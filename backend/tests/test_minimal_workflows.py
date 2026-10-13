from datetime import date, datetime, time, timedelta, timezone
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from app.main import app
from app.database import get_db, Base
from app.models import (AppUser, Team, TeamMembership, Season, Arena, ArenaRink, AvailabilityWindow, Event, Proposal, Invite)
from app.auth import dependencies
from app.auth.dependencies import current_user, current_me_user
from app.schema_guard import assert_minimal_database


@pytest.fixture()
def scenario(db, monkeypatch):
    from app.routers import minimal
    monkeypatch.setattr(minimal, 'send_email', lambda **kwargs: True)
    season=Season(name='Current',start_date=date.today()-timedelta(days=200),end_date=date.today()+timedelta(days=200),is_active=True)
    arena=Arena(name='Arena');db.add_all([season,arena]);db.flush()
    rink=ArenaRink(arena_id=arena.id,name='Main');db.add(rink);db.flush()
    teams=[Team(name=name,age_group='14U',level='AA',home_arena_id=arena.id,home_arena_rink_id=rink.id) for name in ['Home','Away','Other']]
    users=[AppUser(auth_id=name,email=f'{name}@example.com',status='active') for name in ['home','away','other']]
    admin=AppUser(auth_id='admin',email='admin@example.com',status='active',is_platform_admin=True)
    pending=AppUser(auth_id='pending',email='pending@example.com',status='pending')
    db.add_all(teams+users+[admin,pending]);db.flush()
    for team,user in zip(teams,users):db.add(TeamMembership(team_id=team.id,user_id=user.id,role='team_admin'))
    day=date.today()+timedelta(days=7)
    home=AvailabilityWindow(team_id=teams[0].id,season_id=season.id,date=day,start_time=time(18),end_time=time(19),availability_type='home')
    away=AvailabilityWindow(team_id=teams[1].id,season_id=season.id,date=day,start_time=time(17),end_time=time(20),availability_type='away')
    db.add_all([home,away]);db.commit()
    state={'user':users[0]}
    def user():
        actual=db.get(AppUser,state['user'].id)
        if actual.access_state=='disabled' or actual.auth_state=='disabled':raise HTTPException(403,'Account disabled')
        return actual
    app.dependency_overrides[get_db]=lambda:db
    app.dependency_overrides[current_user]=user
    app.dependency_overrides[current_me_user]=user
    client=TestClient(app)
    result=dict(client=client,db=db,state=state,teams=teams,users=users,admin=admin,pending=pending,
        season=season,arena=arena,rink=rink,day=day,home=home,away=away)
    yield result
    app.dependency_overrides.clear()


def body(s):
    return dict(home_team_id=s['teams'][0].id,away_team_id=s['teams'][1].id,proposed_by_team_id=s['teams'][0].id,
        home_availability_window_id=s['home'].id,away_availability_window_id=s['away'].id,event_type='exhibition',
        proposed_date=s['day'].isoformat(),proposed_start_time='18:00',proposed_end_time='19:00',
        arena_id=s['arena'].id,arena_rink_id=s['rink'].id)


def propose(s):
    response=s['client'].post('/api/proposals',json=body(s));assert response.status_code==201,response.text
    return response.json()


def accept(s,proposal):
    s['state']['user']=s['users'][1]
    response=s['client'].patch(f'/api/proposals/{proposal["id"]}/accept');assert response.status_code==200,response.text
    return response.json()


def event_body(s,**kwargs):
    return dict(event_type='practice',date=s['day'].isoformat(),start_time='18:00',end_time='19:00',
        arena_id=s['arena'].id,arena_rink_id=s['rink'].id,season_id=s['season'].id,**kwargs)


