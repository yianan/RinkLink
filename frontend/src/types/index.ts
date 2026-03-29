export interface Association {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamCompetitionMembership {
  id: string;
  team_id: string;
  season_id: string;
  competition_division_id: string;
  membership_role: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  competition_name: string | null;
  competition_short_name: string | null;
  competition_type: string | null;
  division_name: string | null;
  age_group: string | null;
  level: string | null;
  standings_enabled: boolean;
}

export interface CompetitionDivision {
  id: string;
  competition_id: string;
  season_id: string;
  name: string;
  age_group: string;
  level: string;
  standings_enabled: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  competition_name: string | null;
  competition_short_name: string | null;
  competition_type: string | null;
  member_count: number;
}

export interface Competition {
  id: string;
  name: string;
  short_name: string;
  governing_body: string;
  competition_type: string;
  region: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  divisions: CompetitionDivision[];
}

export interface Team {
  id: string;
  association_id: string;
  name: string;
  age_group: string;
  level: string;
  manager_name: string;
  manager_email: string;
  manager_phone: string;
  logo_url: string | null;
  myhockey_ranking: number | null;
  wins: number;
  losses: number;
  ties: number;
  association_name: string | null;
  primary_membership: TeamCompetitionMembership | null;
  memberships: TeamCompetitionMembership[];
  created_at: string;
  updated_at: string;
}

export interface Arena {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  contact_email: string;
  logo_url: string | null;
  website: string | null;
  notes: string | null;
  rink_count: number;
  created_at: string;
  updated_at: string;
}

export interface ArenaRink {
  id: string;
  arena_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  notes: string | null;
  arena_name: string | null;
  locker_room_count: number;
  ice_slot_count: number;
  created_at: string;
  updated_at: string;
}

export interface LockerRoom {
  id: string;
  arena_rink_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  notes: string | null;
  arena_id: string | null;
  arena_name: string | null;
  arena_rink_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface IceSlot {
  id: string;
  arena_rink_id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  status: 'available' | 'held' | 'booked';
  pricing_mode: 'fixed_price' | 'call_for_pricing' | string;
  price_amount_cents: number | null;
  currency: string;
  booked_by_team_id: string | null;
  booked_by_team_name: string | null;
  booked_event_id: string | null;
  booked_event_type: string | null;
  booked_event_home_team_name: string | null;
  booked_event_away_team_name: string | null;
  active_booking_request_id: string | null;
  active_booking_request_status: string | null;
  active_booking_request_team_name: string | null;
  active_booking_request_event_type: string | null;
  notes: string | null;
  arena_id: string | null;
  arena_name: string | null;
  arena_rink_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface IceSlotUploadRow {
  date: string;
  start_time: string;
  end_time: string | null;
  notes: string | null;
}

export interface IceSlotUploadPreview {
  entries: IceSlotUploadRow[];
  warnings: string[];
}

export interface TeamSeasonVenueAssignment {
  id: string;
  team_id: string;
  season_id: string;
  arena_id: string;
  arena_rink_id: string;
  default_locker_room_id: string | null;
  team_name: string | null;
  arena_name: string | null;
  arena_rink_name: string | null;
  default_locker_room_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityWindow {
  id: string;
  team_id: string;
  season_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  availability_type: 'home' | 'away';
  status: 'open' | 'scheduled' | 'confirmed' | 'cancelled';
  blocked: boolean;
  opponent_team_id: string | null;
  notes: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityUploadRow {
  date: string;
  start_time: string | null;
  end_time: string | null;
  availability_type: 'home' | 'away';
  notes: string | null;
  status: string;
}

export interface AvailabilityUploadPreview {
  entries: AvailabilityUploadRow[];
  warnings: string[];
}

export interface Proposal {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_availability_window_id: string;
  away_availability_window_id: string;
  event_type: 'league' | 'tournament' | 'practice' | 'showcase' | 'scrimmage' | 'exhibition';
  proposed_date: string;
  proposed_start_time: string | null;
  proposed_end_time: string | null;
  status: 'proposed' | 'accepted' | 'declined' | 'cancelled';
  proposed_by_team_id: string;
  arena_id: string;
  arena_rink_id: string;
  ice_slot_id: string | null;
  home_locker_room_id: string | null;
  away_locker_room_id: string | null;
  message: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_logo_url: string | null;
  away_team_logo_url: string | null;
  home_team_association: string | null;
  away_team_association: string | null;
  arena_name: string | null;
  arena_logo_url: string | null;
  arena_rink_name: string | null;
  home_locker_room_name: string | null;
  away_locker_room_name: string | null;
  ice_slot_date: string | null;
  ice_slot_start_time: string | null;
  ice_slot_end_time: string | null;
  ice_slot_notes: string | null;
  location_label: string | null;
}

export interface IceBookingRequest {
  id: string;
  requester_team_id: string;
  away_team_id: string | null;
  season_id: string | null;
  event_type: 'league' | 'tournament' | 'practice' | 'showcase' | 'scrimmage' | 'exhibition';
  status: 'requested' | 'accepted' | 'rejected' | 'cancelled';
  arena_id: string;
  arena_rink_id: string;
  ice_slot_id: string;
  event_id: string | null;
  pricing_mode: 'fixed_price' | 'call_for_pricing' | string;
  price_amount_cents: number | null;
  currency: string;
  final_price_amount_cents: number | null;
  final_currency: string | null;
  home_locker_room_id: string | null;
  away_locker_room_id: string | null;
  message: string | null;
  response_message: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  requester_team_name: string | null;
  requester_team_logo_url: string | null;
  requester_association_name: string | null;
  away_team_name: string | null;
  away_team_logo_url: string | null;
  away_association_name: string | null;
  arena_name: string | null;
  arena_logo_url: string | null;
  arena_rink_name: string | null;
  home_locker_room_name: string | null;
  away_locker_room_name: string | null;
  ice_slot_date: string | null;
  ice_slot_start_time: string | null;
  ice_slot_end_time: string | null;
  ice_slot_notes: string | null;
  event_status: string | null;
  location_label: string | null;
}

export interface OpponentResult {
  team_id: string;
  team_name: string;
  team_logo_url: string | null;
  association_name: string;
  age_group: string;
  level: string;
  myhockey_ranking: number | null;
  distance_miles: number | null;
  availability_window_id: string;
  entry_date: string;
  start_time: string | null;
  end_time: string | null;
  availability_type: string;
  primary_competition_short_name: string | null;
  primary_division_name: string | null;
  has_existing_proposal: boolean;
  existing_proposal_id: string | null;
  existing_proposal_status: string | null;
}

export interface AutoMatchResult {
  home_team_id: string;
  home_team_name: string;
  home_team_logo_url: string | null;
  home_association_name: string;
  away_team_id: string;
  away_team_name: string;
  away_team_logo_url: string | null;
  away_association_name: string;
  date: string;
  home_availability_window_id: string;
  away_availability_window_id: string;
  home_start_time: string | null;
  home_end_time: string | null;
  away_start_time: string | null;
  away_end_time: string | null;
  distance_miles: number | null;
  home_primary_competition_short_name: string | null;
  home_primary_division_name: string | null;
  away_primary_competition_short_name: string | null;
  away_primary_division_name: string | null;
  has_existing_proposal: boolean;
  existing_proposal_id: string | null;
  existing_proposal_status: string | null;
}

export interface Event {
  id: string;
  event_type: 'league' | 'tournament' | 'practice' | 'showcase' | 'scrimmage' | 'exhibition';
  status: string;
  home_team_id: string;
  away_team_id: string | null;
  home_availability_window_id: string | null;
  away_availability_window_id: string | null;
  proposal_id: string | null;
  season_id: string | null;
  competition_division_id: string | null;
  arena_id: string;
  arena_rink_id: string;
  ice_slot_id: string | null;
  home_locker_room_id: string | null;
  away_locker_room_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  counts_for_standings: boolean;
  home_weekly_confirmed: boolean;
  away_weekly_confirmed: boolean;
  home_score: number | null;
  away_score: number | null;
  created_at: string;
  updated_at: string;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_logo_url: string | null;
  away_team_logo_url: string | null;
  home_association_name: string | null;
  away_association_name: string | null;
  arena_name: string | null;
  arena_logo_url: string | null;
  arena_rink_name: string | null;
  home_locker_room_name: string | null;
  away_locker_room_name: string | null;
  location_label: string | null;
  competition_name: string | null;
  competition_short_name: string | null;
  division_name: string | null;
  attendance_summary: EventAttendanceSummary | null;
}

export interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  game_count: number;
  created_at: string;
  updated_at: string;
}

export interface StandingsEntry {
  team_id: string;
  team_name: string;
  logo_url: string | null;
  association_name: string | null;
  age_group: string;
  level: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  games_played: number;
}

export interface TeamSeasonRecord {
  id: string;
  team_id: string;
  season_id: string;
  wins: number;
  losses: number;
  ties: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  team_id: string;
  notif_type: string;
  title: string;
  message: string | null;
  week_start: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  team_id: string;
  season_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  position: string | null;
  season_totals: {
    goals: number;
    assists: number;
    shots_on_goal: number;
    saves: number;
    shootout_shots: number;
    shootout_saves: number;
  };
  created_at: string;
  updated_at: string;
}

export type AttendanceStatus = 'unknown' | 'attending' | 'tentative' | 'absent';

export interface EventAttendanceSummary {
  attending_count: number;
  tentative_count: number;
  absent_count: number;
  unknown_count: number;
  total_players: number;
}

export interface EventAttendancePlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  position: string | null;
  status: AttendanceStatus;
  responded_at: string | null;
}

export interface PlayerUploadRow {
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  position: string | null;
}

export interface PlayerUploadPreview {
  entries: PlayerUploadRow[];
  warnings: string[];
}

export interface EventPlayerStat {
  id: string;
  event_id: string;
  team_id: string;
  player_id: string;
  goals: number;
  assists: number;
  shots_on_goal: number;
  created_at: string;
  updated_at: string;
}

export interface EventPlayerStatUpsert {
  team_id: string;
  player_id: string;
  goals: number;
  assists: number;
  shots_on_goal: number;
}

export interface EventPenalty {
  id: string;
  event_id: string;
  team_id: string;
  player_id: string | null;
  penalty_type: string;
  minutes: number;
  created_at: string;
  updated_at: string;
}

export interface EventGoalieStat {
  id: string;
  event_id: string;
  team_id: string;
  player_id: string;
  saves: number;
  shootout_shots: number;
  shootout_saves: number;
  created_at: string;
  updated_at: string;
}

export interface EventGoalieStatUpsert {
  team_id: string;
  player_id: string;
  saves: number;
  shootout_shots: number;
  shootout_saves: number;
}

export interface EventSignature {
  id: string;
  event_id: string;
  team_id: string | null;
  role: string;
  signer_name: string;
  signed_at: string;
  created_at: string;
  updated_at: string;
}

export interface EventScoresheet {
  event: Event;
  player_stats: EventPlayerStat[];
  penalties: EventPenalty[];
  goalie_stats: EventGoalieStat[];
  signatures: EventSignature[];
}
