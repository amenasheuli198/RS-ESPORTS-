import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Coins, MapPin, ShieldCheck, UsersRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import TournamentBanner from '../components/tournaments/TournamentBanner'
import TournamentStatusBadge from '../components/tournaments/TournamentStatusBadge'
import { formatTournamentDate, formatTournamentMoney, getScheduleLines } from '../tournaments/format'
import type { PublicTournament } from '../tournaments/types'
import type { TeamMember } from '../types/team'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'

function TournamentDetailsPage() {
  const { slug } = useParams<{ slug: string }>()
  const { client, user } = useAuth()
  const [tournament, setTournament] = useState<PublicTournament | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamRole, setTeamRole] = useState<string | null>(null)
  const [startingCount, setStartingCount] = useState(0)
  const [substituteCount, setSubstituteCount] = useState(0)
  const [hasActiveRegistration, setHasActiveRegistration] = useState(false)
  const [isEligibilityLoading, setIsEligibilityLoading] = useState(false)
  const [eligibilityError, setEligibilityError] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || configurationError || !slug) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Tournament information is unavailable.')
      return () => { active = false }
    }

    async function loadTournament() {
      try {
        setIsLoading(true)
        const { data, error } = await client.from('tournaments_public').select('*').eq('slug', slug).maybeSingle()
        if (!active) return
        if (error) setErrorMessage('Tournament information could not be loaded. Please try again.')
        else setTournament(data as PublicTournament | null)
      } catch {
        if (!active) return
        setErrorMessage('Tournament information could not be loaded. Please try again.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadTournament()
    return () => { active = false }
  }, [client, configurationError, slug])

  useEffect(() => {
    let active = true
    setTeamName('')
    setTeamRole(null)
    setStartingCount(0)
    setSubstituteCount(0)
    setHasActiveRegistration(false)
    setEligibilityError('')
    if (!client || !user || !tournament) {
      setIsEligibilityLoading(false)
      return () => { active = false }
    }

    setIsEligibilityLoading(true)
    void (async () => {
      try {
        const { data: membership, error: membershipError } = await client.from('team_members')
          .select('team_id, role')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle()
        if (membershipError) throw membershipError
        if (!membership) return

        const [{ data: team, error: teamError }, { data: roster, error: rosterError }, { data: registrations, error: registrationsError }] = await Promise.all([
          client.from('teams').select('name').eq('id', membership.team_id).maybeSingle(),
          client.rpc('get_team_roster', { p_team_id: membership.team_id }),
          client.rpc('get_my_team_registration_records', { p_team_id: membership.team_id }),
        ])
        if (teamError || rosterError || registrationsError) throw new Error('ELIGIBILITY_LOOKUP_FAILED')
        if (!active) return
        setTeamName(team?.name ?? '')
        setTeamRole(membership.role)
        const activeRoster = (roster ?? []) as TeamMember[]
        setStartingCount(activeRoster.filter((member) => member.status === 'active' && member.role !== 'substitute').length)
        setSubstituteCount(activeRoster.filter((member) => member.status === 'active' && member.role === 'substitute').length)
        setHasActiveRegistration((registrations ?? []).some((record: { tournament_id: string; status: string }) => record.tournament_id === tournament.id && ['pending', 'approved'].includes(record.status)))
      } catch {
        if (active) setEligibilityError('Team eligibility could not be checked. Open the team dashboard to refresh your roster.')
      } finally {
        if (active) setIsEligibilityLoading(false)
      }
    })()

    return () => { active = false }
  }, [client, user, tournament])

  if (isLoading) {
    return <><SiteHeader /><main className="tournament-detail-state page-width" role="status" aria-busy="true"><div className="tournament-detail-skeleton" /><span>Loading tournament details...</span></main><SiteFooter /></>
  }

  if (errorMessage || !tournament) {
    return <><SiteHeader /><main className="tournament-detail-state page-width"><span className="section-heading__eyebrow">RS / EVENT FILE</span><h1>{errorMessage ? 'Tournament unavailable.' : 'Tournament not found.'}</h1><p>{errorMessage || 'This tournament may have been removed or is not published.'}</p><Link className="arena-state__button" to="/tournaments">Back to Tournament Arena</Link></main><SiteFooter /></>
  }

  const schedule = getScheduleLines(tournament.match_schedule)
  const canRegister = tournament.tournament_status === 'Registration Open' || tournament.tournament_status === 'Registration Closing Soon'
  const actionText = canRegister ? 'Register now' : tournament.tournament_status === 'Upcoming' ? 'Registration upcoming' : tournament.tournament_status === 'Live' ? 'Tournament live' : tournament.tournament_status === 'Completed' ? 'Tournament completed' : 'Registration closed'
  const eligibilityReason = !user ? 'Sign in to check your team’s eligibility.'
    : eligibilityError || (isEligibilityLoading ? 'Checking your team roster…' : !teamRole ? 'Create or join a team before registering.'
      : teamRole !== 'captain' ? 'Only the team captain can submit this registration.'
        : tournament.entry_type !== 'free' || tournament.entry_fee > 0 ? 'Paid tournament registration is unavailable until payment verification is supported.'
          : tournament.available_slots <= 0 ? 'All tournament slots are currently reserved.'
            : startingCount < tournament.starting_players_required ? `Your team needs ${tournament.starting_players_required} starting players; ${startingCount} are active.`
              : tournament.game_code === 'free_fire' && tournament.mode_code === 'battle_royale' && tournament.format_code === 'squad' && startingCount < 4 ? 'Free Fire Battle Royale Squad requires four active starting players.'
                : substituteCount > 0 && !tournament.substitute_allowed ? 'This tournament does not allow a substitute, but your roster has one.'
                  : hasActiveRegistration ? 'Your team already has a pending or approved registration.'
                    : null)

  return (
    <>
    <SiteHeader />
    <main className="tournament-detail-page">
      <div className="page-width tournament-detail-content">
        <Link className="tournament-back-link" to="/tournaments">← Tournament Arena</Link>
        <section className="tournament-detail-hero">
          <TournamentBanner path={tournament.banner_path} name={tournament.name} className="tournament-detail-hero__banner" />
          <div className="tournament-detail-hero__scrim" />
          <div className="tournament-detail-hero__content">
            <div className="tournament-detail-hero__top"><span>RS / TOURNAMENT FILE</span><TournamentStatusBadge status={tournament.tournament_status} /></div>
            <p>{tournament.game_code.replaceAll('_', ' ')} <i /> {tournament.mode_code.replaceAll('_', ' ')} <i /> {tournament.format_code.replaceAll('_', ' ')}</p>
            <h1>{tournament.name}</h1>
            <p className="tournament-detail-hero__description">{tournament.description || 'Tournament details will be updated by the organizer.'}</p>
          </div>
        </section>

        <div className="tournament-detail-grid">
          <div className="tournament-detail-main">
            <section className="tournament-info-panel" aria-labelledby="tournament-info-title">
              <div className="tournament-info-panel__heading"><span className="section-heading__eyebrow">EVENT INTEL</span><h2 id="tournament-info-title">Tournament information</h2></div>
              <div className="tournament-info-grid">
                <article><Coins size={17} /><span><small>Entry fee</small><b>{formatTournamentMoney(tournament.entry_fee, tournament.entry_type)}</b></span></article>
                <article><span className="tournament-info-coin">$</span><span><small>Prize pool</small><b className="is-gold">{formatTournamentMoney(tournament.prize_pool)}</b></span></article>
                <article><UsersRound size={17} /><span><small>Team slots available</small><b>{tournament.available_slots} / {tournament.max_teams}</b></span></article>
                <article><CalendarDays size={17} /><span><small>Registration closes</small><b>{formatTournamentDate(tournament.registration_closes_at, tournament.timezone, true)}</b></span></article>
                <article><Clock3 size={17} /><span><small>Tournament starts</small><b>{formatTournamentDate(tournament.starts_at, tournament.timezone, true)}</b></span></article>
                <article><MapPin size={17} /><span><small>Timezone</small><b>{tournament.timezone}</b></span></article>
              </div>
              <p className="tournament-capacity-note">Pending and approved registrations reserve team slots.</p>
              <div className="tournament-squad-note"><ShieldCheck size={17} /><span><b>{tournament.starting_players_required} starting players required</b><small>{tournament.substitute_allowed ? 'Substitute allowed' : 'No substitute slot configured'}</small></span></div>
            </section>

            <section className="tournament-rules-panel" aria-labelledby="tournament-rules-title">
              <span className="section-heading__eyebrow">COMPETITION TERMS</span><h2 id="tournament-rules-title">Rules &amp; eligibility</h2>
              <RuleSection title="Eligibility" text={tournament.eligibility} />
              <RuleSection title="Participation requirements" text={tournament.participation_requirements} />
              <RuleSection title="Match rules" text={tournament.match_rules} />
              <RuleSection title="Scoring system" text={tournament.scoring_system} />
              <RuleSection title="Disqualification rules" text={tournament.disqualification_rules} />
              <RuleSection title="General instructions" text={tournament.general_instructions} />
              {tournament.prize_distribution && <RuleSection title="Prize distribution" text={tournament.prize_distribution} />}
            </section>
          </div>

          <aside className="tournament-detail-sidebar">
            <section className="tournament-action-panel">
              <span className="section-heading__eyebrow">YOUR NEXT MOVE</span>
              <h2>{actionText}</h2>
              {canRegister ? (
                <>
                  {eligibilityReason && <p className="tournament-eligibility-reason">{eligibilityReason}{teamName && teamRole === 'captain' ? ` (${teamName})` : ''}</p>}
                  {!user && <Link className="arena-state__button" to="/login" state={{ from: `/dashboard/team/tournaments?register=${encodeURIComponent(tournament.slug)}` }}>Sign in to register</Link>}
                  {user && !teamRole && !isEligibilityLoading && !eligibilityError && <Link className="arena-state__button" to="/teams">Create or join a team</Link>}
                  {user && teamRole === 'captain' && !eligibilityReason && <Link className="arena-state__button" to={`/dashboard/team/tournaments?register=${encodeURIComponent(tournament.slug)}`}>Register {teamName || 'your team'}</Link>}
                  {user && !teamRole && isEligibilityLoading && <p role="status">Checking team eligibility…</p>}
                </>
              ) : <p>{statusDescription(tournament.tournament_status)}</p>}
            </section>
            <section className="tournament-schedule-panel" aria-labelledby="tournament-schedule-title">
              <span className="section-heading__eyebrow">KEY DATES</span><h2 id="tournament-schedule-title">Schedule</h2>
              <ScheduleItem label="Registration opens" value={formatTournamentDate(tournament.registration_opens_at, tournament.timezone, true)} />
              <ScheduleItem label="Registration closes" value={formatTournamentDate(tournament.registration_closes_at, tournament.timezone, true)} />
              <ScheduleItem label="Tournament start" value={formatTournamentDate(tournament.starts_at, tournament.timezone, true)} />
              {schedule.map((item, index) => <ScheduleItem key={`${item.title}-${index}`} label={item.title} value={formatTournamentDate(item.starts_at, tournament.timezone, true)} notes={item.notes} />)}
              <p className="tournament-schedule-panel__zone">All times shown in {tournament.timezone}.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
    <SiteFooter />
    </>
  )
}

function RuleSection({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null
  return <div className="tournament-rule-section"><h3>{title}</h3><p>{text}</p></div>
}

function ScheduleItem({ label, value, notes }: { label: string; value: string; notes?: string }) {
  return <div className="tournament-schedule-item"><span /><div><small>{label}</small><b>{value}</b>{notes && <p>{notes}</p>}</div></div>
}

function statusDescription(status: PublicTournament['tournament_status']) {
  if (status === 'Upcoming') return 'Registration has not opened yet. Check back when the opening date approaches.'
  if (status === 'Live') return 'This tournament is in progress. Registration is no longer available.'
  if (status === 'Completed') return 'This tournament has concluded.'
  if (status === 'Cancelled') return 'This tournament has been cancelled by its organizer.'
  return 'Registration for this tournament is closed.'
}

export default TournamentDetailsPage