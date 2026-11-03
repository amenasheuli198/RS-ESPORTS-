import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import TournamentBanner from '../components/tournaments/TournamentBanner'
import { getScheduleLines } from '../tournaments/format'
import type { TournamentAdminRecord, TournamentScheduleItem } from '../tournaments/types'
import { getTournamentBannerExtension, slugifyTournamentName, toDateTimeLocal, toTimestamp, validateTournamentBanner, type TournamentBannerMime } from '../tournaments/bannerValidation'

interface FormState {
  name: string
  slug: string
  description: string
  game_code: string
  mode_code: string
  format_code: string
  max_teams: string
  starting_players_required: string
  substitute_allowed: boolean
  entry_type: 'free' | 'paid'
  entry_fee: string
  prize_pool: string
  prize_distribution: string
  eligibility: string
  participation_requirements: string
  match_rules: string
  scoring_system: string
  disqualification_rules: string
  general_instructions: string
  timezone: string
  registration_opens_at: string
  registration_closes_at: string
  starts_at: string
  ends_at: string
  match_schedule: TournamentScheduleItem[]
  is_featured: boolean
}

const emptyForm: FormState = {
  name: '', slug: '', description: '', game_code: 'free_fire', mode_code: 'battle_royale', format_code: 'squad',
  max_teams: '48', starting_players_required: '4', substitute_allowed: false, entry_type: 'free', entry_fee: '0', prize_pool: '0',
  prize_distribution: '', eligibility: '', participation_requirements: '', match_rules: '', scoring_system: '',
  disqualification_rules: '', general_instructions: '', timezone: 'UTC', registration_opens_at: '', registration_closes_at: '',
  starts_at: '', ends_at: '', match_schedule: [], is_featured: false,
}

