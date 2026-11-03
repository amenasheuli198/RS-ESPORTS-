import { useState } from 'react'
import { Shield, UserRoundMinus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import InviteMemberPanel from '../components/team/InviteMemberPanel'
import { useTeam } from '../teams/TeamContext'
import { SectionHeading } from '../components/ui'

function TeamMembersPage() {
  const { client, user } = useAuth()
  const { team, membership, roster, refreshTeam } = useTeam()
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function removeMember(memberId: string, ign: string) {
    if (!team || !client || !window.confirm(`Remove ${ign} from ${team.name}? This cannot be undone.`)) return
    setRemovingId(memberId)
    setMessage('')
    try {
      const { error } = await client.rpc('remove_team_member', { p_team_id: team.id, p_member_id: memberId })
      if (error) {
        setIsError(true)
        setMessage(error.message === 'TEAM_ACCESS_DENIED' ? 'Only the captain can remove members.' : 'This player could not be removed.')
      } else {
        setIsError(false)
        setMessage(`${ign} was removed from the active roster.`)
        await refreshTeam()
      }
    } catch {
      setIsError(true)
      setMessage('This player could not be removed. Check your connection and try again.')
    } finally {
      setRemovingId(null)
    }
  }

  if (!team || !membership) return null
  const activeMembers = roster.filter((member) => member.status === 'active')
  const captain = membership.role === 'captain'

  return (
    <div className="team-members-page">
      <SectionHeading eyebrow="Team / squad members" title="The lineup." description={`${activeMembers.length} active player${activeMembers.length === 1 ? '' : 's'} on this roster.`} />
      {message && <p className={isError ? 'team-form-error' : 'team-form-success'} role={isError ? 'alert' : 'status'}>{message}</p>}
      <div className="team-members-layout">
        <section className="team-panel" aria-labelledby="roster-title">
          <div className="team-panel__title"><Shield size={18} /><h2 id="roster-title">Active roster</h2><span>{activeMembers.length} / 5</span></div>
          <div className="team-member-cards">
            {activeMembers.map((member) => {
              const isSelf = member.user_id === user?.id
              return (
                <article className="team-member-card" key={member.member_id}>
                  <div className={`team-member-card__avatar${member.role === 'captain' ? ' is-captain' : ''}`}>{member.ign.slice(0, 1).toUpperCase()}</div>
                  <div className="team-member-card__main"><div className="team-member-card__top"><h3>{member.ign}</h3><span className={`team-role-badge${member.role === 'captain' ? ' is-captain' : ''}`}>{member.role === 'captain' ? 'Captain' : member.role === 'substitute' ? 'Substitute' : 'Starting player'}</span><span className="team-member-status">Active</span></div><p>{member.full_name || 'Player'}{isSelf ? ' / You' : ''}</p><small>Free Fire UID <b>{member.free_fire_uid}</b></small></div>
                  {captain && member.role !== 'captain' && <button className="team-icon-button" type="button" aria-label={`Remove ${member.ign}`} title="Remove player" disabled={removingId === member.member_id} onClick={() => void removeMember(member.member_id, member.ign)}><UserRoundMinus size={17} /></button>}
                </article>
              )
            })}
            {activeMembers.length === 0 && <p className="team-empty-inline">No active players yet.</p>}
          </div>
        </section>
        {captain && <InviteMemberPanel />}
      </div>
    </div>
  )
}

export default TeamMembersPage