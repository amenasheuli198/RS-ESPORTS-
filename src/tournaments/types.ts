export type TournamentStatus =
  | 'Draft'
  | 'Registration Open'
  | 'Registration Closing Soon'
  | 'Registration Closed'
  | 'Upcoming'
  | 'Live'
  | 'Completed'
  | 'Cancelled'

export type TournamentPublicationStatus = 'draft' | 'published' | 'cancelled'
export type TournamentLifecycleStatus = 'scheduled' | 'live' | 'completed'
export type TournamentEntryType = 'free' | 'paid'

export interface TournamentScheduleItem {
  title: string
  starts_at: string
  notes?: string
}

export interface PublicTournament {
  id: string
  name: string
  slug: string
  description: string
  banner_path: string | null
  game_code: string
  mode_code: string
  format_code: string
  max_teams: number
  starting_players_required: number
  substitute_allowed: boolean
  entry_type: TournamentEntryType
  entry_fee: number
  prize_pool: number
  prize_distribution: string
  eligibility: string
  participation_requirements: string
  match_rules: string
  scoring_system: string
  disqualification_rules: string
  general_instructions: string
  match_schedule: TournamentScheduleItem[]
  timezone: string
  registration_opens_at: string
  registration_closes_at: string
  starts_at: string
  ends_at: string | null
  is_featured: boolean
  reserved_slots: number
  available_slots: number
  created_at: string
  tournament_status: TournamentStatus
  publication_status: TournamentPublicationStatus
  lifecycle_status: TournamentLifecycleStatus
}

export interface TournamentAdminRecord extends Omit<PublicTournament, 'tournament_status'> {
  created_by: string
  updated_at: string
}

export type TournamentSort = 'soonest' | 'deadline' | 'prize' | 'name'