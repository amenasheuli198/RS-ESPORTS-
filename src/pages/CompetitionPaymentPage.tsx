import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, Clipboard, Copy, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import { formatTournamentMoney } from '../tournaments/format'

interface PaymentContext {
  entry_id: string
  competition_id: string
  competition_title: string
  competition_type: 'tournament' | 'quick_match'
  game_name: string
  format_name: string
  entry_type: 'free' | 'paid'
  entry_fee: number
  currency: string
  entry_status: string
  payment_id: string | null
  payment_status: string | null
  player_name: string | null
  phone: string | null
}

const bkashNumber = '01845278579'
const successMessage = 'Your payment has been submitted successfully. Our admin team will verify your transaction. You will receive an email notification once your payment is approved or rejected.'

function CompetitionPaymentPage() {
  const { entryId } = useParams<{ entryId: string }>()
  const { client } = useAuth()
  const [context, setContext] = useState<PaymentContext | null>(null)
  const [senderNumber, setSenderNumber] = useState('')
  const [txid, setTxid] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isError, setIsError] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const loadContext = useCallback(async () => {
    if (!client || !entryId) {
      setIsLoading(false)
      setIsError(true)
      setMessage('Payment information is unavailable. Sign in and open your registration again.')
      return
    }
    setIsLoading(true)
    try {
      const { data, error } = await client.rpc('get_my_competition_payment_context', { p_entry_id: entryId }).maybeSingle()
      if (error || !data) throw error ?? new Error('PAYMENT_CONTEXT_NOT_FOUND')
      setContext(data as PaymentContext)
      setMessage('')
      setIsError(false)
    } catch {
      setContext(null)
      setIsError(true)
      setMessage('This payment request could not be loaded. It may not belong to your account.')
    } finally {
      setIsLoading(false)
    }
  }, [client, entryId])

  useEffect(() => { void loadContext() }, [loadContext])

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(bkashNumber)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setIsError(true)
      setMessage('Clipboard access was blocked. Select and copy the payment number manually.')
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !context) return
    const normalizedSender = senderNumber.trim().replace(/[\s()-]/g, '')
    const normalizedTxid = txid.trim()
    if (!/^\+?[1-9][0-9]{6,14}$/.test(normalizedSender)) {
      setIsError(true)
      setMessage('Enter a valid sender bKash number.')
      return
    }
    if (!/^[A-Za-z0-9-]{5,80}$/.test(normalizedTxid)) {
      setIsError(true)
      setMessage('Enter a valid transaction ID (TXID).')
      return
    }
    if (context.entry_type !== 'paid' || context.entry_fee <= 0) {
      setIsError(true)
      setMessage('This registration does not require payment.')
      return
    }
    setIsSubmitting(true)
    setIsError(false)
    setMessage('')
    try {
      const { error } = await client.rpc('submit_bkash_payment', {
        p_entry_id: context.entry_id,
        p_sender_number: normalizedSender,
        p_txid: normalizedTxid,
        p_amount: context.entry_fee,
      })
      if (error) {
        const errors: Record<string, string> = {
          PAYMENT_AMOUNT_MISMATCH: 'The required amount changed. Refresh this page and check the current fee.',
          PAYMENT_ALREADY_EXISTS_FOR_ENTRY: 'A payment has already been submitted for this registration.',
          TXID_ALREADY_USED: 'That TXID has already been submitted. Check the transaction ID and try again.',
          INVALID_SENDER_NUMBER: 'Enter a valid sender bKash number.',
          INVALID_TXID: 'Enter a valid transaction ID.',
          ENTRY_NOT_PAYABLE: 'This registration is no longer waiting for payment.',
          ENTRY_PAYMENT_ACCESS_DENIED: 'This registration does not belong to your account or team.',
          PLAYER_PROFILE_COMPLETION_REQUIRED: 'Complete your profile before submitting payment.',
        }
        setIsError(true)
        setMessage(errors[error.message] ?? 'Payment could not be submitted. Refresh the page and try again.')
      } else {
        setMessage(successMessage)
        setSenderNumber('')
        setTxid('')
        await loadContext()
      }
    } catch {
      setIsError(true)
      setMessage('Payment could not be submitted. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const paymentLocked = context?.payment_status === 'pending' || context?.payment_status === 'approved'

  return (
    <>
      <SiteHeader />
      <main className="competition-payment-page page-width">
        <Link className="tournament-back-link" to={context?.competition_type === 'quick_match' ? '/quick-matches' : '/tournaments'}><ArrowLeft size={15} /> Back to competitions</Link>
        <div className="competition-payment-layout">
          <section className="competition-payment-main" aria-labelledby="payment-title">
            <p className="section-heading__eyebrow">MANUAL PAYMENT / SEND MONEY</p>
            <h1 id="payment-title">Submit bKash payment.</h1>
            <p className="auth-intro">This is a manual payment process. Your entry stays pending until an authorized reviewer verifies the transaction.</p>
            {message && <p className={isError ? 'auth-error' : 'auth-success-message'} role={isError ? 'alert' : 'status'}>{message}</p>}
            {isLoading ? <p role="status">Loading payment details...</p> : context ? (
              <>
                <dl className="competition-payment-summary">
                  <div><dt>Competition</dt><dd>{context.competition_title}</dd></div>
                  <div><dt>Game / Format</dt><dd>{context.game_name} / {context.format_name}</dd></div>
                  <div><dt>Type</dt><dd>{context.competition_type === 'quick_match' ? 'Quick Match' : 'Tournament'}</dd></div>
                  <div><dt>Player</dt><dd>{context.player_name || 'Name not set'}</dd></div>
                  <div><dt>Registration phone</dt><dd>{context.phone || 'Phone not set'}</dd></div>
                  <div><dt>Entry fee</dt><dd>{formatTournamentMoney(context.entry_fee, 'paid', context.currency)}</dd></div>
                  <div><dt>Registration</dt><dd>{context.entry_status.replaceAll('_', ' ')}</dd></div>
                </dl>
                {context.payment_status === 'pending' ? <div className="competition-payment-state"><ShieldCheck size={18} /><div><b>Payment pending verification</b><p>{successMessage}</p></div></div>
                  : context.payment_status === 'approved' ? <div className="competition-payment-state"><Check size={18} /><div><b>Payment approved</b><p>Your entry is confirmed. Check your team or match dashboard for schedule information.</p></div></div>
                    : context.entry_type !== 'paid' || context.entry_fee <= 0 ? <div className="competition-payment-state"><Check size={18} /><div><b>No payment required</b><p>This is a free registration.</p></div></div>
                      : !context.player_name || !context.phone ? <div className="competition-payment-state"><div><b>Complete your profile first</b><p>Add your name and phone number in your account before paying.</p><Link to="/account">Open account</Link></div></div>
                        : paymentLocked ? <div className="competition-payment-state"><b>Payment status: {context.payment_status}</b></div>
                          : <form className="competition-payment-form" onSubmit={(formEvent) => void submitPayment(formEvent)}>
                            <label className="form-field"><span>Sender bKash number</span><input type="tel" required autoComplete="tel" maxLength={24} value={senderNumber} onChange={(change) => setSenderNumber(change.target.value)} placeholder="01XXXXXXXXX" /></label>
                            <label className="form-field"><span>Transaction ID (TXID)</span><input type="text" required autoComplete="off" maxLength={80} value={txid} onChange={(change) => setTxid(change.target.value)} placeholder="Enter the TXID from your receipt" /></label>
                            <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting for review...' : `Submit ৳${Number(context.entry_fee).toFixed(2)} payment`}</button>
                          </form>}
              </>
            ) : null}
          </section>
          <aside className="competition-payment-instructions" aria-labelledby="payment-instructions-title">
            <p className="section-heading__eyebrow">PERSONAL SEND MONEY</p>
            <h2 id="payment-instructions-title">Pay with bKash.</h2>
            <div className="competition-payment-receiver"><div><small>Receiver number</small><b>{bkashNumber}</b></div><button type="button" className="team-button team-button--secondary" onClick={() => void copyNumber()} aria-label="Copy receiver bKash number">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy number'}</button></div>
            <ol><li>Open your bKash account and choose Send Money.</li><li>Send the exact entry fee to the number above.</li><li>Complete the transaction and copy its TXID.</li><li>Enter the sender number and TXID, then submit for manual review.</li></ol>
            <p className="competition-payment-note">UNDERGRADUATE HUB E-Sports uses manual verification. This page is not an official bKash integration.</p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

export default CompetitionPaymentPage
