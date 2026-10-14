import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import {Calendar,CheckCircle2,Inbox} from 'lucide-react';
import {api,isAbortError} from '../api/client';
import type {AvailabilityWindow,Event,Proposal} from '../types';
import {useAuth} from '../context/AuthContext';
import {useSeason} from '../context/SeasonContext';
import {useTeam} from '../context/TeamContext';
import {addDays,formatShortDate,formatTimeHHMM,toLocalDateString} from '../lib/time';
import {Badge} from '../components/ui/Badge';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import PageHeader from '../components/PageHeader';
import TeamLogo from '../components/TeamLogo';
import {cn} from '../lib/cn';
import {getCompetitionBadgeVariant,getCompetitionLabel} from '../lib/competition';
import {interactiveTitleClass,listRowButtonClass} from '../lib/uiClasses';
const clickableCard =
  'cursor-pointer text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-300/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:hover:border-cyan-700/50 dark:hover:shadow-[0_8px_30px_rgba(34,211,238,0.08)] dark:focus-visible:ring-offset-slate-950';

function StatCard({
  title,
  value,
  subtitle,
  onClick,
  icon,
  color,
  ariaLabel,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  onClick?: () => void;
  icon: ReactNode;
  color: string;
  ariaLabel?: string;
}) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? ariaLabel ?? `${title}: ${value}` : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter') onClick();
        if (event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn('p-4 text-left transition-shadow', onClick && clickableCard)}
    >
      <div className="flex items-center gap-2">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', color)}>
          {icon}
        </div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
      </div>
      <div className="mt-3 font-display text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</div> : null}
    </Card>
  );
}

function eventTitle(event: Event) {
  if (event.event_type === 'practice') {
    return `${event.home_team_name} Practice`;
  }
  return event.away_team_name ? `${event.home_team_name} vs ${event.away_team_name}` : `${event.home_team_name} ${getCompetitionLabel(event.event_type)}`;
}

function eventVenue(event: Event) {
  return [event.arena_name, event.arena_rink_name].filter(Boolean).join(' • ') || event.location_label || 'Venue TBD';
}

