export type MatchStatus = 'scheduled' | 'room_ready' | 'live' | 'completed' | 'cancelled' | 'delayed'
export type RoomStatus = 'not_ready' | 'ready' | 'closed'

export interface PublicMatch {
  id: string
  tournament_id: string
  tournament_name: string
  tournament_slug: string
  match_name: string
  match_number: number
  round_name: string
  scheduled_at: string
  timezone: string
  duration_minutes: number | null
  status: MatchStatus
  public_notes: string
  created_at: string
}

export interface TeamMatch extends PublicMatch {
  match_id: string
  team_id: string
  team_name: string
  room_status: RoomStatus
  room_release_at: string | null
}

export interface MatchRoomCredentials {
  room_id: string
  room_password: string | null
  release_at: string
  access_instructions: string
}

export interface ApprovedRegistrationOption {
  id: string
  team_id: string
  team_name: string
  tournament_id: string
  status: 'approved'
}

export interface MatchAssignment {
  assignment_id: string
  registration_id: string
  team_id: string
  team_name: string
  captain_name: string
  assigned_at: string
}

export interface AdminMatch {
  match_id: string
  name: string
  match_number: number
  round_name: string
  scheduled_at: string
  timezone: string
  duration_minutes: number | null
  status: MatchStatus
  lobby_capacity: number
  public_notes: string
  assigned_count: number
}