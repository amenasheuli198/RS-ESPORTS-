import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Clipboard, KeyRound, LockKeyhole, ShieldAlert } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useTeam } from '../teams/TeamContext'
import { formatTournamentDate } from '../tournaments/format'
import type { MatchRoomCredentials, TeamMatch } from '../matches/types'
import MatchStatusBadge from '../components/matches/MatchStatusBadge'
import { SectionHeading } from '../components/ui'

function TeamMatchesPage() {
  const { client } = useAuth()
  const { team } = useTeam()
  const [matches, setMatches] = useState<TeamMatch[]>([])
  const [credentials, setCredentials] = useState<Record<string, MatchRoomCredentials>>({})
  const [loadingRoomId, setLoadingRoomId] = useState('')
  const [copyState, setCopyState] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadMatches = useCallback(async () => {
    if (!client || !team) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setErrorMessage('')
    try {
      const { data, error } = await client.rpc('get_my_team_matches', { p_team_id: team.id })
      if (error) throw error
      setMatches((data ?? []) as TeamMatch[])
    } catch {
      setMatches([])
      setErrorMessage('Match information could not be loaded. Confirm the match migration has been applied.')
    } finally {
      setIsLoading(false)
    }
  }, [client, team])

  useEffect(() => { void loadMatches() }, [loadMatches])

  async function revealCredentials(match: TeamMatch) {
    if (!client || !team || loadingRoomId) return
    setLoadingRoomId(match.match_id)
    setErrorMessage('')
    try {
      const { data, error } = await client.rpc('get_match_room_credentials', { p_match_id: match.match_id }).single()
      if (error || !data) {
        setErrorMessage(error?.message === 'ROOM_NOT_RELEASED'
          ? 'Room credentials will be available at the scheduled release time.'
          : 'Room credentials are not available for this team or match.')
      } else {
        setCredentials((current) => ({ ...current, [match.match_id]: data as MatchRoomCredentials }))
      }
    } catch {
      setErrorMessage('Room credentials could not be retrieved. Try again when the room is ready.')
    } finally {
      setLoadingRoomId('')
    }
  }

  async function copyValue(key: string, value: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const input = document.createElement('textarea')
        input.value = value
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copied = document.execCommand('copy')
        input.remove()
        if (!copied) throw new Error('COPY_FAILED')
      }
      setCopyState(key)
      window.setTimeout(() => setCopyState(''), 1800)
    } catch {
      setErrorMessage('Copy was blocked by the browser. Select the credential and copy it manually.')
    }
  }

  return (
    <section className="team-matches-page">
      <SectionHeading eyebrow="Team / match schedule" title="Match day." description="Only matches assigned to your approved team registration appear here." />
      {errorMessage && <p className="team-form-error" role="alert">{errorMessage}</p>}
      {isLoading ? <div className="team-match-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
        : matches.length ? <div className="team-match-list">{matches.map((match) => {
          const room = credentials[match.match_id]
          const releaseReached = match.room_release_at !== null && Date.now() >= Date.parse(match.room_release_at)
          const matchIneligible = match.status === 'cancelled' || match.status === 'completed'
          const canCheckRoom = match.room_status === 'ready' && releaseReached
            && ['room_ready', 'live'].includes(match.status) && !matchIneligible
          return <article className="team-match-card" key={match.match_id}>
            <div className="team-match-card__top"><div><p>{match.tournament_name}</p><h2>{match.round_name} <span>/</span> {match.match_name}</h2></div><MatchStatusBadge status={match.status} /></div>
            <div className="team-match-card__meta"><span><CalendarDays size={15} />{formatTournamentDate(match.scheduled_at, match.timezone, true)}</span><span>{match.timezone}</span><span>Match {match.match_number}</span>{match.duration_minutes && <span>{match.duration_minutes} min</span>}</div>
            <p className="team-match-card__team">Assigned team <b>{match.team_name}</b></p>
            {match.public_notes && <p className="team-match-card__notes">{match.public_notes}</p>}

            {room ? <section className="team-room-card" aria-label="Released room credentials">
              <div className="team-room-card__heading"><span><KeyRound size={17} /> Room credentials</span><span className="team-room-ready">Ready</span></div>
              <div className="team-room-field"><label htmlFor={`room-id-${match.match_id}`}>Room ID</label><div><input id={`room-id-${match.match_id}`} type="text" readOnly value={room.room_id} /><button type="button" aria-label="Copy room ID" onClick={() => void copyValue(`${match.match_id}-room`, room.room_id)}>{copyState === `${match.match_id}-room` ? <Check size={15} /> : <Clipboard size={15} />}<span>{copyState === `${match.match_id}-room` ? 'Copied' : 'Copy'}</span></button></div></div>
              {room.room_password && <div className="team-room-field"><label htmlFor={`room-password-${match.match_id}`}>Room password</label><div><input id={`room-password-${match.match_id}`} type="text" readOnly value={room.room_password} /><button type="button" aria-label="Copy room password" onClick={() => void copyValue(`${match.match_id}-password`, room.room_password!)}>{copyState === `${match.match_id}-password` ? <Check size={15} /> : <Clipboard size={15} />}<span>{copyState === `${match.match_id}-password` ? 'Copied' : 'Copy'}</span></button></div></div>}
              {room.access_instructions && <p className="team-room-instructions">{room.access_instructions}</p>}
              <p className="team-room-release">Released {formatTournamentDate(room.release_at, match.timezone, true)} / {match.timezone}</p>
            </section> : match.room_status === 'ready' && !matchIneligible ? (
              <section className="team-room-pending" role="status"><LockKeyhole size={17} /><div><b>Room credentials will be available at the scheduled release time.</b>{match.room_release_at && <small>Scheduled release: {formatTournamentDate(match.room_release_at, match.timezone, true)} / {match.timezone}</small>}</div>{canCheckRoom && <button className="team-button team-button--secondary" type="button" disabled={Boolean(loadingRoomId)} onClick={() => void revealCredentials(match)}>{loadingRoomId === match.match_id ? 'Checking...' : 'Check access'}</button>}</section>
            ) : <p className="team-room-unavailable"><ShieldAlert size={15} /> {matchIneligible ? 'Room access is closed for this match.' : 'Room details have not been released by the tournament administrator.'}</p>}
          </article>
        })}</div> : <div className="team-empty-state"><span className="team-feature-icon"><CalendarDays size={21} /></span><h2>No matches assigned yet.</h2><p>Matches appear here after an administrator assigns your approved tournament registration.</p></div>}
      {!isLoading && <button className="team-match-refresh" type="button" onClick={() => void loadMatches()}>Refresh match schedule</button>}
    </section>
  )
}

export default TeamMatchesPage