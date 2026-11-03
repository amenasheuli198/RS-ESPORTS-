import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { hasTournamentAdminClaim, AUTHORIZED_ADMIN_EMAIL } from '../tournaments/adminAccess'

function AdminLoginPage() {
  const { client, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  if (user && hasTournamentAdminClaim(user)) {
    return <Navigate to="/admin/dashboard" replace />
  }

  async function handleSendOtp() {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setErrorMessage('Enter the authorized admin email address.')
      return
    }

    if (trimmedEmail !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
      setErrorMessage('This email is not authorized for the RS Esports admin portal.')
      setNotice('')
      return
    }

    if (!client) {
      setErrorMessage('Authentication is currently unavailable. Please try again later.')
      return
    }

    setIsSending(true)
    setErrorMessage('')
    setNotice('')

    try {
      const { error } = await client.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: new URL('/admin/login', window.location.origin).toString(),
        },
      })

      if (error) {
        setErrorMessage('Unable to send the admin verification code. Please try again in a few moments.')
        return
      }

      setOtpSent(true)
      setCooldown(45)
      setNotice('A secure admin verification code has been sent to your email.')
    } catch {
      setErrorMessage('Unable to send the admin verification code right now.')
    } finally {
      setIsSending(false)
    }
  }

  async function handleVerifyOtp() {
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedOtp = otp.trim()

    if (!trimmedEmail || !trimmedOtp) {
      setErrorMessage('Enter both the admin email and the OTP.')
      return
    }

    if (!client) {
      setErrorMessage('Authentication is currently unavailable. Please try again later.')
      return
    }

    setIsVerifying(true)
    setErrorMessage('')
    setNotice('')

    try {
      const { data, error } = await client.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedOtp,
        type: 'email',
      })

      if (error || !data.session || !data.user) {
        setErrorMessage('The OTP is invalid or expired. Please request a new code.')
        return
      }

      if (!hasTournamentAdminClaim(data.user)) {
        await signOut()
        setErrorMessage('Access denied. This account is not authorized for the RS Esports admin portal.')
        return
      }

      navigate('/admin/dashboard', { replace: true })
    } catch {
      setErrorMessage('The OTP could not be verified. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel" aria-labelledby="admin-login-title">
        <p className="auth-eyebrow">ADMIN ACCESS / SECURE LOGIN</p>
        <h1 id="admin-login-title">RS Esports admin portal.</h1>
        <p className="auth-intro">Use the verified admin account to continue with one-time email OTP authentication.</p>

        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
        {notice && <p className="auth-success-message" role="status">{notice}</p>}

        <div className="auth-form">
          <label className="form-field">
            <span>Authorized admin email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={AUTHORIZED_ADMIN_EMAIL} autoComplete="email" />
          </label>

          {!otpSent ? (
            <button type="button" className="auth-submit" onClick={() => void handleSendOtp()} disabled={isSending}>
              {isSending ? 'Sending OTP...' : 'Send OTP'}
            </button>
          ) : (
            <>
              <label className="form-field">
                <span>One-time password</span>
                <input type="text" inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" />
              </label>

              <button type="button" className="auth-submit" onClick={() => void handleVerifyOtp()} disabled={isVerifying}>
                {isVerifying ? 'Verifying OTP...' : 'Verify OTP'}
              </button>

              <button type="button" className="auth-submit auth-submit--secondary" onClick={() => void handleSendOtp()} disabled={cooldown > 0 || isSending}>
                {cooldown > 0 ? `Resend OTP (${cooldown}s)` : 'Resend OTP'}
              </button>
            </>
          )}

          <Link className="auth-switch" to="/">Return to RS Esports</Link>
        </div>
      </section>
    </main>
  )
}

export default AdminLoginPage
