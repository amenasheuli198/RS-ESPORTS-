import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { BellRing, ClipboardCheck, LayoutDashboard, Megaphone, Settings, ShieldCheck, Swords, Trophy, Users } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { PlatformEmblem } from '../ui'

const primaryLinks = [
  { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Members', path: '/admin/members', icon: Users },
  { label: 'All Teams', path: '/admin/teams', icon: ShieldCheck },
  { label: 'Matches & Tournaments', path: '/admin/tournaments', icon: Trophy },
  { label: 'Pending Registrations', path: '/admin/registrations', icon: ClipboardCheck },
  { label: 'Payments', path: '/admin/payments', icon: ShieldCheck },
  { label: 'Leaderboards', path: '/admin/leaderboards', icon: BellRing },
]

const secondaryLinks = [
  { label: 'Quick Matches', path: '/admin/quick-matches', icon: Swords },
  { label: 'Content', path: '/admin/content', icon: Megaphone },
  { label: 'Settings', path: '/admin/settings', icon: Settings },
]

function TournamentAdminLayout() {
  const { signOut } = useAuth()
  const location = useLocation()
  const currentPage = [...primaryLinks, ...secondaryLinks].find(({ path }) => (
    path === '/admin/dashboard' ? location.pathname === path : location.pathname.startsWith(path)
  ))

  async function handleSignOut() {
    await signOut()
  }

  return (
    <main className="tournament-admin-shell">
      <aside className="tournament-admin-sidebar">
        <Link className="admin-sidebar-brand" to="/" aria-label="Undergraduate E-Sports home"><PlatformEmblem /><span>UNDERGRADUATE <b>E-SPORTS</b></span></Link>
        <p className="admin-sidebar-label">WORKSPACE</p>
        <nav aria-label="Admin navigation" className="admin-sidebar-nav">
          {primaryLinks.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} end={path === '/admin/dashboard'}><Icon size={17} /><span>{label}</span></NavLink>)}
        </nav>
        <p className="admin-sidebar-label admin-sidebar-label--tools">TOOLS</p>
        <nav aria-label="Admin tools" className="admin-sidebar-nav admin-sidebar-nav--secondary">
          {secondaryLinks.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path}><Icon size={16} /><span>{label}</span></NavLink>)}
        </nav>
        <div className="admin-sidebar-footer"><Link to="/">View public site</Link><button type="button" onClick={handleSignOut}>Sign out</button></div>
      </aside>
      <div className="tournament-admin-workspace">
        <header className="admin-topbar"><div><span>ADMINISTRATION</span><strong>{currentPage?.label ?? 'Control panel'}</strong></div><Link to="/">View public site</Link></header>
        <div className="tournament-admin-content"><Outlet /></div>
      </div>
    </main>
  )
}

export default TournamentAdminLayout