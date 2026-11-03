import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useTeam } from '../teams/TeamContext'
import { SectionHeading } from '../components/ui'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface TeamResultRow {
  result_id: string
  match_id: string
  match_number: number
  round_name: string
  scheduled_at: string
  timezone: string
  tournament_name: string
  tournament_slug: string
  placement_rank: number
  total_kills: number
  placement_points: number
  kill_points: number
  total_points: number
}

function TeamResultsPage() {
  const { client } = useAuth()
  const { team } = useTeam()
  const [rows, setRows] = useState<TeamResultRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || !team || configurationError) {
      setIsLoading(false)
      if (configurationError) setErrorMessage(configurationError)
      return () => { active = false }
    }
    void client.from('team_results_public').select('*').eq('team_id', team.id).order('scheduled_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setErrorMessage('Published team results could not be loaded.')
        else setRows((data ?? []) as TeamResultRow[])
        setIsLoading(false)
      }).catch(() => {
        if (!active) return
        setErrorMessage('Published team results could not be loaded.')
        setIsLoading(false)
      })
    return () => { active = false }
  }, [client, team, configurationError])

  return <section className="team-results-page"><SectionHeading eyebrow="Team / results" title="Published results." description={`Official results for ${team?.name ?? 'your team'}. Unpublished scores are not shown.`} />{isLoading ? <div className="team-match-skeletons" aria-busy="true"><div /><div /></div> : errorMessage ? <p className="team-form-error" role="alert">{errorMessage}</p> : rows.length ? <div className="team-results-list">{rows.map((row) => <article className="team-results-row" key={row.result_id}><div><p>{row.tournament_name}</p><h3>{row.round_name} / Match {row.match_number}</h3><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: row.timezone }).format(new Date(row.scheduled_at))} / {row.timezone}</small></div><div className="team-results-row__scores"><span>Placement <b>#{row.placement_rank}</b></span><span>Kills <b>{row.total_kills}</b></span><span>Placement pts <b>{Number(row.placement_points).toFixed(2)}</b></span><span>Kill pts <b>{Number(row.kill_points).toFixed(2)}</b></span><strong>{Number(row.total_points).toFixed(2)} pts</strong></div><Link to={`/matches/${row.match_id}/results`}>Match results</Link><Link to={`/tournaments/${row.tournament_slug}/leaderboard`}>Tournament standings</Link></article>)}</div> : <div className="team-empty-state"><h2>No published results yet.</h2><p>Your completed match results will appear here after the tournament administrator publishes them.</p></div>}</section>
}

export default TeamResultsPage