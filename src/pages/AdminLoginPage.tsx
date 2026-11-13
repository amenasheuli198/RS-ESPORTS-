import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { PlatformEmblem } from '../components/ui'
import { hasTournamentAdminClaim } from '../tournaments/adminAccess'

function AdminLoginPage() {
  const { client, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [accessKey, setAccessKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (user && hasTournamentAdminClaim(user)) {
    return <Navigate to="/admin/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessKey) {
      setErrorMessage('Enter the admin access key.')
      return
    }

    if (!client) {
      setErrorMessage('Authentication is temporarily unavailable. Please try again later.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key: accessKey }),
      })
      const result = await response.json().catch(() => null) as {
        access_token?: string
        refresh_token?: string
      } | null

      if (!response.ok || !result?.access_token || !result.refresh_token) {
        setErrorMessage('Unable to sign in. Check your credentials and try again.')
        return
      }

      const { data, error } = await client.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      })

      if (error || !data.user) {
        setErrorMessage('Unable to sign in. Check your credentials and try again.')
        return
      }

      if (!hasTournamentAdminClaim(data.user)) {
        await signOut()
        setErrorMessage('Access denied. This account is not authorized for the UNDERGRADUATE E-SPORTS admin portal.')
        return
      }

      navigate('/admin/dashboard', { replace: true })
    } catch {
      setErrorMessage('Unable to sign in. Check your credentials and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel" aria-labelledby="admin-login-title">
        <Link className="brand-lockup admin-login-brand" to="/" aria-label="Undergraduate E-Sports home">
          <span className="brand-lockup__mark"><PlatformEmblem /></span>
          <span className="brand-lockup__name">UNDERGRADUATE <b>E-SPORTS</b></span>
        </Link>
        <p className="auth-eyebrow">ADMIN ACCESS / SECURE LOGIN</p>
        <h1 id="admin-login-title">UNDERGRADUATE E-SPORTS admin portal.</h1>
        <p className="auth-intro">Enter the administrator access key to continue.</p>

        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Admin access key</span>
            <input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} autoComplete="off" required />
          </label>
          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>

          <Link className="auth-switch" to="/">Return to UNDERGRADUATE E-SPORTS</Link>
        </form>
      </section>
    </main>
  )
}

export default AdminLoginPage