function safeNumber(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function AdminTournamentFormPage() {
  const { id } = useParams<{ id: string }>()
  const { client, user } = useAuth()
  const navigate = useNavigate()
  const isEditing = Boolean(id)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerMime, setBannerMime] = useState<TournamentBannerMime | null>(null)
  const [bannerPath, setBannerPath] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(isEditing)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const timezoneOptions = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore'] }
  }, [])

  useEffect(() => {
    if (!bannerFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(bannerFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [bannerFile])

  useEffect(() => {
    let active = true
    if (!id || !client) {
      setIsLoading(false)
      return () => { active = false }
    }

    void client.from('tournaments').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (error || !data) {
        setErrorMessage('Tournament draft could not be loaded. Confirm administrator access and try again.')
        setIsLoading(false)
        return
      }

      const record = data as TournamentAdminRecord
      const schedule = getScheduleLines(record.match_schedule).map((item) => ({ ...item, starts_at: toDateTimeLocal(item.starts_at, record.timezone) }))
      setForm({
        name: record.name,
        slug: record.slug,
        description: record.description,
        game_code: record.game_code,
        mode_code: record.mode_code,
        format_code: record.format_code,
        max_teams: String(record.max_teams),
        starting_players_required: String(record.starting_players_required),
        substitute_allowed: record.substitute_allowed,
        entry_type: record.entry_type,
        entry_fee: String(record.entry_fee),
        prize_pool: String(record.prize_pool),
        prize_distribution: record.prize_distribution,
        eligibility: record.eligibility,
        participation_requirements: record.participation_requirements,
        match_rules: record.match_rules,
        scoring_system: record.scoring_system,
        disqualification_rules: record.disqualification_rules,
        general_instructions: record.general_instructions,
        timezone: record.timezone,
        registration_opens_at: toDateTimeLocal(record.registration_opens_at, record.timezone),
        registration_closes_at: toDateTimeLocal(record.registration_closes_at, record.timezone),
        starts_at: toDateTimeLocal(record.starts_at, record.timezone),
        ends_at: toDateTimeLocal(record.ends_at, record.timezone),
        match_schedule: schedule,
        is_featured: record.is_featured,
      })
      setBannerPath(record.banner_path)
      setSlugTouched(true)
      setIsLoading(false)
    }).catch(() => {
      if (!active) return
      setErrorMessage('Tournament draft could not be loaded. Please try again.')
      setIsLoading(false)
    })

    return () => { active = false }
  }, [client, id])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleBannerChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setBannerFile(null)
    setBannerMime(null)
    setErrorMessage('')
    if (!file) return
    try {
      const mime = await validateTournamentBanner(file)
      setBannerFile(file)
      setBannerMime(mime)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Choose a valid tournament banner.')
      event.target.value = ''
    }
  }

  function addScheduleItem() {
    updateField('match_schedule', [...form.match_schedule, { title: '', starts_at: '', notes: '' }])
  }

  function updateScheduleItem(index: number, key: keyof TournamentScheduleItem, value: string) {
    updateField('match_schedule', form.match_schedule.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))
  }

  function validateForm() {
    if (form.name.trim().length < 3 || form.name.trim().length > 120) return 'Tournament name must be 3-120 characters.'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) || form.slug.length > 100) return 'Use a lowercase, hyphen-separated slug.'
    if (!form.registration_opens_at || !form.registration_closes_at || !form.starts_at) return 'Set registration opening, closing, and tournament start dates.'
    const opens = new Date(form.registration_opens_at).getTime()
    const closes = new Date(form.registration_closes_at).getTime()
    const starts = new Date(form.starts_at).getTime()
    const ends = form.ends_at ? new Date(form.ends_at).getTime() : null
    if (!(opens < closes && closes < starts) || (ends !== null && !(starts < ends))) return 'Dates must follow: registration opens, registration closes, tournament starts, then optional end.'
    if (safeNumber(form.max_teams, 0) < 2 || safeNumber(form.max_teams, 0) > 256) return 'Maximum team slots must be between 2 and 256.'
    if (safeNumber(form.starting_players_required, 0) < 1 || safeNumber(form.starting_players_required, 0) > 20) return 'Starting players required must be between 1 and 20.'
    if (form.entry_type === 'free' && safeNumber(form.entry_fee, -1) !== 0) return 'Free tournaments must have an entry fee of zero.'
    if (form.entry_type === 'paid' && safeNumber(form.entry_fee, 0) <= 0) return 'Paid tournaments require an entry fee greater than zero.'
    if (safeNumber(form.prize_pool, -1) < 0) return 'Prize pool cannot be negative.'
    if (form.match_schedule.some((item) => !item.title.trim() || !item.starts_at)) return 'Complete or remove every schedule item.'
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setNotice('')
    const validationError = validateForm()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }
    if (!client || !user) {
      setErrorMessage('Tournament administration is unavailable. Sign in with an authorized account.')
      return
    }

    setIsSaving(true)
    let completionNotice = isEditing ? 'Tournament draft saved.' : 'Tournament draft created.'
    let recordId = id ?? ''
    let uploadedPath: string | null = null
    try {
      const schedule = form.match_schedule.map((item) => ({ ...item, title: item.title.trim(), starts_at: toTimestamp(item.starts_at, form.timezone), notes: item.notes?.trim() || undefined }))
      const payload = {
        ...(id ? { id } : {}),
        name: form.name.trim(),
        slug: form.slug,
        description: form.description.trim(),
        game_code: form.game_code,
        mode_code: form.mode_code,
        format_code: form.format_code,
        max_teams: safeNumber(form.max_teams, 48),
        starting_players_required: safeNumber(form.starting_players_required, 4),
        substitute_allowed: form.substitute_allowed,
        entry_type: form.entry_type,
        entry_fee: safeNumber(form.entry_fee, 0),
        prize_pool: safeNumber(form.prize_pool, 0),
        prize_distribution: form.prize_distribution.trim(),
        eligibility: form.eligibility.trim(),
        participation_requirements: form.participation_requirements.trim(),
        match_rules: form.match_rules.trim(),
        scoring_system: form.scoring_system.trim(),
        disqualification_rules: form.disqualification_rules.trim(),
        general_instructions: form.general_instructions.trim(),
        match_schedule: schedule,
        timezone: form.timezone,
        registration_opens_at: toTimestamp(form.registration_opens_at, form.timezone),
        registration_closes_at: toTimestamp(form.registration_closes_at, form.timezone),
        starts_at: toTimestamp(form.starts_at, form.timezone),
        ends_at: form.ends_at ? toTimestamp(form.ends_at, form.timezone) : null,
        is_featured: form.is_featured,
        banner_path: bannerPath,
      }

      const { data: savedId, error } = await client.rpc('save_tournament', { p_tournament: payload })
      if (error || !savedId) {
        setErrorMessage(error?.message === 'TOURNAMENT_ADMIN_REQUIRED'
          ? 'Your account does not have the server-authorized tournament admin claim.'
          : error?.code === '23505'
            ? 'That tournament slug is already in use.'
            : 'Tournament draft could not be saved. Check the details and try again.')
        return
      }
      recordId = savedId

      if (bannerFile && bannerMime) {
        uploadedPath = `${recordId}/${crypto.randomUUID()}.${getTournamentBannerExtension(bannerMime)}`
        const { error: uploadError } = await client.storage.from('tournament-banners').upload(uploadedPath, bannerFile, {
          contentType: bannerMime,
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadError) {
          completionNotice = 'Draft saved, but the banner could not be uploaded. Select another image and save again.'
          setNotice(completionNotice)
        } else {
          const { error: attachError } = await client.rpc('save_tournament', {
            p_tournament: { ...payload, id: recordId, banner_path: uploadedPath },
          })
          if (attachError) {
            await client.storage.from('tournament-banners').remove([uploadedPath]).catch(() => null)
            completionNotice = 'Draft saved, but its banner could not be attached. Try uploading it again.'
            setNotice(completionNotice)
          } else {
            setBannerPath(uploadedPath)
            setBannerFile(null)
          }
        }
      }

      navigate('/admin/tournaments', { replace: true, state: { notice: completionNotice } })
    } catch {
      if (uploadedPath && client) await client.storage.from('tournament-banners').remove([uploadedPath]).catch(() => null)
      setErrorMessage(recordId ? 'Tournament draft saved, but a follow-up step failed. Review it in the tournament list.' : 'Tournament draft could not be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <div className="tournament-detail-state" role="status">Loading tournament draft...</div>

  return (
    <section className="admin-tournament-form-page">
      <Link className="tournament-back-link" to="/admin/tournaments">← Tournament management</Link>
      <div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / {isEditing ? 'EDIT DRAFT' : 'NEW DRAFT'}</p><h1>{isEditing ? 'Edit tournament.' : 'Create tournament.'}</h1><p>Saved tournaments remain drafts until an administrator publishes them.</p></div></div>
      {errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <form className="admin-tournament-form" onSubmit={(event) => void handleSubmit(event)}>
        <section className="admin-form-section"><div className="admin-form-section__heading"><span>01</span><div><h2>Basic information</h2><p>Set the public identity for this tournament.</p></div></div>
          <label className="admin-banner-input"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleBannerChange(event)} /><span className="admin-banner-input__preview">{previewUrl ? <img src={previewUrl} alt="Selected tournament banner preview" /> : <TournamentBanner path={bannerPath} name={form.name || 'Tournament'} />}</span><span className="admin-banner-input__copy"><ImagePlus size={19} /><b>{bannerPath ? 'Replace tournament banner' : 'Add tournament banner'}</b><small>PNG, JPG, WEBP / max 5 MB / required before publishing</small></span></label>
          <div className="admin-form-grid"><label className="form-field"><span>Tournament name</span><input type="text" required minLength={3} maxLength={120} value={form.name} onChange={(event) => { const name = event.target.value; setForm((current) => ({ ...current, name, ...(slugTouched ? {} : { slug: slugifyTournamentName(name) }) })) }} /></label><label className="form-field"><span>Slug</span><input type="text" required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(event) => { setSlugTouched(true); updateField('slug', event.target.value) }} /><small>Public URL: /tournaments/{form.slug || 'tournament-name'}</small></label></div>
          <label className="form-field"><span>Description</span><textarea rows={4} maxLength={5000} value={form.description} onChange={(event) => updateField('description', event.target.value)} /></label>
          <div className="admin-form-grid admin-form-grid--three"><label className="form-field"><span>Game</span><select value={form.game_code} onChange={(event) => updateField('game_code', event.target.value)}><option value="free_fire">Garena Free Fire</option></select></label><label className="form-field"><span>Tournament mode</span><select value={form.mode_code} onChange={(event) => updateField('mode_code', event.target.value)}><option value="battle_royale">Battle Royale</option></select></label><label className="form-field"><span>Tournament format</span><select value={form.format_code} onChange={(event) => updateField('format_code', event.target.value)}><option value="squad">Squad</option></select></label></div>
        </section>

        <section className="admin-form-section"><div className="admin-form-section__heading"><span>02</span><div><h2>Competition setup</h2><p>Configure capacity, lineup, and date windows.</p></div></div>
          <div className="admin-form-grid admin-form-grid--three"><label className="form-field"><span>Maximum team slots</span><input type="number" min={2} max={256} required value={form.max_teams} onChange={(event) => updateField('max_teams', event.target.value)} /></label><label className="form-field"><span>Starting players required</span><input type="number" min={1} max={20} required value={form.starting_players_required} onChange={(event) => updateField('starting_players_required', event.target.value)} /></label><label className="form-field"><span>Timezone</span><select value={form.timezone} onChange={(event) => updateField('timezone', event.target.value)}>{timezoneOptions.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label></div>
          <label className="admin-toggle"><input type="checkbox" checked={form.substitute_allowed} onChange={(event) => updateField('substitute_allowed', event.target.checked)} /><span><b>Allow one substitute</b><small>Team roster requirements are descriptive until registration is implemented.</small></span></label>
          <div className="admin-form-grid admin-form-grid--two"><label className="form-field"><span>Registration opens</span><input type="datetime-local" required value={form.registration_opens_at} onChange={(event) => updateField('registration_opens_at', event.target.value)} /></label><label className="form-field"><span>Registration closes</span><input type="datetime-local" required value={form.registration_closes_at} onChange={(event) => updateField('registration_closes_at', event.target.value)} /></label><label className="form-field"><span>Tournament starts</span><input type="datetime-local" required value={form.starts_at} onChange={(event) => updateField('starts_at', event.target.value)} /></label><label className="form-field"><span>Tournament ends <small>Optional</small></span><input type="datetime-local" value={form.ends_at} onChange={(event) => updateField('ends_at', event.target.value)} /></label></div>
          <div className="admin-schedule-editor"><div className="admin-schedule-editor__heading"><div><h3>Match schedule</h3><p>Times use the selected tournament timezone.</p></div><button className="admin-refresh-button" type="button" onClick={addScheduleItem}><Plus size={14} /> Add date</button></div>{form.match_schedule.map((item, index) => <div className="admin-schedule-row" key={index}><label className="form-field"><span>Schedule label</span><input type="text" maxLength={120} value={item.title} onChange={(event) => updateScheduleItem(index, 'title', event.target.value)} placeholder="Round 1" /></label><label className="form-field"><span>Date and time</span><input type="datetime-local" value={item.starts_at} onChange={(event) => updateScheduleItem(index, 'starts_at', event.target.value)} /></label><label className="form-field"><span>Notes <small>Optional</small></span><input type="text" maxLength={500} value={item.notes ?? ''} onChange={(event) => updateScheduleItem(index, 'notes', event.target.value)} /></label><button className="admin-remove-schedule" type="button" aria-label={`Remove schedule item ${index + 1}`} onClick={() => updateField('match_schedule', form.match_schedule.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></div>)}</div>
        </section>

        <section className="admin-form-section"><div className="admin-form-section__heading"><span>03</span><div><h2>Entry &amp; prize</h2><p>Payments are not processed by this platform yet.</p></div></div>
          <div className="admin-form-grid admin-form-grid--three"><label className="form-field"><span>Entry type</span><select value={form.entry_type} onChange={(event) => { const entryType = event.target.value as 'free' | 'paid'; setForm((current) => ({ ...current, entry_type: entryType, entry_fee: entryType === 'free' ? '0' : current.entry_fee === '0' ? '' : current.entry_fee })) }}><option value="free">Free entry</option><option value="paid">Paid (payment processing unavailable)</option></select></label><label className="form-field"><span>Entry fee (USD)</span><input type="number" min={form.entry_type === 'paid' ? '0.01' : '0'} step="0.01" required value={form.entry_fee} disabled={form.entry_type === 'free'} onChange={(event) => updateField('entry_fee', event.target.value)} /></label><label className="form-field"><span>Prize pool (USD)</span><input type="number" min="0" step="0.01" required value={form.prize_pool} onChange={(event) => updateField('prize_pool', event.target.value)} /></label></div>
          {form.entry_type === 'paid' && <p className="admin-form-warning" role="status">Paid entry is configuration only. No payments, collection, or payout processing are implemented.</p>}
          <label className="form-field"><span>Prize distribution</span><textarea rows={3} maxLength={2000} value={form.prize_distribution} onChange={(event) => updateField('prize_distribution', event.target.value)} /></label>
        </section>

        <section className="admin-form-section"><div className="admin-form-section__heading"><span>04</span><div><h2>Tournament rules</h2><p>Leave fields blank if the organizer has not configured them.</p></div></div>
          <label className="form-field"><span>Eligibility</span><textarea rows={3} maxLength={3000} value={form.eligibility} onChange={(event) => updateField('eligibility', event.target.value)} /></label>
          <label className="form-field"><span>Participation requirements</span><textarea rows={3} maxLength={3000} value={form.participation_requirements} onChange={(event) => updateField('participation_requirements', event.target.value)} /></label>
          <label className="form-field"><span>Match rules</span><textarea rows={4} maxLength={5000} value={form.match_rules} onChange={(event) => updateField('match_rules', event.target.value)} /></label>
          <label className="form-field"><span>Scoring system</span><textarea rows={4} maxLength={5000} value={form.scoring_system} onChange={(event) => updateField('scoring_system', event.target.value)} /></label>
          <label className="form-field"><span>Disqualification rules</span><textarea rows={3} maxLength={3000} value={form.disqualification_rules} onChange={(event) => updateField('disqualification_rules', event.target.value)} /></label>
          <label className="form-field"><span>General instructions</span><textarea rows={3} maxLength={5000} value={form.general_instructions} onChange={(event) => updateField('general_instructions', event.target.value)} /></label>
        </section>

        <label className="admin-toggle admin-toggle--featured"><input type="checkbox" checked={form.is_featured} onChange={(event) => updateField('is_featured', event.target.checked)} /><span><b>Feature this tournament</b><small>Featured events are highlighted at the top of the public Tournament Arena.</small></span></label>
        <div className="admin-form-actions"><Link className="admin-form-cancel" to="/admin/tournaments">Cancel</Link><button className="arena-state__button" type="submit" disabled={isSaving || !client}>{isSaving ? 'Saving draft...' : isEditing ? 'Save changes' : 'Save as draft'}</button></div>
      </form>
    </section>
  )
}

export default AdminTournamentFormPage