def test_match_propose_accept_shared_schedule_and_calendar(scenario):
    s=scenario;c=s['client'];home_id=s['teams'][0].id;away_id=s['teams'][1].id
    matches=c.get('/api/search/opponents',params={'team_id':home_id,'availability_window_id':s['home'].id})
    assert matches.status_code==200 and len(matches.json())==1
    assert len(c.get('/api/search/auto-matches',params={'team_id':home_id}).json())==1
    proposal=propose(s)
    assert c.patch(f'/api/proposals/{proposal["id"]}/accept').status_code==403  # sender cannot self-accept
    accept(s,proposal)
    away_events=c.get(f'/api/teams/{away_id}/events').json();assert len(away_events)==1
    s['state']['user']=s['users'][0]
    home_events=c.get(f'/api/teams/{home_id}/events').json();assert home_events[0]['id']==away_events[0]['id']
    from app.services.calendar_feed import build_team_calendar
    calendar=build_team_calendar(s['db'],home_id)
    assert f'event-{home_events[0]["id"]}@rinklink' in calendar
    assert 'Home vs Away' in calendar
    assert c.patch(f'/api/events/{home_events[0]["id"]}/cancel').status_code==200
    assert s['home'].status==s['away'].status=='open'
    assert f'event-{home_events[0]["id"]}@rinklink' not in build_team_calendar(s['db'],home_id)


@pytest.mark.parametrize('start,end,expected',[('17:00','20:00',1),('18:45','20:00',0),('18:00','18:15',0),('19:00','20:00',0)])
def test_matching_requires_full_game(scenario,start,end,expected):
    s=scenario;s['away'].start_time=time.fromisoformat(start);s['away'].end_time=time.fromisoformat(end);s['db'].commit()
    for index,window in [(0,s['home']),(1,s['away'])]:
        s['state']['user']=s['users'][index]
        assert len(s['client'].get('/api/search/opponents',params={'team_id':s['teams'][index].id,'availability_window_id':window.id}).json())==expected
        assert len(s['client'].get('/api/search/auto-matches',params={'team_id':s['teams'][index].id}).json())==expected


@pytest.mark.parametrize('kind',['practice','blocked'])
def test_conflicts_prevent_search_and_proposals(scenario,kind):
    s=scenario
    if kind=='practice':s['db'].add(Event(home_team_id=s['teams'][1].id,**{**event_body(s),'date':s['day'],'start_time':time(18,30),'end_time':time(19,30)}))
    else:s['db'].add(AvailabilityWindow(team_id=s['teams'][1].id,date=s['day'],availability_type='away',blocked=True))
    s['db'].commit()
    assert s['client'].get('/api/search/auto-matches',params={'team_id':s['teams'][0].id}).json()==[]
    assert s['client'].post('/api/proposals',json=body(s)).status_code==409


def test_proposal_validates_actual_full_interval_and_rechecks_on_accept(scenario):
    s=scenario;bad={**body(s),'proposed_end_time':'20:30'}
    assert s['client'].post('/api/proposals',json=bad).status_code==400
    proposal=propose(s);s['away'].end_time=time(18,15);s['db'].commit();s['state']['user']=s['users'][1]
    assert s['client'].patch(f'/api/proposals/{proposal["id"]}/accept').status_code==400
    assert s['db'].query(Event).count()==0


def test_direct_games_practices_update_cancel_without_inventory(scenario):
    s=scenario;c=s['client'];team=s['teams'][0].id
    event=c.post(f'/api/teams/{team}/events',json=event_body(s));assert event.status_code==201,event.text
    assert c.post(f'/api/teams/{team}/events',json=event_body(s)).status_code==409
    moved={**event_body(s),'start_time':'19:00','end_time':'20:00'}
    assert c.put(f'/api/events/{event.json()["id"]}',json=moved).status_code==200
    assert c.patch(f'/api/events/{event.json()["id"]}/cancel').status_code==200
    game={**event_body(s),'event_type':'league','opponent_name':'External club'}
    assert c.post(f'/api/teams/{team}/events',json=game).status_code==201
    game['away_team_id']=s['teams'][1].id
    assert c.post(f'/api/teams/{team}/events',json=game).status_code==403


