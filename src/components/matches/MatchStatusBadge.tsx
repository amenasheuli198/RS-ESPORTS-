import type { MatchStatus } from '../../matches/types'

const labels: Record<MatchStatus, string> = {
  scheduled: 'Scheduled',
  room_ready: 'Room Ready',
  live: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
  delayed: 'Delayed',
}

function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return <span className={`match-status-badge match-status-badge--${status}`}>{labels[status]}</span>
}

export default MatchStatusBadge