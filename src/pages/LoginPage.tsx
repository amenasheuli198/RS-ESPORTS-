import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSafeAuthErrorMessage } from '../auth/errorMessage'

function LoginPage() {
  const { requestEmailOtp, verifyEmailOtp, configurationError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setNotice('')
    setIsSubmitting(true)

    try {
      const trimmedEmail = email.trim().toLowerCase()
      if (!otpSent) {
        const error = await requestEmailOtp(trimmedEmail)
        if (error) setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to send a sign-in code. Please try again.'))
        else setOtpSent(true)
      } else {
        const result = await verifyEmailOtp(trimmedEmail, otp.trim())
        if (result.error) {
          setErrorMessage(getSafeAuthErrorMessage(result.error, 'That code is invalid or expired. Request a new code.'))
        } else {
          const from = (location.state as { from?: string } | null)?.from
          const destination = from?.startsWith('/') && !from.startsWith('//') ? from : '/account'
          navigate(destination, { replace: true })
        }
      }
    } catch (error) {
      setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to sign in right now. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendCode() {
    setIsSubmitting(true)
    setErrorMessage('')
    setNotice('')
    try {
      const error = await requestEmailOtp(email.trim().toLowerCase())
      if (error) setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to send a new code. Please try again.'))
      else setNotice('A new sign-in code has been sent.')
    } catch (error) {
      setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to send a new code. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <p className="auth-eyebrow">WELCOME BACK / PLAYER ACCESS</p>
      <h1 id="login-title">Back in the arena.</h1>
      <p className="auth-intro">Sign in with a one-time code sent to your email.</p>
      {configurationError && <p className="auth-notice" role="status">{configurationError}</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Email address</span>
          <input type="email" name="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} readOnly={otpSent} />
        </label>
        {otpSent && <label className="form-field">
          <span>Email code</span>
          <input type="text" name="otp" inputMode="numeric" autoComplete="one-time-code" required maxLength={8} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 8))} />
        </label>}
        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
        {notice && <p className="auth-success-message" role="status">{notice}</p>}
        <button className="auth-submit" type="submit" disabled={isSubmitting || Boolean(configurationError)}>
          {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" /> {otpSent ? 'Verifying code...' : 'Sending code...'}</> : otpSent ? 'Verify and sign in' : 'Send sign-in code'}
        </button>
        {otpSent && <button className="auth-switch" type="button" disabled={isSubmitting} onClick={() => void resendCode()}>Resend code</button>}
        {otpSent && <button className="auth-switch" type="button" onClick={() => { setOtpSent(false); setOtp(''); setErrorMessage('') }}>Use a different email</button>}
      </form>
      <p className="auth-switch">New to UNDERGRADUATE HUB E-Sports? <Link to="/register">Create an account</Link></p>
    </section>
  )
}

export default LoginPage