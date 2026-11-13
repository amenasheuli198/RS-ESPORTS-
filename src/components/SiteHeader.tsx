import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import NotificationBell from './notifications/NotificationBell'
import { PlatformEmblem, PrimaryButton } from './ui'

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Tournaments', href: '/tournaments' },
  { label: 'Rankings', href: '/leaderboard' },
  { label: 'Community', href: '/announcements' },
  { label: 'Matches', href: '/matches' },
  { label: 'News', href: '/news' },
  { label: 'Contact', href: '/contact' },
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
        <a className="brand-lockup" href="/" aria-label="Undergraduate E-Sports home" onClick={closeMenu}>
          <span className="brand-lockup__mark"><PlatformEmblem /></span>
          <span className="brand-lockup__name">UNDERGRADUATE <b>E-SPORTS</b></span>
        </a>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navLinks.map((link, index) => (
            <Link key={link.label} to={link.href} onClick={closeMenu} aria-current={index === 0 && window.location.pathname === '/' ? 'page' : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-header__actions">
          {user ? <NotificationBell /> : <>
            <Link className="header-login" to="/login">Login</Link>
            <Link className="header-register" to="/register">Register</Link>
          </>}
          <PrimaryButton href="/tournaments" className="header-explore">Explore tournaments</PrimaryButton>
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
            <Link key={link.label} to={link.href} onClick={closeMenu}>{link.label}</Link>
          ))}
          <div className="mobile-nav__actions">
            {user ? <NotificationBell /> : <>
              <Link className="mobile-nav__auth-link mobile-nav__auth-link--login" to="/login" onClick={closeMenu}>Login</Link>
              <Link className="mobile-nav__auth-link mobile-nav__auth-link--register" to="/register" onClick={closeMenu}>Register</Link>
            </>}
            <PrimaryButton href="/tournaments" onClick={closeMenu}>Explore tournaments</PrimaryButton>
          </div>
        </nav>
      )}
    </header>
  )
}

export default SiteHeader