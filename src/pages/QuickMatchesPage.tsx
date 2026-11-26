import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, CheckCircle2, KeyRound, LockKeyhole, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import { useTeam } from '../teams/TeamContext'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'

interface QuickCompetition {
  id: string
  title: string
  slug: string
  description: string
  game_code: string
  format_code: string
  entry_type: 'free' | 'paid'
  entry_fee: number
  currency: string
  capacity: number
  registration_opens_at: string
  registration_closes_at: string
  starts_at: string
  ends_at: string | null
  timezone: string
  status: string
}

interface QuickMatch {
  id: string
  competition_id: string
  match_name: string
  match_number: number
  round_name: string
  scheduled_at: string
  timezone: string
  duration_minutes: number | null
  status: string
  public_notes: string
}

interface CompetitionEntry {
  id: string
  competition_id: string
  team_id: string | null
  player_id: string | null
  status: string
}

interface RoomCredentials {
  room_id: string
  room_password: string | null
  release_at: string
  access_instructions: string
}

const activeEntryStatuses = new Set(['pending_payment', 'payment_rejected', 'pending_review', 'confirmed'])

function QuickMatchesPage() {
  const { client, user } = useAuth()
  const { team, membership } = useTeam()
  const [competitions, setCompetitions] = useState<QuickCompetition[]>([])
  const [participantKinds, setParticipantKinds] = useState<Record<string, string>>({})
  const [matches, setMatches] = useState<QuickMatch[]>([])
  const [entries, setEntries] = useState<CompetitionEntry[]>([])
  const [assignedMatchEntries, setAssignedMatchEntries] = useState<Set<string>>(new Set())
  const [rooms, setRooms] = useState<Record<string, RoomCredentials>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const refresh = useCallback(async () => {
    if (!client) {
      setIsLoading(false)
      setMessage('Quick Matches are unavailable because Supabase is not configured.')
      setIsError(true)
      return
    }
    setIsLoading(true)
    setMessage('')
    try {
      const [competitionResult, formatsResult] = await Promise.all([
        client.from('competitions').select('id, title, slug, description, game_code, format_code, entry_type, entry_fee, currency, capacity, registration_opens_at, registration_closes_at, starts_at, ends_at, timezone, status')
          .eq('competition_type', 'quick_match').in('status', ['published', 'registration_closed', 'live', 'completed']).order('starts_at', { ascending: true }),
        client.from('game_formats').select('game_code, format_code, participant_kind'),
      ])
      if (competitionResult.error || formatsResult.error) throw new Error('QUICK_MATCH_LOAD_FAILED')
      const nextCompetitions = (competitionResult.data ?? []) as QuickCompetition[]
      const nextKinds = Object.fromEntries((formatsResult.data ?? []).map((format) => [
        `${format.game_code}:${format.format_code}`, format.participant_kind,
      ]))
      const competitionIds = nextCompetitions.map((item) => item.id)
      setCompetitions(nextCompetitions)
      setParticipantKinds(nextKinds)
      if (!competitionIds.length) {
        setMatches([])
        setEntries([])
        setAssignedMatchEntries(new Set())
        return
      }

      const [matchResult, entryResult] = await Promise.all([
        client.from('matches_public').select('id, competition_id, match_name, match_number, round_name, scheduled_at, timezone, duration_minutes, status, public_notes')
          .eq('competition_type', 'quick_match').in('competition_id', competitionIds).order('scheduled_at', { ascending: true }),
        user ? client.from('competition_entries').select('id, competition_id, team_id, player_id, status').in('competition_id', competitionIds) : Promise.resolve({ data: [], error: null }),
      ])
      if (matchResult.error || entryResult.error) throw new Error('QUICK_MATCH_DETAIL_LOAD_FAILED')
      const nextMatches = (matchResult.data ?? []) as QuickMatch[]
      const nextEntries = (entryResult.data ?? []) as CompetitionEntry[]
      setMatches(nextMatches)
      setEntries(nextEntries)

      if (!user || !nextMatches.length) {
        setAssignedMatchEntries(new Set())
        return
      }
      const matchIds = nextMatches.map((item) => item.id)
      const [teamAssignments, individualAssignments] = await Promise.all([
        client.from('match_team_assignments').select('match_id, entry_id').in('match_id', matchIds),
        client.from('match_participants').select('match_id, entry_id').in('match_id', matchIds),
      ])
      if (teamAssignments.error || individualAssignments.error) throw new Error('QUICK_MATCH_ASSIGNMENT_LOAD_FAILED')
      const myEntryIds = new Set(nextEntries.filter((entry) => activeEntryStatuses.has(entry.status)).map((entry) => entry.id))
      const assigned = [...(teamAssignments.data ?? []), ...(individualAssignments.data ?? [])]
        .filter((assignment) => myEntryIds.has(assignment.entry_id))
        .map((assignment) => `${assignment.match_id}:${assignment.entry_id}`)
      setAssignedMatchEntries(new Set(assigned))
    } catch {
      setIsError(true)
      setMessage('Quick Match information could not be loaded. Confirm the competition and match migrations have been applied.')
    } finally {
      setIsLoading(false)
    }
  }, [client, user])

  useEffect(() => { void refresh() }, [refresh])

  const entriesByCompetition = useMemo(() => new Map(competitions.map((competition) => [
    competition.id,
    entries.filter((entry) => entry.competition_id === competition.id),
  ])), [competitions, entries])

  async function register(competition: QuickCompetition) {
    if (!client || !user) return
    const participantKind = participantKinds[`${competition.game_code}:${competition.format_code}`]
    if (participantKind === 'team' && (!team || team.game_code !== competition.game_code)) {
      setIsError(true)
      setMessage('Create or join a team for this game before registering.')
      return
    }
    if (participantKind === 'team' && membership?.role !== 'captain') {
      setIsError(true)
      setMessage('Only your active team captain can register the team.')
      return
    }
    setWorkingId(competition.id)
    setMessage('')
    try {
      const { data: entryId, error } = participantKind === 'team'
        ? await client.rpc('register_competition_team', { p_competition_id: competition.id, p_team_id: team!.id, p_manual_members: null })
        : await client.rpc('register_competition_individual', { p_competition_id: competition.id })
      if (error) {
        const messages: Record<string, string> = {
          PLAYER_PROFILE_COMPLETION_REQUIRED: 'Complete your verified player profile before registering.',
          TEAM_CAPTAIN_REQUIRED: 'Only your active team captain can register the team.',
          TEAM_ENTRY_NOT_SUPPORTED: 'This Quick Match does not accept team entries.',
          TEAM_GAME_MISMATCH: 'Your active team is set up for a different game.',
          TEAM_ROSTER_OUT_OF_RANGE: 'The registration service still has an older roster rule. Refresh after the database update is applied.',
          GAME_IDENTITY_REQUIRED_FOR_ROSTER: 'The registration service still requires player game IDs. Refresh after the database update is applied.',
          INDIVIDUAL_ENTRY_NOT_SUPPORTED: 'This Quick Match does not accept individual entries.',
          COMPETITION_NOT_OPEN: 'This Quick Match is not open for registration.',
          REGISTRATION_CLOSED: 'Registration is closed for this Quick Match.',
          COMPETITION_FULL: 'This Quick Match has reached its participant limit.',
        }
        setIsError(true)
        setMessage(messages[error.message] ?? 'Registration could not be submitted. Refresh and try again.')
      } else if (competition.entry_type === 'paid') {
        if (!entryId) {
          setIsError(true)
          setMessage('Your registration was saved, but its payment page could not be opened. Refresh your entries and try again.')
          return
        }
        window.location.assign(`/payments/${entryId}`)
      } else {
        setIsError(false)
        setMessage('Registration submitted. An administrator must confirm your entry before match assignment.')
        await refresh()
      }
    } catch {
      setIsError(true)
      setMessage('Registration could not be submitted. Check your connection and try again.')
    } finally {
      setWorkingId('')
    }
  }

  async function revealRoom(match: QuickMatch) {
    if (!client || !user) return
    setWorkingId(match.id)
    setIsError(false)
    setMessage('')
    try {
      const { data, error } = await client.rpc('get_competition_match_room', { p_match_id: match.id }).maybeSingle()
      if (error || !data) {
        setIsError(true)
        setMessage(error?.message === 'ROOM_NOT_RELEASED'
          ? 'Room credentials will be available at the administrator’s release time.'
          : 'Room access is limited to confirmed participants assigned to this match.')
      } else {
        setRooms((current) => ({ ...current, [match.id]: data as RoomCredentials }))
      }
    } catch {
      setIsError(true)
      setMessage('Room credentials are not available yet.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="quick-matches-page">
        <section className="quick-matches-intro page-width" aria-labelledby="quick-matches-title">
          <div className="quick-matches-intro__copy">
            <p className="section-heading__eyebrow">UNDERGRADUATE HUB / OPEN PLAY</p>
            <h1 id="quick-matches-title">Quick Matches.</h1>
            <p>Standalone competitions with their own entry, lobby, and result flow. No tournament bracket required.</p>
            <div className="quick-matches-intro__actions">
              <Link className="arena-state__button" to="/tournaments">Browse tournaments <ArrowRight size={16} /></Link>
              <Link className="quick-matches-text-link" to="/matches">Tournament schedule</Link>
            </div>
          </div>
          <div className="quick-matches-intro__mark" aria-hidden="true"><Swords size={36} /><span>OPEN<br />QUEUE</span></div>
        </section>

        <section className="quick-match-events page-width" aria-labelledby="quick-match-events-title">
          <div className="quick-matches-games__heading"><div><p className="section-heading__eyebrow">MATCH QUEUE</p><h2 id="quick-match-events-title">Open Quick Matches.</h2></div><button className="admin-refresh-button" type="button" onClick={() => void refresh()}>Refresh</button></div>
          {message && <p className={isError ? 'auth-error' : 'auth-success-message'} role={isError ? 'alert' : 'status'}>{message}</p>}
          {isLoading ? <div className="quick-match-event-list" aria-busy="true"><div className="quick-match-event-skeleton" /><div className="quick-match-event-skeleton" /></div>
            : competitions.length ? <div className="quick-match-event-list">{competitions.map((competition) => {
              const participantKind = participantKinds[`${competition.game_code}:${competition.format_code}`]
              const eventEntries = entriesByCompetition.get(competition.id) ?? []
              const myEntry = eventEntries.find((entry) => activeEntryStatuses.has(entry.status))
              const open = competition.status === 'published' && Date.now() >= Date.parse(competition.registration_opens_at)
                && Date.now() < Date.parse(competition.registration_closes_at) && Date.now() < Date.parse(competition.starts_at)
              const eventMatches = matches.filter((match) => match.competition_id === competition.id)
              return <article className="quick-match-event" key={competition.id}>
                <div className="quick-match-event__heading"><div><p className="section-heading__eyebrow">{competition.game_code.replaceAll('_', ' ')} / {competition.format_code.replaceAll('_', ' ')}</p><h3>{competition.title}</h3></div><span className={`quick-match-status quick-match-status--${competition.status}`}>{competition.status.replaceAll('_', ' ')}</span></div>
                {competition.description && <p className="quick-match-event__description">{competition.description}</p>}
                <div className="quick-match-event__facts">
                  <span><b>{formatTournamentMoney(competition.entry_fee, competition.entry_type)}</b><small>Entry</small></span>
                  <span><b>{competition.capacity}</b><small>Participant limit</small></span>
                  <span><b>{formatTournamentDate(competition.registration_closes_at, competition.timezone, true)}</b><small>Registration closes</small></span>
                  <span><b>{formatTournamentDate(competition.starts_at, competition.timezone, true)}</b><small>Starts / {competition.timezone}</small></span>
                </div>
                {!user ? <Link className="arena-state__button" to="/login" state={{ from: '/quick-matches' }}>Sign in to register</Link>
                  : myEntry ? <p className="quick-match-event__entry"><CheckCircle2 size={16} /> Your entry: {myEntry.status.replaceAll('_', ' ')}</p>
                    : participantKind === 'team' && !team ? <Link className="quick-matches-text-link" to="/teams">Create or join a team to enter</Link>
                      : <button className="team-button" type="button" disabled={!open || Boolean(workingId)} onClick={() => void register(competition)}>{workingId === competition.id ? 'Registering...' : open ? (competition.entry_type === 'paid' ? 'Register and pay' : participantKind === 'team' ? 'Register your team' : 'Register') : 'Registration closed'}</button>}
                {eventMatches.map((match) => {
                  const assignedToMe = eventEntries.some((entry) => assignedMatchEntries.has(`${match.id}:${entry.id}`))
                  const room = rooms[match.id]
                  return <div className="quick-match-scheduled" key={match.id}>
                    <div><b><CalendarDays size={15} /> {match.match_name}</b><span>{formatTournamentDate(match.scheduled_at, match.timezone, true)} / {match.timezone}</span><small>{match.status.replaceAll('_', ' ')}{match.duration_minutes ? ` / ${match.duration_minutes} min` : ''}</small></div>
                    {room ? <div className="quick-match-room"><KeyRound size={15} /><b>Room {room.room_id}</b>{room.room_password && <span>Password {room.room_password}</span>}</div>
                      : assignedToMe && <button className="team-button team-button--secondary" type="button" disabled={Boolean(workingId)} onClick={() => void revealRoom(match)}><LockKeyhole size={15} /> {workingId === match.id ? 'Checking...' : 'Check room access'}</button>}
                  </div>
                })}
              </article>
            })}</div> : <div className="arena-state"><Swords size={24} /><h3>No Quick Matches are published yet.</h3><p>Published matches will appear here when an administrator opens registration.</p></div>}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

export default QuickMatchesPage
