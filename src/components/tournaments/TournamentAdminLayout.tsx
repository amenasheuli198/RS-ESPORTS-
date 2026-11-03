import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

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
        <nav aria-label="Admin navigation"><Link to="/admin/tournaments">Tournament admin</Link><button type="button" onClick={handleSignOut}>Sign out</button></nav>
      </header>
      <div className="tournament-admin-content page-width"><Outlet /></div>
    </main>
  )
}

export default TournamentAdminLayout