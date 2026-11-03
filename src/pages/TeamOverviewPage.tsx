import { CalendarDays, Crown, Shield, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTeam } from '../teams/TeamContext'
import TeamLogo from '../components/team/TeamLogo'
import { SectionHeading } from '../components/ui'

function TeamOverviewPage() {
  const { team, membership, roster, outgoingInvitations, error } = useTeam()
  if (!team || !membership) return null

  const activeMembers = roster.filter((member) => member.status === 'active')
  const startingPlayers = activeMembers.filter((member) => member.role !== 'substitute').length
  const substitute = activeMembers.find((member) => member.role === 'substitute')
  const pendingInvitations = outgoingInvitations.filter((invitation) => invitation.status === 'pending').length

  return (
    <div className="team-overview">
      <div className="team-page-title-row">
        <div><p className="auth-eyebrow">TEAM / OVERVIEW</p><h1>Squad briefing.</h1><p>Your lineup at a glance.</p></div>
        {membership.role === 'captain' && <Link className="team-button" to="/dashboard/team/members"><UserPlus size={16} /> Invite players</Link>}
      </div>
      {error && <p className="team-alert" role="alert">{error}</p>}
      <section className="team-overview-hero">
        <TeamLogo path={team.logo_path} teamName={team.name} className="team-overview-hero__logo" />
        <div className="team-overview-hero__identity"><p>{team.game_code.replaceAll('_', ' ')} / {team.format_code.replaceAll('_', ' ')}</p><h2>{team.name}</h2><span><Crown size={13} /> Captain: {roster.find((member) => member.role === 'captain')?.full_name || 'Team captain'}</span></div>
        <div className="team-overview-hero__created"><CalendarDays size={16} /><span><small>Team created</small><b>{new Date(team.created_at).toLocaleDateString()}</b></span></div>
      </section>
      <div className="team-metrics-grid">
        <article className="team-metric"><Users size={18} /><p>ACTIVE PLAYERS</p><strong>{activeMembers.length}<small> / 5</small></strong></article>
        <article className="team-metric"><Shield size={18} /><p>STARTING LINEUP</p><strong>{startingPlayers}<small> / 4</small></strong><span>{startingPlayers === 4 ? 'Complete' : `${4 - startingPlayers} slot${4 - startingPlayers === 1 ? '' : 's'} open`}</span></article>
        <article className="team-metric"><Crown size={18} /><p>SUBSTITUTE</p><strong className="team-metric__text">{substitute ? 'Assigned' : 'Open'}</strong><span>{pendingInvitations && !substitute ? 'A slot may be reserved' : 'Optional roster slot'}</span></article>
      </div>
      <section className="team-panel team-overview-roster">
        <SectionHeading eyebrow="The active lineup" title="Your squad." action={<Link className="team-text-link" to="/dashboard/team/members">Manage roster <span>↗</span></Link>} />
        {activeMembers.length ? (
          <div className="team-roster-list">
            {activeMembers.map((member) => (
              <article className="team-roster-row" key={member.member_id}>
                <span className={`team-roster-row__slot${member.role === 'captain' ? ' is-captain' : ''}`}>{member.slot.toString().padStart(2, '0')}</span>
                <div className="team-roster-row__identity"><b>{member.ign}</b><span>{member.full_name || 'Player'}</span></div>
                <span className={`team-role-badge${member.role === 'captain' ? ' is-captain' : ''}`}>{member.role === 'captain' ? 'Captain' : member.role === 'substitute' ? 'Substitute' : 'Starting player'}</span>
              </article>
            ))}
          </div>
        ) : <p className="team-empty-inline">No active players yet.</p>}
      </section>
      {pendingInvitations > 0 && <p className="team-overview-notice">{pendingInvitations} roster invitation{pendingInvitations === 1 ? '' : 's'} pending. <Link to="/dashboard/team/invitations">Review invitations</Link></p>}
    </div>
  )
}

export default TeamOverviewPage