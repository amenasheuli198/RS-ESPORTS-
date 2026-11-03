import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, ShieldAlert, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useTeam } from '../teams/TeamContext'
import type { PublicTournament } from '../tournaments/types'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'
import TournamentBanner from '../components/tournaments/TournamentBanner'
import TournamentStatusBadge from '../components/tournaments/TournamentStatusBadge'
import { SectionHeading } from '../components/ui'

interface RegistrationRecord {
  registration_id: string
  tournament_id: string
  tournament_name: string
  tournament_slug: string
  team_id: string
  team_name: string
  status: string
  registered_at: string
  entry_type: 'free' | 'paid'
  entry_fee: number
  prize_pool: number
  registration_closes_at: string
  starts_at: string
  timezone: string
  publication_status: string
  lifecycle_status: string
}

interface RegistrationNotification {
  id: string
  tournament_id: string
  event_type: string
  message: string
  created_at: string
  read_at: string | null
}

const openStatuses = ['Registration Open', 'Registration Closing Soon']

function TeamTournamentsPage() {
  const { client, user } = useAuth()
  const { team, membership, roster } = useTeam()
  const [searchParams, setSearchParams] = useSearchParams()
  const [availableTournaments, setAvailableTournaments] = useState<PublicTournament[]>([])
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>([])
  const [notifications, setNotifications] = useState<RegistrationNotification[]>([])
  const [selectedTournament, setSelectedTournament] = useState<PublicTournament | null>(null)
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const refresh = useCallback(async () => {
    if (!client || !team || !user) {
      setIsLoading(false)
      return
    }
    setIsError(false)
    setMessage('')
    setIsLoading(true)
    try {
      const [tournamentResult, registrationResult, notificationResult] = await Promise.all([
        client.from('tournaments_public').select('*').in('tournament_status', openStatuses).order('starts_at', { ascending: true }),
        client.rpc('get_my_team_registration_records', { p_team_id: team.id }),
        client.from('tournament_registration_notifications').select('id, tournament_id, event_type, message, created_at, read_at').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(10),
      ])
      if (tournamentResult.error || registrationResult.error || notificationResult.error) throw new Error('LOAD_FAILED')
      setAvailableTournaments((tournamentResult.data ?? []) as PublicTournament[])
      setRegistrations((registrationResult.data ?? []) as RegistrationRecord[])
      setNotifications((notificationResult.data ?? []) as RegistrationNotification[])
    } catch {
      setIsError(true)
      setMessage('Tournament registrations could not be loaded. Confirm the registration migration has been applied.')
    } finally {
      setIsLoading(false)
    }
  }, [client, team, user])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const slug = searchParams.get('register')
    if (!slug || !availableTournaments.length) return
    const match = availableTournaments.find((item) => item.slug === slug)
    if (match) setSelectedTournament(match)
    const next = new URLSearchParams(searchParams)
    next.delete('register')
    setSearchParams(next, { replace: true })
  }, [availableTournaments, searchParams, setSearchParams])

  const activeStarters = roster.filter((member) => member.status === 'active' && member.role !== 'substitute').length
  const activeSubstitutes = roster.filter((member) => member.status === 'active' && member.role === 'substitute').length
  const visibleTournaments = useMemo(() => availableTournaments.filter((tournament) => {
    const matchesSearch = tournament.name.toLowerCase().includes(search.trim().toLowerCase())
    const registration = registrations.find((item) => item.tournament_id === tournament.id && ['pending', 'approved'].includes(item.status))
    return matchesSearch && (statusFilter === 'all' || (statusFilter === 'registered' ? Boolean(registration) : !registration))
  }), [availableTournaments, search, statusFilter, registrations])

  function eligibilityReason(tournament: PublicTournament) {
    if (membership?.role !== 'captain') return 'Only the team captain can submit this registration.'
    if (tournament.entry_type !== 'free' || tournament.entry_fee !== 0) return 'This tournament requires payment verification, which is not supported.'
    if (tournament.tournament_status !== 'Registration Open' && tournament.tournament_status !== 'Registration Closing Soon') return 'Registration is not open.'
    if (tournament.available_slots <= 0) return 'All tournament slots are reserved.'
    if (registrations.some((item) => item.tournament_id === tournament.id && ['pending', 'approved'].includes(item.status))) return 'Your team already has an active registration.'
    if (activeStarters < tournament.starting_players_required) return `Your team needs ${tournament.starting_players_required} starting players; ${activeStarters} are active.`
    if (tournament.game_code === 'free_fire' && tournament.mode_code === 'battle_royale' && tournament.format_code === 'squad' && activeStarters < 4) return 'Free Fire Battle Royale Squad requires four active starting players.'
    if (activeSubstitutes > 0 && !tournament.substitute_allowed) return 'This tournament does not allow a substitute, but your roster has one.'
    return null
  }

  async function submitRegistration() {
    if (!client || !team || !selectedTournament || !rulesAccepted) return
    const reason = eligibilityReason(selectedTournament)
    if (reason) {
      setIsError(true)
      setMessage(reason)
      return
    }
    setWorkingId(selectedTournament.id)
    setMessage('')
    try {
      const { error } = await client.rpc('register_team_for_tournament', {
        p_tournament_id: selectedTournament.id,
        p_team_id: team.id,
      })
      if (error) {
        setIsError(true)
        const messages: Record<string, string> = {
          TEAM_CAPTAIN_REQUIRED: 'Only the team captain can register this team.',
          STARTING_ROSTER_INCOMPLETE: 'The team starting lineup is incomplete.',
          FREE_FIRE_SQUAD_REQUIRES_FOUR_STARTERS: 'Free Fire squads require four active starting players.',
          SUBSTITUTE_NOT_ALLOWED: 'This tournament does not allow a substitute.',
          ROSTER_EXCEEDS_TOURNAMENT_LIMIT: 'Your roster exceeds this tournament’s configured limit.',
          TOURNAMENT_FULL: 'All tournament slots are reserved.',
          REGISTRATION_CLOSED: 'Registration has closed or the tournament has started.',
          TOURNAMENT_NOT_PUBLISHED: 'This tournament is no longer available.',
          TEAM_ALREADY_REGISTERED: 'Your team already has an active registration.',
          PAYMENT_VERIFICATION_REQUIRED: 'Paid tournaments cannot be registered without payment verification.',
        }
        setMessage(messages[error.message] ?? 'Registration could not be submitted. Please refresh and try again.')
      } else {
        setIsError(false)
        setMessage('Registration submitted. Your team has a pending review and its slot is reserved.')
        setSelectedTournament(null)
        setRulesAccepted(false)
        await refresh()
      }
    } catch {
      setIsError(true)
      setMessage('Registration could not be submitted. Check your connection and try again.')
    } finally {
      setWorkingId('')
    }
  }

  async function withdrawRegistration(registration: RegistrationRecord) {
    if (!client || !window.confirm(`Withdraw ${team?.name ?? 'your team'} from ${registration.tournament_name}?`)) return
    setWorkingId(registration.registration_id)
    setMessage('')
    try {
      const { error } = await client.rpc('withdraw_tournament_registration', { p_registration_id: registration.registration_id })
      if (error) {
        setIsError(true)
        setMessage(error.message === 'WITHDRAWAL_CUTOFF_PASSED' ? 'The withdrawal cutoff has passed.' : 'This registration cannot be withdrawn.')
      } else {
        setIsError(false)
        setMessage('Registration withdrawn. The reserved slot is available again.')
        await refresh()
      }
    } catch {
      setIsError(true)
      setMessage('Registration could not be withdrawn. Try again.')
    } finally {
      setWorkingId('')
    }
  }

  async function markNotificationRead(notification: RegistrationNotification) {
    if (!client || notification.read_at || !user) return
    try {
      const readAt = new Date().toISOString()
      const { error } = await client.from('tournament_registration_notifications')
        .update({ read_at: readAt })
        .eq('id', notification.id)
        .eq('recipient_id', user.id)
      if (!error) setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
    } catch {
      setIsError(true)
      setMessage('This notification could not be marked as read.')
    }
  }

  return (
    <div className="team-tournaments-page">
      <SectionHeading eyebrow="Team / tournaments" title="Your tournament run." description="Browse open events and track your team’s registrations." />
      {message && <p className={isError ? 'team-form-error' : 'team-form-success'} role={isError ? 'alert' : 'status'}>{message}</p>}

      <section className="team-registration-section" aria-labelledby="team-open-events-title">
        <div className="team-registration-toolbar"><div><h2 id="team-open-events-title">Open tournaments</h2><p>Free tournaments only. Pending registrations reserve a team slot.</p></div><div className="team-registration-filters"><label className="visually-hidden" htmlFor="team-tournament-search">Search tournaments</label><input id="team-tournament-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tournaments" /><select aria-label="Filter tournaments" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All available</option><option value="available">Not registered</option><option value="registered">Already registered</option></select></div></div>
        {isLoading ? <div className="team-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
          : visibleTournaments.length ? <div className="team-tournament-grid">{visibleTournaments.map((tournament) => {
            const registration = registrations.find((item) => item.tournament_id === tournament.id && ['pending', 'approved'].includes(item.status))
            const reason = eligibilityReason(tournament)
            return <article className="team-tournament-card" key={tournament.id}>
              <TournamentBanner path={tournament.banner_path} name={tournament.name} className="team-tournament-card__banner" />
              <div className="team-tournament-card__body"><div className="team-tournament-card__top"><span>{tournament.game_code.replaceAll('_', ' ')} / {tournament.format_code.replaceAll('_', ' ')}</span><TournamentStatusBadge status={tournament.tournament_status} /></div><h3>{tournament.name}</h3>
                <div className="team-tournament-card__facts"><span><b>{tournament.available_slots}/{tournament.max_teams}</b><small>Available / total</small></span><span><b>{formatTournamentMoney(tournament.entry_fee, tournament.entry_type)}</b><small>Entry</small></span><span><b>{formatTournamentMoney(tournament.prize_pool)}</b><small>Prize</small></span><span><b>{formatTournamentDate(tournament.starts_at, tournament.timezone)}</b><small>Tournament date</small></span></div>
                {registration ? <p className="team-tournament-card__registered"><CheckCircle2 size={15} /> Registered / {registration.status}</p> : reason ? <p className="team-tournament-card__reason"><ShieldAlert size={14} /> {reason}</p> : <button className="team-button" type="button" onClick={() => { setSelectedTournament(tournament); setRulesAccepted(false) }}>Register team</button>}
                <Link to={`/tournaments/${tournament.slug}`}>Tournament details <span>↗</span></Link>
              </div>
            </article>
          })}</div> : <div className="team-empty-inline">{availableTournaments.length ? 'No tournaments match this search or filter.' : 'There are no currently open published tournaments.'}</div>}
      </section>

      <section className="team-registration-section" aria-labelledby="team-registrations-title">
        <div className="team-registration-toolbar"><div><h2 id="team-registrations-title">Registered tournaments</h2><p>Registration activity for {team?.name}.</p></div><span className="team-count-badge">{registrations.length} total</span></div>
        {registrations.length ? <div className="team-registration-list">{registrations.map((registration) => {
          const canWithdraw = ['pending', 'approved'].includes(registration.status)
            && registration.publication_status === 'published'
            && registration.lifecycle_status === 'scheduled'
            && Date.now() < Date.parse(registration.registration_closes_at)
            && Date.now() < Date.parse(registration.starts_at)
          return <article className="team-registration-row" key={registration.registration_id}>
            <div className="team-registration-row__main"><div><h3>{registration.tournament_name}</h3><span className={`registration-status registration-status--${registration.status}`}>{registration.status}</span></div><p>{registration.team_name} · Registered {formatTournamentDate(registration.registered_at, registration.timezone, true)}</p><small><CalendarDays size={13} /> {formatTournamentDate(registration.starts_at, registration.timezone, true)} <i /> {formatTournamentMoney(registration.entry_fee, registration.entry_type)} <i /> Prize {formatTournamentMoney(registration.prize_pool)}</small></div>
            <div className="team-registration-row__actions"><Link to={`/tournaments/${registration.tournament_slug}`}>Details</Link>{canWithdraw && <button className="team-button team-button--secondary" type="button" disabled={workingId === registration.registration_id} onClick={() => void withdrawRegistration(registration)}>Withdraw</button>}</div>
          </article>
        })}</div> : <div className="team-empty-inline">Your team has not registered for a tournament yet.</div>}
      </section>

      <section className="team-registration-section" aria-labelledby="registration-notifications-title">
        <div className="team-registration-toolbar"><div><h2 id="registration-notifications-title">Registration updates</h2><p>In-app updates for your team’s registration activity.</p></div><Bell size={17} /></div>
        {notifications.length ? <div className="team-notification-list">{notifications.map((notification) => <button className={`team-notification${notification.read_at ? '' : ' is-unread'}`} type="button" key={notification.id} onClick={() => void markNotificationRead(notification)}><span className="team-notification__icon"><Bell size={14} /></span><span><b>{notification.message}</b><small>{formatTournamentDate(notification.created_at, 'UTC', true)} · {notification.event_type.replaceAll('_', ' ')}</small></span>{!notification.read_at && <i aria-label="Unread" />}</button>)}</div> : <div className="team-empty-inline">No registration updates yet.</div>}
      </section>

      {selectedTournament && <div className="registration-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !workingId) setSelectedTournament(null) }}>
        <section className="registration-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-dialog-title">
          <button className="registration-dialog__close" type="button" aria-label="Close registration confirmation" disabled={Boolean(workingId)} onClick={() => setSelectedTournament(null)}><X size={18} /></button>
          <p className="section-heading__eyebrow">FINAL CHECK / TEAM REGISTRATION</p><h2 id="registration-dialog-title">Confirm your entry.</h2>
          <div className="registration-dialog__summary"><span>Tournament</span><b>{selectedTournament.name}</b><span>Team</span><b>{team?.name}</b><span>Entry fee</span><b>{formatTournamentMoney(selectedTournament.entry_fee, selectedTournament.entry_type)}</b><span>Starting roster</span><b>{activeStarters} / {selectedTournament.starting_players_required} players</b><span>Registration closes</span><b>{formatTournamentDate(selectedTournament.registration_closes_at, selectedTournament.timezone, true)}</b></div>
          <div className="registration-dialog__rules"><b>Key requirements</b><p>{selectedTournament.participation_requirements || selectedTournament.eligibility || 'Review the complete tournament rules before confirming.'}</p><Link to={`/tournaments/${selectedTournament.slug}`} target="_blank" rel="noreferrer">Read all tournament rules</Link></div>
          <label className="registration-dialog__accept"><input type="checkbox" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} /><span>I have reviewed and agree to the tournament rules and participation requirements.</span></label>
          <div className="registration-dialog__actions"><button className="team-button team-button--secondary" type="button" disabled={Boolean(workingId)} onClick={() => setSelectedTournament(null)}>Go back</button><button className="team-button" type="button" disabled={!rulesAccepted || Boolean(workingId)} onClick={() => void submitRegistration()}>{workingId === selectedTournament.id ? 'Submitting...' : 'Confirm registration'}</button></div>
        </section>
      </div>}
    </div>
  )
}

export default TeamTournamentsPage