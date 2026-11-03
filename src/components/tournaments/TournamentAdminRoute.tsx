import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { hasTournamentAdminClaim } from '../../tournaments/adminAccess'

function TournamentAdminRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <main className="tournament-admin-gate" role="status">Checking administrator access...</main>
  if (!user) return <Navigate to="/login" replace />
  if (!hasTournamentAdminClaim(user)) {
    return <main className="tournament-admin-gate"><h1>Administrator access required.</h1><p>Tournament administration is restricted to authorized platform administrators.</p><a href="/">Return home</a></main>
  }
  return <Outlet />
}

export default TournamentAdminRoute