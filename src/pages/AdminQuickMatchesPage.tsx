import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CalendarClock, KeyRound, Plus, RotateCw, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import { formatTournamentDate, toDateTimeLocal, toTimestamp } from '../tournaments/format'
import { slugifyTournamentName } from '../tournaments/bannerValidation'

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
  min_team_size: number
  max_team_size: number
  max_substitutes: number
  registration_opens_at: string
  registration_closes_at: string
  starts_at: string
  ends_at: string | null
  timezone: string
  status: string
}

interface GameFormat {
  game_code: string
  format_code: string
  display_name: string
  participant_kind: 'team' | 'individual'
  min_team_size: number
  max_team_size: number
  max_substitutes: number
}

interface QuickEntry {
  id: string
  competition_id: string
  team_id: string | null
  player_id: string | null
  registered_by: string
  status: string
  registered_at: string
}

interface CompetitionMatch {
  id: string
  competition_id: string
  name: string
  match_number: number
  round_name: string
  scheduled_at: string
  timezone: string
  duration_minutes: number | null
  status: string
  lobby_capacity: number
}

interface RoomForm {
  room_id: string
  room_password: string
  release_at: string
  access_instructions: string
}

interface MatchDraft {
  name: string
  number: string
  round: string
  scheduled: string
  duration: string
  capacity: string
}

const emptyRoom: RoomForm = { room_id: '', room_password: '', release_at: '', access_instructions: '' }
const timezones = ['Asia/Dhaka', 'UTC', 'Asia/Kolkata', 'Asia/Singapore', 'Europe/London', 'America/New_York']

