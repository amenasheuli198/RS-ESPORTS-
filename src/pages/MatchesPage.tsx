import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Search, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import MatchStatusBadge from '../components/matches/MatchStatusBadge'
import { formatTournamentDate } from '../tournaments/format'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { PublicMatch } from '../matches/types'

function MatchesPage() {
  const { client } = useAuth()
  const [matches, setMatches] = useState<PublicMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [tournamentFilter, setTournamentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Match schedule is unavailable.')
      return () => { active = false }
    }

    const supabaseClient = client

    async function loadMatches() {
      try {
        setIsLoading(true)
        const { data, error } = await supabaseClient.from('matches_public').select('*').order('scheduled_at', { ascending: true }).limit(200)
        if (!active) return
        if (error) {
          setErrorMessage('Match schedule could not be loaded. Please try again.')
          setMatches([])
        } else {
          setMatches((data ?? []) as PublicMatch[])
          setErrorMessage('')
        }
      } catch {
        if (!active) return
        setErrorMessage('Match schedule could not be loaded. Please try again.')
        setMatches([])
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadMatches()
    return () => { active = false }
  }, [client, configurationError])

  const tournaments = useMemo(() => [...new Map(matches.map((match) => [match.tournament_id, { id: match.tournament_id, name: match.tournament_name }])).values()], [matches])
  const visibleMatches = useMemo(() => matches.filter((match) => {
    const searchText = search.trim().toLowerCase()
    const matchesSearch = !searchText || `${match.tournament_name} ${match.match_name} ${match.round_name}`.toLowerCase().includes(searchText)
    return matchesSearch && (tournamentFilter === 'all' || match.tournament_id === tournamentFilter)
      && (statusFilter === 'all' || match.status === statusFilter)
  }), [matches, search, tournamentFilter, statusFilter])

  return (
    <>
      <SiteHeader />
      <main className="matches-page">
        <div className="page-width matches-page__content">
          <div className="matches-page__heading"><div><p className="section-heading__eyebrow">RS / MATCH DAY</p><h1>Match schedule.</h1><p>Published tournament schedules. Room details remain private to assigned teams.</p></div><span className="matches-page__mark"><Swords size={19} /> THE ARENA</span></div>
          <div className="matches-page__filters"><label className="matches-search"><Search size={16} /><span className="visually-hidden">Search matches</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tournament or round" /></label><label><span>Tournament</span><select value={tournamentFilter} onChange={(event) => setTournamentFilter(event.target.value)}><option value="all">All tournaments</option>{tournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}</select></label><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="scheduled">Scheduled</option><option value="room_ready">Room Ready</option><option value="live">Live</option><option value="delayed">Delayed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div>
          {isLoading ? <div className="matches-skeleton-list" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
            : errorMessage ? <div className="arena-state arena-state--error" role="alert"><CalendarDays size={23} /><h2>Schedule unavailable.</h2><p>{errorMessage}</p></div>
              : visibleMatches.length ? <div className="matches-list">{visibleMatches.map((match) => <article className="match-card" key={match.id}>
                <div className="match-card__number"><span>MATCH</span><b>{match.match_number.toString().padStart(2, '0')}</b></div>
                <div className="match-card__main"><p><Link to={`/tournaments/${match.tournament_slug}`}>{match.tournament_name}</Link></p><h2>{match.round_name} <span>/</span> {match.match_name}</h2><div className="match-card__meta"><span><CalendarDays size={14} />{formatTournamentDate(match.scheduled_at, match.timezone, true)}</span><span>{match.timezone}</span>{match.duration_minutes && <span>{match.duration_minutes} min</span>}</div>{match.public_notes && <p className="match-card__notes">{match.public_notes}</p>}</div>
                <MatchStatusBadge status={match.status} />
                <p className="match-card__privacy">Room credentials are available only to assigned teams at release time.</p>
                {match.status === 'completed' && <Link className="match-card__results-link" to={`/matches/${match.id}/results`}>Published results</Link>}
              </article>)}</div> : <div className="arena-state"><Swords size={25} /><h2>{matches.length ? 'No matches match those filters.' : 'No matches scheduled yet.'}</h2><p>{matches.length ? 'Adjust your search or filters to see other matches.' : 'Published match schedules will appear here when organizers create them.'}</p></div>}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

export default MatchesPage