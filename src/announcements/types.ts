export type AnnouncementType =
  | 'general'
  | 'tournament_update'
  | 'registration_notice'
  | 'match_schedule_update'
  | 'room_information'
  | 'result_announcement'
  | 'maintenance_notice'
  | 'important_alert'

export type AnnouncementAudience = 'public' | 'authenticated' | 'tournament_participants' | 'match_participants' | 'team_members'
export type AnnouncementStatus = 'draft' | 'published' | 'archived'

export interface PublicAnnouncement {
  id: string
  title: string
  content: string
  announcement_type: AnnouncementType
  published_at: string
  expires_at: string | null
  tournament_id: string | null
  tournament_name: string | null
  tournament_slug: string | null
  match_id: string | null
  match_number: number | null
  round_name: string | null
}

export interface AdminAnnouncement extends PublicAnnouncement {
  audience_type: AnnouncementAudience
  team_id: string | null
  status: AnnouncementStatus
  created_by: string
  created_at: string
  updated_at: string
}