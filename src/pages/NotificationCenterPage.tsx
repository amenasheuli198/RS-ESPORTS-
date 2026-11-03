import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { AppNotification, NotificationPreferences } from '../notifications/types'
import { formatTournamentDate } from '../tournaments/format'

const defaultPreferences: NotificationPreferences = {
  tournament_announcements: true,
  match_updates: true,
  team_updates: true,
  result_updates: true,
  system_updates: true,
}

function safeActionUrl(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return '/dashboard/notifications'
  return value
}

function NotificationCenterPage() {
  const { client, user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const configurationError = getSupabaseConfigurationError()

  const loadNotifications = useCallback(async () => {
    if (!client || !user || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Notifications are unavailable.')
      return
    }
    setIsLoading(true)
    setErrorMessage('')
    try {
      const [notificationResult, unreadResult, preferenceResult] = await Promise.all([
        client.from('tournament_registration_notifications')
          .select('id, recipient_id, title, message, event_type, tournament_id, related_match_id, related_team_id, related_announcement_id, action_url, is_read, read_at, created_at')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        client.from('tournament_registration_notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', user.id).is('read_at', null),
        client.from('notification_preferences').select('tournament_announcements, match_updates, team_updates, result_updates, system_updates').eq('user_id', user.id).maybeSingle(),
      ])
      if (notificationResult.error || unreadResult.error || preferenceResult.error) throw new Error('LOAD_FAILED')
      setNotifications((notificationResult.data ?? []) as AppNotification[])
      setUnreadCount(unreadResult.count ?? 0)
      setPreferences((preferenceResult.data as NotificationPreferences | null) ?? defaultPreferences)
    } catch {
      setErrorMessage('Your notifications could not be loaded. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [client, user, configurationError])

  useEffect(() => { void loadNotifications() }, [loadNotifications])

  async function markAllRead() {
    if (!client || !user || !unreadCount) return
    setNotice('')
    const readAt = new Date().toISOString()
    const { error } = await client.from('tournament_registration_notifications')
      .update({ read_at: readAt })
      .eq('recipient_id', user.id)
      .is('read_at', null)
    if (error) setErrorMessage('Notifications could not be marked as read.')
    else {
      setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, is_read: true, read_at: readAt }))
      setUnreadCount(0)
      setNotice('All notifications marked as read.')
    }
  }

  async function savePreferences() {
    if (!client) return
    setIsSavingPreferences(true)
    setNotice('')
    const { error } = await client.rpc('set_my_notification_preferences', {
      p_tournament_announcements: preferences.tournament_announcements,
      p_match_updates: preferences.match_updates,
      p_team_updates: preferences.team_updates,
      p_result_updates: preferences.result_updates,
      p_system_updates: true,
    })
    if (error) setErrorMessage('Notification preferences could not be saved.')
    else setNotice('Notification preferences saved. Critical system alerts remain enabled.')
    setIsSavingPreferences(false)
  }

  async function markOneRead(item: AppNotification) {
    if (!client || !user || item.read_at) return
    const readAt = new Date().toISOString()
    const { error } = await client.from('tournament_registration_notifications')
      .update({ read_at: readAt })
      .eq('id', item.id)
      .eq('recipient_id', user.id)
      .is('read_at', null)
    if (error) {
      setErrorMessage('Notification could not be marked as read.')
      return
    }
    setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, is_read: true, read_at: readAt } : notification))
    setUnreadCount((current) => Math.max(0, current - 1))
  }

  return (
    <main className="notification-center-page">
      <div className="page-width notification-center-content">
        <div className="notification-center-heading"><div><p className="auth-eyebrow">PLAYER INBOX / ACTIVITY</p><h1>Notifications.</h1><p>{unreadCount} unread notification{unreadCount === 1 ? '' : 's'} for your account.</p></div><button className="admin-refresh-button" type="button" disabled={!unreadCount} onClick={() => void markAllRead()}><CheckCheck size={14} /> Mark all read</button></div>
        {errorMessage && <p className="team-form-error" role="alert">{errorMessage}</p>}
        {notice && <p className="team-form-success" role="status">{notice}</p>}
        <section className="notification-center-list" aria-label="Notifications">
          {isLoading ? <div className="team-match-skeletons" aria-busy="true"><div /><div /><div /></div>
            : notifications.length ? notifications.map((item) => <article className={`notification-center-item${item.read_at ? '' : ' is-unread'}`} key={item.id}>
              <span className="notification-center-item__icon"><Bell size={16} /></span>
              <div><p>{item.event_type.replaceAll('_', ' ')}</p><h2>{item.title}</h2><p className="notification-center-item__message">{item.message}</p><small>{formatTournamentDate(item.created_at, 'UTC', true)}</small></div>
              <div className="notification-center-item__actions">{!item.read_at && <button type="button" onClick={() => void markOneRead(item)}>Mark read</button>}<Link to={safeActionUrl(item.action_url)} onClick={() => void markOneRead(item)}>Open</Link></div>
            </article>)
              : <div className="team-empty-state"><span className="team-feature-icon"><Bell size={20} /></span><h2>You’re all caught up.</h2><p>Registration, match, result, and announcement updates will appear here.</p></div>}
        </section>

        <section className="notification-preferences" aria-labelledby="notification-preferences-title">
          <div className="notification-preferences__heading"><span className="team-feature-icon"><Settings2 size={18} /></span><div><h2 id="notification-preferences-title">Notification preferences</h2><p>Choose which optional updates reach your in-app inbox.</p></div></div>
          <div className="notification-preferences__options">
            <PreferenceToggle label="Tournament announcements" checked={preferences.tournament_announcements} onChange={(checked) => setPreferences((current) => ({ ...current, tournament_announcements: checked }))} />
            <PreferenceToggle label="Match updates and reminders" checked={preferences.match_updates} onChange={(checked) => setPreferences((current) => ({ ...current, match_updates: checked }))} />
            <PreferenceToggle label="Team and invitation updates" checked={preferences.team_updates} onChange={(checked) => setPreferences((current) => ({ ...current, team_updates: checked }))} />
            <PreferenceToggle label="Published result updates" checked={preferences.result_updates} onChange={(checked) => setPreferences((current) => ({ ...current, result_updates: checked }))} />
            <div className="notification-preference-fixed"><b>Critical system alerts</b><span>Always on</span></div>
          </div>
          <button className="team-button" type="button" disabled={isSavingPreferences} onClick={() => void savePreferences()}>{isSavingPreferences ? 'Saving...' : 'Save preferences'}</button>
        </section>
      </div>
    </main>
  )
}

function PreferenceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="notification-preference-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>
}

export default NotificationCenterPage