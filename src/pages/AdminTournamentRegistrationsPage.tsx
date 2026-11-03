import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ClipboardList, RotateCw, Search, ShieldCheck, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { TeamRole } from '../types/team'
import { SectionHeading } from '../components/ui'

interface AdminRegistration {
  registration_id: string
  team_id: string
  team_name: string
  captain_name: string
  status: string
  registered_at: string
  reviewed_at: string | null
  rejection_reason: string | null
  notes: string | null
}

interface RegistrationMember {
  user_id: string
  full_name: string
  ign: string
  free_fire_uid: string
  role: TeamRole
  slot: number
}

interface RegistrationEvent {
  id: string
  from_status: string | null
  to_status: string
  actor_id: string
  reason: string | null
  created_at: string
}

function AdminTournamentRegistrationsPage() {
  const { id: tournamentId } = useParams<{ id: string }>()
  const { client } = useAuth()
  const [records, setRecords] = useState<AdminRegistration[]>([])
  const [tournamentName, setTournamentName] = useState('Tournament registrations')
  const [members, setMembers] = useState<Record<string, RegistrationMember[]>>({})
  const [events, setEvents] = useState<Record<string, RegistrationEvent[]>>({})
  const [expandedId, setExpandedId] = useState('')
  const [reasonById, setReasonById] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const configurationError = getSupabaseConfigurationError()

  const loadRecords = useCallback(async () => {
    if (!client || !tournamentId || configurationError) {
      setIsLoading(false)
      setIsError(true)
      setMessage(configurationError ?? 'Tournament data is unavailable.')
      return
    }
    setIsLoading(true)
    try {
      const [tournamentResult, registrationResult] = await Promise.all([
        client.from('tournaments').select('name').eq('id', tournamentId).maybeSingle(),
        client.rpc('get_tournament_registrations_admin', { p_tournament_id: tournamentId }),
      ])
      if (tournamentResult.error || registrationResult.error) throw new Error('LOAD_FAILED')
      setTournamentName(tournamentResult.data?.name ?? 'Tournament registrations')
      setRecords((registrationResult.data ?? []) as AdminRegistration[])
      setMessage('')
      setIsError(false)
    } catch {
      setIsError(true)
      setMessage('Registration records could not be loaded. Confirm administrator access and migration status.')
      setRecords([])
    } finally {
      setIsLoading(false)
    }
  }, [client, tournamentId, configurationError])

  useEffect(() => { void loadRecords() }, [loadRecords])

  const visibleRecords = useMemo(() => records.filter((record) => (
    record.team_name.toLowerCase().includes(search.trim().toLowerCase())
    && (statusFilter === 'all' || record.status === statusFilter)
  )), [records, search, statusFilter])

  async function expandRecord(recordId: string) {
    if (expandedId === recordId) {
      setExpandedId('')
      return
    }
    setExpandedId(recordId)
    if (members[recordId] && events[recordId]) return
    if (!client) return

    try {
      const [rosterResult, eventResult] = await Promise.all([
        client.rpc('get_tournament_registration_roster_admin', { p_registration_id: recordId }),
        client.from('tournament_registration_events').select('id, from_status, to_status, actor_id, reason, created_at').eq('registration_id', recordId).order('created_at', { ascending: false }),
      ])
      if (rosterResult.error || eventResult.error) throw new Error('DETAILS_FAILED')
      setMembers((current) => ({ ...current, [recordId]: (rosterResult.data ?? []) as RegistrationMember[] }))
      setEvents((current) => ({ ...current, [recordId]: (eventResult.data ?? []) as RegistrationEvent[] }))
      setIsError(false)
      setMessage('')
    } catch {
      setIsError(true)
      setMessage('Registration details could not be loaded.')
    }
  }

  async function review(record: AdminRegistration, decision: 'approved' | 'rejected' | 'disqualified') {
    if (!client) return
    const reason = reasonById[record.registration_id]?.trim() ?? ''
    if ((decision === 'rejected' || decision === 'disqualified') && !reason) {
      setIsError(true)
      setMessage('Enter a reason before rejecting or disqualifying a registration.')
      return
    }
    if (!window.confirm(`${decision === 'approved' ? 'Approve' : decision === 'rejected' ? 'Reject' : 'Disqualify'} ${record.team_name}?`)) return

    setWorkingId(record.registration_id)
    setMessage('')
    try {
      const { error } = await client.rpc('review_tournament_registration', {
        p_registration_id: record.registration_id,
        p_decision: decision,
        p_reason: reason || null,
      })
      if (error) {
        setIsError(true)
        const errorText: Record<string, string> = {
          TOURNAMENT_ADMIN_REQUIRED: 'Your account does not have the server-authorized tournament admin claim.',
          REGISTRATION_NOT_PENDING: 'Only pending registrations can be approved or rejected.',
          REGISTRATION_NO_LONGER_APPROVABLE: 'This tournament can no longer approve registrations.',
          TEAM_ROSTER_NO_LONGER_ELIGIBLE: 'This team no longer meets the tournament roster requirements.',
          SELF_REVIEW_FORBIDDEN: 'You cannot review your own team registration.',
        }
        setMessage(errorText[error.message] ?? 'The registration review action could not be completed.')
      } else {
        setIsError(false)
        setReasonById((current) => ({ ...current, [record.registration_id]: '' }))
        setMessage(`Registration ${decision}. The action was recorded in the audit history.`)
        setExpandedId('')
        setEvents((current) => {
          const next = { ...current }
          delete next[record.registration_id]
          return next
        })
        setMembers((current) => {
          const next = { ...current }
          delete next[record.registration_id]
          return next
        })
        await loadRecords()
      }
    } catch {
      setIsError(true)
      setMessage('The registration review action could not be completed. Check your connection.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className="admin-registration-page">
      <Link className="tournament-back-link" to="/admin/tournaments">← Tournament management</Link>
      <SectionHeading eyebrow="CONTROL ROOM / REGISTRATIONS" title={tournamentName} description="Review team eligibility and record every decision." />
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="admin-registration-controls"><label className="admin-registration-search"><Search size={15} /><span className="visually-hidden">Search team name</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search team name" /></label><label className="admin-registration-status"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All registrations</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option><option value="disqualified">Disqualified</option></select></label><button className="admin-refresh-button" type="button" onClick={() => void loadRecords()}><RotateCw size={14} /> Refresh</button></div>
      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
        : visibleRecords.length ? <div className="admin-registration-list">{visibleRecords.map((record) => <article className="admin-registration-card" key={record.registration_id}>
          <div className="admin-registration-card__summary"><div className="admin-registration-card__identity"><span className="admin-registration-card__icon"><ShieldCheck size={17} /></span><div><h2>{record.team_name}</h2><p>Captain: {record.captain_name} · Submitted {new Date(record.registered_at).toLocaleString()}</p></div></div><span className={`registration-status registration-status--${record.status}`}>{record.status}</span><button className="admin-registration-expand" type="button" aria-expanded={expandedId === record.registration_id} onClick={() => void expandRecord(record.registration_id)}>{expandedId === record.registration_id ? <ChevronUp size={17} /> : <ChevronDown size={17} />}<span className="visually-hidden">Toggle details for {record.team_name}</span></button></div>
          {expandedId === record.registration_id && <div className="admin-registration-card__details">
            <section><h3><UserRound size={15} /> Active team roster</h3>{members[record.registration_id] ? <div className="admin-registration-roster">{members[record.registration_id].map((member) => <div key={member.user_id}><b>{member.ign}</b><span>{member.full_name} · {member.role.replaceAll('_', ' ')}</span><small>UID {member.free_fire_uid}</small></div>)}</div> : <p>Loading team roster…</p>}</section>
            <section><h3><ClipboardList size={15} /> Review history</h3>{events[record.registration_id] ? events[record.registration_id].length ? <div className="registration-audit-list">{events[record.registration_id].map((event) => <div key={event.id}><b>{event.from_status ? `${event.from_status} → ` : ''}{event.to_status}</b><span>Reviewer {event.actor_id} · {new Date(event.created_at).toLocaleString()}</span>{event.reason && <small>{event.reason}</small>}</div>)}</div> : <p>No review actions recorded yet.</p> : <p>Loading review history…</p>}</section>
            {['pending', 'approved'].includes(record.status) && <section className="admin-registration-decision"><label className="form-field"><span>{record.status === 'pending' ? 'Review reason (required for reject)' : 'Disqualification reason (required)'}</span><textarea rows={2} maxLength={2000} value={reasonById[record.registration_id] ?? ''} onChange={(event) => setReasonById((current) => ({ ...current, [record.registration_id]: event.target.value }))} /></label><div>{record.status === 'pending' && <><button className="team-button" type="button" disabled={workingId === record.registration_id} onClick={() => void review(record, 'approved')}>Approve</button><button className="team-button team-button--secondary" type="button" disabled={workingId === record.registration_id} onClick={() => void review(record, 'rejected')}>Reject</button></>}<button className="admin-disqualify-button" type="button" disabled={workingId === record.registration_id} onClick={() => void review(record, 'disqualified')}>Disqualify</button></div></section>}
          </div>}
        </article>)}</div> : <div className="arena-state"><ClipboardList size={24} /><h3>{records.length ? 'No registrations match.' : 'No registrations yet.'}</h3><p>{records.length ? 'Adjust the search or status filter.' : 'Team registrations will appear here after captains submit them.'}</p></div>}
    </section>
  )
}

export default AdminTournamentRegistrationsPage