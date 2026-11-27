import { useCallback, useEffect, useState } from 'react'
import { RotateCw, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { formatTournamentDate } from '../tournaments/format'

interface MemberRow {
  user_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string
  registered_at: string
  email_confirmed_at: string | null
  profile_completed_at: string | null
  team_id: string | null
  team_name: string | null
  team_role: string | null
  total_count: number
}

const pageSize = 50

function AdminMembersPage() {
  const { client } = useAuth()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<MemberRow[]>([])
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const loadMembers = useCallback(async () => {
    if (!client) {
      setIsLoading(false)
      setIsError(true)
      setMessage('Member directory is unavailable because Supabase is not configured.')
      return
    }
    setIsLoading(true)
    setMessage('')
    setIsError(false)
    try {
      const { data, error } = await client.rpc('get_admin_members_directory', {
        p_search: query.trim(), p_limit: pageSize, p_offset: page * pageSize,
      })
      if (error) throw error
      const rows = (data ?? []) as MemberRow[]
      setItems(rows)
      setTotalCount(Number(rows[0]?.total_count ?? 0))
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error && error.message.includes('ADMIN_REQUIRED')
        ? 'Your account does not have administrator access to member records.'
        : 'Member records could not be loaded. Check your connection and refresh.')
      setItems([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [client, page, query])

  useEffect(() => { void loadMembers() }, [loadMembers])

  return (
    <section className="admin-work-page">
      <div className="admin-work-heading"><div><p className="section-heading__eyebrow">DIRECTORY / MEMBERS</p><h1>Members.</h1><p>Verified accounts, profile details, roles, and team membership.</p></div><button className="admin-refresh-button" type="button" onClick={() => void loadMembers()} disabled={isLoading}><RotateCw size={15} /> Refresh</button></div>
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="admin-directory-toolbar"><label className="admin-directory-search"><Search size={16} /><span className="visually-hidden">Search members</span><input type="search" value={query} onChange={(event) => { setPage(0); setQuery(event.target.value) }} placeholder="Name, email, phone, role, team" /></label><span className="admin-directory-total">{totalCount.toLocaleString()} members</span></div>
      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
        : items.length ? <div className="admin-data-table-wrap"><table className="admin-data-table">
          <thead><tr><th scope="col">Member</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Role</th><th scope="col">Team</th><th scope="col">Registered</th><th scope="col">Profile</th></tr></thead>
          <tbody>{items.map((member) => <tr key={member.user_id}>
            <th scope="row">{member.full_name || 'Name not set'}</th><td>{member.email || '—'}{member.email_confirmed_at && <small className="admin-table-subline">Verified</small>}</td><td>{member.phone || '—'}</td><td><span className="admin-role-label">{member.role.replaceAll('_', ' ')}</span></td><td>{member.team_name || 'No team'}{member.team_role && <small className="admin-table-subline">{member.team_role.replaceAll('_', ' ')}</small>}</td><td>{formatTournamentDate(member.registered_at, 'UTC', true)}</td><td>{member.profile_completed_at ? 'Complete' : 'Incomplete'}</td>
          </tr>)}</tbody>
        </table></div> : <div className="arena-state"><Search size={24} /><h2>No members found.</h2><p>{query ? 'Try another name, email, phone, role, or team.' : 'Verified and unverified user accounts will appear here.'}</p></div>}
      <div className="admin-directory-pagination"><button type="button" disabled={page === 0 || isLoading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))}</span><button type="button" disabled={(page + 1) * pageSize >= totalCount || isLoading} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </section>
  )
}

export default AdminMembersPage