export default function HomePage(){
 const navigate=useNavigate(); const {activeTeam,teams}=useTeam(); const {activeSeason,seasons}=useSeason(); const {authEnabled,me}=useAuth();
 const [availability,setAvailability]=useState<AvailabilityWindow[]>([]);const [events,setEvents]=useState<Event[]>([]);const [proposals,setProposals]=useState<Proposal[]>([]); const [error,setError]=useState('');
 const effectiveSeason=activeSeason??seasons.find(s=>s.is_active)??seasons[0]??null;
 const todayStr=toLocalDateString(new Date()); const weekEndStr=toLocalDateString(addDays(new Date(),7));
 const canViewAvailabilitySummary=!authEnabled||!!me?.capabilities.includes('team.manage_schedule');
 const canViewProposalSummary=!authEnabled||!!me?.capabilities.includes('team.manage_proposals');
 useEffect(()=>{const controller=new AbortController();setAvailability([]);setEvents([]);setProposals([]);setError('');if(!activeTeam)return;
 const params={date_from:todayStr,...(effectiveSeason?{season_id:effectiveSeason.id}:{})};
 Promise.all([canViewAvailabilitySummary?api.getAvailability(activeTeam.id,params,{signal:controller.signal}):Promise.resolve([]),api.getEvents(activeTeam.id,params,{signal:controller.signal}),canViewProposalSummary?api.getProposals(activeTeam.id,{...params,direction:'incoming',status:'proposed'},{signal:controller.signal}):Promise.resolve([])])
 .then(([a,e,p])=>{if(controller.signal.aborted)return;setAvailability(a);setEvents(e);setProposals(p);}).catch(e=>{if(!isAbortError(e))setError('Unable to load the dashboard. Please try again.');});return()=>controller.abort();
 },[activeTeam,effectiveSeason,todayStr,canViewAvailabilitySummary,canViewProposalSummary]);
 const seasonAvailability=availability;const seasonEvents=events;
 const openDates=seasonAvailability.filter(w=>w.status==='open'&&!w.blocked&&w.date>=todayStr);
 const upcomingEventsAll=seasonEvents.filter(e=>e.date>=todayStr&&e.status!=='cancelled');
 const gamesThisWeek=upcomingEventsAll.filter(e=>e.event_type!=='practice'&&e.date<=weekEndStr);
 const practicesThisWeek=upcomingEventsAll.filter(e=>e.event_type==='practice'&&e.date<=weekEndStr);
 const eventsThisWeek=upcomingEventsAll.filter(e=>e.date<=weekEndStr);
 const upcomingEvents=useMemo(()=>[...upcomingEventsAll].sort((a,b)=>(a.date+(a.start_time||'')).localeCompare(b.date+(b.start_time||''))).slice(0,5),[upcomingEventsAll]);
 const incomingProposals=useMemo(()=>[...proposals].sort((a,b)=>(a.proposed_date+a.proposed_start_time).localeCompare(b.proposed_date+b.proposed_start_time)).slice(0,4),[proposals]);
 if(!activeTeam)return <div className="space-y-6"><PageHeader title="Dashboard" subtitle={teams.length?'Choose an active team to view schedule and proposals.':'Add a team to begin.'}/><Card className="mx-auto max-w-2xl p-6"><div className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">{teams.length?'No active team selected':'Welcome to RinkLink'}</div><div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{teams.length?'Use the team switcher in the header to load a team workspace.':'Add your first team to start matching and scheduling.'}</div>{!teams.length&&me?.user.is_platform_admin?<Button type="button" variant="outline" className="mt-5" onClick={()=>navigate('/teams')}>Add Team</Button>:null}</Card></div>;
 if(error)return <Card className="p-6 text-sm text-rose-700 dark:text-rose-300">{error}</Card>;
 return (<div className="space-y-4">
      <PageHeader title={(<span className="inline-flex items-center gap-3">
            <TeamLogo name={activeTeam.name} logoUrl={activeTeam.logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs" loading="eager" fetchPriority="high"/>
            <span>{`${activeTeam.name} Dashboard`}</span>
          </span>)} subtitle={effectiveSeason ? `${effectiveSeason.name} Season` : "All Seasons"}/>



      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">

        <StatCard title="Upcoming Schedule" value={upcomingEventsAll.length} subtitle={eventsThisWeek.length > 0
        ? `${gamesThisWeek.length} game${gamesThisWeek.length === 1 ? '' : 's'} • ${practicesThisWeek.length} practice${practicesThisWeek.length === 1 ? '' : 's'} this week`
        : 'No events this week'} onClick={() => navigate('/schedule')} icon={<CheckCircle2 className="h-4 w-4"/>} color="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"/>
        {canViewAvailabilitySummary ? (<StatCard title="Open Availability" value={openDates.length} subtitle={`${openDates.filter((window) => window.date <= weekEndStr).length} this week`} onClick={() => navigate('/availability')} icon={<Calendar className="h-4 w-4"/>} color="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400"/>) : null}
        {canViewProposalSummary ? (<StatCard title="Incoming Proposals" value={proposals.length} onClick={() => navigate('/proposals')} icon={<Inbox className="h-4 w-4"/>} color="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"/>) : null}

      </div>

      <div className={cn('grid gap-3', canViewProposalSummary ? 'xl:grid-cols-[1.35fr_0.95fr]' : 'xl:grid-cols-1')}>
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-white/85 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Upcoming Schedule</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Scheduled games, scrimmages, and practices for the next few dates.
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {upcomingEvents.length === 0 ? (<div className="px-4 py-4">
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <div className="font-medium text-slate-900 dark:text-slate-100">No upcoming events</div>
                  <div className="mt-1">
                    {'Schedule a practice or accept a proposal to populate the next event block.'}
                  </div>
                  <div className="mt-3">
                    <Button type="button" size="sm" variant="outline" onClick={() => navigate('/schedule')}>
                      <Calendar className="h-4 w-4"/>
                      Open Schedule
                    </Button>
                  </div>
                </div>
              </div>) : upcomingEvents.map((event) => (<button type="button" key={event.id} onClick={() => navigate(`/schedule/${event.id}`, {
            state: {
                backTo: '/',
                backLabel: 'Back to Dashboard',
            },
        })} className={cn(listRowButtonClass, 'px-4 py-4')}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <TeamLogo name={event.home_team_name || 'Home'} logoUrl={event.home_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs"/>
                        {event.away_team_name ? (<TeamLogo name={event.away_team_name} logoUrl={event.away_team_logo_url} className="h-10 w-10 rounded-xl" initialsClassName="text-xs"/>) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {eventTitle(event)}
                          </div>
                          {event.competition_short_name ? (<Badge variant="outline" className="shrink-0">
                              {event.competition_short_name}
                            </Badge>) : null}
                        </div>
                        <div className="mt-1 flex items-center gap-2 truncate text-sm text-slate-600 dark:text-slate-400">
                          <TeamLogo name={event.arena_name || 'Arena'} logoUrl={event.arena_logo_url} className="h-6 w-6 rounded-lg" initialsClassName="text-[9px]"/>
                          <span className="truncate">{eventVenue(event)}</span>
                        </div>


                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 md:items-end">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatShortDate(event.date)}
                      {event.start_time ? ` • ${formatTimeHHMM(event.start_time) || event.start_time}` : ''}
                    </div>
                    <Badge variant={getCompetitionBadgeVariant(event.event_type)} className="w-fit">
                      {getCompetitionLabel(event.event_type)}
                    </Badge>
                  </div>
                </div>
              </button>))}
          </div>
        </Card>

        {canViewProposalSummary ? (<Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 bg-white/85 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {'Incoming Proposals'}
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {'Requests waiting on your response.'}
                </div>
              </div>
              {canViewProposalSummary ? (<Button type="button" size="sm" variant="ghost" onClick={() => navigate('/proposals')}>
                  Open Proposals
                </Button>) : null}
            </div>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {incomingProposals.length === 0 ? (<div className="px-4 py-4">
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <div className="font-medium text-slate-900 dark:text-slate-100">No incoming proposals</div>
                  <div className="mt-1">New matchup requests will appear here when other teams send them.</div>
                </div>
              </div>) : incomingProposals.map((proposal) => (<button type="button" key={proposal.id} onClick={() => navigate('/proposals')} className={cn(listRowButtonClass, 'px-4 py-3')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center gap-2">
                        <TeamLogo name={proposal.home_team_name || 'Home'} logoUrl={proposal.home_team_logo_url} className="h-9 w-9 rounded-xl" initialsClassName="text-[11px]"/>
                        <TeamLogo name={proposal.away_team_name || 'Away'} logoUrl={proposal.away_team_logo_url} className="h-9 w-9 rounded-xl" initialsClassName="text-[11px]"/>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cn('truncate text-sm font-semibold text-slate-900 dark:text-slate-100', interactiveTitleClass)}>
                          {proposal.home_team_name} vs {proposal.away_team_name}
                        </div>
                        <div className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                          {[proposal.arena_name, proposal.arena_rink_name].filter(Boolean).join(' • ') || 'Venue TBD'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {formatShortDate(proposal.proposed_date)}
                          {proposal.proposed_start_time ? ` • ${formatTimeHHMM(proposal.proposed_start_time) || proposal.proposed_start_time}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                  <Badge variant={getCompetitionBadgeVariant(proposal.event_type)} className="shrink-0">
                    {getCompetitionLabel(proposal.event_type)}
                  </Badge>
                </div>
              </button>))}
          </div>
          </Card>) : null}
      </div>
    </div>);
}
