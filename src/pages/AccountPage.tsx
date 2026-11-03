import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

interface Profile {
  id: string
  full_name: string | null
  display_name: string | null
  username: string | null
  avatar_url: string | null
  free_fire_ign: string | null
  free_fire_uid: string | null
  region: string | null
  bio: string | null
  profile_visibility: 'public' | 'private'
  uid_visibility: 'public' | 'private'
  match_history_visibility: 'public' | 'private'
  created_at: string
  updated_at: string
}

const profileColumns = 'id, full_name, display_name, username, avatar_url, free_fire_ign, free_fire_uid, region, bio, profile_visibility, uid_visibility, match_history_visibility, created_at, updated_at'

function AccountPage() {
  const { client, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [freeFireIgn, setFreeFireIgn] = useState('')
  const [freeFireUid, setFreeFireUid] = useState('')
  const [region, setRegion] = useState('')
  const [bio, setBio] = useState('')
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'private'>('public')
  const [uidVisibility, setUidVisibility] = useState<'public' | 'private'>('private')
  const [matchHistoryVisibility, setMatchHistoryVisibility] = useState<'public' | 'private'>('public')
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
          setDisplayName(nextProfile.display_name ?? nextProfile.full_name ?? '')
          setUsername(nextProfile.username ?? '')
          setAvatarUrl(nextProfile.avatar_url ?? '')
          setFreeFireIgn(nextProfile.free_fire_ign ?? '')
          setFreeFireUid(nextProfile.free_fire_uid ?? '')
          setRegion(nextProfile.region ?? '')
          setBio(nextProfile.bio ?? '')
          setProfileVisibility(nextProfile.profile_visibility ?? 'public')
          setUidVisibility(nextProfile.uid_visibility ?? 'private')
          setMatchHistoryVisibility(nextProfile.match_history_visibility ?? 'public')
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
    if (normalizedName.length < 2 || normalizedName.length > 100) {
      setIsError(true)
      setMessage('Enter a profile display name between 2 and 100 characters.')
      return
    }

    const profilePayload = {
      username: username.trim(),
      display_name: displayName.trim() || normalizedName,
      avatar_url: avatarUrl.trim() || null,
      free_fire_ign: freeFireIgn.trim() || null,
      free_fire_uid: freeFireUid.trim() || null,
      region: region.trim() || null,
      bio: bio.trim() || null,
      profile_visibility: profileVisibility,
      uid_visibility: uidVisibility,
      match_history_visibility: matchHistoryVisibility,
    }

    setIsSaving(true)
    setIsError(false)
    setMessage('')
    try {
      const { data, error } = await client.rpc('save_player_profile', { p_profile: profilePayload })
      if (error || !data) {
        const errorMapping: Record<string, string> = {
          INVALID_USERNAME: 'Username must be 3-30 characters and contain only letters, numbers, underscores, dots, or hyphens.',
          USERNAME_ALREADY_TAKEN: 'That username is already in use by another player.',
          INVALID_FREE_FIRE_IGN: 'Free Fire IGN must be 2-32 characters.',
          INVALID_FREE_FIRE_UID: 'Free Fire UID must be a 5-20 digit number.',
          INVALID_PROFILE_VISIBILITY: 'Select a valid profile visibility.',
        }
        setIsError(true)
        setMessage(errorMapping[error?.message ?? ''] ?? 'Your profile could not be updated. Please try again.')
      } else {
        const { data: refreshed, error: refreshError } = await client.from('profiles')
          .select(profileColumns)
          .eq('id', user.id)
          .maybeSingle()
        if (refreshError || !refreshed) {
          setMessage('Profile saved. Refresh the page to confirm your latest values.')
        } else {
          const nextProfile = refreshed as Profile
          setProfile(nextProfile)
          setFullName(nextProfile.full_name ?? '')
          setDisplayName(nextProfile.display_name ?? nextProfile.full_name ?? '')
          setUsername(nextProfile.username ?? '')
          setAvatarUrl(nextProfile.avatar_url ?? '')
          setFreeFireIgn(nextProfile.free_fire_ign ?? '')
          setFreeFireUid(nextProfile.free_fire_uid ?? '')
          setRegion(nextProfile.region ?? '')
          setBio(nextProfile.bio ?? '')
          setProfileVisibility(nextProfile.profile_visibility ?? 'public')
          setUidVisibility(nextProfile.uid_visibility ?? 'private')
          setMatchHistoryVisibility(nextProfile.match_history_visibility ?? 'public')
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