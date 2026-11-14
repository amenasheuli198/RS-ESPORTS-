import { useCallback, useEffect, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { formatTournamentDate } from '../tournaments/format'

interface MemberRow {
  user_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  created_at: string
  email_confirmed_at: string | null
  profile_completed_at: string | null
  team_id: string | null
  team_name: string | null
  team_code: string | null
  team_role: string | null
  ign: string | null
  game_code: string | null
  external_id: string | null
}

function AdminMembersPage() {
  const { client } = useAuth()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<MemberRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, unknown> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const loadMembers = useCallback(async () => {
    if (!client) return
    setIsLoading(true)
    try {
      const { data, error } = await client.rpc('get_admin_members', { p_search: query, p_limit: 50, p_offset: 0 })
      if (error) throw error
      setItems((data ?? []) as MemberRow[])
      if (selectedId && !(data ?? []).some((member: MemberRow) => member.user_id === selectedId)) {
        setSelectedId(null)
        setDetails(null)
      }
    } catch {
      setIsError(true)
      setMessage('Member review data could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }, [client, query, selectedId])

  useEffect(() => { void loadMembers() }, [loadMembers])

  async function showMember(userId: string) {
    if (!client) return
    try {
      const { data, error } = await client.rpc('get_admin_member_details', { p_user_id: userId })
      if (error) throw error
      setSelectedId(userId)
      setDetails((data ?? null) as Record<string, unknown> | null)
    } catch {
      setIsError(true)
      setMessage('Member details could not be loaded.')
    }
  }

  return (
    <section className="admin-tournament-list">
      <div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / MEMBERS</p><h1>Member management.</h1><p>Search for players, inspect their team information, and review their competition history.</p></div></div>
      <label className="admin-form-field" style={{ marginBottom: '1rem' }}>
        <span><Search size={15} /> Search members</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, email, team" />
      </label>
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="admin-tournament-list__items">
        {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
          : items.map((member) => (
            <article key={member.user_id} className="admin-tournament-row">
              <div className="admin-tournament-row__main">
                <div className="admin-tournament-row__title"><h2>{member.full_name ?? 'Unnamed member'}</h2><span className="registration-status registration-status--confirmed">{member.team_name ?? 'No team'}</span></div>
                <p>{member.email ?? 'No email'} · {member.phone ?? 'No phone'}</p>
                <small>Created {formatTournamentDate(member.created_at, 'UTC', true)} · Verified {member.email_confirmed_at ? 'Yes' : 'No'} · Team code {member.team_code ?? '—'}</small>
              </div>
              <div className="admin-tournament-row__actions">
                <button type="button" onClick={() => void showMember(member.user_id)}><ShieldCheck size={15} /> View profile</button>
              </div>
            </article>
          ))}
      </div>
      {details && <div className="team-form-hint" style={{ marginTop: '1rem' }}><h3>Member details</h3><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(details, null, 2)}</pre></div>}
    </section>
  )
}

export default AdminMembersPage
