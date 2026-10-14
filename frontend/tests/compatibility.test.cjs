const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/api/compatibility.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,URL});
const {prepareRequest,normalizeResponse}=exportsObject;
test('original profile updates retain minimal venue and geography fields',()=>{
  normalizeResponse('/teams',[{id:'home',name:'Home',club_name:'Club',home_zip_code:'60062',home_arena_id:'arena',home_arena_rink_id:'rink',logo_asset_id:'logo'}]);
  const [,request]=prepareRequest('/teams/home',{method:'PUT',body:JSON.stringify({name:'Updated',association_id:'removed',manager_name:'Manager'})});
  assert.deepEqual(JSON.parse(request.body),{name:'Updated',club_name:'Club',home_zip_code:'60062',home_arena_id:'arena',home_arena_rink_id:'rink',manager_name:'Manager'});
  assert.equal(normalizeResponse('/teams',[{id:'home',logo_asset_id:'logo'}])[0].logo_url,'/api/team-logos/logo');
});
test('proposal and reschedule requests send real manual intervals without removed booking fields',()=>{
  const body={proposed_by_team_id:'home',proposed_date:'2026-10-23',proposed_start_time:'18:00',proposed_end_time:'19:00',arena_id:'arena',arena_rink_id:'rink',ice_slot_id:'removed',home_locker_room_id:'removed'};
  const [path,request]=prepareRequest('/proposals/game/reschedule',{method:'PATCH',body:JSON.stringify(body)});
  assert.equal(path,'/proposals/game/reschedule');assert.equal(request.method,'POST');
  assert.deepEqual(JSON.parse(request.body),{proposed_by_team_id:'home',proposed_date:'2026-10-23',proposed_start_time:'18:00',proposed_end_time:'19:00',arena_id:'arena',arena_rink_id:'rink'});
});
test('original tabs filter incoming/outgoing and dates over the minimal list response',()=>{
  const rows=[{id:'incoming',proposed_by_team_id:'away',status:'proposed',proposed_date:'2026-10-23'},{id:'outgoing',proposed_by_team_id:'home',status:'proposed',proposed_date:'2026-10-24'},{id:'history',proposed_by_team_id:'away',status:'declined',proposed_date:'2026-10-20'}];
  assert.deepEqual(normalizeResponse('/teams/home/proposals?direction=incoming&status=proposed',rows).map(x=>x.id),['incoming']);
  assert.deepEqual(normalizeResponse('/teams/home/proposals?direction=outgoing&date_from=2026-10-24',rows).map(x=>x.id),['outgoing']);
});
test('team onboarding retains the original form details in strict minimal API fields',()=>{
  const [,request]=prepareRequest('/access-requests',{method:'POST',body:JSON.stringify({target_type:'team_setup',target_id:'new-team',details:{team_name:'New Team',age_group:'14U',level:'AA',home_zip_code:'60025',association_id:'removed'}})});
  assert.deepEqual(JSON.parse(request.body).details,{name:'New Team',age_group:'14U',level:'AA',home_zip_code:'60025',club_name:''});
});
test('original match cards use the actual seeded team logos and clubs',()=>{
  normalizeResponse('/teams',[{id:'selected',name:'Selected',club_name:'Home club',logo_asset_id:'home-logo'}]);
  const [match]=normalizeResponse('/search/opponents',[{id:'opponent',team_id:'opponent',name:'Opponent',team_name:'Opponent',club_name:'Away club',logo_asset_id:'away-logo',home_team_id:'selected',away_team_id:'opponent'}]);
  assert.equal(match.team_logo_url,'/api/team-logos/away-logo');
  assert.equal(match.home_team_logo_url,'/api/team-logos/home-logo');
  assert.equal(match.away_team_logo_url,'/api/team-logos/away-logo');
  assert.equal(match.home_association_name,'Home club');
  assert.equal(match.away_association_name,'Away club');
});
