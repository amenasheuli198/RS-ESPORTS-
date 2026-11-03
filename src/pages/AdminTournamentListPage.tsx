import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CirclePlus, ExternalLink, RotateCw } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import TournamentStatusBadge from '../components/tournaments/TournamentStatusBadge'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'
import type { TournamentAdminRecord, TournamentStatus } from '../tournaments/types'
import TournamentBanner from '../components/tournaments/TournamentBanner'

function deriveStatus(tournament: TournamentAdminRecord): TournamentStatus {
  if (tournament.publication_status === 'cancelled') return 'Cancelled'
  if (tournament.publication_status === 'draft') return 'Draft'
  const now = Date.now()
  if (tournament.lifecycle_status === 'completed' || (tournament.ends_at && now >= Date.parse(tournament.ends_at))) return 'Completed'
  if (tournament.lifecycle_status === 'live' || now >= Date.parse(tournament.starts_at)) return 'Live'
  if (now < Date.parse(tournament.registration_opens_at)) return 'Upcoming'
  if (now >= Date.parse(tournament.registration_closes_at)) return 'Registration Closed'
  if (Date.parse(tournament.registration_closes_at) <= now + 48 * 60 * 60 * 1000) return 'Registration Closing Soon'
  return 'Registration Open'
}

function AdminTournamentListPage() {
  const { client } = useAuth()
  const location = useLocation()
  const [records, setRecords] = useState<TournamentAdminRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [workingId, setWorkingId] = useState('')
  const [notice, setNotice] = useState(() => {
    const state = location.state as { notice?: string } | null
    return state?.notice ?? ''
  })
  const configurationError = getSupabaseConfigurationError()

  const loadRecords = useCallback(async () => {
    if (!client || configurationError) {
      setErrorMessage(configurationError ?? 'Supabase is unavailable.')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setErrorMessage('')
    const { data, error } = await client.from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setErrorMessage('Tournament records could not be loaded. Confirm administrator access and migration status.')
      setRecords([])
    } else {
      setRecords((data ?? []) as TournamentAdminRecord[])
    }
    setIsLoading(false)
  }, [client, configurationError])

  useEffect(() => { void loadRecords() }, [loadRecords])

  async function runAction(id: string, action: 'publish' | 'cancel') {
    if (!client) return
    const label = action === 'publish' ? 'publish this tournament' : 'cancel this tournament'
    if (!window.confirm(`Are you sure you want to ${label}?`)) return
    setWorkingId(id)
    setNotice('')
    const { error } = await client.rpc(action === 'publish' ? 'publish_tournament' : 'cancel_tournament', { p_tournament_id: id })
    if (error) {
      setNotice(action === 'publish' && error.message === 'TOURNAMENT_NOT_READY_TO_PUBLISH'
        ? 'Add a valid banner and dates before publishing this tournament.'
        : 'That tournament action could not be completed.')
    } else {
      setNotice(action === 'publish' ? 'Tournament published.' : 'Tournament cancelled.')
      await loadRecords()
    }
    setWorkingId('')
  }

  async function setLifecycle(id: string, lifecycle: 'scheduled' | 'live' | 'completed') {
    if (!client) return
    setWorkingId(id)
    setNotice('')
    const { error } = await client.rpc('set_tournament_lifecycle', { p_tournament_id: id, p_lifecycle_status: lifecycle })
    if (error) setNotice('Tournament lifecycle could not be updated.')
    else {
      setNotice('Tournament lifecycle updated.')
      await loadRecords()
    }
    setWorkingId('')
  }

  return (
    <section className="admin-tournament-list">
      <div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / TOURNAMENTS</p><h1>Tournament management.</h1><p>Create, review, and publish event listings.</p></div><Link className="arena-state__button" to="/admin/tournaments/new"><CirclePlus size={16} /> New tournament</Link></div>
      <div className="admin-list-toolbar"><span>{records.length} tournament{records.length === 1 ? '' : 's'}</span><button className="admin-refresh-button" type="button" onClick={() => void loadRecords()}><RotateCw size={14} /> Refresh</button></div>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
        : errorMessage ? <div className="arena-state arena-state--error" role="alert"><h2>Admin data unavailable.</h2><p>{errorMessage}</p></div>
          : records.length === 0 ? <div className="arena-state"><CalendarDays size={25} /><h3>No tournaments yet.</h3><p>Create a draft event to begin configuring the arena.</p><Link className="arena-state__button" to="/admin/tournaments/new">Create tournament</Link></div>
            : <div className="admin-tournament-list__items">{records.map((record) => {
              const status = deriveStatus(record)
              return <article className="admin-tournament-row" key={record.id}>
                <TournamentBanner path={record.banner_path} name={record.name} className="admin-tournament-row__banner" />
                <div className="admin-tournament-row__main"><div className="admin-tournament-row__title"><h2>{record.name}</h2><TournamentStatusBadge status={status} /></div><p>{record.game_code.replaceAll('_', ' ')} / {record.mode_code.replaceAll('_', ' ')} · {record.slug}</p><small>{formatTournamentDate(record.starts_at, record.timezone, true)} · Up to {record.max_teams} teams · {formatTournamentMoney(record.prize_pool)} prize pool</small></div>
                <div className="admin-tournament-row__actions">
                  <Link to={`/admin/tournaments/${record.id}/edit`} aria-label={`Edit ${record.name}`}>Edit</Link>
                  <Link to={`/admin/tournaments/${record.id}/registrations`} aria-label={`Manage registrations for ${record.name}`}>Registrations</Link>
                  <Link to={`/admin/tournaments/${record.id}/matches`} aria-label={`Manage matches for ${record.name}`}>Matches</Link>
                  <Link to={`/admin/tournaments/${record.id}/scoring`} aria-label={`Configure scoring for ${record.name}`}>Scoring</Link>
                  {record.publication_status === 'draft' && <button type="button" disabled={workingId === record.id} onClick={() => void runAction(record.id, 'publish')}>Publish</button>}
                  {record.publication_status !== 'cancelled' && <button type="button" className="is-danger" disabled={workingId === record.id} onClick={() => void runAction(record.id, 'cancel')}>Cancel</button>}
                  {record.publication_status === 'published' && <select aria-label={`Set lifecycle for ${record.name}`} value={record.lifecycle_status} disabled={workingId === record.id} onChange={(event) => void setLifecycle(record.id, event.target.value as 'scheduled' | 'live' | 'completed')}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="completed">Completed</option></select>}
                  {record.publication_status === 'published' && <Link to={`/tournaments/${record.slug}`} aria-label={`View ${record.name} publicly`}><ExternalLink size={15} /></Link>}
                </div>
              </article>
            })}</div>}
    </section>
  )
}

export default AdminTournamentListPage