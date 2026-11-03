import { NavLink, Link, Outlet } from 'react-router-dom'
import { BellRing, LayoutDashboard, Megaphone, Settings, ShieldCheck, Swords, Trophy, Users } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

const adminLinks = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Content', path: '/admin/content', icon: Megaphone },
  { label: 'Settings', path: '/admin/settings', icon: Settings },
  { label: 'Tournaments', path: '/admin/tournaments', icon: Trophy },
  { label: 'Matches', path: '/matches', icon: Swords },
  { label: 'Results', path: '/leaderboard', icon: ShieldCheck },
  { label: 'Teams', path: '/teams', icon: Users },
  { label: 'Announcements', path: '/announcements', icon: Megaphone },
  { label: 'Notifications', path: '/dashboard/notifications', icon: BellRing },
]

function TournamentAdminLayout() {
  const { signOut } = useAuth()

  async function handleSignOut() {
    await signOut()
  }

  return (
    <main className="tournament-admin-shell">
      <header className="tournament-admin-header page-width">
        <Link className="brand-lockup" to="/" aria-label="RS Esports home">
          <span className="brand-lockup__mark">RS</span><span className="brand-lockup__name">RS <b>ESPORTS</b></span>
        </Link>
        <nav aria-label="Admin navigation" className="tournament-admin-header__nav">
          {adminLinks.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === '/admin/dashboard'}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
          <button type="button" onClick={handleSignOut}>Sign out</button>
        </nav>
      </header>
      <div className="tournament-admin-content page-width"><Outlet /></div>
    </main>
  )
}

export default TournamentAdminLayout