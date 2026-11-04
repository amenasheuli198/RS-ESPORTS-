import { Navigate, useParams } from 'react-router-dom'

function TournamentRegistrationComingSoonPage() {
  const { slug } = useParams<{ slug: string }>()
  if (!slug) return <Navigate to="/tournaments" replace />
  return <Navigate to={`/dashboard/team/tournaments?register=${encodeURIComponent(slug)}`} replace />
}

export default TournamentRegistrationComingSoonPage