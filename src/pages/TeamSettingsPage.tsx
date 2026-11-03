import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { ImagePlus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useTeam } from '../teams/TeamContext'
import { getTeamLogoExtension, validateTeamLogo, type TeamLogoMimeType } from '../teams/teamValidation'
import { SectionHeading } from '../components/ui'
import TeamLogo from '../components/team/TeamLogo'

function TeamSettingsPage() {
  const { client, user } = useAuth()
  const { team, membership, refreshTeam } = useTeam()
  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [region, setRegion] = useState(team?.region ?? '')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoType, setLogoType] = useState<TeamLogoMimeType | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const canEdit = membership?.role === 'captain'

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
    setLogoType(null)
    setMessage('')
    if (!file) return
    try {
      const type = await validateTeamLogo(file)
      setLogo(file)
      setLogoType(type)
    } catch (error) {
      setIsError(true)
      setMessage(error instanceof Error ? error.message : 'Choose a valid logo image.')
      event.target.value = ''
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!team || !client || !user || !canEdit) return
    if (name.trim().length < 3 || name.trim().length > 40) {
      setIsError(true)
      setMessage('Team name must be 3-40 characters.')
      return
    }

    setIsSaving(true)
    setMessage('')
    setIsError(false)
    let uploadedPath: string | null = null
    try {
      if (logo && logoType) {
        uploadedPath = `${team.id}/${user.id}/${crypto.randomUUID()}.${getTeamLogoExtension(logoType)}`
        const { error: uploadError } = await client.storage.from('team-logos').upload(uploadedPath, logo, {
          contentType: logoType,
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadError) throw new Error('LOGO_UPLOAD_FAILED')
      }

      const { error } = await client.rpc('update_team', {
        p_team_id: team.id,
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_region: region.trim() || null,
        p_logo_path: uploadedPath,
      })
      if (error) {
        if (uploadedPath) await client.storage.from('team-logos').remove([uploadedPath]).catch(() => null)
        setIsError(true)
        setMessage(error.code === '23505' ? 'That team name is already in use.' : 'Team settings could not be saved. Please try again.')
      } else {
        setMessage('Team settings saved.')
        setLogo(null)
        await refreshTeam()
      }
    } catch {
      if (uploadedPath) await client.storage.from('team-logos').remove([uploadedPath]).catch(() => null)
      setIsError(true)
      setMessage('Team settings could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!team || !membership) return null

  return (
    <section className="team-settings-page">
      <SectionHeading eyebrow="Team / settings" title="Team settings." description={canEdit ? 'Only the captain can change team details.' : 'Team details are read-only for squad members.'} />
      {message && <p className={isError ? 'team-form-error' : 'team-form-success'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <form className="team-settings-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="team-settings-logo">
          <span className="team-settings-logo__label">Team logo</span>
          <span className="team-settings-logo__control">
            {previewUrl ? <img src={previewUrl} alt="Preview of selected team logo" /> : <TeamLogo path={team.logo_path} teamName={team.name} />}
            {canEdit && <span className="team-settings-logo__upload"><ImagePlus size={15} /> {logo ? 'Change logo' : 'Upload logo'}</span>}
          </span>
          {canEdit && <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleLogoChange(event)} />}
          <small>PNG, JPG, or WEBP. Maximum file size 2 MB.</small>
        </label>
        <label className="form-field"><span>Team name</span><input type="text" required minLength={3} maxLength={40} disabled={!canEdit} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="form-field"><span>Description <small>Optional</small></span><textarea rows={4} maxLength={1000} disabled={!canEdit} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="form-field"><span>Region <small>Optional</small></span><input type="text" maxLength={100} disabled={!canEdit} value={region} onChange={(event) => setRegion(event.target.value)} /></label>
        {canEdit && <button className="team-button" type="submit" disabled={isSaving || !client}>{isSaving ? <><span className="auth-spinner" aria-hidden="true" /> Saving...</> : 'Save changes'}</button>}
      </form>
    </section>
  )
}

export default TeamSettingsPage