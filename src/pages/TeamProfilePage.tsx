import { CalendarDays, MapPin, Shield, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTeam } from '../teams/TeamContext'
import TeamLogo from '../components/team/TeamLogo'
import { SectionHeading } from '../components/ui'

function TeamProfilePage() {
  const { team, membership, roster } = useTeam()
  if (!team || !membership) return null
  const captain = roster.find((member) => member.role === 'captain')
  const activeCount = roster.filter((member) => member.status === 'active').length

  return (
    <section className="team-profile-page">
      <SectionHeading eyebrow="Team / public profile" title="Team profile." description="The identity and details your squad brings to the arena." action={membership.role === 'captain' ? <Link className="team-button team-button--secondary" to="/dashboard/team/settings">Edit profile</Link> : undefined} />
      <article className="team-profile-card">
        <TeamLogo path={team.logo_path} teamName={team.name} className="team-profile-card__logo" />
        <div className="team-profile-card__main"><p className="auth-eyebrow">{team.game_code.replaceAll('_', ' ')} / {team.format_code.replaceAll('_', ' ')}</p><h2>{team.name}</h2><p>{team.description || 'No team description has been added.'}</p></div>
      </article>
      <div className="team-profile-facts">
        <article><MapPin size={17} /><span><small>Region</small><b>{team.region || 'Not specified'}</b></span></article>
        <article><Shield size={17} /><span><small>Captain</small><b>{captain?.full_name || 'Team captain'}</b></span></article>
        <article><Users size={17} /><span><small>Active roster</small><b>{activeCount} / 5 players</b></span></article>
        <article><CalendarDays size={17} /><span><small>Created</small><b>{new Date(team.created_at).toLocaleDateString()}</b></span></article>
      </div>
    </section>
  )
}

export default TeamProfilePage