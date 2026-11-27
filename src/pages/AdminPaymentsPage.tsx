import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RotateCw, Search, ShieldAlert, XCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'

interface PaymentQueueItem {
  payment_id: string
  entry_id: string
  competition_id: string
  competition_name: string
  competition_type: string
  game_name: string
  team_id: string | null
  team_name: string | null
  participant_name: string
  participant_email: string
  participant_phone: string
  sender_number: string
  txid: string
  amount: number
  currency: string
  status: string
  submitted_at: string
  rejection_reason: string | null
}

function AdminPaymentsPage() {
  const { client } = useAuth()
  const [items, setItems] = useState<PaymentQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [workingPaymentId, setWorkingPaymentId] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending')
  const [search, setSearch] = useState('')

  const loadItems = useCallback(async () => {
    if (!client) {
      setIsLoading(false)
      setIsError(true)
      setMessage('Payment review is unavailable because Supabase is not configured.')
      return
    }
    setIsLoading(true)
    setIsError(false)
    setMessage('')
    try {
      const { data, error } = await client.rpc('get_admin_bkash_payment_queue_v2')
      if (error) {
        if (error.message.includes('PAYMENT_REVIEWER_REQUIRED') || error.code === '42501') {
          throw new Error('PAYMENT_REVIEWER_REQUIRED')
        }
        throw new Error(error.code === 'PGRST202' ? 'PAYMENT_QUEUE_RPC_MISSING' : 'PAYMENT_QUEUE_LOAD_FAILED')
      }
      setItems((data ?? []) as PaymentQueueItem[])
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error && error.message === 'PAYMENT_REVIEWER_REQUIRED'
        ? 'Your account does not have payment-review access. Ask a super administrator to grant the admin or payment_reviewer role, then sign in again.'
        : error instanceof Error && error.message === 'PAYMENT_QUEUE_RPC_MISSING'
          ? 'The payment queue database function is missing. Apply the latest Supabase payment migration.'
          : 'Payment review data could not be loaded. Check your connection and refresh.')
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => { void loadItems() }, [loadItems])

  const pendingCount = useMemo(() => items.filter((item) => item.status === 'pending').length, [items])
  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const searchable = [item.competition_name, item.game_name, item.competition_type, item.participant_name,
        item.participant_email, item.sender_number, item.txid].join(' ').toLowerCase()
      return matchesStatus && (!normalizedSearch || searchable.includes(normalizedSearch))
    })
  }, [items, search, statusFilter])

  async function updatePayment(paymentId: string, decision: 'approved' | 'rejected') {
    if (!client) return
    const reason = decision === 'rejected' ? window.prompt('Enter rejection reason:') ?? '' : ''
    if (decision === 'rejected' && !reason.trim()) {
      setIsError(true)
      setMessage('A rejection reason is required.')
      return
    }
    setWorkingPaymentId(paymentId)
    setIsError(false)
    setMessage('')
    try {
      const { error } = await client.rpc('review_bkash_payment', {
        p_payment_id: paymentId,
        p_decision: decision,
        p_reason: decision === 'rejected' ? reason.trim() : null,
      })
      if (error) {
        setIsError(true)
        setMessage(error.message === 'PAYMENT_NOT_PENDING'
          ? 'This payment is no longer pending review. Refresh the queue to see its current status.'
          : error.message === 'PAYMENT_REVIEWER_REQUIRED' || error.code === '42501'
            ? 'Your account does not have permission to review payments. Ask a super administrator to grant payment-review access.'
            : 'The payment state could not be updated. Refresh and try again.')
      } else {
        setIsError(false)
        setMessage(decision === 'approved' ? 'Payment approved.' : 'Payment rejected.')
        await loadItems()
      }
    } catch {
      setIsError(true)
      setMessage('Payment review failed.')
    } finally {
      setWorkingPaymentId('')
    }
  }

  return (
    <section className="admin-tournament-list">
      <div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / PAYMENT REVIEW</p><h1>Manual bKash review.</h1><p>Verify the sender, TXID, and amount before deciding each payment.</p></div><button className="admin-refresh-button" type="button" onClick={() => void loadItems()} disabled={isLoading}><RotateCw size={14} className={isLoading ? 'is-spinning' : undefined} /> {isLoading ? 'Refreshing...' : 'Refresh queue'}</button></div>
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="admin-payment-toolbar">
        <div className="admin-payment-count"><b>{pendingCount}</b><span>pending</span><i /><b>{items.length}</b><span>total</span></div>
        <label className="admin-payment-search"><Search size={15} /><span className="visually-hidden">Search payments</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search competition, player, sender, TXID" /></label>
        <label className="visually-hidden" htmlFor="admin-payment-status">Payment status</label>
        <select id="admin-payment-status" className="admin-payment-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="pending">Pending</option><option value="all">All statuses</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
      </div>
      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
        : visibleItems.length === 0 ? <div className="arena-state"><ShieldAlert size={24} /><h3>{items.length === 0 ? 'No payment submissions yet.' : 'No matching payments.'}</h3><p>{items.length === 0 ? 'Submitted payments will appear here. Refresh to check for new submissions.' : 'Try another status or search term.'}</p></div>
          : <div className="admin-tournament-list__items">{visibleItems.map((item) => (
            <article className="admin-tournament-row" key={item.payment_id}>
              <div className="admin-tournament-row__main">
                <div className="admin-tournament-row__title"><h2>{item.competition_name}</h2><span className={`registration-status registration-status--${item.status}`}>{item.status}</span></div>
                <p>{item.team_name ? `${item.team_name} · ` : ''}{item.game_name} / {item.competition_type} · {item.participant_name}</p>
                <small>{formatTournamentDate(item.submitted_at, 'Asia/Dhaka', true)} · {formatTournamentMoney(item.amount, 'paid', item.currency)} · Sender {item.sender_number}</small>
                <small>TXID: {item.txid} · Email: {item.participant_email}</small>
                {item.rejection_reason && <small>Reason: {item.rejection_reason}</small>}
              </div>
              <div className="admin-tournament-row__actions">
                {item.status === 'pending' ? <>
                  <button type="button" disabled={Boolean(workingPaymentId)} onClick={() => void updatePayment(item.payment_id, 'approved')}><CheckCircle2 size={15} /> {workingPaymentId === item.payment_id ? 'Saving...' : 'Approve'}</button>
                  <button type="button" className="is-danger" disabled={Boolean(workingPaymentId)} onClick={() => void updatePayment(item.payment_id, 'rejected')}><XCircle size={15} /> Reject</button>
                </> : <span className="admin-payment-reviewed">Reviewed</span>}
              </div>
            </article>
          ))}</div>}
    </section>
  )
}

export default AdminPaymentsPage
