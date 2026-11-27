import { useCallback, useEffect, useState } from 'react'
import { RotateCw, Search, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import TeamLogo from '../components/team/TeamLogo'
import { formatTournamentDate } from '../tournaments/format'

interface TeamMemberRow {
  user_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string
  slot: number
  status: string
  joined_at: string
  ign: string | null
  free_fire_uid: string | null
}

interface TeamRow {
  team_id: string
  team_name: string
  team_code: string | null
  logo_path: string | null
  game_code: string
  format_code: string
  created_at: string
  captain_user_id: string | null
  captain_name: string | null
  captain_email: string | null
  captain_phone: string | null
  roster: TeamMemberRow[]
  total_count: number
}

const pageSize = 25

function AdminTeamsPage() {
  const { client } = useAuth()
  const [items, setItems] = useState<TeamRow[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const loadTeams = useCallback(async () => {
    if (!client) {
      setIsLoading(false)
      setIsError(true)
      setMessage('Team directory is unavailable because Supabase is not configured.')
      return
    }
    setIsLoading(true)
    setMessage('')
    setIsError(false)
    try {
      const { data, error } = await client.rpc('get_admin_teams_directory', {
        p_search: query.trim(), p_limit: pageSize, p_offset: page * pageSize,
      })
      if (error) throw error
      const rows = (data ?? []) as TeamRow[]
      setItems(rows)
      setTotalCount(Number(rows[0]?.total_count ?? 0))
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error && error.message.includes('ADMIN_REQUIRED')
        ? 'Your account does not have administrator access to the team directory.'
        : 'Team records could not be loaded. Check your connection and refresh.')
      setItems([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [client, page, query])

  useEffect(() => { void loadTeams() }, [loadTeams])

  return (
    <section className="admin-work-page">
      <div className="admin-work-heading">
        <div><p className="section-heading__eyebrow">DIRECTORY / ALL TEAMS</p><h1>Teams.</h1><p>Team leaders, badges, and registered player rosters.</p></div>
        <button className="admin-refresh-button" type="button" onClick={() => void loadTeams()} disabled={isLoading}><RotateCw size={15} /> Refresh</button>
      </div>
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="admin-directory-toolbar">
        <label className="admin-directory-search"><Search size={16} /><span className="visually-hidden">Search teams</span><input type="search" value={query} onChange={(event) => { setPage(0); setQuery(event.target.value) }} placeholder="Search team, code, leader, email" /></label>
        <span className="admin-directory-total">{totalCount.toLocaleString()} teams</span>
      </div>
      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
        : items.length ? <div className="admin-data-table-wrap"><table className="admin-data-table admin-team-table">
          <thead><tr><th scope="col">Team</th><th scope="col">Leader</th><th scope="col">Game / format</th><th scope="col">Created</th><th scope="col">Roster</th></tr></thead>
          <tbody>{items.map((team) => <tr key={team.team_id}>
            <td><div className="admin-team-identity"><TeamLogo path={team.logo_path} teamName={team.team_name} /><div><b>{team.team_name}</b><small>{team.team_code ?? 'No team code'}</small></div></div></td>
            <td><b>{team.captain_name || 'Leader not assigned'}</b><small>{team.captain_email || 'No email'}{team.captain_phone ? ` · ${team.captain_phone}` : ''}</small></td>
            <td>{team.game_code.replaceAll('_', ' ')}<small>{team.format_code.replaceAll('_', ' ')}</small></td>
            <td>{formatTournamentDate(team.created_at, 'UTC', true)}</td>
            <td><details className="admin-roster-details"><summary><Users size={14} /> {team.roster.length} players</summary>
              <div className="admin-roster-list">{team.roster.length ? team.roster.map((member) => <article key={member.user_id}>
                <b>{member.full_name || member.ign || 'Unnamed player'}</b><span>{member.role.replaceAll('_', ' ')} · Slot {member.slot}</span>
                <small>{member.email || 'No email'}{member.phone ? ` · ${member.phone}` : ''}</small>
                <small>IGN {member.ign || '—'}{member.free_fire_uid ? ` · UID ${member.free_fire_uid}` : ''}</small>
              </article>) : <p>No active roster members.</p>}</div>
            </details></td>
          </tr>)}</tbody>
        </table></div> : <div className="arena-state"><Users size={24} /><h2>No teams found.</h2><p>{query ? 'Try another team, code, leader, or email.' : 'Teams will appear here after members create them.'}</p></div>}
      <div className="admin-directory-pagination"><button type="button" disabled={page === 0 || isLoading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))}</span><button type="button" disabled={(page + 1) * pageSize >= totalCount || isLoading} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </section>
  )
}

export default AdminTeamsPage