def test_reschedule_keeps_game_until_accepted_and_reuses_event(scenario):
    s=scenario;c=s['client'];proposal=propose(s);accept(s,proposal);original=s['db'].query(Event).one();identity=original.id
    revision_body={key:body(s)[key] for key in ['proposed_by_team_id','proposed_date','proposed_start_time','proposed_end_time','arena_id','arena_rink_id']}
    revision_body.update(proposed_by_team_id=s['teams'][1].id,proposed_start_time='19:00',proposed_end_time='20:00')
    revision=c.post(f'/api/proposals/{proposal["id"]}/reschedule',json=revision_body);assert revision.status_code==201,revision.text
    assert original.start_time==time(18)
    s['state']['user']=s['users'][0]
    assert c.patch(f'/api/proposals/{revision.json()["id"]}/accept').status_code==200
    assert s['db'].query(Event).count()==1 and original.id==identity and original.start_time==time(19)
    assert len(c.get(f'/api/proposals/{proposal["id"]}/history').json())==2


def test_withdrawing_revision_keeps_agreed_game(scenario):
    s=scenario;c=s['client'];proposal=propose(s);accept(s,proposal)
    revision=c.post(f'/api/proposals/{proposal["id"]}/reschedule',json={
        'proposed_by_team_id':s['teams'][1].id,'proposed_date':s['day'].isoformat(),
        'proposed_start_time':'19:00','proposed_end_time':'20:00','arena_id':s['arena'].id,'arena_rink_id':s['rink'].id})
    assert revision.status_code==201
    assert c.patch(f'/api/proposals/{revision.json()["id"]}/cancel').status_code==200
    assert s['db'].query(Event).one().status=='scheduled' and s['home'].status=='scheduled'


def test_permissions_and_removed_features(scenario):
    s=scenario;c=s['client'];s['state']['user']=s['users'][2]
    assert c.get(f'/api/teams/{s["teams"][0].id}/events').status_code==403
    assert c.post('/api/proposals',json=body(s)).status_code==403
    for path in ['/api/players','/api/competitions','/api/ice-slots/open','/api/associations','/api/teams/x/roster','/api/teams/x/events/y/attendance']:
        assert c.get(path).status_code==404,path
    assert not set(inspect(s['db'].bind).get_table_names()) & {'players','competitions','ice_slots','ice_booking_requests'}
    caps=c.get('/api/me').json()['capabilities'];assert not any('player' in cap or 'arena' in cap or 'roster' in cap for cap in caps)


def test_pending_request_and_admin_approval(scenario):
    s=scenario;c=s['client'];s['state']['user']=s['pending']
    assert c.get('/api/teams').status_code==403
    req=c.post('/api/access-requests',json={'target_type':'team','target_id':s['teams'][0].id});assert req.status_code==201
    assert c.post('/api/access-requests',json={'target_type':'guardian_link','target_id':'x'}).status_code==422
    s['state']['user']=s['users'][2]
    assert c.post(f'/api/access-requests/{req.json()["id"]}/approve',json={}).status_code==403
    s['state']['user']=s['users'][0]
    assert c.post(f'/api/access-requests/{req.json()["id"]}/approve',json={}).status_code==200
    s['state']['user']=s['pending'];assert c.get('/api/me').json()['user']['status']=='active'
    assert c.get(f'/api/teams/{s["teams"][0].id}/events').status_code==200


def test_invitation_email_expiry_and_revocation(scenario):
    s=scenario;c=s['client'];req=c.post('/api/invites',json={'email':s['pending'].email,'target_id':s['teams'][0].id});assert req.status_code==201,req.text
    invitation=req.json();assert c.post(f'/api/invites/{invitation["token"]}/accept').status_code==403
    s['state']['user']=s['pending'];assert c.post(f'/api/invites/{invitation["token"]}/accept').status_code==200
    assert c.post(f'/api/invites/{invitation["token"]}/accept').status_code==409
    membership=s['db'].query(TeamMembership).filter(TeamMembership.user_id==s['pending'].id).one()
    s['state']['user']=s['users'][0];assert c.delete(f'/api/team-memberships/{membership.id}').status_code==204
    s['state']['user']=s['pending'];assert c.get(f'/api/teams/{s["teams"][0].id}/events').status_code==403


