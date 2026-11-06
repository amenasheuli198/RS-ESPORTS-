import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

function ProfileCompletionPage() {
  const { client, user } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = fullName.trim()
    const normalizedPhone = phone.trim()

    if (normalizedName.length < 2 || normalizedName.length > 100) {
      setErrorMessage('Enter a name between 2 and 100 characters.')
      return
    }
    if (!/^\+?[0-9][0-9\s()-]{6,19}$/.test(normalizedPhone)) {
      setErrorMessage('Enter a valid phone number, including country code if needed.')
      return
    }
    if (!client || !user) {
      setErrorMessage('Your verified account is unavailable. Sign in again to continue.')
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    try {
      const { error } = await client.rpc('complete_my_profile', {
        p_full_name: normalizedName,
        p_phone: normalizedPhone,
      })
      if (error) {
        setErrorMessage(error.code === 'PGRST202'
          ? 'Profile setup is not connected yet. The profile backend update is required before you can continue.'
          : 'Your profile could not be saved. Check the details and try again.')
      } else {
        navigate('/account', { replace: true })
      }
    } catch {
      setErrorMessage('Your profile could not be saved. Please try again later.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="profile-completion-title">
      <p className="auth-eyebrow">PLAYER PROFILE / REQUIRED DETAILS</p>
      <h1 id="profile-completion-title">Complete your profile.</h1>
      <p className="auth-intro">Add your name and phone number before setting up your team or entering a competition.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Full name</span>
          <input type="text" name="name" autoComplete="name" required minLength={2} maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Phone number</span>
          <input type="tel" name="tel" autoComplete="tel" required maxLength={24} value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
        <button className="auth-submit" type="submit" disabled={isSaving}>
          {isSaving ? <><span className="auth-spinner" aria-hidden="true" /> Saving profile...</> : 'Save and continue'}
        </button>
      </form>
    </section>
  )
}

export default ProfileCompletionPage