function AdminQuickMatchesPage() {
  const { client } = useAuth()
  const [competitions, setCompetitions] = useState<QuickCompetition[]>([])
  const [formats, setFormats] = useState<GameFormat[]>([])
  const [entries, setEntries] = useState<QuickEntry[]>([])
  const [matches, setMatches] = useState<CompetitionMatch[]>([])
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  const [assignedEntryIds, setAssignedEntryIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [entryType, setEntryType] = useState<'free' | 'paid'>('free')
  const [entryFee, setEntryFee] = useState('')
  const [formatKey, setFormatKey] = useState('')
  const [capacity, setCapacity] = useState('48')
  const [registrationOpens, setRegistrationOpens] = useState('')
  const [registrationCloses, setRegistrationCloses] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [timezone, setTimezone] = useState('Asia/Dhaka')
  const [editingScheduleId, setEditingScheduleId] = useState('')
  const [scheduleForm, setScheduleForm] = useState({ opens: '', closes: '', starts: '', ends: '', timezone: 'Asia/Dhaka' })
  const [matchForms, setMatchForms] = useState<Record<string, MatchDraft>>({})
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({})
  const [roomMatchId, setRoomMatchId] = useState('')
  const [roomForm, setRoomForm] = useState<RoomForm>(emptyRoom)
  const [scheduleMatchId, setScheduleMatchId] = useState('')
  const [matchScheduleForm, setMatchScheduleForm] = useState({ scheduled: '', timezone: 'Asia/Dhaka', duration: '' })
  const configurationError = getSupabaseConfigurationError()

  const selectedFormat = formats.find((item) => `${item.game_code}:${item.format_code}` === formatKey) ?? formats[0] ?? null

  const loadData = useCallback(async () => {
    if (!client || configurationError) {
      setIsError(true)
      setMessage(configurationError ?? 'Quick Match administration is unavailable.')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const [competitionResult, formatResult] = await Promise.all([
        client.from('competitions').select('*').eq('competition_type', 'quick_match').order('created_at', { ascending: false }),
        client.from('game_formats').select('game_code, format_code, display_name, participant_kind, min_team_size, max_team_size, max_substitutes').eq('is_active', true),
      ])
      if (competitionResult.error || formatResult.error) throw new Error('QUICK_MATCH_ADMIN_LOAD_FAILED')
      const nextCompetitions = (competitionResult.data ?? []) as QuickCompetition[]
      const nextFormats = (formatResult.data ?? []) as GameFormat[]
      setCompetitions(nextCompetitions)
      setFormats(nextFormats)
      if (!formatKey && nextFormats.length) setFormatKey(`${nextFormats[0].game_code}:${nextFormats[0].format_code}`)
      if (!nextCompetitions.length) {
        setEntries([])
        setMatches([])
        setAssignedEntryIds(new Set())
        setTeamNames({})
        return
      }

      const competitionIds = nextCompetitions.map((item) => item.id)
      const [entryResult, matchResult] = await Promise.all([
        client.from('competition_entries').select('id, competition_id, team_id, player_id, registered_by, status, registered_at').in('competition_id', competitionIds).order('registered_at', { ascending: false }),
        client.from('matches').select('id, competition_id, name, match_number, round_name, scheduled_at, timezone, duration_minutes, status, lobby_capacity').in('competition_id', competitionIds).order('scheduled_at', { ascending: true }),
      ])
      if (entryResult.error || matchResult.error) throw new Error('QUICK_MATCH_RECORDS_LOAD_FAILED')
      const nextEntries = (entryResult.data ?? []) as QuickEntry[]
      const nextMatches = (matchResult.data ?? []) as CompetitionMatch[]
      setEntries(nextEntries)
      setMatches(nextMatches)

      const teamIds = [...new Set(nextEntries.map((entry) => entry.team_id).filter((value): value is string => Boolean(value)))]
      if (teamIds.length) {
        const { data: teams, error: teamsError } = await client.from('teams').select('id, name').in('id', teamIds)
        if (teamsError) throw teamsError
        setTeamNames(Object.fromEntries((teams ?? []).map((team) => [team.id, team.name])))
      } else {
        setTeamNames({})
      }

      const matchIds = nextMatches.map((match) => match.id)
      if (!matchIds.length) {
        setAssignedEntryIds(new Set())
        return
      }
      const [teamAssignments, individualAssignments] = await Promise.all([
        client.from('match_team_assignments').select('entry_id').in('match_id', matchIds).not('entry_id', 'is', null),
        client.from('match_participants').select('entry_id').in('match_id', matchIds),
      ])
      if (teamAssignments.error || individualAssignments.error) throw new Error('QUICK_MATCH_ASSIGNMENTS_LOAD_FAILED')
      setAssignedEntryIds(new Set([...(teamAssignments.data ?? []), ...(individualAssignments.data ?? [])].map((row) => row.entry_id)))
    } catch {
      setIsError(true)
      setMessage('Quick Match records could not be loaded. Confirm competition and match migrations are applied.')
    } finally {
      setIsLoading(false)
    }
  }, [client, configurationError, formatKey])

  useEffect(() => { void loadData() }, [loadData])

  async function createQuickMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !selectedFormat) return
    if (!title.trim() || !slug.trim() || !registrationOpens || !registrationCloses || !startsAt) {
      setIsError(true)
      setMessage('Complete the title, slug, registration window, and start time.')
      return
    }
    const fee = entryType === 'paid' ? Number(entryFee) : 0
    if (entryType === 'paid' && (!Number.isFinite(fee) || fee <= 0)) {
      setIsError(true)
      setMessage('Enter a valid paid entry fee greater than zero.')
      return
    }
    setIsSaving(true)
    setMessage('')
    try {
      const { data: id, error } = await client.rpc('create_competition', {
        p_competition: {
          competition_type: 'quick_match', title: title.trim(), slug: slug.trim(), description: description.trim(),
          game_code: selectedFormat.game_code, format_code: selectedFormat.format_code,
          entry_type: entryType, entry_fee: fee, currency: 'BDT', capacity: Number(capacity),
          min_team_size: selectedFormat.min_team_size, max_team_size: selectedFormat.max_team_size,
          max_substitutes: selectedFormat.max_substitutes,
          registration_opens_at: toTimestamp(registrationOpens, timezone),
          registration_closes_at: toTimestamp(registrationCloses, timezone),
          starts_at: toTimestamp(startsAt, timezone), ends_at: endsAt ? toTimestamp(endsAt, timezone) : null,
          timezone,
        },
      })
      if (error || !id) throw error ?? new Error('QUICK_MATCH_CREATE_FAILED')
      const { error: publishError } = await client.rpc('publish_competition', { p_competition_id: id })
      setIsError(Boolean(publishError))
      setMessage(publishError ? 'Quick Match saved as a draft, but could not be published. Check its dates and try Publish.' : 'Quick Match created and published.')
      setTitle('')
      setSlug('')
      setSlugTouched(false)
      setDescription('')
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Quick Match could not be created. Check the game format, dates, and migration status.')
    } finally {
      setIsSaving(false)
    }
  }

  async function publishQuickMatch(competition: QuickCompetition) {
    if (!client) return
    setWorkingId(competition.id)
    try {
      const { error } = await client.rpc('publish_competition', { p_competition_id: competition.id })
      if (error) throw error
      setIsError(false)
      setMessage(`${competition.title} is published.`)
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Quick Match could not be published. Verify the registration and start dates.')
    } finally {
      setWorkingId('')
    }
  }

  async function saveEventSchedule(event: FormEvent<HTMLFormElement>, competition: QuickCompetition) {
    event.preventDefault()
    if (!client) return
    setWorkingId(competition.id)
    try {
      const { error } = await client.rpc('update_quick_match_schedule', {
        p_competition_id: competition.id,
        p_registration_opens_at: toTimestamp(scheduleForm.opens, scheduleForm.timezone),
        p_registration_closes_at: toTimestamp(scheduleForm.closes, scheduleForm.timezone),
        p_starts_at: toTimestamp(scheduleForm.starts, scheduleForm.timezone),
        p_ends_at: scheduleForm.ends ? toTimestamp(scheduleForm.ends, scheduleForm.timezone) : null,
        p_timezone: scheduleForm.timezone,
      })
      if (error) throw error
      setIsError(false)
      setMessage('Quick Match schedule updated.')
      setEditingScheduleId('')
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Schedule could not be updated. Check that registration closes before the start time.')
    } finally {
      setWorkingId('')
    }
  }

  async function createMatch(event: FormEvent<HTMLFormElement>, competition: QuickCompetition) {
    event.preventDefault()
    if (!client) return
    const form = matchForms[competition.id] ?? {
      name: 'Quick Match', number: '1', round: 'Open Play',
      scheduled: toDateTimeLocal(competition.starts_at, competition.timezone), duration: '60', capacity: '48',
    }
    if (!form.scheduled) return
    setWorkingId('create-match')
    try {
      const { error } = await client.rpc('create_competition_match', {
        p_competition_id: competition.id,
        p_name: form.name.trim(),
        p_match_number: Number(form.number),
        p_round_name: form.round.trim(),
        p_scheduled_at: toTimestamp(form.scheduled, competition.timezone),
        p_timezone: competition.timezone,
        p_duration_minutes: form.duration ? Number(form.duration) : null,
        p_lobby_capacity: Number(form.capacity),
        p_public_notes: '',
      })
      if (error) throw error
      setIsError(false)
      setMessage('Quick Match lobby created.')
      setMatchForms((current) => ({
        ...current,
        [competition.id]: { ...form, number: String(Number(form.number) + 1) },
      }))
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Match could not be created. Check the time, match number, and capacity.')
    } finally {
      setWorkingId('')
    }
  }

  async function reviewEntry(entry: QuickEntry) {
    if (!client) return
    setWorkingId(entry.id)
    try {
      const { error } = await client.rpc('review_competition_entry', {
        p_entry_id: entry.id,
        p_decision: 'confirmed',
        p_reason: null,
      })
      if (error) throw error
      setIsError(false)
      setMessage('Entry confirmed and eligible for match assignment.')
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Entry could not be confirmed. Only pending free entries can be reviewed.')
    } finally {
      setWorkingId('')
    }
  }

  async function assignEntry(entry: QuickEntry) {
    if (!client) return
    const matchId = assignmentTargets[entry.id]
    if (!matchId) return
    setWorkingId(entry.id)
    try {
      const { error } = await client.rpc('assign_competition_entry_to_match', { p_match_id: matchId, p_entry_id: entry.id })
      if (error) throw error
      setIsError(false)
      setMessage('Confirmed entry assigned to the match.')
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Entry could not be assigned. Check match capacity and entry status.')
    } finally {
      setWorkingId('')
    }
  }

  async function openRoomEditor(match: CompetitionMatch) {
    if (!client) return
    setRoomMatchId(match.id)
    setRoomForm({ ...emptyRoom, release_at: toDateTimeLocal(match.scheduled_at, match.timezone) })
    const { data, error } = await client.rpc('get_match_room_credentials_admin', { p_match_id: match.id })
    if (!error && data?.[0]) {
      const room = data[0] as RoomForm & { room_status?: string }
      setRoomForm({
        room_id: room.room_id ?? '', room_password: room.room_password ?? '',
        release_at: room.release_at ? toDateTimeLocal(room.release_at, match.timezone) : toDateTimeLocal(match.scheduled_at, match.timezone),
        access_instructions: room.access_instructions ?? '',
      })
    }
  }

  async function saveRoom(match: CompetitionMatch) {
    if (!client) return
    setWorkingId(`${match.id}-room`)
    try {
      const { error } = await client.rpc('set_competition_match_room', {
        p_match_id: match.id,
        p_room_id: roomForm.room_id.trim(),
        p_room_password: roomForm.room_password,
        p_release_at: toTimestamp(roomForm.release_at, match.timezone),
        p_access_instructions: roomForm.access_instructions.trim(),
      })
      if (error) throw error
      setIsError(false)
      setMessage('Room credentials saved. Assigned members can access them after the release time.')
      setRoomMatchId('')
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Room details could not be saved. Check the code and release time.')
    } finally {
      setWorkingId('')
    }
  }

  async function saveMatchSchedule(match: CompetitionMatch) {
    if (!client) return
    setWorkingId(`${match.id}-schedule`)
    try {
      const { error } = await client.rpc('update_quick_match_schedule_time', {
        p_match_id: match.id,
        p_scheduled_at: toTimestamp(matchScheduleForm.scheduled, matchScheduleForm.timezone),
        p_timezone: matchScheduleForm.timezone,
        p_duration_minutes: matchScheduleForm.duration ? Number(matchScheduleForm.duration) : null,
      })
      if (error) throw error
      setIsError(false)
      setMessage('Match time extended/updated.')
      setScheduleMatchId('')
      await loadData()
    } catch {
      setIsError(true)
      setMessage('Match time could not be updated. Completed or live matches cannot be rescheduled.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className="admin-quick-matches-page">
      <div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / QUICK MATCHES</p><h1>Quick Match operations.</h1><p>Create standalone events, confirm entries, assign matches, and release room access.</p></div></div>
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <form className="admin-match-form" onSubmit={(event) => void createQuickMatch(event)}>
        <div className="admin-match-form__heading"><Plus size={18} /><div><h2>Create a Quick Match</h2><p>Configure free entry or manual bKash payment.</p></div></div>
        <div className="admin-form-grid admin-form-grid--three">
          <label className="form-field"><span>Title</span><input required minLength={3} maxLength={140} value={title} onChange={(event) => { setTitle(event.target.value); if (!slugTouched) setSlug(slugifyTournamentName(event.target.value)) }} /></label>
          <label className="form-field"><span>Slug</span><input required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(event.target.value) }} /></label>
          <label className="form-field"><span>Game format</span><select value={formatKey} onChange={(event) => setFormatKey(event.target.value)}>{formats.map((format) => <option key={`${format.game_code}:${format.format_code}`} value={`${format.game_code}:${format.format_code}`}>{format.game_code.replaceAll('_', ' ')} / {format.display_name} ({format.participant_kind})</option>)}</select></label>
          <label className="form-field"><span>Entry type</span><select value={entryType} onChange={(event) => setEntryType(event.target.value as 'free' | 'paid')}><option value="free">Free</option><option value="paid">Paid / manual bKash</option></select></label>
          {entryType === 'paid' && <label className="form-field"><span>Entry fee (BDT)</span><input type="number" min="0.01" max="1000000000" step="0.01" required value={entryFee} onChange={(event) => setEntryFee(event.target.value)} /></label>}
          <label className="form-field"><span>Capacity</span><input type="number" min="1" max="10000" required value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          <label className="form-field"><span>Timezone</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}>{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
          <label className="form-field"><span>Description</span><input maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="form-field"><span>Registration opens</span><input type="datetime-local" required value={registrationOpens} onChange={(event) => setRegistrationOpens(event.target.value)} /></label>
          <label className="form-field"><span>Registration closes</span><input type="datetime-local" required value={registrationCloses} onChange={(event) => setRegistrationCloses(event.target.value)} /></label>
          <label className="form-field"><span>Match starts</span><input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
          <label className="form-field"><span>Ends <small>Optional</small></span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        </div>
        <button className="arena-state__button" type="submit" disabled={isSaving || !formats.length}>{isSaving ? 'Creating...' : 'Create and publish'}</button>
      </form>

      <section className="admin-match-list-section">
        <div className="admin-match-list-heading"><div><h2>Published and draft Quick Matches</h2><p>Updates to event and lobby times are audited.</p></div><button className="admin-refresh-button" type="button" onClick={() => void loadData()}><RotateCw size={14} /> Refresh</button></div>
        {isLoading ? <p role="status">Loading Quick Matches...</p> : competitions.length ? <div className="admin-quick-match-list">{competitions.map((competition) => {
          const eventMatches = matches.filter((match) => match.competition_id === competition.id)
          const eventEntries = entries.filter((entry) => entry.competition_id === competition.id)
          const eventFormat = formats.find((format) => format.game_code === competition.game_code && format.format_code === competition.format_code)
          return <article className="admin-dashboard-panel admin-quick-match" key={competition.id}>
            <header><div><p className="section-heading__eyebrow">{competition.game_code.replaceAll('_', ' ')} / {eventFormat?.display_name ?? competition.format_code}</p><h2>{competition.title}</h2><p>{competition.status} / {competition.capacity} max / {formatTournamentDate(competition.starts_at, competition.timezone, true)}</p></div>{competition.status === 'draft' && <button className="team-button" type="button" disabled={Boolean(workingId)} onClick={() => void publishQuickMatch(competition)}>Publish</button>}</header>
            {editingScheduleId === competition.id ? <form className="admin-match-form" onSubmit={(event) => void saveEventSchedule(event, competition)}><div className="admin-form-grid admin-form-grid--three"><label className="form-field"><span>Opens</span><input type="datetime-local" required value={scheduleForm.opens} onChange={(event) => setScheduleForm((current) => ({ ...current, opens: event.target.value }))} /></label><label className="form-field"><span>Closes</span><input type="datetime-local" required value={scheduleForm.closes} onChange={(event) => setScheduleForm((current) => ({ ...current, closes: event.target.value }))} /></label><label className="form-field"><span>Starts</span><input type="datetime-local" required value={scheduleForm.starts} onChange={(event) => setScheduleForm((current) => ({ ...current, starts: event.target.value }))} /></label><label className="form-field"><span>Ends</span><input type="datetime-local" value={scheduleForm.ends} onChange={(event) => setScheduleForm((current) => ({ ...current, ends: event.target.value }))} /></label><label className="form-field"><span>Timezone</span><select value={scheduleForm.timezone} onChange={(event) => setScheduleForm((current) => ({ ...current, timezone: event.target.value }))}>{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></label></div><button className="team-button" type="submit" disabled={Boolean(workingId)}>Save dates</button><button className="team-button team-button--secondary" type="button" onClick={() => setEditingScheduleId('')}>Cancel</button></form>
              : <button className="admin-refresh-button" type="button" disabled={['completed', 'cancelled'].includes(competition.status)} onClick={() => { setEditingScheduleId(competition.id); setScheduleForm({ opens: toDateTimeLocal(competition.registration_opens_at, competition.timezone), closes: toDateTimeLocal(competition.registration_closes_at, competition.timezone), starts: toDateTimeLocal(competition.starts_at, competition.timezone), ends: competition.ends_at ? toDateTimeLocal(competition.ends_at, competition.timezone) : '', timezone: competition.timezone }) }}>Extend / edit event dates</button>}
            <section><h3><Users size={15} /> Registrations ({eventEntries.length})</h3>{eventEntries.length ? <div className="admin-quick-entry-list">{eventEntries.map((entry) => {
              const identity = entry.team_id ? teamNames[entry.team_id] ?? `Team ${entry.team_id.slice(0, 8)}` : `Player ${entry.player_id?.slice(0, 8) ?? ''}`
              return <div className="admin-quick-entry" key={entry.id}><span>{identity}</span><span>{entry.status.replaceAll('_', ' ')}</span><small>{new Date(entry.registered_at).toLocaleString()}</small>{entry.status === 'pending_review' && <button className="team-button" type="button" disabled={Boolean(workingId)} onClick={() => void reviewEntry(entry)}>Confirm</button>}{entry.status === 'confirmed' && !assignedEntryIds.has(entry.id) && eventMatches.length > 0 && <><select aria-label={`Match for ${identity}`} value={assignmentTargets[entry.id] ?? ''} onChange={(event) => setAssignmentTargets((current) => ({ ...current, [entry.id]: event.target.value }))}><option value="">Assign match</option>{eventMatches.map((match) => <option key={match.id} value={match.id}>{match.name} / {match.match_number}</option>)}</select><button className="team-button team-button--secondary" type="button" disabled={!assignmentTargets[entry.id] || Boolean(workingId)} onClick={() => void assignEntry(entry)}>Assign</button></>}</div>
            })}</div> : <p>No entries yet.</p>}</section>
            {(() => { const draft = matchForms[competition.id] ?? { name: 'Quick Match', number: '1', round: 'Open Play', scheduled: toDateTimeLocal(competition.starts_at, competition.timezone), duration: '60', capacity: '48' }; const update = (key: keyof MatchDraft, value: string) => setMatchForms((current) => ({ ...current, [competition.id]: { ...draft, [key]: value } })); return <form className="admin-match-form" onSubmit={(event) => void createMatch(event, competition)}><h3><CalendarClock size={15} /> Create match</h3><div className="admin-form-grid admin-form-grid--three"><label className="form-field"><span>Name</span><input required minLength={2} maxLength={120} value={draft.name} onChange={(event) => update('name', event.target.value)} /></label><label className="form-field"><span>Match number</span><input type="number" min="1" max="200" required value={draft.number} onChange={(event) => update('number', event.target.value)} /></label><label className="form-field"><span>Round</span><input required maxLength={100} value={draft.round} onChange={(event) => update('round', event.target.value)} /></label><label className="form-field"><span>Scheduled</span><input type="datetime-local" required value={draft.scheduled} onChange={(event) => update('scheduled', event.target.value)} /></label><label className="form-field"><span>Duration</span><input type="number" min="1" max="720" value={draft.duration} onChange={(event) => update('duration', event.target.value)} /></label><label className="form-field"><span>Lobby capacity</span><input type="number" min="1" max="100" value={draft.capacity} onChange={(event) => update('capacity', event.target.value)} /></label></div><button className="team-button" type="submit" disabled={Boolean(workingId)}>Create match</button></form> })()}
            {eventMatches.map((match) => <section className="admin-quick-match-row" key={match.id}><div><b>{match.name} / {match.round_name}</b><span>{formatTournamentDate(match.scheduled_at, match.timezone, true)} / {match.timezone} / {match.status}</span></div><button className="admin-refresh-button" type="button" onClick={() => { setScheduleMatchId(match.id); setMatchScheduleForm({ scheduled: toDateTimeLocal(match.scheduled_at, match.timezone), timezone: match.timezone, duration: match.duration_minutes ? String(match.duration_minutes) : '' }) }}>Edit match time</button><button className="admin-refresh-button" type="button" onClick={() => void openRoomEditor(match)}><KeyRound size={14} /> Room</button>
              {scheduleMatchId === match.id && <form className="admin-match-form" onSubmit={(event) => { event.preventDefault(); void saveMatchSchedule(match) }}><label className="form-field"><span>Scheduled</span><input type="datetime-local" required value={matchScheduleForm.scheduled} onChange={(event) => setMatchScheduleForm((current) => ({ ...current, scheduled: event.target.value }))} /></label><label className="form-field"><span>Timezone</span><select value={matchScheduleForm.timezone} onChange={(event) => setMatchScheduleForm((current) => ({ ...current, timezone: event.target.value }))}>{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></label><label className="form-field"><span>Duration</span><input type="number" min="1" max="720" value={matchScheduleForm.duration} onChange={(event) => setMatchScheduleForm((current) => ({ ...current, duration: event.target.value }))} /></label><button className="team-button" type="submit" disabled={Boolean(workingId)}>Save match time</button></form>}
              {roomMatchId === match.id && <form className="admin-match-form" onSubmit={(event) => { event.preventDefault(); void saveRoom(match) }}><label className="form-field"><span>Room code / ID</span><input required maxLength={64} value={roomForm.room_id} onChange={(event) => setRoomForm((current) => ({ ...current, room_id: event.target.value }))} /></label><label className="form-field"><span>Password <small>Optional</small></span><input maxLength={128} value={roomForm.room_password} onChange={(event) => setRoomForm((current) => ({ ...current, room_password: event.target.value }))} /></label><label className="form-field"><span>Release time</span><input type="datetime-local" required value={roomForm.release_at} onChange={(event) => setRoomForm((current) => ({ ...current, release_at: event.target.value }))} /></label><label className="form-field"><span>Instructions</span><textarea rows={2} maxLength={2000} value={roomForm.access_instructions} onChange={(event) => setRoomForm((current) => ({ ...current, access_instructions: event.target.value }))} /></label><button className="team-button" type="submit" disabled={Boolean(workingId)}><ShieldCheck size={14} /> Save room details</button></form>}
            </section>)}
          </article>
        })}</div> : <p>No Quick Matches created yet.</p>}
      </section>
    </section>
  )
}

export default AdminQuickMatchesPage