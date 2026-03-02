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
  message: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_association: string | null;
  away_team_association: string | null;
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
}
