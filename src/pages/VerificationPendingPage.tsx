import { MailCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

function VerificationPendingPage() {
  return (
    <section className="auth-panel auth-panel--center" aria-labelledby="verify-title">
      <span className="auth-feature-icon"><MailCheck aria-hidden="true" size={25} /></span>
      <p className="auth-eyebrow">ONE LAST CHECK / EMAIL VERIFICATION</p>
      <h1 id="verify-title">Check your inbox.</h1>
      <p className="auth-intro">If your registration was accepted, we sent a verification link to the address you provided. Open it to verify your email, then sign in to continue.</p>
      <p className="auth-note">Can’t find it? Check your spam folder or try registering again after a few minutes.</p>
      <Link className="auth-submit auth-submit--link" to="/login">Return to sign in</Link>
    </section>
  )
}

export default VerificationPendingPage