import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Medal, RotateCw, Save, Send, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { MatchAssignment, AdminMatch } from '../matches/types'
import { SectionHeading } from '../components/ui'

interface ScoringConfig {
  placement_points: Record<string, number>
  points_per_kill: number
  max_placement_rank: number
  placement_enabled: boolean
  kill_enabled: boolean
  allow_shared_rank: boolean
  tie_breakers: string[]
}

interface MatchResult {
  id: string
  registration_id: string
  team_id: string
  placement_rank: number
  total_kills: number
  placement_points: number
  kill_points: number
  total_points: number
  status: string
  admin_notes: string
  submitted_by: string | null
  verified_by: string | null
  verified_at: string | null
  published_at: string | null
}

interface ResultInput {
  placement_rank: string
  total_kills: string
  admin_notes: string
  correction_reason: string
  review_reason: string
}

function resultTone(status: string) {
  return `result-lifecycle result-lifecycle--${status}`
}

function AdminMatchResultsPage() {
  const { tournamentId, matchId } = useParams<{ tournamentId: string; matchId: string }>()
  const { client } = useAuth()
  const [match, setMatch] = useState<AdminMatch | null>(null)
  const [tournamentName, setTournamentName] = useState('')
  const [assignments, setAssignments] = useState<MatchAssignment[]>([])
  const [results, setResults] = useState<MatchResult[]>([])
  const [scoring, setScoring] = useState<ScoringConfig | null>(null)
  const [inputs, setInputs] = useState<Record<string, ResultInput>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const configurationError = getSupabaseConfigurationError()

  const loadData = useCallback(async () => {
    if (!client || !tournamentId || !matchId || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Match is unavailable.')
      return
    }
    setIsLoading(true)
    setErrorMessage('')
    try {
      const [tournamentResult, matchResult, assignmentResult, resultResult, scoringResult] = await Promise.all([
        client.from('tournaments').select('name').eq('id', tournamentId).maybeSingle(),
        client.rpc('get_tournament_matches_admin', { p_tournament_id: tournamentId }),
        client.rpc('get_match_assignments_admin', { p_match_id: matchId }),
        client.from('match_results').select('*').eq('match_id', matchId),
        client.from('tournament_scoring_configs').select('*').eq('tournament_id', tournamentId).maybeSingle(),
      ])
      if (tournamentResult.error || matchResult.error || assignmentResult.error || resultResult.error || scoringResult.error) throw new Error('LOAD_FAILED')
      const currentMatch = ((matchResult.data ?? []) as AdminMatch[]).find((item) => item.match_id === matchId) ?? null
      if (!currentMatch || !tournamentResult.data) throw new Error('MATCH_NOT_FOUND')
      const currentAssignments = (assignmentResult.data ?? []) as MatchAssignment[]
      const currentResults = (resultResult.data ?? []) as MatchResult[]
      setTournamentName(tournamentResult.data.name)
      setMatch(currentMatch)
      setAssignments(currentAssignments)
      setResults(currentResults)
      setScoring(scoringResult.data as ScoringConfig | null)
      const nextInputs: Record<string, ResultInput> = {}
      for (const assignment of currentAssignments) {
        const result = currentResults.find((item) => item.registration_id === assignment.registration_id)
        nextInputs[assignment.registration_id] = {
          placement_rank: result ? String(result.placement_rank) : '',
          total_kills: result ? String(result.total_kills) : '',
          admin_notes: result?.admin_notes ?? '',
          correction_reason: '',
          review_reason: '',
        }
      }
      setInputs(nextInputs)
    } catch {
      setErrorMessage('Match results could not be loaded. Confirm admin access and migration status.')
    } finally {
      setIsLoading(false)
    }
  }, [client, tournamentId, matchId, configurationError])

  useEffect(() => { void loadData() }, [loadData])

  function updateInput(registrationId: string, key: keyof ResultInput, value: string) {
    setInputs((current) => ({
      ...current,
      [registrationId]: { ...(current[registrationId] ?? { placement_rank: '', total_kills: '', admin_notes: '', correction_reason: '', review_reason: '' }), [key]: value },
    }))
  }

  function calculatePreview(input: ResultInput | undefined) {
    if (!scoring || !input) return null
    const rank = Number(input.placement_rank)
    const kills = Number(input.total_kills)
    if (!Number.isInteger(rank) || rank < 1 || rank > scoring.max_placement_rank || !Number.isInteger(kills) || kills < 0) return null
    const placementPoints = scoring.placement_enabled ? Number(scoring.placement_points[String(rank)] ?? 0) : 0
    const killPoints = scoring.kill_enabled ? kills * Number(scoring.points_per_kill) : 0
    return { placementPoints, killPoints, total: placementPoints + killPoints }
  }

  async function saveDraft(assignment: MatchAssignment) {
    if (!client || !matchId) return
    const input = inputs[assignment.registration_id]
    if (!input || !input.placement_rank || input.total_kills === '') {
      setErrorMessage('Enter placement rank and total kills before saving.')
      return
    }
    setWorkingId(assignment.registration_id)
    setErrorMessage('')
    setNotice('')
    try {
      const { error } = await client.rpc('save_match_result_draft', {
        p_match_id: matchId,
        p_registration_id: assignment.registration_id,
        p_placement_rank: Number(input.placement_rank),
        p_total_kills: Number(input.total_kills),
        p_admin_notes: input.admin_notes,
      })
      if (error) {
        const errorMessages: Record<string, string> = {
          SCORING_NOT_CONFIGURED: 'Configure tournament scoring before entering results.',
          INVALID_PLACEMENT_RANK: 'Placement rank is outside the configured range.',
          INVALID_KILL_COUNT: 'Kills must be between 0 and 1000.',
          DUPLICATE_PLACEMENT_RANK: 'That placement rank is already assigned and ties are not allowed.',
          RESULT_NOT_EDITABLE: 'Submitted or published results cannot be edited as a draft.',
        }
        setErrorMessage(errorMessages[error.message] ?? 'Draft result could not be saved.')
      } else {
        setNotice(`Draft saved for ${assignment.team_name}. Points were calculated by the database.`)
        await loadData()
      }
    } catch {
      setErrorMessage('Draft result could not be saved. Check your connection.')
    } finally {
      setWorkingId('')
    }
  }

  async function submitResult(result: MatchResult) {
    if (!client) return
    setWorkingId(result.id)
    setErrorMessage('')
    try {
      const { error } = await client.rpc('submit_match_result', { p_result_id: result.id })
      if (error) setErrorMessage(error.message === 'MATCH_MUST_BE_COMPLETED' ? 'Complete the match before submitting results for verification.' : 'Result could not be submitted.')
      else {
        setNotice('Result submitted for verification.')
        await loadData()
      }
    } catch {
      setErrorMessage('Result could not be submitted. Check your connection.')
    } finally {
      setWorkingId('')
    }
  }

  async function reviewResult(result: MatchResult, decision: 'verified' | 'disputed') {
    if (!client) return
    const reason = inputs[result.registration_id]?.review_reason.trim() ?? ''
    if (decision === 'disputed' && !reason) {
      setErrorMessage('Add a reason before disputing a result.')
      return
    }
    if (!window.confirm(`${decision === 'verified' ? 'Verify' : 'Dispute'} this result?`)) return
    setWorkingId(result.id)
    setErrorMessage('')
    try {
      const { error } = await client.rpc('review_match_result', { p_result_id: result.id, p_decision: decision, p_reason: reason || null })
      if (error) {
        const errorMessages: Record<string, string> = {
          SELF_APPROVAL_FORBIDDEN: 'The result submitter cannot verify their own result.',
          MATCH_MUST_BE_COMPLETED: 'The match must be completed before results can be verified.',
        }
        setErrorMessage(errorMessages[error.message] ?? 'Result review could not be completed.')
      } else {
        setNotice(`Result ${decision}.`)
        await loadData()
      }
    } catch {
      setErrorMessage('Result review could not be completed. Check your connection.')
    } finally {
      setWorkingId('')
    }
  }

  async function correctResult(result: MatchResult) {
    if (!client) return
    const input = inputs[result.registration_id]
    const reason = input?.correction_reason.trim() ?? ''
    if (!reason) {
      setErrorMessage('A correction reason is required.')
      return
    }
    if (!window.confirm('Correct this published result? The full change will be audited and standings will be withheld until reverified and republished.')) return
    setWorkingId(result.id)
    setErrorMessage('')
    try {
      const { error } = await client.rpc('correct_published_match_result', {
        p_result_id: result.id,
        p_placement_rank: Number(input?.placement_rank),
        p_total_kills: Number(input?.total_kills),
        p_admin_notes: input?.admin_notes ?? '',
        p_correction_reason: reason,
      })
      if (error) setErrorMessage(error.message === 'DUPLICATE_PLACEMENT_RANK' ? 'That placement rank already exists and ties are disabled.' : 'Result correction could not be saved.')
      else {
        setNotice('Correction saved and audited. It must be verified by another administrator before republishing.')
        await loadData()
      }
    } catch {
      setErrorMessage('Result correction could not be saved. Check your connection.')
    } finally {
      setWorkingId('')
    }
  }

  async function publishResults() {
    if (!client || !matchId || !match) return
    const summary = assignments.map((assignment) => {
      const result = results.find((item) => item.registration_id === assignment.registration_id)
      return `${assignment.team_name}: ${result ? `${result.placement_rank} / ${result.total_kills} kills / ${Number(result.total_points).toFixed(2)} points` : 'MISSING RESULT'}`
    }).join('\n')
    if (!window.confirm(`Publish the verified standings for ${match.name}?\n\n${summary}`)) return
    setWorkingId('publish')
    setErrorMessage('')
    try {
      const { error } = await client.rpc('publish_match_results', { p_match_id: matchId })
      if (error) setErrorMessage(error.message === 'ALL_ASSIGNED_RESULTS_MUST_BE_VERIFIED' ? 'Every assigned team needs a verified result before publishing.' : error.message === 'DUPLICATE_PLACEMENT_RANK' ? 'Duplicate placements are not allowed by this tournament configuration.' : 'Match results could not be published.')
      else {
        setNotice('All verified match results are now published to the public standings.')
        await loadData()
      }
    } catch {
      setErrorMessage('Match results could not be published. Check your connection.')
    } finally {
      setWorkingId('')
    }
  }

  const resultsByRegistration = useMemo(() => new Map(results.map((result) => [result.registration_id, result])), [results])
  const readyToPublish = assignments.length > 0 && assignments.every((assignment) => ['verified', 'published'].includes(resultsByRegistration.get(assignment.registration_id)?.status ?? ''))

  if (isLoading) return <div className="tournament-detail-state" role="status">Loading match results...</div>

  return <section className="admin-match-results-page"><Link className="tournament-back-link" to={`/admin/tournaments/${tournamentId}/matches`}>← Match operations</Link><SectionHeading eyebrow="CONTROL ROOM / RESULTS" title={match?.name ?? 'Match results'} description={`${tournamentName} · Enter scores, verify, then publish the final standings.`} />{errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
    {!scoring && <div className="admin-form-warning" role="status">Scoring has not been configured. <Link to={`/admin/tournaments/${tournamentId}/scoring`}>Configure scoring rules</Link> before entering results.</div>}
    {match && <div className="admin-result-match-summary"><span>Match {match.match_number} / {match.round_name}</span><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: match.timezone }).format(new Date(match.scheduled_at))} / {match.timezone}</span><span className={match.status === 'completed' ? 'is-completed' : ''}>{match.status.replaceAll('_', ' ')}</span></div>}
    <div className="admin-results-heading"><div><h2>Assigned team results</h2><p>{assignments.length} teams assigned · {assignments.length - results.length} result records missing</p></div><button className="admin-refresh-button" type="button" onClick={() => void loadData()}><RotateCw size={14} /> Refresh</button></div>
    {assignments.length ? <div className="admin-result-list">{assignments.map((assignment) => {
      const result = resultsByRegistration.get(assignment.registration_id)
      const input = inputs[assignment.registration_id] ?? { placement_rank: '', total_kills: '', admin_notes: '', correction_reason: '', review_reason: '' }
      const preview = calculatePreview(input)
      return <article className="admin-result-card" key={assignment.registration_id}>
        <div className="admin-result-card__heading"><div><span className="admin-result-card__slot">{assignment.team_name.slice(0, 1)}</span><div><h3>{assignment.team_name}</h3><p>Captain: {assignment.captain_name}</p></div></div><span className={resultTone(result?.status ?? 'missing')}>{result?.status ?? 'No result'}</span></div>
        <div className="admin-result-form"><label className="form-field"><span>Placement rank</span><input type="number" min="1" max={scoring?.max_placement_rank ?? 256} value={input.placement_rank} disabled={!scoring || ['submitted', 'verified', 'published', 'corrected'].includes(result?.status ?? '')} onChange={(event) => updateInput(assignment.registration_id, 'placement_rank', event.target.value)} /></label><label className="form-field"><span>Total kills</span><input type="number" min="0" max="1000" value={input.total_kills} disabled={!scoring || ['submitted', 'verified', 'published', 'corrected'].includes(result?.status ?? '')} onChange={(event) => updateInput(assignment.registration_id, 'total_kills', event.target.value)} /></label><label className="form-field admin-result-form__notes"><span>Admin notes</span><input type="text" maxLength={3000} value={input.admin_notes} disabled={['submitted', 'verified', 'published', 'corrected'].includes(result?.status ?? '')} onChange={(event) => updateInput(assignment.registration_id, 'admin_notes', event.target.value)} /></label></div>
        {preview && <div className="admin-result-preview"><span>Placement <b>{preview.placementPoints.toFixed(2)}</b></span><span>Kills <b>{preview.killPoints.toFixed(2)}</b></span><strong>Total <b>{preview.total.toFixed(2)}</b></strong><small>Preview only · database calculates authoritative points</small></div>}
        <div className="admin-result-actions">
          {(!result || ['draft', 'disputed'].includes(result.status)) && <><button className="team-button team-button--secondary" type="button" disabled={!scoring || workingId === assignment.registration_id} onClick={() => void saveDraft(assignment)}><Save size={13} /> Save draft</button>{result && <button className="team-button" type="button" disabled={workingId === result.id || match?.status !== 'completed'} onClick={() => void submitResult(result)}><Send size={13} /> Submit for review</button>}</>}
          {result?.status === 'corrected' && <button className="team-button" type="button" disabled={workingId === result.id || match?.status !== 'completed'} onClick={() => void submitResult(result)}><Send size={13} /> Resubmit correction</button>}
          {result?.status === 'submitted' && <div className="admin-result-review"><label className="form-field"><span>Dispute reason (if needed)</span><input type="text" maxLength={2000} value={input.review_reason} onChange={(event) => updateInput(assignment.registration_id, 'review_reason', event.target.value)} /></label><button className="team-button" type="button" disabled={workingId === result.id || match?.status !== 'completed'} onClick={() => void reviewResult(result, 'verified')}><CheckCircle2 size={13} /> Verify</button><button className="admin-disqualify-button" type="button" disabled={workingId === result.id || match?.status !== 'completed'} onClick={() => void reviewResult(result, 'disputed')}>Dispute</button></div>}
          {result?.status === 'published' && <div className="admin-result-correction"><label className="form-field"><span>Correction reason (required)</span><input type="text" maxLength={2000} value={input.correction_reason} onChange={(event) => updateInput(assignment.registration_id, 'correction_reason', event.target.value)} /></label><button className="admin-refresh-button" type="button" disabled={workingId === result.id} onClick={() => void correctResult(result)}>Correct published result</button></div>}
          {result?.status === 'verified' && <button className="team-button" type="button" disabled={workingId === 'publish' || match?.status !== 'completed'} onClick={() => void publishResults()}><ShieldCheck size={13} /> Publish match results</button>}
        </div>
      </article>
    })}</div> : <div className="arena-state"><Medal size={22} /><h3>No assigned teams.</h3><p>Assign approved registrations to this match before entering results.</p></div>}
    <div className="admin-result-publish-bar"><span>{readyToPublish ? 'Every assigned team has a verified result.' : 'Every assigned team must have a verified result before publication.'}</span><button className="arena-state__button" type="button" disabled={!readyToPublish || workingId === 'publish' || match?.status !== 'completed'} onClick={() => void publishResults()}>{workingId === 'publish' ? 'Publishing...' : 'Publish match standings'}</button></div>
  </section>
}

export default AdminMatchResultsPage