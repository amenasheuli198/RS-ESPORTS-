import { Swords } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'

function AuthLayout() {
  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link className="brand-lockup" to="/" aria-label="Undergraduate Hub E-Sports home">
          <span className="brand-lockup__mark"><Swords aria-hidden="true" size={20} /></span>
          <span className="brand-lockup__name">UNDERGRADUATE <b>HUB E-SPORTS</b></span>
        </Link>
        <Link className="auth-back-link" to="/">Back to the arena</Link>
      </header>
      <div className="auth-layout__content"><Outlet /></div>
      <footer className="auth-footer">Independent competition. Shared passion.</footer>
    </main>
  )
}

export default AuthLayout