import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, BellRing, CalendarRange, Gauge, LayoutDashboard, ShieldCheck, Trophy, UserRound, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import { formatTournamentDate } from '../tournaments/format'

interface DashboardStats {
  registeredUsers: number
  totalTeams: number
  totalTournaments: number
  activeTournaments: number
  pendingRegistrations: number
  scheduledMatches: number
  liveMatches: number
  completedMatches: number
  publishedResults: number
  adminUnreadNotifications: string
}

interface TrendStats {
  newUsers: number
  newTeams: number
  newTournaments: number
  newRegistrations: number
}

interface SummaryCard {
  label: string
  value: string
  detail: string
  icon: typeof Users
  link?: string
}

const ranges = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
] as const

type RangeKey = (typeof ranges)[number]['key']

function toIsoDaysAgo(days: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function AdminDashboardPage() {
  const { client } = useAuth()
  const [range, setRange] = useState<RangeKey>('30d')
  const [stats, setStats] = useState<DashboardStats>({
    registeredUsers: 0,
    totalTeams: 0,
    totalTournaments: 0,
    activeTournaments: 0,
    pendingRegistrations: 0,
    scheduledMatches: 0,
    liveMatches: 0,
    completedMatches: 0,
    publishedResults: 0,
    adminUnreadNotifications: 'Unavailable',
  })
  const [trends, setTrends] = useState<TrendStats>({
    newUsers: 0,
    newTeams: 0,
    newTournaments: 0,
    newRegistrations: 0,
  })
  const [upcomingTournaments, setUpcomingTournaments] = useState<Array<{ id: string; name: string; starts_at: string; publication_status: string; slug: string }>>([])
  const [upcomingMatches, setUpcomingMatches] = useState<Array<{ id: string; name: string; tournament_id: string; match_number: number; scheduled_at: string; status: string; round_name: string; tournament_name?: string }>>([])
  const [recentResults, setRecentResults] = useState<Array<{ id: string; total_points: number; published_at: string; team_id: string; match_id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  const loadDashboard = useCallback(async () => {
    if (!client || configurationError) {
      setErrorMessage(configurationError ?? 'Admin dashboard data is unavailable.')
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage('')

    const cutoff = toIsoDaysAgo(range === '7d' ? 7 : range === '30d' ? 30 : 90)
    try {
      const [
        usersResult,
        teamsResult,
        tournamentsResult,
        activeTournamentsResult,
        pendingRegistrationsResult,
        scheduledMatchesResult,
        liveMatchesResult,
        completedMatchesResult,
        publishedResultsResult,
        recentResultsResult,
        nextTournamentsResult,
        nextMatchesResult,
        trendUsersResult,
        trendTeamsResult,
        trendTournamentsResult,
        trendRegistrationsResult,
      ] = await Promise.all([
        client.from('profiles').select('id', { count: 'exact', head: true }),
        client.from('teams').select('id', { count: 'exact', head: true }),
        client.from('tournaments').select('id', { count: 'exact', head: true }),
        client.from('tournaments').select('id', { count: 'exact', head: true }).eq('publication_status', 'published').neq('lifecycle_status', 'completed'),
        client.from('tournament_registrations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        client.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
        client.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'live'),
        client.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        client.from('match_results').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        client.from('match_results').select('id, total_points, published_at, team_id, match_id').eq('status', 'published').order('published_at', { ascending: false }).limit(5),
        client.from('tournaments').select('id, name, starts_at, publication_status, slug').eq('publication_status', 'published').gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(4),
        client.from('matches').select('id, name, match_number, scheduled_at, status, round_name, tournament_id').order('scheduled_at', { ascending: true }).limit(5),
        client.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', cutoff),
        client.from('teams').select('id', { count: 'exact', head: true }).gte('created_at', cutoff),
        client.from('tournaments').select('id', { count: 'exact', head: true }).gte('created_at', cutoff),
        client.from('tournament_registrations').select('id', { count: 'exact', head: true }).gte('registered_at', cutoff),
      ])

      if ([
        usersResult.error,
        teamsResult.error,
        tournamentsResult.error,
        activeTournamentsResult.error,
        pendingRegistrationsResult.error,
        scheduledMatchesResult.error,
        liveMatchesResult.error,
        completedMatchesResult.error,
        publishedResultsResult.error,
        recentResultsResult.error,
        nextTournamentsResult.error,
        nextMatchesResult.error,
        trendUsersResult.error,
        trendTeamsResult.error,
        trendTournamentsResult.error,
        trendRegistrationsResult.error,
      ].some(Boolean)) {
        throw new Error('DASHBOARD_DATA_FAILED')
      }

      const nextMatches = (nextMatchesResult.data ?? []) as Array<{ id: string; name: string; tournament_id: string; match_number: number; scheduled_at: string; status: string; round_name: string; tournament_name?: string }>
      const nextTournaments = (nextTournamentsResult.data ?? []) as Array<{ id: string; name: string; starts_at: string; publication_status: string; slug: string }>

      const statsNext: DashboardStats = {
        registeredUsers: usersResult.count ?? 0,
        totalTeams: teamsResult.count ?? 0,
        totalTournaments: tournamentsResult.count ?? 0,
        activeTournaments: activeTournamentsResult.count ?? 0,
        pendingRegistrations: pendingRegistrationsResult.count ?? 0,
        scheduledMatches: scheduledMatchesResult.count ?? 0,
        liveMatches: liveMatchesResult.count ?? 0,
        completedMatches: completedMatchesResult.count ?? 0,
        publishedResults: publishedResultsResult.count ?? 0,
        adminUnreadNotifications: 'Unavailable',
      }

      setStats(statsNext)
      setTrends({
        newUsers: trendUsersResult.count ?? 0,
        newTeams: trendTeamsResult.count ?? 0,
        newTournaments: trendTournamentsResult.count ?? 0,
        newRegistrations: trendRegistrationsResult.count ?? 0,
      })
      setUpcomingTournaments(nextTournaments)
      setUpcomingMatches(nextMatches)
      setRecentResults((recentResultsResult.data ?? []) as Array<{ id: string; total_points: number; published_at: string; team_id: string; match_id: string }>)
    } catch {
      setErrorMessage('One or more platform metrics could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [client, configurationError, range])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  const cards = useMemo<SummaryCard[]>(() => [
    { label: 'Registered users', value: stats.registeredUsers.toLocaleString(), detail: 'Profiles on the platform', icon: UserRound, link: '/admin/tournaments' },
    { label: 'Teams', value: stats.totalTeams.toLocaleString(), detail: 'Active rosters on file', icon: Users, link: '/teams' },
    { label: 'Tournaments', value: stats.totalTournaments.toLocaleString(), detail: 'Total created', icon: Trophy, link: '/admin/tournaments' },
    { label: 'Active tournaments', value: stats.activeTournaments.toLocaleString(), detail: 'Published and in-flight', icon: Activity, link: '/admin/tournaments' },
    { label: 'Pending registrations', value: stats.pendingRegistrations.toLocaleString(), detail: 'Awaiting review', icon: ShieldCheck, link: '/admin/tournaments' },
    { label: 'Scheduled matches', value: stats.scheduledMatches.toLocaleString(), detail: 'Awaiting kickoff', icon: CalendarRange, link: '/admin/tournaments' },
    { label: 'Live matches', value: stats.liveMatches.toLocaleString(), detail: 'Currently live', icon: Gauge, link: '/matches' },
    { label: 'Completed matches', value: stats.completedMatches.toLocaleString(), detail: 'Finished events', icon: Trophy, link: '/matches' },
    { label: 'Published results', value: stats.publishedResults.toLocaleString(), detail: 'Official rankings locked', icon: BellRing, link: '/leaderboard' },
    { label: 'Unread admin alerts', value: stats.adminUnreadNotifications, detail: 'Dedicated admin inbox not yet deployed', icon: BellRing, link: '/dashboard/notifications' },
  ], [stats])

  return (
    <section className="admin-dashboard-page">
      <div className="admin-dashboard-header">
        <div>
          <p className="section-heading__eyebrow">CONTROL ROOM / OVERVIEW</p>
          <h1>Operations dashboard.</h1>
        </div>
        <div className="admin-dashboard-header__actions">
          <label className="admin-dashboard-range">
            <span>Range</span>
            <select value={range} onChange={(event) => setRange(event.target.value as RangeKey)}>
              {ranges.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <button type="button" className="admin-refresh-button" onClick={() => void loadDashboard()}>Refresh</button>
        </div>
      </div>

      {errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}

      {loading ? (
        <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
      ) : (
        <>
          <div className="admin-dashboard-grid">
            {cards.map(({ label, value, detail, icon: Icon, link }) => (
              <article className="admin-dashboard-card" key={label}>
                <div className="admin-dashboard-card__head">
                  <span className="admin-dashboard-card__icon"><Icon size={16} /></span>
                  <span>{label}</span>
                </div>
                <strong>{value}</strong>
                <p>{detail}</p>
                {link && <Link to={link}>Open</Link>}
              </article>
            ))}
          </div>

          <div className="admin-dashboard-panels">
            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel__head">
                <div><p className="section-heading__eyebrow">OPERATIONS</p><h2>Tournament operations summary</h2></div>
                <Link className="text-link" to="/admin/tournaments">Open tournament admin</Link>
              </div>
              <div className="admin-dashboard-list">
                {upcomingTournaments.length ? upcomingTournaments.map((tournament) => (
                  <div key={tournament.id} className="admin-dashboard-list__item">
                    <div>
                      <strong>{tournament.name}</strong>
                      <small>{formatTournamentDate(tournament.starts_at, 'UTC', true)}</small>
                    </div>
                    <Link to={`/tournaments/${tournament.slug}`}>View</Link>
                  </div>
                )) : <p className="admin-dashboard-empty">No published tournaments are scheduled yet.</p>}
              </div>
            </section>

            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel__head">
                <div><p className="section-heading__eyebrow">OPERATIONS</p><h2>Upcoming match schedule</h2></div>
                <Link className="text-link" to="/matches">Open schedule</Link>
              </div>
              <div className="admin-dashboard-list">
                {upcomingMatches.length ? upcomingMatches.map((match) => (
                  <div key={match.id} className="admin-dashboard-list__item">
                    <div>
                      <strong>{match.name}</strong>
                      <small>{match.round_name} / Match {match.match_number} · {formatTournamentDate(match.scheduled_at, 'UTC', true)}</small>
                    </div>
                    <span className={`status-badge status-badge--${match.status}`}>{match.status}</span>
                  </div>
                )) : <p className="admin-dashboard-empty">No upcoming matches are scheduled.</p>}
              </div>
            </section>
          </div>

          <div className="admin-dashboard-panels admin-dashboard-panels--wide">
            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel__head">
                <div><p className="section-heading__eyebrow">ANALYTICS</p><h2>Recent platform growth</h2></div>
              </div>
              <div className="admin-dashboard-trends">
                <div><span>New users</span><strong>{trends.newUsers}</strong></div>
                <div><span>New teams</span><strong>{trends.newTeams}</strong></div>
                <div><span>New tournaments</span><strong>{trends.newTournaments}</strong></div>
                <div><span>Registrations</span><strong>{trends.newRegistrations}</strong></div>
              </div>
            </section>

            <section className="admin-dashboard-panel">
              <div className="admin-dashboard-panel__head">
                <div><p className="section-heading__eyebrow">RESULTS</p><h2>Recently published results</h2></div>
                <Link className="text-link" to="/leaderboard">Open leaderboard</Link>
              </div>
              <div className="admin-dashboard-list">
                {recentResults.length ? recentResults.map((result) => (
                  <div key={result.id} className="admin-dashboard-list__item">
                    <div>
                      <strong>Published result</strong>
                      <small>{formatTournamentDate(result.published_at, 'UTC', true)}</small>
                    </div>
                    <span>{result.total_points} pts</span>
                  </div>
                )) : <p className="admin-dashboard-empty">No published result records are available yet.</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  )
}

export default AdminDashboardPage
