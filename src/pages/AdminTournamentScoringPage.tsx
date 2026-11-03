import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface ScoringConfig {
  tournament_id: string
  placement_points: Record<string, number>
  points_per_kill: number
  max_placement_rank: number
  placement_enabled: boolean
  kill_enabled: boolean
  tie_breakers: string[]
  allow_shared_rank: boolean
}

interface PlacementPoint { rank: string; points: string }
const tieOptions = [
  ['total_points', 'Total points'],
  ['first_place_finishes', 'First-place finishes'],
  ['total_kills', 'Total kills'],
  ['highest_placement', 'Highest individual placement'],
  ['placement_points', 'Placement points'],
  ['kill_points', 'Kill points'],
  ['matches_played', 'Matches played'],
]

function AdminTournamentScoringPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { client } = useAuth()
  const [tournamentName, setTournamentName] = useState('Tournament scoring')
  const [config, setConfig] = useState<ScoringConfig | null>(null)
  const [points, setPoints] = useState<PlacementPoint[]>([])
  const [maxRank, setMaxRank] = useState('')
  const [pointsPerKill, setPointsPerKill] = useState('')
  const [placementEnabled, setPlacementEnabled] = useState(false)
  const [killEnabled, setKillEnabled] = useState(false)
  const [tieBreakers, setTieBreakers] = useState<string[]>([])
  const [allowSharedRank, setAllowSharedRank] = useState(false)
  const [resultsExist, setResultsExist] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    async function load() {
      if (!client || !tournamentId || configurationError) {
        setIsLoading(false)
        setErrorMessage(configurationError ?? 'Tournament is unavailable.')
        return
      }
      try {
        const [tournamentResult, configResult, matchesResult] = await Promise.all([
          client.from('tournaments').select('name').eq('id', tournamentId).maybeSingle(),
          client.from('tournament_scoring_configs').select('*').eq('tournament_id', tournamentId).maybeSingle(),
          client.from('matches').select('id').eq('tournament_id', tournamentId),
        ])
        if (tournamentResult.error || configResult.error || matchesResult.error) throw new Error('LOAD_FAILED')
        if (!active) return
        setTournamentName(tournamentResult.data?.name ?? 'Tournament scoring')
        setResultsExist(Boolean(matchesResult.data?.length))
        if (configResult.data) {
          const current = configResult.data as ScoringConfig
          setConfig(current)
          setMaxRank(String(current.max_placement_rank))
          setPointsPerKill(String(current.points_per_kill))
          setPlacementEnabled(current.placement_enabled)
          setKillEnabled(current.kill_enabled)
          setTieBreakers(current.tie_breakers)
          setAllowSharedRank(current.allow_shared_rank)
          setPoints(Object.entries(current.placement_points).map(([rank, value]) => ({ rank, points: String(value) })).sort((a, b) => Number(a.rank) - Number(b.rank)))
        }
      } catch {
        if (active) setErrorMessage('Scoring configuration could not be loaded. Confirm administrator access and migration status.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [client, tournamentId, configurationError])

  function updatePoint(index: number, field: keyof PlacementPoint, value: string) {
    setPoints((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, [field]: value } : item))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !tournamentId) return
    setErrorMessage('')
    setNotice('')
    const max = Number(maxRank)
    if (!Number.isInteger(max) || max < 1 || max > 256) {
      setErrorMessage('Maximum placement rank must be between 1 and 256.')
      return
    }
    if (!placementEnabled && !killEnabled) {
      setErrorMessage('Enable placement points, kill points, or both.')
      return
    }
    if (killEnabled && (!Number.isFinite(Number(pointsPerKill)) || Number(pointsPerKill) < 0)) {
      setErrorMessage('Enter a valid non-negative points-per-kill value.')
      return
    }
    const placementMap: Record<string, number> = {}
    for (const point of points) {
      const rank = Number(point.rank)
      const value = Number(point.points)
      if (!Number.isInteger(rank) || rank < 1 || rank > max || !Number.isFinite(value) || value < 0) {
        setErrorMessage('Placement rows require a valid rank and non-negative points within the configured maximum.')
        return
      }
      if (placementMap[String(rank)] !== undefined) {
        setErrorMessage('Placement ranks in the scoring table must be unique.')
        return
      }
      placementMap[String(rank)] = value
    }
    if (placementEnabled && !Object.keys(placementMap).length) {
      setErrorMessage('Add at least one placement point before enabling placement scoring.')
      return
    }
    if (!tieBreakers.length || new Set(tieBreakers).size !== tieBreakers.length) {
      setErrorMessage('Choose at least one ordered tie-break rule.')
      return
    }

    setIsSaving(true)
    try {
      const { error } = await client.rpc('set_tournament_scoring_config', {
        p_tournament_id: tournamentId,
        p_placement_points: placementMap,
        p_points_per_kill: killEnabled ? Number(pointsPerKill) : 0,
        p_max_placement_rank: max,
        p_placement_enabled: placementEnabled,
        p_kill_enabled: killEnabled,
        p_tie_breakers: tieBreakers,
        p_allow_shared_rank: allowSharedRank,
      })
      if (error) {
        setErrorMessage(error.message === 'SCORING_LOCKED_AFTER_RESULTS' ? 'Scoring rules cannot be changed after result entry has started.' : 'Scoring configuration could not be saved.')
      } else {
        setNotice('Tournament scoring configuration saved.')
        setConfig({
          tournament_id: tournamentId,
          placement_points: placementMap,
          points_per_kill: killEnabled ? Number(pointsPerKill) : 0,
          max_placement_rank: max,
          placement_enabled: placementEnabled,
          kill_enabled: killEnabled,
          tie_breakers: tieBreakers,
          allow_shared_rank: allowSharedRank,
        })
      }
    } catch {
      setErrorMessage('Scoring configuration could not be saved. Check your connection.')
    } finally {
      setIsSaving(false)
    }
  }

  function toggleTieBreaker(value: string) {
    setTieBreakers((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  if (isLoading) return <div className="tournament-detail-state" role="status">Loading scoring rules...</div>

  return <section className="admin-scoring-page"><Link className="tournament-back-link" to="/admin/tournaments">← Tournament management</Link><div className="admin-tournament-heading"><div><p className="section-heading__eyebrow">CONTROL ROOM / SCORING RULES</p><h1>{tournamentName} scoring.</h1><p>No scoring table is assumed. Configure official event values explicitly.</p></div></div>{errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}{resultsExist && <p className="admin-form-warning" role="status">This tournament has match records. Configuration changes are locked once any result entry exists.</p>}
    <form className="admin-scoring-form" onSubmit={(event) => void submit(event)}>
      <label className="form-field"><span>Maximum placement rank</span><input type="number" min="1" max="256" required value={maxRank} disabled={resultsExist} onChange={(event) => setMaxRank(event.target.value)} /><small>Placement ranks above this value will be rejected.</small></label>
      <label className="admin-toggle"><input type="checkbox" checked={placementEnabled} disabled={resultsExist} onChange={(event) => setPlacementEnabled(event.target.checked)} /><span><b>Enable placement points</b><small>Ranks omitted from the table receive zero points.</small></span></label>
      {placementEnabled && <section className="admin-placement-points"><div className="admin-schedule-editor__heading"><div><h2>Placement points</h2><p>Enter only the ranks and values configured for this tournament.</p></div><button className="admin-refresh-button" type="button" disabled={resultsExist} onClick={() => setPoints((current) => [...current, { rank: '', points: '' }])}>Add rank</button></div>{points.map((point, index) => <div className="admin-placement-point-row" key={index}><label className="form-field"><span>Rank</span><input type="number" min="1" max={maxRank || 256} value={point.rank} disabled={resultsExist} onChange={(event) => updatePoint(index, 'rank', event.target.value)} /></label><label className="form-field"><span>Points</span><input type="number" min="0" step="0.001" value={point.points} disabled={resultsExist} onChange={(event) => updatePoint(index, 'points', event.target.value)} /></label><button className="admin-remove-schedule" type="button" aria-label={`Remove rank ${point.rank || index + 1}`} disabled={resultsExist} onClick={() => setPoints((current) => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</button></div>)}</section>}
      <label className="admin-toggle"><input type="checkbox" checked={killEnabled} disabled={resultsExist} onChange={(event) => setKillEnabled(event.target.checked)} /><span><b>Enable kill points</b><small>Kill points are calculated from the configured per-kill value.</small></span></label>
      {killEnabled && <label className="form-field"><span>Points per kill</span><input type="number" min="0" step="0.001" required value={pointsPerKill} disabled={resultsExist} onChange={(event) => setPointsPerKill(event.target.value)} /></label>}
      <fieldset className="admin-tiebreaker-fieldset" disabled={resultsExist}><legend>Tie-break order</legend><p>Selected rules are applied in the order shown. Use the arrows to reorder them.</p>{tieOptions.map(([value, label]) => <label className="admin-tiebreaker-option" key={value}><input type="checkbox" checked={tieBreakers.includes(value)} onChange={() => toggleTieBreaker(value)} /><span>{label}</span>{tieBreakers.includes(value) && <div><button type="button" aria-label={`Move ${label} earlier`} disabled={tieBreakers.indexOf(value) === 0} onClick={(event) => { event.preventDefault(); setTieBreakers((current) => { const index = current.indexOf(value); if (index <= 0) return current; const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next }) }}>↑</button><button type="button" aria-label={`Move ${label} later`} disabled={tieBreakers.indexOf(value) === tieBreakers.length - 1} onClick={(event) => { event.preventDefault(); setTieBreakers((current) => { const index = current.indexOf(value); if (index < 0 || index >= current.length - 1) return current; const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next }) }}>↓</button></div>}</label>)}</fieldset>
      <label className="admin-toggle"><input type="checkbox" checked={allowSharedRank} disabled={resultsExist} onChange={(event) => setAllowSharedRank(event.target.checked)} /><span><b>Allow shared ranks for ties</b><small>When disabled, teams tied on configured criteria receive separate deterministic ranks.</small></span></label>
      <p className="admin-scoring-form__summary">Current state: {config ? 'Configured' : 'Not configured'}. Results cannot be entered until scoring rules are saved.</p>
      <div className="admin-form-actions"><Link className="admin-form-cancel" to={`/admin/tournaments/${tournamentId}/matches`}>Back to matches</Link><button className="arena-state__button" type="submit" disabled={isSaving || resultsExist || !client}>{isSaving ? 'Saving scoring...' : 'Save scoring rules'}</button></div>
    </form>
  </section>
}

export default AdminTournamentScoringPage