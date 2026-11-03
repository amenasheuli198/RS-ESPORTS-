export interface AppNotification {
  id: string
  recipient_id: string
  title: string
  message: string
  event_type: string
  tournament_id: string | null
  related_match_id: string | null
  related_team_id: string | null
  related_announcement_id: string | null
  action_url: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface NotificationPreferences {
  tournament_announcements: boolean
  match_updates: boolean
  team_updates: boolean
  result_updates: boolean
  system_updates: boolean
}