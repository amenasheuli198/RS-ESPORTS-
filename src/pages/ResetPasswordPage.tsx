import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSafeAuthErrorMessage } from '../auth/errorMessage'

function ResetPasswordPage() {
  const { user, isLoading, updatePassword, configurationError } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updated, setUpdated] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    if (password.length < 12) {
      setErrorMessage('Your password must be at least 12 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const error = await updatePassword(password)
      if (error) setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to update your password. Request a new reset link and try again.'))
      else setUpdated(true)
    } catch (error) {
      setErrorMessage(getSafeAuthErrorMessage(error, 'Unable to update your password. Request a new reset link and try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <section className="auth-panel" role="status">Restoring your session...</section>

  return (
    <section className="auth-panel" aria-labelledby="reset-title">
      <p className="auth-eyebrow">ACCOUNT RECOVERY</p>
      <h1 id="reset-title">Choose a new password.</h1>
      {updated ? (
        <div className="auth-success" role="status">
          <p>Your password has been updated.</p>
          <button className="auth-submit" type="button" onClick={() => navigate(user ? '/account' : '/login', { replace: true })}>Continue</button>
        </div>
      ) : !user ? (
        <div className="auth-success" role="status">
          <p>This reset link is missing or has expired. Request a new one to continue.</p>
          <Link className="auth-submit auth-submit--link" to="/forgot-password">Request a new link</Link>
        </div>
      ) : (
        <>
          <p className="auth-intro">Use at least 12 characters for your new password.</p>
          {configurationError && <p className="auth-notice" role="status">{configurationError}</p>}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>New password</span>
              <input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Confirm new password</span>
              <input type="password" name="confirm-password" autoComplete="new-password" required maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
            {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting || Boolean(configurationError)}>
              {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" /> Updating...</> : 'Update password'}
            </button>
          </form>
        </>
      )}
    </section>
  )
}

export default ResetPasswordPage