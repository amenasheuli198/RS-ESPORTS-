import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'

interface PaymentQueueItem {
  payment_id: string
  entry_id: string
  competition_id: string
  competition_name: string
  competition_type: string
  game_name: string
  participant_name: string
  participant_email: string
  participant_phone: string
  sender_number: string
  txid: string
  amount: number
  currency: string
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  rejection_reason: string | null
}

function AdminPaymentsPage() {
  const { client } = useAuth()
  const [items, setItems] = useState<PaymentQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  const loadItems = useCallback(async () => {
    if (!client) return
    setIsLoading(true)
    try {
      const { data, error } = await client.rpc('get_admin_bkash_payment_queue')
      if (error) throw error
      setItems((data ?? []) as PaymentQueueItem[])
    } catch {
      setIsError(true)
      setMessage('Payment review data could not be loaded.')
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => { void loadItems() }, [loadItems])

  async function updatePayment(paymentId: string, decision: 'approved' | 'rejected') {
    if (!client) return
    const reason = decision === 'rejected' ? window.prompt('Enter rejection reason:') ?? '' : ''
    if (decision === 'rejected' && !reason.trim()) {
      setIsError(true)
      setMessage('A rejection reason is required.')
      return
    }
    try {
      const { error } = await client.rpc('review_bkash_payment', {
        p_payment_id: paymentId,
        p_decision: decision,
        p_reason: decision === 'rejected' ? reason.trim() : null,
      })
      if (error) {
        setIsError(true)
        setMessage(error.message === 'PAYMENT_NOT_PENDING' ? 'This payment is no longer pending review.' : 'The payment state could not be updated.')
      } else {
        setIsError(false)
        setMessage(decision === 'approved' ? 'Payment approved.' : 'Payment rejected.')
        await loadItems()
      }
    } catch {
      setIsError(true)
      setMessage('Payment review failed.')
    }
  }

  return (
    <section className="admin-tournament-list">
      <div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / PAYMENT REVIEW</p><h1>Manual bKash review.</h1><p>Approve or reject member payment submissions after checking the TXID and amount.</p></div></div>
      {message && <p className={isError ? 'admin-form-error' : 'admin-notice'} role={isError ? 'alert' : 'status'}>{message}</p>}
      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
        : items.length === 0 ? <div className="arena-state"><ShieldAlert size={24} /><h3>No payment submissions yet.</h3><p>Incoming member payments will appear here.</p></div>
          : <div className="admin-tournament-list__items">{items.map((item) => (
            <article className="admin-tournament-row" key={item.payment_id}>
              <div className="admin-tournament-row__main">
                <div className="admin-tournament-row__title"><h2>{item.competition_name}</h2><span className={`registration-status registration-status--${item.status}`}>{item.status}</span></div>
                <p>{item.game_name} / {item.competition_type} · {item.participant_name}</p>
                <small>{formatTournamentDate(item.submitted_at, 'Asia/Dhaka', true)} · {formatTournamentMoney(item.amount, 'paid', item.currency)} · Sender {item.sender_number}</small>
                <small>TXID: {item.txid} · Email: {item.participant_email}</small>
                {item.rejection_reason && <small>Reason: {item.rejection_reason}</small>}
              </div>
              <div className="admin-tournament-row__actions">
                <button type="button" onClick={() => void updatePayment(item.payment_id, 'approved')}><CheckCircle2 size={15} /> Approve</button>
                <button type="button" className="is-danger" onClick={() => void updatePayment(item.payment_id, 'rejected')}><XCircle size={15} /> Reject</button>
              </div>
            </article>
          ))}</div>}
    </section>
  )
}

export default AdminPaymentsPage
