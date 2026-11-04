import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSafeAuthErrorMessage } from '../auth/errorMessage'

function RegistrationPage() {
  const { signUp, configurationError } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    const trimmedName = fullName.trim()

    const trimmedEmail = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setErrorMessage('Use a valid email address to create your RS Esports account.')
      return
    }
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      setErrorMessage('Enter a name between 2 and 100 characters.')
      return
    }
    if (password.length < 12) {
      setErrorMessage('Your password must be at least 12 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }
    if (!termsAccepted) {
      setErrorMessage('Accept the terms to create an account.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await signUp(trimmedName, trimmedEmail, password)
      if (result.error) {
        setErrorMessage(getSafeAuthErrorMessage(result.error, 'Unable to create an account with those details. Please try signing in or resetting your password.'))
      } else if (result.user?.email_confirmed_at) {
        navigate('/account', { replace: true })
      } else {
        navigate('/auth/verify-email', { replace: true, state: { email: trimmedEmail } })
      }
    } catch (error) {
      setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to create an account right now. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="register-title">
      <p className="auth-eyebrow">NEW PLAYER / CREATE ACCOUNT</p>
      <h1 id="register-title">Claim your place.</h1>
      <p className="auth-intro">Create your player account. You can build your squad next.</p>
      {configurationError && <p className="auth-notice" role="status">{configurationError}</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Full name</span>
          <input type="text" name="name" autoComplete="name" required minLength={2} maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Email address</span>
          <input type="email" name="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Password <small>At least 12 characters</small></span>
          <input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Confirm password</span>
          <input type="password" name="confirm-password" autoComplete="new-password" required maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        <label className="terms-check">
          <input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
          <span>I agree to the <Link to="/terms">Terms and Conditions</Link> and <Link to="/privacy">Privacy Policy</Link>.</span>
        </label>
        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
        <button className="auth-submit" type="submit" disabled={isSubmitting || Boolean(configurationError)}>
          {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" /> Creating account...</> : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
    </section>
  )
}

export default RegistrationPage