def test_csv_preview_then_import(scenario):
    s=scenario;c=s['client'];path=f'/api/teams/{s["teams"][0].id}/availability'
    preview=c.post(path+'/upload',files={'file':('windows.csv',f'Date,Start Time,End Time,Home/Away\n{s["day"]},17:00,18:00,Home\n', 'text/csv')})
    assert preview.status_code==200,preview.text
    assert c.post(path+'/confirm-upload',json={'entries':preview.json()['entries']}).status_code==201


def test_guard_rejects_full_app_database_and_old_revision(tmp_path):
    engine=create_engine(f'sqlite:///{tmp_path}/guard.db')
    with engine.begin() as connection:connection.execute(text('CREATE TABLE players (id TEXT)'))
    with pytest.raises(RuntimeError,match='Full-app database'):assert_minimal_database(engine)
    with engine.begin() as connection:
        connection.execute(text('DROP TABLE players'));connection.execute(text('CREATE TABLE alembic_version (version_num TEXT)'))
        connection.execute(text("INSERT INTO alembic_version VALUES ('5c1d8a7e9b20')"))
    with pytest.raises(RuntimeError,match='lineage'):assert_minimal_database(engine)


def test_development_admin_initialization_is_concurrent_safe(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    monkeypatch.setattr(settings, 'app_env', 'development')
    monkeypatch.setattr(settings, 'auth_enabled', False)
    monkeypatch.setattr(settings, 'auth_bypass_dev_only', True)
    engine=create_engine(f'sqlite:///{tmp_path}/dev-admin.db',connect_args={'check_same_thread':False})
    Base.metadata.create_all(engine)
    factory=sessionmaker(bind=engine)
    def resolve(_):
        with factory() as session:
            return dependencies._resolve_current_user(credentials=None,db=session).id
    with ThreadPoolExecutor(max_workers=8) as executor:
        ids=list(executor.map(resolve,range(16)))
    assert len(set(ids))==1
    with factory() as session:assert session.query(AppUser).count()==1


def test_original_profile_controls_preserve_fields_and_logo_authorization(scenario):
    s=scenario;c=s['client'];team_id=s['teams'][0].id
    svg=b'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>'
    uploaded=c.post(f'/api/teams/{team_id}/logo',files={'file':('test.svg',svg,'text/html')})
    assert uploaded.status_code==200,uploaded.text
    asset_id=uploaded.json()['logo_asset_id']
    image=c.get(f'/api/team-logos/{asset_id}')
    assert image.content==svg and image.headers['content-type'].startswith('image/svg+xml')
    assert image.headers['x-content-type-options']=='nosniff' and 'sandbox' in image.headers['content-security-policy']
    assert c.get(f'/api/arena-logos/{asset_id}').status_code==404
    s['state']['user']=s['users'][1]
    assert c.post(f'/api/teams/{team_id}/logo',files={'file':('test.svg',svg)}).status_code==403
    assert c.delete(f'/api/teams/{team_id}/logo').status_code==403
    s['state']['user']=s['users'][0]
    assert c.post(f'/api/teams/{team_id}/logo',files={'file':('bad.html',svg)}).status_code==400
    assert c.delete(f'/api/teams/{team_id}/logo').json()['logo_asset_id'] is None
    assert c.put(f'/api/arenas/{s["arena"].id}',json={'name':'Updated'}).status_code==403
    s['state']['user']=s['admin']
    venue={'name':'Updated','phone':'555-0100','contact_email':'rink@example.test','website':'https://example.test','notes':'Reference only'}
    updated=c.put(f'/api/arenas/{s["arena"].id}',json=venue)
    assert updated.status_code==200,updated.text
    assert all(updated.json()[key]==value for key,value in venue.items())
    assert c.put(f'/api/arena-rinks/{s["rink"].id}',json={'name':'Main rink','notes':'Entrance A'}).status_code==200
    assert c.delete(f'/api/teams/{team_id}').status_code==409
    assert c.delete(f'/api/arenas/{s["arena"].id}').status_code==409
    assert c.get('/api/teams').status_code==200
