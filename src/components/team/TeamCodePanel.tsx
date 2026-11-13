import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Copy, Link2, UserPlus, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useTeam } from '../../teams/TeamContext'

interface TeamJoinCode {
  id: string
  player_name: string
  player_email: string | null
  player_phone: string | null
  role: 'starting_player' | 'substitute'
  join_code: string
  created_at: string
  expires_at: string
}

function TeamCodePanel() {
  const { client } = useAuth()
  const { team, refreshTeam } = useTeam()
  const [codes, setCodes] = useState<TeamJoinCode[]>([])
  const [playerName, setPlayerName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'starting_player' | 'substitute'>('starting_player')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [workingId, setWorkingId] = useState('')

  const loadCodes = useCallback(async () => {
    if (!client || !team) return
    setIsLoading(true)
    try {
      const { data, error } = await client.rpc('get_team_join_codes', { p_team_id: team.id })
      if (error) throw error
      setCodes((data ?? []) as TeamJoinCode[])
    } catch {
      setIsError(true)
      setMessage('Team codes could not be loaded. Confirm the team-code migration has been applied.')
    } finally {
      setIsLoading(false)
    }
  }, [client, team])

  useEffect(() => { void loadCodes() }, [loadCodes])

  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !team) return
    const name = playerName.trim()
    if (name.length < 2 || name.length > 100) {
      setIsError(true)
      setMessage('Player name must be 2-100 characters.')
      return
    }
    setIsError(false)
    setMessage('')
    setWorkingId('create')
    try {
      const { error } = await client.rpc('create_team_join_code', {
        p_team_id: team.id,
        p_player_name: name,
        p_email: email.trim() || null,
        p_phone: phone.trim() || null,
        p_role: role,
      })
      if (error) {
        const messages: Record<string, string> = {
          TEAM_CAPTAIN_REQUIRED: 'Only the active captain can create team codes.',
          TEAM_ROSTER_FULL: 'The roster is full or all remaining slots are reserved.',
          STARTING_LINEUP_FULL: 'There are no starting-player slots available.',
          SUBSTITUTE_SLOT_FULL: 'The substitute slot is full or reserved.',
          INVALID_PLAYER_EMAIL: 'Enter a valid email address or leave it blank.',
          INVALID_PLAYER_PHONE: 'Enter a valid phone number or leave it blank.',
        }
        setIsError(true)
        setMessage(messages[error.message] ?? 'A team code could not be created.')
        return
      }
      setPlayerName('')
      setEmail('')
      setPhone('')
      setIsError(false)
      setMessage(`Team code created for ${name}. It expires in 7 days.`)
      await Promise.all([loadCodes(), refreshTeam()])
    } catch {
      setIsError(true)
      setMessage('A team code could not be created. Check your connection and try again.')
    } finally {
      setWorkingId('')
    }
  }

  async function cancelCode(codeId: string) {
    if (!client) return
    setWorkingId(codeId)
    setMessage('')
    try {
      const { error } = await client.rpc('cancel_team_join_code', { p_code_id: codeId })
      if (error) throw error
      setIsError(false)
      setMessage('Team code cancelled.')
      await loadCodes()
    } catch {
      setIsError(true)
      setMessage('Team code could not be cancelled.')
    } finally {
      setWorkingId('')
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setIsError(false)
      setMessage('Team code copied.')
    } catch {
      setIsError(true)
      setMessage('Clipboard access was blocked. Select and copy the code manually.')
    }
  }

  return (
    <section className="team-panel team-invite-panel" aria-labelledby="team-code-title">
      <div className="team-panel__heading"><span className="team-feature-icon"><Link2 aria-hidden="true" size={19} /></span><div><h2 id="team-code-title">Team Code</h2><p>Create a one-time code for a verified player to join this roster. Codes expire after 7 days.</p></div></div>
      <form className="team-invite-form" onSubmit={(event) => void createCode(event)}>
        <label className="form-field"><span>Player name</span><input type="text" required minLength={2} maxLength={100} autoComplete="name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} /></label>
        <label className="form-field"><span>Email <small>Optional; if provided, only this verified email can redeem the code.</small></span><input type="email" maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="form-field"><span>Phone number <small>Optional</small></span><input type="tel" maxLength={24} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="form-field"><span>Roster role</span><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="starting_player">Starting player</option><option value="substitute">Substitute</option></select></label>
        {message && <p className={isError ? 'team-form-error' : 'team-form-success'} role={isError ? 'alert' : 'status'}>{message}</p>}
        <button className="team-button" type="submit" disabled={workingId === 'create' || !client}><UserPlus size={15} /> {workingId === 'create' ? 'Creating code...' : 'Create Team Code'}</button>
      </form>
      <div className="team-join-code-list" aria-label="Active team codes">
        {isLoading ? <p role="status">Loading active codes...</p> : codes.length ? codes.map((code) => (
          <article className="team-outgoing-row" key={code.id}>
            <div><b>{code.player_name}</b><span>{code.role === 'substitute' ? 'Substitute' : 'Starting player'} · expires {new Date(code.expires_at).toLocaleString()}</span>{code.player_email && <small>{code.player_email}</small>}{code.player_phone && <small>{code.player_phone}</small>}<code>{code.join_code}</code></div>
            <div className="team-join-code-actions"><button className="team-button team-button--secondary" type="button" onClick={() => void copyCode(code.join_code)}><Copy size={14} /> Copy</button><button className="team-icon-button" type="button" aria-label={`Cancel code for ${code.player_name}`} disabled={workingId === code.id} onClick={() => void cancelCode(code.id)}><X size={15} /></button></div>
          </article>
        )) : <p className="team-empty-inline">No active team codes.</p>}
      </div>
    </section>
  )
}

export default TeamCodePanel