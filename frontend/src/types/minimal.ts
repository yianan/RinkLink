export interface Team {
  id: string;
  name: string;
  club_name: string;
  age_group: string;
  level: string;
  home_zip_code: string;
  home_arena_id: string | null;
  home_arena_rink_id: string | null;
  manager_name: string;
  manager_email: string;
  manager_phone: string;
  myhockey_ranking: number | null;
}
export interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}
export interface Arena {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
}
export interface ArenaRink {
  id: string;
  arena_id: string;
  name: string;
}
export interface AvailabilityWindow {
  id: string;
  team_id: string;
  season_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  availability_type: "home" | "away";
  status: string;
  blocked: boolean;
  notes: string | null;
  event_id: string | null;
}
export interface Event {
  id: string;
  home_team_id: string;
  away_team_id: string | null;
  opponent_name: string | null;
  event_type: string;
  status: string;
  season_id: string;
  proposal_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  arena_id: string;
  arena_rink_id: string;
  notes: string | null;
  home_team_name: string;
  away_team_name: string | null;
  location_label: string;
}
export interface Proposal {
  id: string;
  home_team_id: string;
  away_team_id: string;
  proposed_by_team_id: string;
  home_availability_window_id: string;
  away_availability_window_id: string;
  proposed_date: string;
  proposed_start_time: string;
  proposed_end_time: string;
  event_type: string;
  status: string;
  message: string | null;
  response_message: string | null;
  arena_id: string;
  arena_rink_id: string;
  location_label: string;
  home_team_name: string;
  away_team_name: string;
  revision_number: number;
}
export interface Match extends Team {
  team_id: string;
  team_name: string;
  availability_window_id: string;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  availability_type: string;
  home_team_id: string;
  away_team_id: string;
  home_availability_window_id: string;
  away_availability_window_id: string;
  date: string;
  home_start_time: string;
  home_end_time: string;
  distance_miles: number | null;
  has_existing_proposal: boolean;
  existing_proposal_id: string | null;
}
export interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
  access_state: string;
  auth_state: string;
  is_platform_admin: boolean;
  default_team_id: string | null;
}
export interface MeResponse {
  user: AppUser;
  capabilities: string[];
  teams: { team_id: string; role: string }[];
  accessible_teams: Team[];
}
export interface AppBootstrap {
  me: MeResponse;
  teams: Team[];
  seasons: Season[];
}
export interface Notification {
  id: string;
  title: string;
  message: string;
}
export interface Staff {
  id: string;
  user_id: string;
  team_id: string;
  role: string;
  email: string;
}
export interface Invite {
  id: string;
  email: string;
  status: string;
  role: string;
  url: string;
  team_name: string;
}
export interface AccessRequest {
  id: string;
  user_email: string;
  status: string;
  team_name: string;
  notes: string | null;
  target_type: string;
}
