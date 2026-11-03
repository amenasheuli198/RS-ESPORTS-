import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSafeAuthErrorMessage } from '../auth/errorMessage'

function ForgotPasswordPage() {
  const { sendPasswordReset, configurationError } = useAuth()
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      const error = await sendPasswordReset(email.trim())
      if (error) {
        setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to request a reset email right now. Please try again later.'))
      } else {
        setSent(true)
      }
    } catch (error) {
      setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to request a reset email right now. Please try again later.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="forgot-title">
      <p className="auth-eyebrow">ACCOUNT RECOVERY</p>
      <h1 id="forgot-title">Reset your password.</h1>
      {sent ? (
        <div className="auth-success" role="status">
          <p>If an account matches that email, a password reset link is on its way. Check your inbox and spam folder.</p>
          <Link className="auth-submit auth-submit--link" to="/login">Return to sign in</Link>
        </div>
      ) : (
        <>
          <p className="auth-intro">Enter your account email and we’ll send recovery instructions.</p>
          {configurationError && <p className="auth-notice" role="status">{configurationError}</p>}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Email address</span>
              <input type="email" name="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting || Boolean(configurationError)}>
              {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" /> Sending...</> : 'Send reset link'}
            </button>
          </form>
        </>
      )}
      <p className="auth-switch"><Link to="/login">Return to sign in</Link></p>
    </section>
  )
}

export default ForgotPasswordPage