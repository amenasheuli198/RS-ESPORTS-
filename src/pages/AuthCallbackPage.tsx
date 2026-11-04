import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

function AuthCallbackPage() {
  const { client } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true

    async function handleAuthCallback() {
      const callbackParams = new URLSearchParams(location.search)
      const callbackHash = new URLSearchParams(location.hash.replace(/^#/, ''))
      const callbackError = callbackParams.get('error_code') ?? callbackHash.get('error_code')

      if (callbackError) {
        navigate('/auth/verify-email', {
          replace: true,
          state: {
            verificationError: callbackError === 'otp_expired'
              ? 'This verification link has expired. Request a new email below.'
              : 'This verification link is invalid. Request a new email below.',
          },
        })
        return
      }

      if (!client) {
        if (active) setErrorMessage('Authentication is currently unavailable.')
        return
      }

      try {
        const { data, error } = await client.auth.getSession()
        if (!active) return
        if (error) throw error

        if (data.session?.user?.email_confirmed_at) {
          navigate('/account', { replace: true })
          return
        }

        navigate('/auth/verify-email', { replace: true, state: { email: data.session?.user.email ?? '' } })
      } catch {
        if (active) setErrorMessage('We could not confirm your email verification. Please sign in again.')
      }
    }

    void handleAuthCallback()
    return () => { active = false }
  }, [client, location.hash, location.search, navigate])

  return (
    <section className="auth-panel auth-panel--center" aria-live="polite">
      <p className="auth-eyebrow">ACCOUNT / VERIFICATION</p>
      {errorMessage ? (
        <>
          <h1>Verification status unavailable.</h1>
          <p className="auth-intro">{errorMessage}</p>
          <Link className="auth-submit auth-submit--link" to="/login">Return to sign in</Link>
        </>
      ) : (
        <>
          <h1>Confirming your account…</h1>
          <p className="auth-intro">Please wait while we confirm your email verification status.</p>
        </>
      )}
    </section>
  )
}

export default AuthCallbackPage
