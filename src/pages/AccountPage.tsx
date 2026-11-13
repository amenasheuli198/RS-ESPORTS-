import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSafeAuthErrorMessage } from '../auth/errorMessage'
import { PlatformEmblem } from '../components/ui'

interface Profile {
  id: string
  full_name: string | null
  display_name: string | null
  username: string | null
  avatar_url: string | null
  free_fire_ign: string | null
  free_fire_uid: string | null
  phone: string | null
  profile_completed_at: string | null
  region: string | null
  bio: string | null
  profile_visibility: 'public' | 'private'
  uid_visibility: 'public' | 'private'
  match_history_visibility: 'public' | 'private'
  created_at: string
  updated_at: string
}

function AccountPage() {
  const { client, user, signOut, updateEmail } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!client || !user) {
        setIsLoading(false)
        return
      }

      try {
        const { data, error } = await client.rpc('get_my_profile').maybeSingle()

        if (!active) return
        if (error || !data) {
          setIsError(true)
          setMessage('Your profile is not available yet. Confirm the profile migration has been applied to this Supabase project.')
        } else {
          const nextProfile = data as Profile
          setProfile(nextProfile)
          setFullName(nextProfile.full_name ?? '')
          setPhone(nextProfile.phone ?? '')
        }
      } catch {
        if (!active) return
        setIsError(true)
        setMessage('Unable to load your profile. Please try again later.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadProfile()
    return () => { active = false }
  }, [client, user])

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !user) {
      setIsError(true)
      setMessage('You must be signed in to update your profile.')
      return
    }

    const normalizedName = fullName.trim()
    const normalizedPhone = phone.trim()
    if (normalizedName.length < 2 || normalizedName.length > 100) {
      setIsError(true)
      setMessage('Enter a full name between 2 and 100 characters.')
      return
    }
    if (!/^\+?[0-9][0-9\s()-]{6,19}$/.test(normalizedPhone)) {
      setIsError(true)
      setMessage('Enter a valid phone number, including country code if needed.')
      return
    }

    setIsSaving(true)
    setIsError(false)
    setMessage('')
    try {
      const { data, error } = await client.rpc('update_my_contact_profile', {
        p_full_name: normalizedName,
        p_phone: normalizedPhone,
      })
      if (error || !data) {
        const errorMapping: Record<string, string> = {
          INVALID_FULL_NAME: 'Enter a full name between 2 and 100 characters.',
          INVALID_PHONE_NUMBER: 'Enter a valid phone number.',
          EMAIL_VERIFICATION_REQUIRED: 'Verify your email address before updating your profile.',
        }
        setIsError(true)
        setMessage(errorMapping[error?.message ?? ''] ?? 'Your profile could not be updated. Please try again.')
      } else {
        const { data: refreshed, error: refreshError } = await client.rpc('get_my_profile').maybeSingle()
        if (refreshError || !refreshed) {
          setMessage('Profile saved. Refresh the page to confirm your latest values.')
        } else {
          const nextProfile = refreshed as Profile
          setProfile(nextProfile)
          setFullName(nextProfile.full_name ?? '')
          setPhone(nextProfile.phone ?? '')
          setMessage('Profile updated.')
        }
      }
    } catch {
      setIsError(true)
      setMessage('Your profile could not be updated. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedEmail = newEmail.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      setIsError(true)
      setMessage('Enter a valid email address.')
      return
    }
    if (normalizedEmail === user?.email?.toLowerCase()) {
      setIsError(true)
      setMessage('Enter a different email address.')
      return
    }

    setIsSaving(true)
    setIsError(false)
    setMessage('')
    try {
      const error = await updateEmail(normalizedEmail)
      if (error) {
        setIsError(true)
        setMessage(getSafeAuthErrorMessage(error, 'Unable to start the email change. Please try again.'))
      } else {
        setMessage('Check the verification message sent by Supabase. Your account email changes only after confirmation.')
        setNewEmail('')
      }
    } catch (error) {
      setIsError(true)
      setMessage(getSafeAuthErrorMessage(error, 'Unable to start the email change. Please try again.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSignOut() {
    try {
      const error = await signOut()
      if (error) throw error
      navigate('/', { replace: true })
    } catch {
      setIsError(true)
      setMessage('Unable to sign out right now. Please try again.')
    }
  }

  return (
    <main className="account-page">
      <header className="account-header page-width">
        <a className="brand-lockup" href="/" aria-label="Undergraduate E-Sports home">
          <span className="brand-lockup__mark"><PlatformEmblem /></span><span className="brand-lockup__name">UNDERGRADUATE <b>E-SPORTS</b></span>
        </a>
        <button className="account-signout" type="button" onClick={handleSignOut}>Sign out</button>
      </header>
      <div className="account-content page-width">
        <p className="auth-eyebrow">PLAYER PROFILE / ACCOUNT</p>
        <h1>Your player profile.</h1>
        <p className="auth-intro">Your profile details are private to your account.</p>
        <Link className="team-account-link" to="/teams">Manage your team</Link>
        {message && <p className={isError ? 'auth-error' : 'auth-success-message'} role="status">{message}</p>}
        <section className="profile-panel" aria-label="Profile information">
          {isLoading ? <p role="status">Loading profile...</p> : (
            <>
              <div className="profile-avatar" aria-hidden="true">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile?.full_name?.slice(0, 1).toUpperCase() || 'P')}
              </div>
              <dl className="profile-meta">
                <div><dt>User ID</dt><dd>{user?.id}</dd></div>
                <div><dt>Email</dt><dd>{user?.email}</dd></div>
                <div><dt>Phone</dt><dd>{profile?.phone || 'Not set'}</dd></div>
                <div><dt>Created</dt><dd>{profile ? new Date(profile.created_at).toLocaleDateString() : 'Not available'}</dd></div>
                <div><dt>Last updated</dt><dd>{profile ? new Date(profile.updated_at).toLocaleDateString() : 'Not available'}</dd></div>
              </dl>
              {profile && (
                <form className="profile-form" onSubmit={handleProfileSave}>
                  <label className="form-field">
                    <span>Full name</span>
                    <input type="text" required minLength={2} maxLength={100} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </label>
                  <label className="form-field">
                    <span>Phone number</span>
                    <input type="tel" required maxLength={24} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </label>
                  <button className="auth-submit" type="submit" disabled={isSaving}>
                    {isSaving ? <><span className="auth-spinner" aria-hidden="true" /> Saving...</> : 'Save profile'}
                  </button>
                </form>
              )}
              <form className="profile-form" onSubmit={handleEmailChange}>
                <p className="auth-eyebrow">EMAIL ADDRESS</p>
                <p className="auth-intro">A change takes effect only after Supabase verifies it.</p>
                <label className="form-field">
                  <span>New email address</span>
                  <input type="email" required maxLength={254} autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                </label>
                <button className="auth-submit" type="submit" disabled={isSaving}>Send verification</button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default AccountPage