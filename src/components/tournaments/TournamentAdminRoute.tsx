import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { hasTournamentAdminClaim } from '../../tournaments/adminAccess'

function TournamentAdminRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <main className="tournament-admin-gate" role="status">Checking administrator access...</main>
  if (!user) return <Navigate to="/admin/login" replace />
  if (!hasTournamentAdminClaim(user)) {
    return <Navigate to="/admin/login" replace />
  }
  return <Outlet />
}

export default TournamentAdminRoute