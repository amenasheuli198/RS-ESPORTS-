import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import LeaderboardTable, { type LeaderboardRow } from '../components/results/LeaderboardTable'
import { getSupabaseConfigurationError } from '../services/supabase/client'

function TournamentLeaderboardPage() {
  const { slug } = useParams<{ slug: string }>()
  const { client } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [tournamentName, setTournamentName] = useState('Tournament standings')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || !slug || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Tournament is unavailable.')
      return () => { active = false }
    }
    setIsLoading(true)
    void client.from('tournament_leaderboard').select('*').eq('tournament_slug', slug).order('rank', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setErrorMessage('Tournament standings could not be loaded.')
          setRows([])
        } else {
          const nextRows = (data ?? []) as LeaderboardRow[]
          setRows(nextRows)
          setTournamentName(nextRows[0]?.tournament_name ?? 'Tournament standings')
        }
        setIsLoading(false)
      }).catch(() => {
        if (!active) return
        setErrorMessage('Tournament standings could not be loaded.')
        setIsLoading(false)
      })
    return () => { active = false }
  }, [client, slug, configurationError])

  return <><SiteHeader /><main className="results-page"><div className="page-width results-page__content"><Link className="tournament-back-link" to={`/tournaments/${slug}`}>← Tournament details</Link><div className="results-page__heading"><div><p className="section-heading__eyebrow">EVENT STANDINGS</p><h1>{tournamentName} leaderboard.</h1><p>Ranking follows this tournament’s configured tie-break rules. Only published results are included.</p></div><Trophy size={22} /></div>
    {isLoading ? <div className="team-match-skeletons" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
      : errorMessage ? <div className="arena-state arena-state--error" role="alert"><h2>Standings unavailable.</h2><p>{errorMessage}</p></div>
        : rows.length ? <LeaderboardTable rows={rows} /> : <div className="arena-state"><Trophy size={24} /><h2>No published standings yet.</h2><p>Results will appear after the administrator publishes all match results.</p></div>}
  </div></main><SiteFooter /></>
}

export default TournamentLeaderboardPage