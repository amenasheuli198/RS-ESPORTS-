import { useState } from 'react'
import { Menu, Swords, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import NotificationBell from './notifications/NotificationBell'
import { PrimaryButton } from './ui'

const navLinks = [
  { label: 'Home', href: '#top' },
  { label: 'Tournaments', href: '/tournaments' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Match Schedule', href: '/matches' },
  { label: 'News', href: '/announcements' },
  { label: 'My Team', href: '/teams' },
]

function SiteHeader() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <header className="site-header">
      <div className="site-header__inner page-width">
        <a className="brand-lockup" href="#top" aria-label="RS Esports home" onClick={closeMenu}>
          <span className="brand-lockup__mark"><Swords aria-hidden="true" size={20} /></span>
          <span className="brand-lockup__name">RS <b>ESPORTS</b></span>
        </a>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navLinks.map((link, index) => (
            <a key={link.label} href={link.href} aria-current={index === 0 ? 'page' : undefined}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="site-header__actions">
          {user ? <NotificationBell /> : <>
            <a className="header-login" href="/login">Login</a>
            <a className="header-register" href="/register">Register</a>
          </>}
          <PrimaryButton href="#tournaments" className="header-explore">Explore tournaments</PrimaryButton>
        </div>

        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} onClick={closeMenu}>{link.label}</a>
          ))}
          <div className="mobile-nav__actions">
            {user ? <NotificationBell /> : <>
              <a href="/login" onClick={closeMenu}>Login</a>
              <a href="/register" onClick={closeMenu}>Register</a>
            </>}
            <PrimaryButton href="#tournaments" onClick={closeMenu}>Explore tournaments</PrimaryButton>
          </div>
        </nav>
      )}
    </header>
  )
}

export default SiteHeader