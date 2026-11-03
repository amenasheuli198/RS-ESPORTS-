import type { TournamentStatus } from '../../tournaments/types'
import { getTournamentStatusClass } from '../../tournaments/format'

function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  return <span className={`tournament-status tournament-status--${getTournamentStatusClass(status)}`}>{status}</span>
}

export default TournamentStatusBadge