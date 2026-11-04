import { MailCheck } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

function VerificationPendingPage() {
  const { user, resendVerificationEmail, configurationError } = useAuth()
  const location = useLocation()
  const routeState = location.state as { email?: string; verificationError?: string } | null
  const [email, setEmail] = useState(routeState?.email ?? user?.email ?? '')
  const [isResending, setIsResending] = useState(false)
  const [message, setMessage] = useState(routeState?.verificationError ?? '')
  const [isError, setIsError] = useState(Boolean(routeState?.verificationError))

  if (user?.email_confirmed_at) return <Navigate to="/account" replace />

  async function handleResend() {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setIsError(true)
      setMessage('Enter the email address used to create your account.')
      return
    }

    setIsResending(true)
    setMessage('')
    try {
      const error = await resendVerificationEmail(trimmedEmail)
      if (error) {
        setIsError(true)
        setMessage(error.code === 'over_email_send_rate_limit'
          ? 'A verification email was sent recently. Wait a few minutes before requesting another.'
          : 'We could not resend the verification email. Check the address and try again.')
      } else {
        setIsError(false)
        setMessage('A new verification email has been sent. Check your inbox and spam folder.')
      }
    } catch {
      setIsError(true)
      setMessage(configurationError ?? 'We could not resend the verification email. Please try again later.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <section className="auth-panel auth-panel--center" aria-labelledby="verify-title">
      <span className="auth-feature-icon"><MailCheck aria-hidden="true" size={25} /></span>
      <p className="auth-eyebrow">ONE LAST CHECK / EMAIL VERIFICATION</p>
      <h1 id="verify-title">Verify your email.</h1>
      <p className="auth-intro">Your RS Esports account has been created. Please verify your email address before accessing your player dashboard.</p>
      <label className="form-field">
        <span>Email address</span>
        <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <p className="auth-note">Check your inbox and spam folder. Once verified, continue to the RS Esports dashboard.</p>
      {message && <p className={isError ? 'auth-error' : 'auth-success-message'} role={isError ? 'alert' : 'status'}>{message}</p>}
      {configurationError && <p className="auth-notice" role="status">{configurationError}</p>}
      <button type="button" className="auth-submit auth-submit--link" onClick={() => void handleResend()} disabled={isResending || Boolean(configurationError)}>
        {isResending ? 'Sending...' : 'Resend verification email'}
      </button>
      <Link className="auth-submit auth-submit--link" to="/login">Return to sign in</Link>
    </section>
  )
}

export default VerificationPendingPage