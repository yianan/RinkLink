export interface Association {
  id: string;
  name: string;
  home_rink_address: string;
  city: string;
  state: string;
  zip_code: string;
  league_affiliation: string | null;
  created_at: string;
  updated_at: string;
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
  rink_city: string;
  rink_state: string;
  rink_zip: string;
  myhockey_ranking: number | null;
  association_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleEntry {
  id: string;
  team_id: string;
  date: string;
  time: string | null;
  entry_type: 'home' | 'away';
  status: 'open' | 'scheduled' | 'confirmed';
  opponent_name: string | null;
  opponent_team_id: string | null;
  location: string | null;
  notes: string | null;
  weekly_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleUploadRow {
  date: string;
  time: string | null;
  entry_type: string;
  opponent_name: string | null;
  location: string | null;
  notes: string | null;
  status: string;
}

export interface ScheduleUploadPreview {
  entries: ScheduleUploadRow[];
  warnings: string[];
}

export interface GameProposal {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_schedule_entry_id: string;
  away_schedule_entry_id: string;
  proposed_date: string;
  proposed_time: string | null;
  status: 'proposed' | 'accepted' | 'declined' | 'cancelled';
  proposed_by_team_id: string;
  ice_slot_id: string | null;
  message: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_association: string | null;
  away_team_association: string | null;
  rink_name: string | null;
  rink_address: string | null;
  rink_city: string | null;
  rink_state: string | null;
  rink_zip: string | null;
  ice_slot_date: string | null;
  ice_slot_start_time: string | null;
  ice_slot_end_time: string | null;
  ice_slot_notes: string | null;
  location_label: string | null;
}

export interface OpponentResult {
  team_id: string;
  team_name: string;
  association_name: string;
  age_group: string;
  level: string;
  myhockey_ranking: number | null;
  distance_miles: number | null;
  schedule_entry_id: string;
  entry_date: string;
  entry_time: string | null;
  entry_type: string;
  has_existing_proposal: boolean;
  existing_proposal_id: string | null;
  existing_proposal_status: string | null;
}

export interface Rink {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
}

export interface IceSlot {
  id: string;
  rink_id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  status: 'available' | 'held' | 'booked';
  booked_by_team_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  rink_name: string | null;
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

export interface AutoMatchResult {
  home_team_id: string;
  home_team_name: string;
  home_association_name: string;
  away_team_id: string;
  away_team_name: string;
  away_association_name: string;
  date: string;
  home_entry_id: string;
  away_entry_id: string;
  home_time: string | null;
  away_time: string | null;
  distance_miles: number | null;
  has_existing_proposal: boolean;
  existing_proposal_id: string | null;
  existing_proposal_status: string | null;
}

export interface Player {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  position: string | null;
  created_at: string;
  updated_at: string;
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

export interface Game {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_schedule_entry_id: string | null;
  away_schedule_entry_id: string | null;
  proposal_id: string | null;
  ice_slot_id: string | null;
  date: string;
  time: string | null;
  status: string;
  home_weekly_confirmed: boolean;
  away_weekly_confirmed: boolean;
  home_score: number | null;
  away_score: number | null;
  created_at: string;
  updated_at: string;
  home_team_name: string | null;
  away_team_name: string | null;
  home_association_name: string | null;
  away_association_name: string | null;
  rink_name: string | null;
  rink_address: string | null;
  rink_city: string | null;
  rink_state: string | null;
  rink_zip: string | null;
  location_label: string | null;
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

export interface GamePlayerStat {
  id: string;
  game_id: string;
  team_id: string;
  player_id: string;
  goals: number;
  assists: number;
  shots_on_goal: number;
  created_at: string;
  updated_at: string;
}

export interface GamePlayerStatUpsert {
  team_id: string;
  player_id: string;
  goals: number;
  assists: number;
  shots_on_goal: number;
}

export interface GamePenalty {
  id: string;
  game_id: string;
  team_id: string;
  player_id: string | null;
  penalty_type: string;
  minutes: number;
  created_at: string;
  updated_at: string;
}

export interface GameGoalieStat {
  id: string;
  game_id: string;
  team_id: string;
  player_id: string;
  saves: number;
  shootout_shots: number;
  shootout_saves: number;
  created_at: string;
  updated_at: string;
}

export interface GameGoalieStatUpsert {
  team_id: string;
  player_id: string;
  saves: number;
  shootout_shots: number;
  shootout_saves: number;
}

export interface GameSignature {
  id: string;
  game_id: string;
  team_id: string | null;
  role: string;
  signer_name: string;
  signed_at: string;
  created_at: string;
  updated_at: string;
}

export interface GameScoresheet {
  game: Game;
  player_stats: GamePlayerStat[];
  penalties: GamePenalty[];
  goalie_stats: GameGoalieStat[];
  signatures: GameSignature[];
}

export interface PracticeBooking {
  id: string;
  team_id: string;
  ice_slot_id: string;
  notes: string | null;
  status: 'active' | 'cancelled';
  created_at: string;
  updated_at: string;
  team_name: string | null;
  slot_date: string | null;
  slot_start_time: string | null;
  slot_end_time: string | null;
  slot_notes: string | null;
  rink_id: string | null;
  rink_name: string | null;
  rink_city: string | null;
  rink_state: string | null;
}
