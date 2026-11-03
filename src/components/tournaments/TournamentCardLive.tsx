import { CalendarDays, CircleDollarSign, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicTournament } from '../../tournaments/types'
import { formatTournamentDate, formatTournamentMoney } from '../../tournaments/format'
import TournamentBanner from './TournamentBanner'
import TournamentStatusBadge from './TournamentStatusBadge'

function TournamentCardLive({ tournament }: { tournament: PublicTournament }) {
  return (
    <article className="live-tournament-card">
      <Link className="live-tournament-card__media-link" to={`/tournaments/${tournament.slug}`} aria-label={`View ${tournament.name}`}>
        <TournamentBanner path={tournament.banner_path} name={tournament.name} className="live-tournament-card__banner" />
      </Link>
      <div className="live-tournament-card__body">
        <div className="live-tournament-card__topline"><span>{tournament.game_code.replaceAll('_', ' ')}</span><TournamentStatusBadge status={tournament.tournament_status} /></div>
        <h2><Link to={`/tournaments/${tournament.slug}`}>{tournament.name}</Link></h2>
        <p className="live-tournament-card__mode">{tournament.mode_code.replaceAll('_', ' ')} <span>/</span> {tournament.format_code.replaceAll('_', ' ')}</p>
        <div className="live-tournament-card__facts">
          <span><CircleDollarSign size={15} /><b>{formatTournamentMoney(tournament.entry_fee, tournament.entry_type)}</b><small>Entry</small></span>
          <span><span className="live-tournament-card__coin">$</span><b>{formatTournamentMoney(tournament.prize_pool)}</b><small>Prize pool</small></span>
          <span><UsersRound size={15} /><b>{tournament.available_slots} / {tournament.max_teams}</b><small>Available / total teams</small></span>
          <span><CalendarDays size={15} /><b>{formatTournamentDate(tournament.starts_at, tournament.timezone)}</b><small>Tournament date</small></span>
        </div>
        <p className="live-tournament-card__deadline">Registration closes <b>{formatTournamentDate(tournament.registration_closes_at, tournament.timezone, true)}</b></p>
        <p className="live-tournament-card__capacity-note">Pending and approved registrations reserve slots.</p>
        <Link className="live-tournament-card__action" to={`/tournaments/${tournament.slug}`}>View details <span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  )
}

export default TournamentCardLive