import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface TicketRecord {
  id: string
  ticket_number: string
  subject: string
  category: string
  priority: string
  status: string
  created_at: string
  updated_at: string
}

function SupportDashboardPage() {
  const { client, user } = useAuth()
  const [tickets, setTickets] = useState<TicketRecord[]>([])
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('other')
  const [priority, setPriority] = useState('normal')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || !user || configurationError) {
      setIsLoading(false)
      setNotice(configurationError ?? 'Support dashboard is unavailable.')
      return () => { active = false }
    }

    const safeClient = client
    const safeUser = user

    async function loadTickets() {
      try {
        const { data, error } = await safeClient.from('support_tickets').select('*').eq('user_id', safeUser.id).order('created_at', { ascending: false })
        if (!active) return
        if (error) throw error
        setTickets((data ?? []) as TicketRecord[])
      } catch {
        if (!active) return
        setNotice('Your support tickets could not be loaded.')
        setIsError(true)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadTickets()
    return () => { active = false }
  }, [client, configurationError, user])

  async function handleTicketCreate() {
    if (!client || !user) return
    if (subject.trim().length < 3 || message.trim().length < 10) {
      setIsError(true)
      setNotice('Add a clear subject and enough detail to open a support ticket.')
      return
    }

    try {
      const { error } = await client.rpc('create_support_ticket', {
        p_subject: subject.trim(),
        p_category: category,
        p_priority: priority,
        p_message: message.trim(),
      })
      if (error) throw error
      setIsError(false)
      setNotice('Support ticket submitted successfully.')
      setSubject('')
      setCategory('other')
      setPriority('normal')
      setMessage('')
      const { data } = await client.from('support_tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      setTickets((data ?? []) as TicketRecord[])
    } catch {
      setIsError(true)
      setNotice('Your ticket could not be created. Please try again.')
    }
  }

  return (
    <main className="page-width support-dashboard-page">
      <header className="announcements-heading">
        <div>
          <p className="section-heading__eyebrow">PLAYER / SUPPORT</p>
          <h1>Support center.</h1>
          <p>Manage tickets, updates, and issue tracking for your account and tournament activity.</p>
        </div>
      </header>

      <section className="profile-panel">
        <h2>Open a new ticket</h2>
        <div className="profile-form">
          <label className="form-field"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          <label className="form-field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="account_login">Account & Login</option>
            <option value="team_management">Team Management</option>
            <option value="tournament_registration">Tournament Registration</option>
            <option value="match_issues">Match Issues</option>
            <option value="room_access">Room ID / Password</option>
            <option value="results_scoring">Results & Scoring</option>
            <option value="payment">Payment Issues</option>
            <option value="technical">Technical Problems</option>
            <option value="other">Other</option>
          </select></label>
          <label className="form-field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select></label>
          <label className="form-field"><span>Message</span><textarea rows={6} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
          {notice && <p className={isError ? 'auth-error' : 'auth-success-message'} role="status">{notice}</p>}
          <button type="button" className="auth-submit" onClick={() => void handleTicketCreate()}>Submit ticket</button>
        </div>
      </section>

      <section className="player-profile-panel">
        <h2>Your tickets</h2>
        {isLoading ? <p>Loading tickets...</p> : tickets.length ? tickets.map((ticket) => (
          <article className="admin-dashboard-list__item" key={ticket.id}>
            <div>
              <strong>{ticket.ticket_number}</strong>
              <small>{ticket.subject}</small>
            </div>
            <span>{ticket.status}</span>
          </article>
        )) : <p>No support tickets yet.</p>}
      </section>
    </main>
  )
}

export default SupportDashboardPage
