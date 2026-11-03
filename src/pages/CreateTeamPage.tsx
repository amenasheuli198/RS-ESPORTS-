import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import TeamPageHeader from '../components/team/TeamPageHeader'
import { useTeam } from '../teams/TeamContext'
import { getTeamLogoExtension, validateTeamFields, validateTeamLogo, type TeamLogoMimeType } from '../teams/teamValidation'

function getCreateError(error: { message?: string; code?: string }) {
  switch (error.message) {
    case 'ACTIVE_TEAM_EXISTS': return 'You are already active on a team roster.'
    case 'PROFILE_NAME_REQUIRED': return 'Add your full name to your player profile before creating a team.'
    case 'INVALID_TEAM_NAME': return 'Team name must be 3-40 characters.'
    case 'INVALID_PLAYER_IGN': return 'IGN must be 2-32 characters.'
    case 'INVALID_FREE_FIRE_UID': return 'Free Fire UID must contain 5-20 digits.'
    default:
      if (error.code === '23505') return 'That team name is already in use. Choose another name.'
      return 'Team creation failed. Check your details and try again.'
  }
}

function CreateTeamPage() {
  const { client, user } = useAuth()
  const { team, isLoading: isTeamLoading, error: teamError, refreshTeam } = useTeam()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [ign, setIgn] = useState('')
  const [freeFireUid, setFreeFireUid] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoMimeType, setLogoMimeType] = useState<TeamLogoMimeType | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!logo) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(logo)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logo])

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setLogo(null)
    setLogoMimeType(null)
    setErrorMessage('')
    if (!file) return

    try {
      const mimeType = await validateTeamLogo(file)
      setLogo(file)
      setLogoMimeType(mimeType)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Choose a valid logo image.')
      event.target.value = ''
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    const fieldError = validateTeamFields(name, ign, freeFireUid)
    if (fieldError) {
      setErrorMessage(fieldError)
      return
    }
    if (!client || !user) {
      setErrorMessage('Team creation is unavailable. Sign in again and retry.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data: teamId, error } = await client.rpc('create_team', {
        p_name: name.trim(),
        p_ign: ign.trim(),
        p_free_fire_uid: freeFireUid.trim(),
        p_description: description.trim() || null,
        p_region: region.trim() || null,
      })
      if (error || !teamId) {
        setErrorMessage(getCreateError(error ?? {}))
        return
      }

      let logoNotice = ''
      if (logo && logoMimeType) {
        const path = `${teamId}/${user.id}/${crypto.randomUUID()}.${getTeamLogoExtension(logoMimeType)}`
        try {
          const { error: uploadError } = await client.storage.from('team-logos').upload(path, logo, {
            contentType: logoMimeType,
            cacheControl: '3600',
            upsert: false,
          })
          if (uploadError) {
            logoNotice = 'Team created, but the logo could not be uploaded. You can try again in team settings.'
          } else {
            const { error: updateError } = await client.rpc('update_team', {
              p_team_id: teamId,
              p_name: name.trim(),
              p_description: description.trim() || null,
              p_region: region.trim() || null,
              p_logo_path: path,
            })
            if (updateError) {
              await client.storage.from('team-logos').remove([path]).catch(() => null)
              logoNotice = 'Team created, but its logo could not be attached. You can try again in team settings.'
            }
          }
        } catch {
          logoNotice = 'Team created, but the logo could not be uploaded. You can try again in team settings.'
        }
      }

      await refreshTeam()
      navigate('/dashboard/team', { replace: true, state: logoNotice ? { notice: logoNotice } : undefined })
    } catch {
      setErrorMessage('Team creation could not be completed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isTeamLoading) return <main className="team-loading" role="status"><span className="auth-spinner" aria-hidden="true" /> Checking your roster...</main>
  if (team) return <Navigate to="/dashboard/team" replace />

  return (
    <main className="team-app team-create-page">
      <TeamPageHeader />
      <div className="team-create-content page-width">
        <Link className="team-back-link" to="/teams"><ArrowLeft size={15} /> Teams</Link>
        <div className="team-form-layout">
          <div className="team-form-intro">
            <p className="auth-eyebrow">FIRST MOVE / CREATE YOUR SQUAD</p>
            <h1>Build your roster.</h1>
            <p>You’ll be added as captain and starting player. Invite teammates after your team is created.</p>
            <div className="team-roster-rule"><span>01</span><div><b>Starting lineup</b><small>Captain + 3 starting players</small></div></div>
            <div className="team-roster-rule"><span>02</span><div><b>Optional substitute</b><small>One reserve player</small></div></div>
          </div>
          <form className="team-form-panel" onSubmit={handleSubmit}>
            {teamError && <p className="team-alert" role="alert">{teamError}</p>}
            <label className="team-logo-picker">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleLogoChange(event)} />
              {previewUrl ? <img src={previewUrl} alt="Preview of selected team logo" /> : <span className="team-logo-picker__placeholder"><ImagePlus size={22} /><b>Upload team logo</b><small>PNG, JPG or WEBP / max 2 MB</small></span>}
              {previewUrl && <span className="team-logo-picker__edit">Change logo</span>}
            </label>
            <label className="form-field"><span>Team name</span><input type="text" required minLength={3} maxLength={40} autoComplete="organization" value={name} onChange={(event) => setName(event.target.value)} placeholder="Choose a team name" /></label>
            <label className="form-field"><span>Your Free Fire IGN</span><input type="text" required minLength={2} maxLength={32} value={ign} onChange={(event) => setIgn(event.target.value)} placeholder="Your in-game nickname" /></label>
            <label className="form-field"><span>Your Free Fire UID</span><input type="text" required inputMode="numeric" pattern="[0-9]{5,20}" maxLength={20} value={freeFireUid} onChange={(event) => setFreeFireUid(event.target.value)} placeholder="5-20 digit UID" /></label>
            <label className="form-field"><span>Description <small>Optional</small></span><textarea rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell players what your squad is about" /></label>
            <label className="form-field"><span>Region <small>Optional</small></span><input type="text" maxLength={100} value={region} onChange={(event) => setRegion(event.target.value)} placeholder="For example, Southeast Asia" /></label>
            {errorMessage && <p className="team-form-error" role="alert">{errorMessage}</p>}
            <button className="team-button team-button--full" type="submit" disabled={isSubmitting || !client}>
              {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" /> Creating team...</> : 'Create team'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

export default CreateTeamPage