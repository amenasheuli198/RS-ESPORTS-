import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSafeAuthErrorMessage } from '../auth/errorMessage'

function LoginPage() {
  const { signIn, configurationError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const result = await signIn(email.trim(), password)
      if (result.error) {
        if (result.error.code === 'email_not_confirmed') {
          setErrorMessage('Your email address must be verified before you can access your RS Esports account.')
          navigate('/auth/verify-email', { replace: true, state: { email: email.trim() } })
          return
        }
        setErrorMessage(getSafeAuthErrorMessage(result.error, 'Unable to sign in right now. Please try again.'))
      } else {
        const from = (location.state as { from?: string } | null)?.from
        const destination = from?.startsWith('/') && !from.startsWith('//') ? from : '/account'
        navigate(destination, { replace: true })
      }
    } catch (error) {
      setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to sign in right now. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <p className="auth-eyebrow">WELCOME BACK / PLAYER ACCESS</p>
      <h1 id="login-title">Back in the arena.</h1>
      <p className="auth-intro">Sign in to pick up where your squad left off.</p>
      {configurationError && <p className="auth-notice" role="status">{configurationError}</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Email address</span>
          <input type="email" name="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <div className="auth-form__forgot"><Link to="/forgot-password">Forgot password?</Link></div>
        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
        <button className="auth-submit" type="submit" disabled={isSubmitting || Boolean(configurationError)}>
          {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" /> Signing in...</> : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">New to RS Esports? <Link to="/register">Create an account</Link></p>
    </section>
  )
}

export default LoginPage