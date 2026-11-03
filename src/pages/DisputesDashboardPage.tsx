import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

function DisputesDashboardPage() {
  const { client, user } = useAuth()
  const [details, setDetails] = useState('')
  const [category, setCategory] = useState('match_results')
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    if (!client || !user || configurationError) {
      setIsLoading(false)
      setNotice(configurationError ?? 'Disputes are unavailable.')
      return
    }
    setIsLoading(false)
  }, [client, configurationError, user])

  async function handleSubmit() {
    if (!client || !user) return
    if (details.trim().length < 20) {
      setIsError(true)
      setNotice('Describe the dispute with enough detail for review.')
      return
    }

    try {
      const { error } = await client.rpc('create_tournament_dispute', {
        p_tournament_id: null,
        p_match_id: null,
        p_registration_id: null,
        p_category: category,
        p_description: details.trim(),
      })
      if (error) throw error
      setIsError(false)
      setNotice('Dispute submitted. An administrator will review it and request any additional evidence if needed.')
      setDetails('')
    } catch {
      setIsError(true)
      setNotice('Unable to file the dispute at the moment.')
    }
  }

  return (
    <main className="page-width support-dashboard-page">
      <header className="announcements-heading">
        <div>
          <p className="section-heading__eyebrow">PLAYER / DISPUTES</p>
          <h1>Dispute center.</h1>
          <p>Submit a dispute for match results, eligibility, roster, room access, or tournament issues.</p>
        </div>
      </header>
      <section className="profile-panel">
        <div className="profile-form">
          <label className="form-field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="match_results">Match Results</option>
            <option value="kill_count">Kill Count</option>
            <option value="placement">Placement</option>
            <option value="player_eligibility">Player Eligibility</option>
            <option value="team_roster">Team Roster</option>
            <option value="match_scheduling">Match Scheduling</option>
            <option value="room_access">Room / Match Access</option>
            <option value="rule_violation">Rule Violation</option>
            <option value="other">Other</option>
          </select></label>
          <label className="form-field"><span>Detailed description</span><textarea rows={8} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
          {notice && <p className={isError ? 'auth-error' : 'auth-success-message'} role="status">{notice}</p>}
          <button type="button" className="auth-submit" onClick={() => void handleSubmit()} disabled={isLoading}>Submit dispute</button>
        </div>
      </section>
    </main>
  )
}

export default DisputesDashboardPage
