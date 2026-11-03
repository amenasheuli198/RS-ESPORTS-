import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { LeaderboardRow } from '../components/results/LeaderboardTable'
import LeaderboardTable from '../components/results/LeaderboardTable'

function PublicMatchResultsPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { client } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [match, setMatch] = useState<{ tournament_slug: string; tournament_name: string; match_number: number; round_name: string; scheduled_at: string; timezone: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || !matchId || configurationError) {
      setErrorMessage(configurationError ?? 'Match results are unavailable.')
      setIsLoading(false)
      return () => { active = false }
    }

    const supabaseClient = client

    async function loadResults() {
      try {
        const { data, error } = await supabaseClient.from('match_results_public').select('*').eq('match_id', matchId).order('placement_rank', { ascending: true })
        if (!active) return
        if (error) setErrorMessage('Published match results could not be loaded.')
        else if (data?.length) {
          const first = data[0]
          setRows(data.map((row) => ({
            rank: row.placement_rank,
            team_id: row.team_id,
            team_name: row.team_name,
            matches_played: 1,
            first_place_finishes: row.placement_rank === 1 ? 1 : 0,
            total_kills: row.total_kills,
            placement_points: row.placement_points,
            kill_points: row.kill_points,
            total_points: row.total_points,
          })))
          setMatch({ tournament_slug: first.tournament_slug, tournament_name: first.tournament_name, match_number: first.match_number, round_name: first.round_name, scheduled_at: first.scheduled_at, timezone: first.timezone })
        }
      } catch {
        if (!active) return
        setErrorMessage('Published match results could not be loaded.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadResults()
    return () => { active = false }
  }, [client, matchId, configurationError])

  return <><SiteHeader /><main className="results-page"><div className="page-width results-page__content">{match && <Link className="tournament-back-link" to={`/tournaments/${match.tournament_slug}`}>← {match.tournament_name}</Link>}<div className="results-page__heading"><div><p className="section-heading__eyebrow">PUBLISHED MATCH RESULTS</p><h1>{match ? `${match.round_name} / Match ${match.match_number}` : 'Match results.'}</h1>{match && <p>{match.tournament_name} / {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: match.timezone }).format(new Date(match.scheduled_at))} / {match.timezone}</p>}</div></div>
  {isLoading ? <div className="team-match-skeletons" aria-busy="true"><div /><div /></div>
    : errorMessage ? <div className="arena-state arena-state--error" role="alert"><h2>Results unavailable.</h2><p>{errorMessage}</p></div>
      : rows.length ? <LeaderboardTable rows={rows} /> : <div className="arena-state"><h2>Results are not published.</h2><p>Results stay private until all assigned team results are verified and published.</p></div>}
</div></main><SiteFooter /></>
}

export default PublicMatchResultsPage