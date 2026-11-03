import { useState } from 'react'
import { Award, CalendarRange, LayoutDashboard, Mail, Menu, Settings, Shield, Users, X } from 'lucide-react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTeam } from '../../teams/TeamContext'
import TeamLogo from './TeamLogo'
import TeamPageHeader from './TeamPageHeader'

const dashboardLinks = [
  { label: 'Overview', path: '/dashboard/team', icon: LayoutDashboard, end: true },
  { label: 'Team profile', path: '/dashboard/team/profile', icon: Shield, end: false },
  { label: 'Squad members', path: '/dashboard/team/members', icon: Users, end: false },
  { label: 'Tournaments', path: '/dashboard/team/tournaments', icon: CalendarRange, end: false },
  { label: 'Matches', path: '/dashboard/team/matches', icon: CalendarRange, end: false },
  { label: 'Results', path: '/dashboard/team/results', icon: Award, end: false },
  { label: 'Invitations', path: '/dashboard/team/invitations', icon: Mail, end: false },
  { label: 'Settings', path: '/dashboard/team/settings', icon: Settings, end: false },
]

function TeamDashboardLayout() {
  const { team, isLoading, error, refreshTeam } = useTeam()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const isInvitationPage = location.pathname === '/dashboard/team/invitations'
  const routeNotice = (location.state as { notice?: unknown } | null)?.notice

  if (isLoading) {
    return <main className="team-loading" role="status"><span className="auth-spinner" aria-hidden="true" /> Loading team workspace...</main>
  }

  if (error) {
    return <main className="team-empty-state page-width" role="alert"><h1>Team workspace unavailable.</h1><p>{error}</p><button className="team-button team-button--secondary" onClick={() => void refreshTeam()} type="button">Try again</button></main>
  }

  if (!team && !isInvitationPage) return <Navigate to="/teams" replace state={{ from: location.pathname }} />

  return (
    <div className="team-app">
      <TeamPageHeader />
      <div className="team-dashboard page-width">
        <div className="team-mobile-heading">
          <div className="team-identity">
            <TeamLogo path={team?.logo_path} teamName={team?.name ?? 'Invitations'} />
            <div><p>{team ? 'TEAM WORKSPACE' : 'PLAYER INBOX'}</p><h1>{team?.name ?? 'Invitations'}</h1></div>
          </div>
          <button className="team-menu-toggle" type="button" aria-label={menuOpen ? 'Close team navigation' : 'Open team navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <aside className={`team-sidebar${menuOpen ? ' is-open' : ''}`}>
          <div className="team-sidebar__identity">
            <TeamLogo path={team?.logo_path} teamName={team?.name ?? 'Invitations'} />
            <div><p>{team ? 'TEAM WORKSPACE' : 'PLAYER INBOX'}</p><h1>{team?.name ?? 'Invitations'}</h1></div>
          </div>
          <nav aria-label="Team dashboard navigation">
            {dashboardLinks.filter(({ path }) => team || path === '/dashboard/team/invitations').map(({ label, path, icon: Icon, end }) => (
              <NavLink key={path} to={path} end={end} onClick={() => setMenuOpen(false)}>
                <Icon aria-hidden="true" size={17} strokeWidth={1.7} />{label}
              </NavLink>
            ))}
          </nav>
          <Link className="team-sidebar__browse" to="/teams">All teams <span>↗</span></Link>
        </aside>
        <div className="team-dashboard__content">
          {typeof routeNotice === 'string' && <p className="team-form-hint team-route-notice" role="status">{routeNotice}</p>}
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default TeamDashboardLayout