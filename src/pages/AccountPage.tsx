import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

const profileColumns = 'id, full_name, avatar_url, created_at, updated_at'

function AccountPage() {
  const { client, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
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
        const { data, error } = await client.from('profiles')
          .select(profileColumns)
          .eq('id', user.id)
          .maybeSingle()

        if (!active) return
        if (error || !data) {
          setIsError(true)
          setMessage('Your profile is not available yet. Confirm the profile migration has been applied to this Supabase project.')
        } else {
          const nextProfile = data as Profile
          setProfile(nextProfile)
          setFullName(nextProfile.full_name ?? '')
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
    const normalizedName = fullName.trim()
    if (!client || !user || normalizedName.length < 2 || normalizedName.length > 100) {
      setIsError(true)
      setMessage('Enter a name between 2 and 100 characters.')
      return
    }

    setIsSaving(true)
    setIsError(false)
    setMessage('')
    try {
      const { data, error } = await client.from('profiles')
        .update({ full_name: normalizedName })
        .eq('id', user.id)
        .select(profileColumns)
        .single()

      if (error || !data) {
        setIsError(true)
        setMessage('Your profile could not be updated. Please try again.')
      } else {
        const nextProfile = data as Profile
        setProfile(nextProfile)
        setFullName(nextProfile.full_name ?? '')
        setMessage('Profile updated.')
      }
    } catch {
      setIsError(true)
      setMessage('Your profile could not be updated. Please try again.')
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
        <a className="brand-lockup" href="/" aria-label="RS Esports home">
          <span className="brand-lockup__mark">RS</span><span className="brand-lockup__name">RS <b>ESPORTS</b></span>
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
                <div><dt>Created</dt><dd>{profile ? new Date(profile.created_at).toLocaleDateString() : 'Not available'}</dd></div>
                <div><dt>Last updated</dt><dd>{profile ? new Date(profile.updated_at).toLocaleDateString() : 'Not available'}</dd></div>
              </dl>
              {profile && (
                <form className="profile-form" onSubmit={handleProfileSave}>
                  <label className="form-field">
                    <span>Full name</span>
                    <input type="text" required minLength={2} maxLength={100} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                  </label>
                  <button className="auth-submit" type="submit" disabled={isSaving}>
                    {isSaving ? <><span className="auth-spinner" aria-hidden="true" /> Saving...</> : 'Save profile'}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default AccountPage