import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import type { AppNotification } from '../../notifications/types'
import { formatTournamentDate } from '../../tournaments/format'

function safeActionUrl(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return '/dashboard/notifications'
  return value
}

function NotificationBell() {
  const { client, user } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<AppNotification[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  const refreshUnread = useCallback(async () => {
    if (!client || !user) {
      setUnreadCount(0)
      return
    }
    const { count, error } = await client.from('tournament_registration_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null)
    if (!error) setUnreadCount(count ?? 0)
  }, [client, user])

  const loadRecent = useCallback(async () => {
    if (!client || !user) return
    setErrorMessage('')
    const { data, error } = await client.from('tournament_registration_notifications')
      .select('id, recipient_id, title, message, event_type, tournament_id, related_match_id, related_team_id, related_announcement_id, action_url, is_read, read_at, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(6)
    if (error) setErrorMessage('Notifications could not be loaded.')
    else setItems((data ?? []) as AppNotification[])
    await refreshUnread()
  }, [client, user, refreshUnread])

  useEffect(() => {
    void refreshUnread()
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void refreshUnread()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshUnread])

  useEffect(() => {
    if (!isOpen) return
    void loadRecent()
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, loadRecent])

  async function markRead(notification: AppNotification) {
    if (!client || !user || notification.read_at) return
    const readAt = new Date().toISOString()
    const { error } = await client.from('tournament_registration_notifications')
      .update({ read_at: readAt })
      .eq('id', notification.id)
      .eq('recipient_id', user.id)
      .is('read_at', null)
    if (error) {
      setErrorMessage('Notification could not be marked as read.')
      return
    }
    setItems((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true, read_at: readAt } : item))
    await refreshUnread()
  }

  if (!user) return null

  return (
    <div className="notification-bell" ref={rootRef}>
      <button className="notification-bell__toggle" type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={isOpen} aria-controls="notification-popover" onClick={() => setIsOpen((open) => !open)}>
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-bell__count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {isOpen && <section className="notification-popover" id="notification-popover" aria-label="Recent notifications">
        <div className="notification-popover__heading"><div><h2>Notifications</h2><span>{unreadCount} unread</span></div><Link to="/dashboard/notifications" onClick={() => setIsOpen(false)}>View all</Link></div>
        {errorMessage ? <p className="notification-popover__error" role="alert">{errorMessage}</p>
          : items.length ? <div className="notification-popover__list">{items.map((item) => <article className={`notification-item${item.read_at ? '' : ' is-unread'}`} key={item.id}>
            <Link to={safeActionUrl(item.action_url)} onClick={() => { void markRead(item); setIsOpen(false) }}><span className="notification-item__type">{item.event_type.replaceAll('_', ' ')}</span><b>{item.title}</b><p>{item.message}</p><small>{formatTournamentDate(item.created_at, 'UTC', true)}</small></Link>
            {!item.read_at && <button type="button" aria-label={`Mark ${item.title} as read`} onClick={() => void markRead(item)}><Check size={14} /></button>}
          </article>)}</div>
            : <div className="notification-popover__empty"><Bell size={19} /><p>You’re all caught up.</p></div>}
        <Link className="notification-popover__footer" to="/dashboard/notifications" onClick={() => setIsOpen(false)}>Open notification center <ExternalLink size={13} /></Link>
      </section>}
    </div>
  )
}

export default NotificationBell