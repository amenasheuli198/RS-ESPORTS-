export type TeamRole = 'captain' | 'starting_player' | 'substitute'
export type TeamMemberStatus = 'active' | 'removed'
export type TeamInvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled'

export interface Team {
  id: string
  name: string
  slug: string
  game_code: string
  format_code: string
  logo_path: string | null
  description: string | null
  region: string | null
  created_at: string
  updated_at: string
}

export interface TeamMember {
  member_id: string
  user_id: string
  full_name?: string
  ign: string
  free_fire_uid: string
  role: TeamRole
  slot: number
  status: TeamMemberStatus
  joined_at: string
}

export interface TeamInvitation {
  invitation_id: string
  invited_user_id?: string
  invited_user_name?: string
  team_id?: string
  team_name?: string
  logo_path?: string | null
  role: Exclude<TeamRole, 'captain'>
  status: TeamInvitationStatus
  created_at: string
}