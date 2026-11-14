import { useState, type FormEvent } from 'react'
import { Check, Mail, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import TeamLogo from '../components/team/TeamLogo'
import { useTeam } from '../teams/TeamContext'
import { SectionHeading } from '../components/ui'

function TeamInvitationsPage() {
  const { client } = useAuth()
  const { team, membership, incomingInvitations, outgoingInvitations, error: teamError, refreshTeam } = useTeam()
  const navigate = useNavigate()
  const [credentials, setCredentials] = useState<Record<string, { ign: string; uid: string }>>({})
  const [joinCode, setJoinCode] = useState('')
  const [joinIgn, setJoinIgn] = useState('')
  const [joinUid, setJoinUid] = useState('')
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  async function joinWithCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client) return
    if (alreadyOnTeam) {
      setIsError(true)
      setMessage('Leave your current active team before joining another roster.')
      return
    }
    setWorkingId('team-code')
    setIsError(false)
    setMessage('')
    try {
      const code = joinCode.trim()
      const { error } = /^[A-Fa-f0-9]{16}$/.test(code)
        ? await client.rpc('join_team_by_code', {
          p_team_code: code,
          p_ign: joinIgn.trim(),
          p_free_fire_uid: joinUid.trim(),
        })
        : await client.rpc('join_team_with_code', {
          p_join_code: code,
          p_ign: joinIgn.trim(),
          p_free_fire_uid: joinUid.trim(),
        })
      if (error) {
        const messages: Record<string, string> = {
          PLAYER_PROFILE_COMPLETION_REQUIRED: 'Complete your verified player profile before joining a team.',
          TEAM_CODE_UNAVAILABLE: 'This code is invalid, expired, used, or cancelled.',
          TEAM_CODE_NOT_FOUND: 'No team has this code. Check it with the captain and try again.',
          TEAM_CODE_EMAIL_MISMATCH: 'This code is restricted to a different verified email address.',
          PLAYER_ALREADY_ON_ACTIVE_TEAM: 'You are already active on another team roster.',
          TEAM_ROSTER_FULL: 'The database is still enforcing the old roster limit. Apply the latest team-code migration and retry.',
          STARTING_LINEUP_FULL: 'The database is still enforcing the old roster limit. Apply the latest team-code migration and retry.',
          SUBSTITUTE_SLOT_FULL: 'The database is still enforcing the old roster limit. Apply the latest team-code migration and retry.',
          INVALID_TEAM_CODE: 'Enter the Team Code exactly as the captain shared it.',
          INVALID_PLAYER_IGN: 'IGN must be 2-32 characters.',
          INVALID_FREE_FIRE_UID: 'Free Fire UID must contain 5-20 digits.',
        }
        const fallback = error.message ?? ''
        setIsError(true)
        setMessage(
          messages[error.message]
            ?? (fallback.toLowerCase().includes('does not exist') || fallback.toLowerCase().includes('function')
              ? 'The Team Code backend is not active in the database yet. Apply the latest team join migration and retry.'
              : 'The Team Code could not be redeemed.')
        )
      } else {
        setMessage('Team Code accepted. You have joined the roster.')
        setJoinCode('')
        setJoinIgn('')
        setJoinUid('')
        await refreshTeam()
        navigate('/dashboard/team', { replace: true })
      }
    } catch {
      setIsError(true)
      setMessage('The Team Code could not be redeemed. Check your connection and try again.')
    } finally {
      setWorkingId(null)
    }
  }

  async function respond(invitationId: string, accept: boolean) {
    if (!client) return
    setWorkingId(invitationId)
    setMessage('')
    setIsError(false)
    const player = credentials[invitationId] ?? { ign: '', uid: '' }
    try {
      const { error } = await client.rpc('respond_to_team_invitation', {
        p_invitation_id: invitationId,
        p_accept: accept,
        p_ign: accept ? player.ign.trim() : null,
        p_free_fire_uid: accept ? player.uid.trim() : null,
      })

      if (error) {
        setIsError(true)
        switch (error.message) {
        case 'PLAYER_ALREADY_ON_ACTIVE_TEAM':
          setMessage('You are already active on another team roster.')
          break
        case 'TEAM_ROSTER_FULL':
        case 'STARTING_LINEUP_FULL':
        case 'SUBSTITUTE_SLOT_FULL':
          setMessage('The reserved roster slot is no longer available. Ask the captain to send a new invitation.')
          break
        case 'INVITATION_UNAVAILABLE':
          setMessage('This invitation is no longer available.')
          break
        case 'INVALID_PLAYER_IGN':
          setMessage('IGN must be 2-32 characters.')
          break
        case 'INVALID_FREE_FIRE_UID':
          setMessage('Free Fire UID must contain 5-20 digits.')
          break
        default:
          setMessage('Your invitation response could not be saved. Please try again.')
        }
      } else {
        setMessage(accept ? 'Invitation accepted. You are now on this roster.' : 'Invitation declined.')
        await refreshTeam()
        if (accept) navigate('/dashboard/team', { replace: true })
      }
    } catch {
      setIsError(true)
      setMessage('Your invitation response could not be saved. Check your connection and try again.')
    } finally {
      setWorkingId(null)
    }
  }

  async function cancelInvitation(invitationId: string) {
    if (!client) return
    setWorkingId(invitationId)
    setMessage('')
    setIsError(false)
    try {
      const { error } = await client.rpc('cancel_team_invitation', { p_invitation_id: invitationId })
      if (error) {
        setIsError(true)
        setMessage('The invitation could not be cancelled. Refresh and try again.')
      } else {
        setMessage('Invitation cancelled.')
        await refreshTeam()
      }
    } catch {
      setIsError(true)
      setMessage('The invitation could not be cancelled. Check your connection and try again.')
    } finally {
      setWorkingId(null)
    }
  }

  const pendingOutgoing = outgoingInvitations.filter((invitation) => invitation.status === 'pending')
  const alreadyOnTeam = Boolean(membership)

  return (
    <div className="team-invitations-page">
      <SectionHeading eyebrow="Team / invitations" title="Roster invitations." description="Join a roster with a captain-issued Team Code or respond to an existing account invitation." />
      {teamError && <p className="team-form-hint" role="status">Team status could not be loaded. You can still submit a code; the server will check whether you are eligible.</p>}
      {message && <p className={isError ? 'team-form-error' : 'team-form-success'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <section className="team-panel team-code-join-panel" aria-labelledby="team-code-join-title">
        <div className="team-panel__heading"><span className="team-feature-icon"><Mail size={18} /></span><div><h2 id="team-code-join-title">Join with Team Code</h2><p>The code is one-time use and may be restricted to your verified email.</p></div></div>
        <form className="team-invite-form" onSubmit={(event) => void joinWithCode(event)}>
          <label className="form-field"><span>Team Code</span><input type="text" required maxLength={36} autoComplete="off" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Paste the code from your captain" /></label>
          <label className="form-field"><span>Your Free Fire IGN</span><input type="text" required minLength={2} maxLength={32} value={joinIgn} onChange={(event) => setJoinIgn(event.target.value)} /></label>
          <label className="form-field"><span>Your Free Fire UID</span><input type="text" required inputMode="numeric" pattern="[0-9]{5,20}" maxLength={20} value={joinUid} onChange={(event) => setJoinUid(event.target.value.replace(/\D/g, ''))} /></label>
          {alreadyOnTeam && <p className="team-form-hint">You can be active on one team at a time. Leave your current roster before joining another.</p>}
          <button className="team-button" type="submit" disabled={workingId === 'team-code' || alreadyOnTeam || !client}>{workingId === 'team-code' ? 'Joining...' : 'Join team'}</button>
        </form>
      </section>
      {incomingInvitations.length > 0 ? (
        <section className="team-invite-list" aria-label="Incoming invitations">
          {incomingInvitations.map((invitation) => {
            const player = credentials[invitation.invitation_id] ?? { ign: '', uid: '' }
            return (
              <article className="team-invitation-card" key={invitation.invitation_id}>
                <TeamLogo path={invitation.logo_path} teamName={invitation.team_name ?? 'Team'} />
                <div className="team-invitation-card__body">
                  <p className="auth-eyebrow">INCOMING / {invitation.role === 'substitute' ? 'SUBSTITUTE' : 'STARTING PLAYER'}</p>
                  <h2>{invitation.team_name}</h2>
                  <p>Sent {new Date(invitation.created_at).toLocaleDateString()}</p>
                  {!alreadyOnTeam && (
                    <div className="team-invitation-card__fields">
                      <label className="form-field"><span>Your Free Fire IGN</span><input type="text" minLength={2} maxLength={32} required value={player.ign} onChange={(event) => setCredentials((current) => ({ ...current, [invitation.invitation_id]: { ...player, ign: event.target.value } }))} /></label>
                      <label className="form-field"><span>Your Free Fire UID</span><input type="text" inputMode="numeric" pattern="[0-9]{5,20}" maxLength={20} required value={player.uid} onChange={(event) => setCredentials((current) => ({ ...current, [invitation.invitation_id]: { ...player, uid: event.target.value } }))} /></label>
                    </div>
                  )}
                  {alreadyOnTeam && <p className="team-form-hint">Leave your current roster before accepting another invitation.</p>}
                  <div className="team-invitation-card__actions">
                    <button className="team-button" type="button" disabled={workingId === invitation.invitation_id || alreadyOnTeam} onClick={() => void respond(invitation.invitation_id, true)}><Check size={15} /> Accept invitation</button>
                    <button className="team-button team-button--secondary" type="button" disabled={workingId === invitation.invitation_id} onClick={() => void respond(invitation.invitation_id, false)}><X size={15} /> Decline</button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      ) : (
        <div className="team-empty-state"><span className="team-feature-icon"><Mail size={21} /></span><h2>No incoming invitations.</h2><p>When a captain invites your registered account, you’ll find it here.</p></div>
      )}

      {membership?.role === 'captain' && team && (
        <section className="team-outgoing-invitations">
          <div className="team-page-title-row"><div><p className="auth-eyebrow">CAPTAIN / SENT INVITATIONS</p><h2>Outgoing invitations.</h2></div><span className="team-count-badge">{pendingOutgoing.length} pending</span></div>
          {pendingOutgoing.length ? pendingOutgoing.map((invitation) => (
            <article className="team-outgoing-row" key={invitation.invitation_id}>
              <div><b>{invitation.invited_user_name || 'Registered player'}</b><span>{invitation.role === 'substitute' ? 'Substitute' : 'Starting player'} · Sent {new Date(invitation.created_at).toLocaleDateString()}</span></div>
              <button className="team-button team-button--secondary" type="button" disabled={workingId === invitation.invitation_id} onClick={() => void cancelInvitation(invitation.invitation_id)}>Cancel invitation</button>
            </article>
          )) : <p className="team-empty-inline">No pending invitations for this team.</p>}
        </section>
      )}
    </div>
  )
}

export default TeamInvitationsPage