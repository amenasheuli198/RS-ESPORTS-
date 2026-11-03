import { MailCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

function VerificationPendingPage() {
  const { user, resendVerificationEmail } = useAuth()
  const location = useLocation()
  const submittedEmail = (location.state as { email?: string } | null)?.email ?? user?.email ?? ''

  async function handleResend() {
    if (!submittedEmail.trim()) return
    await resendVerificationEmail(submittedEmail.trim())
  }

  return (
    <section className="auth-panel auth-panel--center" aria-labelledby="verify-title">
      <span className="auth-feature-icon"><MailCheck aria-hidden="true" size={25} /></span>
      <p className="auth-eyebrow">ONE LAST CHECK / EMAIL VERIFICATION</p>
      <h1 id="verify-title">Verify your email.</h1>
      <p className="auth-intro">Your RS Esports account has been created. Please verify your email address before accessing your player dashboard.</p>
      {submittedEmail && <p className="auth-note">Verification email sent to: <strong>{submittedEmail}</strong></p>}
      <p className="auth-note">Check your inbox and spam folder. Once verified, continue to the RS Esports dashboard.</p>
      <button type="button" className="auth-submit auth-submit--link" onClick={() => void handleResend()}>Resend verification email</button>
      <Link className="auth-submit auth-submit--link" to="/login">Return to sign in</Link>
    </section>
  )
}

export default VerificationPendingPage