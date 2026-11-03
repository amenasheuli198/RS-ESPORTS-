import { useState, type FormEvent } from 'react'
import { MailPlus } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useTeam } from '../../teams/TeamContext'

function InviteMemberPanel() {
  const { client } = useAuth()
  const { team, roster, outgoingInvitations, refreshTeam } = useTeam()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'starting_player' | 'substitute'>('starting_player')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const activeStarters = roster.filter((member) => member.status === 'active' && member.role !== 'substitute').length
  const pendingStarters = outgoingInvitations.filter((invitation) => invitation.status === 'pending' && invitation.role === 'starting_player').length
  const hasSubstitute = roster.some((member) => member.status === 'active' && member.role === 'substitute')
    || outgoingInvitations.some((invitation) => invitation.status === 'pending' && invitation.role === 'substitute')
  const roleUnavailable = role === 'starting_player'
    ? activeStarters + pendingStarters >= 4
    : hasSubstitute

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setIsError(false)
    if (!client || !team || roleUnavailable) {
      setIsError(true)
      setMessage('There is no available roster slot for this role.')
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await client.rpc('invite_team_member', {
        p_team_id: team.id,
        p_email: email.trim(),
        p_role: role,
      })

      if (error) {
        setIsError(true)
        switch (error.message) {
        case 'PLAYER_NOT_FOUND':
        case 'INVALID_EMAIL':
        case 'PLAYER_PROFILE_INCOMPLETE':
          setMessage('Unable to invite that account. Confirm they have a registered RS Esports account and try again.')
          break
        case 'PLAYER_ALREADY_ON_ACTIVE_TEAM':
          setMessage('That player is already active on a team roster.')
          break
        case 'INVITATION_ALREADY_PENDING':
          setMessage('An invitation to that player is already pending.')
          break
        case 'TEAM_ROSTER_FULL':
        case 'STARTING_LINEUP_FULL':
        case 'SUBSTITUTE_SLOT_FULL':
          setMessage('That roster slot has just been filled. Refresh the roster and try again.')
          break
        case 'TEAM_ACCESS_DENIED':
          setMessage('Only the active team captain can invite players.')
          break
        default:
          setMessage('The invitation could not be sent. Please try again.')
        }
      } else {
        setEmail('')
        setMessage('Invitation sent to the registered player account.')
        await refreshTeam()
      }
    } catch {
      setIsError(true)
      setMessage('The invitation could not be sent. Check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="team-panel team-invite-panel" aria-labelledby="invite-member-title">
      <div className="team-panel__heading"><span className="team-feature-icon"><MailPlus aria-hidden="true" size={19} /></span><div><h2 id="invite-member-title">Invite a player</h2><p>Invitations go to existing, verified RS Esports accounts.</p></div></div>
      <form className="team-invite-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="form-field"><span>Player email</span><input type="email" required maxLength={254} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="player@example.com" /></label>
        <label className="form-field"><span>Roster role</span><select value={role} onChange={(event) => setRole(event.target.value as 'starting_player' | 'substitute')}><option value="starting_player">Starting player</option><option value="substitute">Substitute</option></select></label>
        {roleUnavailable && <p className="team-form-hint" role="status">{role === 'substitute' ? 'The substitute slot is full or reserved.' : 'The starting lineup is full or its remaining slots are reserved.'}</p>}
        {message && <p className={isError ? 'team-form-error' : 'team-form-success'} role={isError ? 'alert' : 'status'}>{message}</p>}
        <button className="team-button" type="submit" disabled={isSubmitting || !client || roleUnavailable}>
          {isSubmitting ? <><span className="auth-spinner" aria-hidden="true" /> Sending...</> : 'Send invitation'}
        </button>
      </form>
    </section>
  )
}

export default InviteMemberPanel