import { useEffect, useState } from 'react'
import { Search, Trophy } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import LeaderboardTable, { type LeaderboardRow } from '../components/results/LeaderboardTable'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { PublicTournament } from '../tournaments/types'

function LeaderboardPage() {
  const { client } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [tournaments, setTournaments] = useState<Pick<PublicTournament, 'id' | 'name'>[]>([])
  const [tournamentId, setTournamentId] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('rank')
  const [page, setPage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()
  const pageSize = 25

  useEffect(() => {
    let active = true
    if (!client || configurationError) return () => { active = false }
    void client.from('tournaments_public').select('id, name').order('starts_at', { ascending: false }).then(({ data }) => {
      if (active) setTournaments((data ?? []) as Pick<PublicTournament, 'id' | 'name'>[])
    }).catch(() => {
      if (active) setTournaments([])
    })
    return () => { active = false }
  }, [client, configurationError])

  useEffect(() => {
    let active = true
    if (!client || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Leaderboard data is unavailable.')
      return () => { active = false }
    }
    setIsLoading(true)
    let request = tournamentId === 'all'
      ? client.from('global_leaderboard').select('*', { count: 'exact' })
      : client.from('tournament_leaderboard').select('*', { count: 'exact' }).eq('tournament_id', tournamentId)
    if (search.trim()) request = request.ilike('team_name', `%${search.trim().replace(/[%_]/g, '\\$&')}%`)
    const sortColumns: Record<string, { column: string; ascending: boolean }> = {
      rank: { column: 'rank', ascending: true },
      points: { column: 'total_points', ascending: false },
      wins: { column: 'first_place_finishes', ascending: false },
      kills: { column: 'total_kills', ascending: false },
      name: { column: 'team_name', ascending: true },
    }
    const ordering = sortColumns[sort] ?? sortColumns.rank
    void request.order(ordering.column, { ascending: ordering.ascending }).range(page * pageSize, page * pageSize + pageSize - 1).then(({ data, error, count: resultCount }) => {
      if (!active) return
      if (error) {
        setErrorMessage('Published leaderboard could not be loaded.')
        setRows([])
      } else {
        setErrorMessage('')
        setRows((data ?? []) as LeaderboardRow[])
        setCount(resultCount ?? 0)
      }
      setIsLoading(false)
    }).catch(() => {
      if (!active) return
      setErrorMessage('Published leaderboard could not be loaded.')
      setIsLoading(false)
    })
    return () => { active = false }
  }, [client, configurationError, search, page, tournamentId, sort])

  return <><SiteHeader /><main className="results-page"><div className="page-width results-page__content"><div className="results-page__heading"><div><p className="section-heading__eyebrow">RS / PUBLISHED STANDINGS</p><h1>{tournamentId === 'all' ? 'Global leaderboard.' : `${tournaments.find((item) => item.id === tournamentId)?.name ?? 'Tournament'} leaderboard.`}</h1><p>Published results only. Scoring rules can vary by tournament.</p></div><Trophy size={22} /></div><div className="results-controls"><label className="results-search"><Search size={16} /><span className="visually-hidden">Search team names</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search team name" /></label><label className="results-filter"><span>Tournament</span><select value={tournamentId} onChange={(event) => { setTournamentId(event.target.value); setPage(0) }}><option value="all">All tournaments</option>{tournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}</select></label><label className="results-filter"><span>Sort by</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(0) }}><option value="rank">Official rank</option><option value="points">Total points</option><option value="wins">First-place finishes</option><option value="kills">Total kills</option><option value="name">Team name</option></select></label></div>
  {isLoading ? <div className="team-match-skeletons" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
    : errorMessage ? <div className="arena-state arena-state--error" role="alert"><h2>Leaderboard unavailable.</h2><p>{errorMessage}</p></div>
      : rows.length ? <><LeaderboardTable rows={rows} showTournament={tournamentId === 'all'} /><nav className="arena-pagination" aria-label="Leaderboard pages"><button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(count / pageSize))}</span><button type="button" disabled={(page + 1) * pageSize >= count} onClick={() => setPage((value) => value + 1)}>Next</button></nav></>
        : <div className="arena-state"><Trophy size={24} /><h2>{search ? 'No teams match this search.' : 'No published results yet.'}</h2><p>Teams appear when administrators publish completed match results.</p></div>}
</div></main><SiteFooter /></>
}

export default LeaderboardPage