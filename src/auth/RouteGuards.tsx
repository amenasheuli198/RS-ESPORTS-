import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

function AuthLoading() {
  return (
    <main className="auth-loading" role="status" aria-live="polite">
      <span className="auth-spinner" aria-hidden="true" />
      <p>Restoring your session</p>
    </main>
  )
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <AuthLoading />
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  return <Outlet />
}

export function GuestRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <AuthLoading />
  if (user) return <Navigate to="/account" replace />
  return <Outlet />
}