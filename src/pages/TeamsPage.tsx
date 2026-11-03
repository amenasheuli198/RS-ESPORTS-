import { ArrowRight, Mail, Shield, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import TeamLogo from '../components/team/TeamLogo'
import TeamPageHeader from '../components/team/TeamPageHeader'
import { useTeam } from '../teams/TeamContext'

function TeamsPage() {
  const { user } = useAuth()
  const { team, incomingInvitations, isLoading, error, refreshTeam } = useTeam()

  return (
    <main className="team-app team-index-page">
      <TeamPageHeader />
      <div className="team-index-content page-width">
        <div className="team-index-heading">
          <div><p className="auth-eyebrow">YOUR SQUAD / TEAM MANAGEMENT</p><h1>Teams &amp; squad</h1><p>Manage your Free Fire lineup and invitations.</p></div>
          {team && <Link className="team-button" to="/dashboard/team">Open team workspace <ArrowRight size={16} /></Link>}
        </div>

        {error && <div className="team-alert" role="alert">{error}<button type="button" onClick={() => void refreshTeam()}>Retry</button></div>}
        {isLoading ? <div className="team-loading" role="status"><span className="auth-spinner" aria-hidden="true" /> Loading your teams...</div> : (
          <div className="team-index-grid">
            {team ? (
              <article className="team-index-card">
                <TeamLogo path={team.logo_path} teamName={team.name} />
                <div><p className="team-index-card__label">YOUR ACTIVE TEAM</p><h2>{team.name}</h2><p>{team.region || 'Region not set'} <span>/</span> Created {new Date(team.created_at).toLocaleDateString()}</p></div>
                <Link to="/dashboard/team" aria-label={`Open ${team.name} team workspace`}><ArrowRight size={18} /></Link>
              </article>
            ) : (
              <section className="team-create-prompt">
                <span className="team-feature-icon"><Users aria-hidden="true" size={21} /></span>
                <p className="auth-eyebrow">NO ACTIVE SQUAD</p>
                <h2>Bring your team together.</h2>
                <p>Create a team to start building your starting lineup. You’ll be added as its captain and first player.</p>
                <Link className="team-button" to="/teams/create">Create a team <ArrowRight size={16} /></Link>
              </section>
            )}

            <section className="team-invite-summary">
              <div className="team-invite-summary__top"><span className="team-feature-icon"><Mail aria-hidden="true" size={20} /></span><span className="team-invite-summary__count">{incomingInvitations.length.toString().padStart(2, '0')}</span></div>
              <p className="auth-eyebrow">TEAM INVITATIONS</p>
              <h2>{incomingInvitations.length ? 'You’re wanted on a roster.' : 'No pending invitations.'}</h2>
              <p>{incomingInvitations.length ? 'Review invitations sent to your registered account.' : 'When a captain invites your account, it will appear here.'}</p>
              <Link className="team-text-link" to="/dashboard/team/invitations">Review invitations <ArrowRight size={14} /></Link>
            </section>

            <section className="team-guidance">
              <Shield aria-hidden="true" size={20} />
              <div><h2>One player, one active team.</h2><p>Your account can be active on one team roster at a time. Invitation acceptance is confirmed by you and checked again by the database.</p></div>
            </section>
          </div>
        )}
        <p className="team-account-hint">Signed in as {user?.email}</p>
      </div>
    </main>
  )
}

export default TeamsPage