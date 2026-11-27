import { useCallback, useEffect, useState } from 'react'
import { RotateCw, Search, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import TeamLogo from '../components/team/TeamLogo'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'

interface RegistrationRosterMember {
  name: string | null
  email: string | null
  phone: string | null
  role: string
  slot: number
  ign: string | null
  external_id: string | null
}

interface PendingRegistration {
  registration_id: string
  registration_source: 'competition' | 'legacy_tournament'
  event_id: string
  event_name: string
  event_type: string
  entry_type: 'free' | 'paid'
  entry_fee: number
  currency: string
  status: string
  registered_at: string
  team_id: string
  team_name: string
  team_logo_path: string | null
  captain_name: string | null
  captain_email: string | null
  captain_phone: string | null
  payment_id: string | null
  payment_status: string | null
  sender_number: string | null
  txid: string | null
  amount: number | null
  payment_submitted_at: string | null
  roster: RegistrationRosterMember[]
  total_count: number
}

const pageSize = 25

function AdminRegistrationsPage() {
  const { client } = useAuth()
  const [items, setItems] = useState<PendingRegistration[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const loadRegistrations = useCallback(async () => {
    if (!client) {
      setIsLoading(false)
      setIsError(true)
      setMessage('Registration review is unavailable because Supabase is not configured.')
      return
    }
    setIsLoading(true)
    setMessage('')
    setIsError(false)
    try {
      const { data, error } = await client.rpc('get_admin_pending_registrations', {
        p_search: query.trim(), p_limit: pageSize, p_offset: page * pageSize,
      })
      if (error) throw error
      const rows = (data ?? []) as PendingRegistration[]
      setItems(rows)
      setTotalCount(Number(rows[0]?.total_count ?? 0))
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error && error.message.includes('ADMIN_REQUIRED')
        ? 'Your account does not have administrator access to pending registrations.'
        : 'Pending registrations could not be loaded. Check your connection and refresh.')
      setItems([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [client, page, query])

  useEffect(() => { void loadRegistrations() }, [loadRegistrations])

  async function review(registration: PendingRegistration, decision: 'approve' | 'reject') {
    if (!client) return
    const reason = decision === 'reject' ? window.prompt(`Reason for rejecting ${registration.team_name}:`)?.trim() ?? '' : ''
    if (decision === 'reject' && !reason) {
      setIsError(true)
      setMessage('A rejection reason is required.')
      return
    }
    if (decision === 'approve' && !window.confirm(`Approve ${registration.team_name} for ${registration.event_name}?`)) return

    setWorkingId(registration.registration_id)
    setIsError(false)
    setMessage('')
    try {
      let error: { message: string } | null = null
      if (registration.registration_source === 'legacy_tournament') {
        const result = await client.rpc('review_tournament_registration', {
          p_registration_id: registration.registration_id,
          p_decision: decision === 'approve' ? 'approved' : 'rejected',
          p_reason: decision === 'reject' ? reason : null,
        })
        error = result.error
      } else if (registration.entry_type === 'paid' && registration.payment_status === 'pending' && registration.payment_id) {
        const result = await client.rpc('review_bkash_payment', {
          p_payment_id: registration.payment_id,
          p_decision: decision === 'approve' ? 'approved' : 'rejected',
          p_reason: decision === 'reject' ? reason : null,
        })
        error = result.error
      } else {
        const result = await client.rpc('review_competition_entry', {
          p_entry_id: registration.registration_id,
          p_decision: decision === 'approve' ? 'confirmed' : 'rejected',
          p_reason: decision === 'reject' ? reason : null,
        })
        error = result.error
      }

      if (error) {
        const reviewErrors: Record<string, string> = {
          PAYMENT_NOT_PENDING: 'That payment is no longer pending review. Refresh the list.',
          PAID_ENTRY_REQUIRES_APPROVED_PAYMENT: 'A paid entry can only be approved after its payment is approved.',
          REGISTRATION_NOT_PENDING: 'That registration is no longer pending review. Refresh the list.',
          ENTRY_NOT_REVIEWABLE: 'That registration is no longer pending review. Refresh the list.',
          SELF_REVIEW_FORBIDDEN: 'You cannot review your own registration.',
          PAYMENT_REVIEWER_REQUIRED: 'Your account does not have payment-review permission.',
          COMPETITION_MANAGER_REQUIRED: 'Your account does not have competition-management permission.',
          TOURNAMENT_ADMIN_REQUIRED: 'Your account does not have tournament-admin permission.',
        }
        throw new Error(reviewErrors[error.message] ?? 'The registration decision could not be saved.')
      }
      const successMessage = `${registration.team_name} ${decision === 'approve' ? 'approved' : 'rejected'} for ${registration.event_name}.`
      await loadRegistrations()
      setIsError(false)
      setMessage(successMessage)
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : 'The registration decision could not be saved.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className="admin-work-page">
      <div className="admin-work-heading"><div><p className="section-heading__eyebrow">REVIEW QUEUE / TEAM ENTRIES</p><h1>Pending registrations.</h1><p>Check team rosters and payment receipts before changing entry status.</p></div><button className="admin-refresh-button" type="button" onClick={() => void loadRegistrations()} disabled={isLoading}><RotateCw size={15} /> Refresh</button></div>
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="admin-directory-toolbar"><label className="admin-directory-search"><Search size={16} /><span className="visually-hidden">Search pending registrations</span><input type="search" value={query} onChange={(event) => { setPage(0); setQuery(event.target.value) }} placeholder="Search team, event, leader, TXID" /></label><span className="admin-directory-total">{totalCount.toLocaleString()} awaiting review</span></div>
      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
        : items.length ? <div className="admin-pending-list">{items.map((registration) => {
          const pendingPayment = registration.entry_type === 'paid' && registration.payment_status === 'pending' && Boolean(registration.payment_id)
          const canApprove = registration.registration_source === 'legacy_tournament'
            ? registration.entry_type === 'free'
            : registration.entry_type === 'free' ? registration.status === 'pending_review' : pendingPayment
          const allowActions = registration.registration_source === 'legacy_tournament'
            ? registration.status === 'pending'
            : ['pending_review', 'pending_payment', 'payment_rejected'].includes(registration.status)
          return <article className="admin-pending-card" key={`${registration.registration_source}-${registration.registration_id}`}>
            <div className="admin-pending-card__main">
              <div className="admin-pending-card__identity"><TeamLogo path={registration.team_logo_path} teamName={registration.team_name} /><div><p className="section-heading__eyebrow">{registration.event_type.replaceAll('_', ' ')} / {registration.entry_type} entry</p><h2>{registration.team_name}</h2><p>{registration.event_name} · Captain {registration.captain_name || 'Unknown'}</p><small>Leader {registration.captain_email || 'No email'}{registration.captain_phone ? ` · ${registration.captain_phone}` : ''}</small></div></div>
              <div className="admin-pending-card__facts"><span><small>Entry</small><b>{formatTournamentMoney(registration.entry_fee, registration.entry_type, registration.currency)}</b></span><span><small>Submitted</small><b>{formatTournamentDate(registration.registered_at, 'Asia/Dhaka', true)}</b></span><span><small>Registration</small><b>{registration.status.replaceAll('_', ' ')}</b></span></div>
              <div className="admin-pending-payment"><b>Payment</b>{registration.payment_id ? <><span className={`registration-status registration-status--${registration.payment_status ?? 'pending'}`}>{registration.payment_status}</span><span>TXID <strong>{registration.txid || '—'}</strong></span><span>Sender <strong>{registration.sender_number || '—'}</strong></span><span>Amount <strong>{registration.amount == null ? '—' : formatTournamentMoney(registration.amount, 'paid', registration.currency)}</strong></span>{registration.payment_submitted_at && <span>Paid record {formatTournamentDate(registration.payment_submitted_at, 'Asia/Dhaka', true)}</span>}</> : <span>No payment submitted</span>}</div>
              <details className="admin-roster-details"><summary><Users size={14} /> Inspect roster ({registration.roster.length})</summary><div className="admin-roster-list">{registration.roster.length ? registration.roster.map((member, index) => <article key={`${registration.registration_id}-${member.slot}-${index}`}><b>{member.name || member.ign || 'Unnamed player'}</b><span>{member.role.replaceAll('_', ' ')} · Slot {member.slot}</span><small>{member.email || 'No email'}{member.phone ? ` · ${member.phone}` : ''}</small><small>IGN {member.ign || '—'}{member.external_id ? ` · ID ${member.external_id}` : ''}</small></article>) : <p>No roster snapshot found.</p>}</div></details>
            </div>
            {allowActions && <div className="admin-pending-card__actions"><button type="button" disabled={Boolean(workingId) || !canApprove} title={!canApprove ? 'Paid entries require an approved payment before registration approval.' : undefined} onClick={() => void review(registration, 'approve')}><ShieldCheck size={15} /> {workingId === registration.registration_id ? 'Saving...' : 'Approve'}</button><button type="button" className="is-danger" disabled={Boolean(workingId)} onClick={() => void review(registration, 'reject')}>Reject</button>{!canApprove && <small>Payment approval required before this entry can be confirmed.</small>}</div>}
          </article>
        })}</div> : <div className="arena-state"><ShieldCheck size={24} /><h2>No pending registrations.</h2><p>New team registrations will appear here for review.</p></div>}
      <div className="admin-directory-pagination"><button type="button" disabled={page === 0 || isLoading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))}</span><button type="button" disabled={(page + 1) * pageSize >= totalCount || isLoading} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </section>
  )
}

export default AdminRegistrationsPage
