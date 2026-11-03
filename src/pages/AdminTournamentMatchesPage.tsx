import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, KeyRound, RotateCw, Save, Shield, Trash2, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { AdminMatch, ApprovedRegistrationOption, MatchAssignment, MatchRoomCredentials, MatchStatus } from '../matches/types'
import MatchStatusBadge from '../components/matches/MatchStatusBadge'
import { formatTournamentDate, toDateTimeLocal, toTimestamp } from '../tournaments/format'

interface MatchFormState {
  id: string
  name: string
  match_number: string
  round_name: string
  scheduled_at: string
  timezone: string
  duration_minutes: string
  lobby_capacity: string
  public_notes: string
}

const emptyMatch: MatchFormState = {
  id: '', name: '', match_number: '1', round_name: 'Round 1', scheduled_at: '', timezone: 'Asia/Dhaka',
  duration_minutes: '', lobby_capacity: '48', public_notes: '',
}

interface RoomFormState {
  room_id: string
  room_password: string
  release_at: string
  access_instructions: string
  status: 'not_ready' | 'ready' | 'closed'
}

const emptyRoom: RoomFormState = { room_id: '', room_password: '', release_at: '', access_instructions: '', status: 'not_ready' }

function AdminTournamentMatchesPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { client } = useAuth()
  const [tournamentName, setTournamentName] = useState('Tournament matches')
  const [tournamentTimezone, setTournamentTimezone] = useState('Asia/Dhaka')
  const [matches, setMatches] = useState<AdminMatch[]>([])
  const [registrations, setRegistrations] = useState<ApprovedRegistrationOption[]>([])
  const [assignments, setAssignments] = useState<Record<string, MatchAssignment[]>>({})
  const [rooms, setRooms] = useState<Record<string, MatchRoomCredentials & { room_status: 'not_ready' | 'ready' | 'closed' }>>({})
  const [roomForms, setRoomForms] = useState<Record<string, RoomFormState>>({})
  const [expandedMatchId, setExpandedMatchId] = useState('')
  const [form, setForm] = useState<MatchFormState>(emptyMatch)
  const [selectedRegistration, setSelectedRegistration] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const configurationError = getSupabaseConfigurationError()

  const loadData = useCallback(async () => {
    if (!client || !tournamentId || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Tournament is unavailable.')
      return
    }
    setIsLoading(true)
    setErrorMessage('')
    try {
      const [tournamentResult, matchesResult, registrationsResult] = await Promise.all([
        client.from('tournaments').select('name, timezone').eq('id', tournamentId).maybeSingle(),
        client.rpc('get_tournament_matches_admin', { p_tournament_id: tournamentId }),
        client.rpc('get_tournament_registrations_admin', { p_tournament_id: tournamentId }),
      ])
      if (tournamentResult.error || matchesResult.error || registrationsResult.error || !tournamentResult.data) throw new Error('LOAD_FAILED')
      setTournamentName(tournamentResult.data.name)
      setTournamentTimezone(tournamentResult.data.timezone)
      setMatches((matchesResult.data ?? []) as AdminMatch[])
      setRegistrations((registrationsResult.data ?? []).filter((registration: { status: string }) => registration.status === 'approved').map((registration: { registration_id: string; team_id: string; team_name: string; status: 'approved' }) => ({
        id: registration.registration_id,
        team_id: registration.team_id,
        team_name: registration.team_name,
        tournament_id: tournamentId,
        status: registration.status,
      })))
    } catch {
      setErrorMessage('Match operations could not be loaded. Confirm administrator access and migration status.')
    } finally {
      setIsLoading(false)
    }
  }, [client, tournamentId, configurationError])

  useEffect(() => { void loadData() }, [loadData])

  const availableRegistrations = useMemo(() => registrations.filter((registration) => (
    !assignments[expandedMatchId]?.some((assignment) => assignment.registration_id === registration.id)
  )), [registrations, assignments, expandedMatchId])

  async function saveMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !tournamentId) return
    setErrorMessage('')
    setNotice('')
    if (form.name.trim().length < 2 || !form.round_name.trim() || !form.scheduled_at) {
      setErrorMessage('Enter a match name, round, and scheduled time.')
      return
    }
    setIsSaving(true)
    try {
      const { error } = await client.rpc('save_match', {
        p_match: {
          ...(form.id ? { id: form.id } : {}),
          tournament_id: tournamentId,
          name: form.name.trim(),
          match_number: Number(form.match_number),
          round_name: form.round_name.trim(),
          scheduled_at: toTimestamp(form.scheduled_at, form.timezone),
          timezone: form.timezone,
          duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
          lobby_capacity: Number(form.lobby_capacity),
          public_notes: form.public_notes.trim(),
        },
      })
      if (error) {
        setErrorMessage(error.code === '23505' ? 'That match number already exists in this round.' : 'Match could not be saved. Check the details and try again.')
      } else {
        setNotice(form.id ? 'Match schedule updated.' : 'Match created.')
        setForm(emptyMatch)
        await loadData()
      }
    } catch {
      setErrorMessage('Match could not be saved. Check the time and selected timezone.')
    } finally {
      setIsSaving(false)
    }
  }

  async function expandMatch(match: AdminMatch) {
    if (!client) return
    if (expandedMatchId === match.match_id) {
      setExpandedMatchId('')
      return
    }
    setExpandedMatchId(match.match_id)
    setSelectedRegistration('')
    setErrorMessage('')
    try {
      const [assignmentResult, roomResult] = await Promise.all([
        client.rpc('get_match_assignments_admin', { p_match_id: match.match_id }),
        client.rpc('get_match_room_credentials_admin', { p_match_id: match.match_id }),
      ])
      if (assignmentResult.error) throw assignmentResult.error
      if (roomResult.error) throw roomResult.error
      const nextAssignments = (assignmentResult.data ?? []) as MatchAssignment[]
      setAssignments((current) => ({ ...current, [match.match_id]: nextAssignments }))
      const roomData = ((roomResult.data?.[0] ?? { ...emptyRoom, room_status: 'not_ready' }) as (typeof emptyRoom & { room_status?: 'not_ready' | 'ready' | 'closed'; match_id?: string }))
      const normalizedRoom = {
        room_id: roomData.room_id ?? '',
        room_password: roomData.room_password ?? '',
        release_at: roomData.release_at ?? '',
        access_instructions: roomData.access_instructions ?? '',
        room_status: roomData.room_status ?? 'not_ready',
      } as MatchRoomCredentials & { room_status: 'not_ready' | 'ready' | 'closed' }
      setRooms((current) => ({ ...current, [match.match_id]: normalizedRoom }))
      setRoomForms((current) => ({
        ...current,
        [match.match_id]: {
          room_id: normalizedRoom.room_id,
          room_password: normalizedRoom.room_password ?? '',
          release_at: normalizedRoom.release_at ? toDateTimeLocal(normalizedRoom.release_at, match.timezone) : '',
          access_instructions: normalizedRoom.access_instructions ?? '',
          status: normalizedRoom.room_status,
        },
      }))
    } catch {
      setErrorMessage('Match assignments or room configuration could not be loaded.')
    }
  }

  async function assignTeam(match: AdminMatch) {
    if (!client || !selectedRegistration) return
    setWorkingId(match.match_id)
    setErrorMessage('')
    try {
      const { error } = await client.rpc('assign_approved_registration_to_match', {
        p_match_id: match.match_id,
        p_registration_id: selectedRegistration,
      })
      if (error) {
        setErrorMessage(error.message === 'MATCH_LOBBY_FULL' ? 'This lobby has reached its configured capacity.' : 'Only an approved registration from this tournament can be assigned.')
      } else {
        setNotice('Approved team assigned to match.')
        const { data } = await client.rpc('get_match_assignments_admin', { p_match_id: match.match_id })
        setAssignments((current) => ({ ...current, [match.match_id]: (data ?? []) as MatchAssignment[] }))
        setSelectedRegistration('')
        await loadData()
      }
    } catch {
      setErrorMessage('Team assignment could not be completed. Check your connection and try again.')
    } finally {
      setWorkingId('')
    }
  }

  async function removeAssignment(match: AdminMatch, assignment: MatchAssignment) {
    if (!client || !window.confirm(`Remove ${assignment.team_name} from this match?`)) return
    setWorkingId(assignment.assignment_id)
    try {
      const { error } = await client.rpc('remove_match_team_assignment', { p_assignment_id: assignment.assignment_id })
      if (error) setErrorMessage('Assignment could not be removed. Live/completed matches cannot be changed.')
      else {
        const { data } = await client.rpc('get_match_assignments_admin', { p_match_id: match.match_id })
        setAssignments((current) => ({ ...current, [match.match_id]: (data ?? []) as MatchAssignment[] }))
        await loadData()
      }
    } catch {
      setErrorMessage('Assignment could not be removed. Check your connection and try again.')
    } finally {
      setWorkingId('')
    }
  }

  async function updateMatchStatus(match: AdminMatch, status: MatchStatus) {
    if (!client) return
    setWorkingId(match.match_id)
    try {
      const { error } = await client.rpc('set_match_status', { p_match_id: match.match_id, p_status: status, p_public_notes: match.public_notes })
      if (error) setErrorMessage(error.message === 'ROOM_NOT_READY' || error.message === 'ROOM_RELEASE_TIME_NOT_REACHED' ? 'Configure and release the room before moving the match to Room Ready or Live.' : 'Match status could not be changed.')
      else {
        setNotice('Match status updated.')
        await loadData()
      }
    } catch {
      setErrorMessage('Match status could not be changed. Check your connection and try again.')
    } finally {
      setWorkingId('')
    }
  }

  async function saveRoom(match: AdminMatch) {
    if (!client) return
    const room = roomForms[match.match_id] ?? emptyRoom
    setWorkingId(`${match.match_id}-room`)
    setErrorMessage('')
    try {
      const { error } = await client.rpc('set_match_room_credentials', {
        p_match_id: match.match_id,
        p_room_id: room.room_id.trim() || null,
        p_room_password: room.room_password || null,
        p_release_at: room.release_at ? toTimestamp(room.release_at, match.timezone) : null,
        p_access_instructions: room.access_instructions.trim(),
        p_room_status: room.status,
      })
      if (error) {
        setErrorMessage(error.message === 'ROOM_CREDENTIALS_REQUIRED' ? 'Room ID and release time are required to mark the room ready.' : 'Room configuration could not be saved.')
      } else {
        setNotice('Room configuration saved securely.')
        const { data } = await client.rpc('get_match_room_credentials_admin', { p_match_id: match.match_id })
        const roomData = (data?.[0] ?? { ...emptyRoom, room_status: 'not_ready' }) as MatchRoomCredentials & { room_status: 'not_ready' | 'ready' | 'closed' }
        setRooms((current) => ({ ...current, [match.match_id]: roomData }))
      }
    } catch {
      setErrorMessage('Room configuration could not be saved. Check the release time.')
    } finally {
      setWorkingId('')
    }
  }

  function editMatch(match: AdminMatch) {
    setForm({
      id: match.match_id,
      name: match.name,
      match_number: String(match.match_number),
      round_name: match.round_name,
      scheduled_at: toDateTimeLocal(match.scheduled_at, match.timezone),
      timezone: match.timezone,
      duration_minutes: match.duration_minutes ? String(match.duration_minutes) : '',
      lobby_capacity: String(match.lobby_capacity),
      public_notes: match.public_notes,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="admin-matches-page">
      <Link className="tournament-back-link" to="/admin/tournaments">← Tournament management</Link>
      <div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / MATCH OPERATIONS</p><h1>{tournamentName} / matches</h1><p>Create lobbies, assign approved teams, and control room access.</p></div><div className="admin-match-header-actions"><Link className="admin-refresh-button" to={`/admin/tournaments/${tournamentId}/registrations`}>Review registrations</Link><Link className="admin-refresh-button" to={`/admin/tournaments/${tournamentId}/scoring`}>Scoring rules</Link></div></div>
      {errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      <form className="admin-match-form" onSubmit={(event) => void saveMatch(event)}>
        <div className="admin-match-form__heading"><CalendarClock size={18} /><div><h2>{form.id ? 'Edit match schedule' : 'Create a match'}</h2><p>Room credentials are stored separately and never returned in schedule data.</p></div></div>
        <div className="admin-form-grid admin-form-grid--three"><label className="form-field"><span>Match name</span><input type="text" minLength={2} maxLength={120} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label className="form-field"><span>Match number</span><input type="number" min="1" max="200" required value={form.match_number} onChange={(event) => setForm((current) => ({ ...current, match_number: event.target.value }))} /></label><label className="form-field"><span>Round name</span><input type="text" maxLength={100} required value={form.round_name} onChange={(event) => setForm((current) => ({ ...current, round_name: event.target.value }))} /></label><label className="form-field"><span>Match date and time</span><input type="datetime-local" required value={form.scheduled_at} onChange={(event) => setForm((current) => ({ ...current, scheduled_at: event.target.value }))} /></label><label className="form-field"><span>Timezone</span><select value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}><option value={tournamentTimezone}>{tournamentTimezone} (tournament)</option><option value="Asia/Dhaka">Asia/Dhaka</option><option value="UTC">UTC</option><option value="Asia/Kolkata">Asia/Kolkata</option><option value="Asia/Singapore">Asia/Singapore</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label><label className="form-field"><span>Duration in minutes <small>Optional</small></span><input type="number" min="1" max="720" value={form.duration_minutes} onChange={(event) => setForm((current) => ({ ...current, duration_minutes: event.target.value }))} /></label><label className="form-field"><span>Lobby capacity</span><input type="number" min="1" max="100" required value={form.lobby_capacity} onChange={(event) => setForm((current) => ({ ...current, lobby_capacity: event.target.value }))} /></label></div>
        <label className="form-field"><span>Public match notes</span><textarea rows={2} maxLength={2000} value={form.public_notes} onChange={(event) => setForm((current) => ({ ...current, public_notes: event.target.value }))} /></label>
        <div className="admin-form-actions"><button className="admin-form-cancel" type="button" onClick={() => setForm(emptyMatch)}>Clear form</button><button className="arena-state__button" type="submit" disabled={isSaving || !client}>{isSaving ? 'Saving match...' : form.id ? 'Save match changes' : 'Create match'}</button></div>
      </form>

      <section className="admin-match-list-section"><div className="admin-match-list-heading"><div><h2>Tournament schedule</h2><p>Room credentials are visible only through the protected admin room panel or eligible team RPC.</p></div><button className="admin-refresh-button" type="button" onClick={() => void loadData()}><RotateCw size={14} /> Refresh</button></div>
        {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
          : matches.length ? <div className="admin-match-list">{matches.map((match) => {
            const matchAssignments = assignments[match.match_id] ?? []
            const room = rooms[match.match_id]
            const roomForm = roomForms[match.match_id] ?? emptyRoom
            const eligibleRegistrations = availableRegistrations.filter((registration) => registration.tournament_id === tournamentId && !matchAssignments.some((assignment) => assignment.registration_id === registration.id))
            return <article className="admin-match-card" key={match.match_id}>
              <div className="admin-match-card__summary"><div className="admin-match-card__number"><small>MATCH</small><b>{match.match_number.toString().padStart(2, '0')}</b></div><div className="admin-match-card__main"><div><h3>{match.round_name} / {match.name}</h3><MatchStatusBadge status={match.status} /></div><p>{formatTournamentDate(match.scheduled_at, match.timezone, true)} / {match.timezone} / {match.assigned_count} of {match.lobby_capacity} teams</p></div><div className="admin-match-card__buttons"><Link className="admin-refresh-button" to={`/admin/tournaments/${tournamentId}/matches/${match.match_id}/results`}>Results</Link><button className="admin-refresh-button" type="button" onClick={() => void expandMatch(match)}>{expandedMatchId === match.match_id ? 'Close operations' : 'Manage match'}</button></div></div>
              {expandedMatchId === match.match_id && <div className="admin-match-card__operations">
                <div className="admin-match-ops-section"><h4><Users size={15} /> Assigned approved teams</h4>{matchAssignments.length ? <div className="admin-match-assignments">{matchAssignments.map((assignment) => <div key={assignment.assignment_id}><span><b>{assignment.team_name}</b><small>Captain: {assignment.captain_name}</small></span><button type="button" disabled={workingId === assignment.assignment_id || ['live', 'completed', 'cancelled'].includes(match.status)} onClick={() => void removeAssignment(match, assignment)}><Trash2 size={14} /> Remove</button></div>)}</div> : <p>No teams assigned yet.</p>}
                  {!['live', 'completed', 'cancelled'].includes(match.status) && <div className="admin-match-assign-control"><select aria-label="Select approved team registration" value={selectedRegistration} onChange={(event) => setSelectedRegistration(event.target.value)}><option value="">Select approved team registration</option>{eligibleRegistrations.map((registration) => <option key={registration.id} value={registration.id}>{registration.team_name}</option>)}</select><button className="team-button" type="button" disabled={!selectedRegistration || workingId === match.match_id} onClick={() => void assignTeam(match)}>Assign team</button></div>}
                </div>
                <div className="admin-match-ops-section"><h4><Shield size={15} /> Match status</h4><div className="admin-match-status-control"><MatchStatusBadge status={match.status} /><select aria-label="Set match status" disabled={workingId === match.match_id || ['completed', 'cancelled'].includes(match.status)} value={match.status} onChange={(event) => void updateMatchStatus(match, event.target.value as MatchStatus)}><option value="scheduled">Scheduled</option><option value="room_ready">Room Ready</option><option value="live">Live</option><option value="delayed">Delayed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><button className="admin-refresh-button" type="button" onClick={() => editMatch(match)}><Save size={13} /> Edit schedule</button></div></div>
                <div className="admin-match-ops-section admin-room-config"><h4><KeyRound size={15} /> Secure room configuration <span>{room?.room_status?.replaceAll('_', ' ') ?? 'Not loaded'}</span></h4><div className="admin-room-form"><label className="form-field"><span>Room ID</span><input type="text" maxLength={64} value={roomForm.room_id} onChange={(event) => setRoomForms((current) => ({ ...current, [match.match_id]: { ...roomForm, room_id: event.target.value } }))} /></label><label className="form-field"><span>Room password <small>Leave blank if none</small></span><input type="password" maxLength={128} autoComplete="new-password" value={roomForm.room_password} onChange={(event) => setRoomForms((current) => ({ ...current, [match.match_id]: { ...roomForm, room_password: event.target.value } }))} /></label><label className="form-field"><span>Release time</span><input type="datetime-local" value={roomForm.release_at} onChange={(event) => setRoomForms((current) => ({ ...current, [match.match_id]: { ...roomForm, release_at: event.target.value } }))} /></label><label className="form-field"><span>Room status</span><select value={roomForm.status} onChange={(event) => setRoomForms((current) => ({ ...current, [match.match_id]: { ...roomForm, status: event.target.value as RoomFormState['status'] } }))}><option value="not_ready">Not ready</option><option value="ready">Ready</option><option value="closed">Closed / clear credentials</option></select></label><label className="form-field admin-room-form__instructions"><span>Access instructions</span><textarea rows={2} maxLength={2000} value={roomForm.access_instructions} onChange={(event) => setRoomForms((current) => ({ ...current, [match.match_id]: { ...roomForm, access_instructions: event.target.value } }))} /></label></div><button className="team-button" type="button" disabled={workingId === `${match.match_id}-room`} onClick={() => void saveRoom(match)}>{workingId === `${match.match_id}-room` ? 'Saving room...' : 'Save room configuration'}</button>{room?.room_status === 'ready' && room.release_at && <p className="admin-room-release-note">Release scheduled: {formatTournamentDate(room.release_at, match.timezone, true)} / {match.timezone}</p>}</div>
              </div>}
            </article>
          })}</div> : <div className="arena-state"><CalendarClock size={24} /><h3>No matches created yet.</h3><p>Create the first match schedule for this tournament above.</p></div>}
      </section>
    </section>
  )
}

export default AdminTournamentMatchesPage