import { CalendarDays, CircleDollarSign, UsersRound } from 'lucide-react'
import type { Tournament } from '../types/homepage'
import MediaFrame from './MediaFrame'
import { PrimaryButton, StatusBadge } from './ui'

interface TournamentCardProps {
  tournament: Tournament
}

function TournamentCard({ tournament }: TournamentCardProps) {
  return (
    <article className="tournament-card">
      <div className="tournament-card__image-wrap">
        <MediaFrame src={tournament.image} alt={tournament.imageAlt} className="tournament-card__image" />
        <StatusBadge status={tournament.status} />
      </div>
      <div className="tournament-card__body">
        <p className="tournament-card__game">{tournament.game}<span />{tournament.mode}</p>
        <h3>{tournament.name}</h3>
        <div className="tournament-card__details">
          <div><CircleDollarSign aria-hidden="true" size={16} /><span><b>{tournament.entryFee}</b><small>Entry</small></span></div>
          <div><span className="tournament-card__coin">$</span><span><b>{tournament.prizePool}</b><small>Prize pool</small></span></div>
          <div><UsersRound aria-hidden="true" size={16} /><span><b>{tournament.slotsAvailable} / {tournament.slotsTotal}</b><small>Slots left</small></span></div>
          <div><CalendarDays aria-hidden="true" size={16} /><span><b>{tournament.matchDate}</b><small>Match date</small></span></div>
        </div>
        <PrimaryButton className="tournament-card__button" href={`/tournaments/${tournament.id}`}>View details</PrimaryButton>
      </div>
    </article>
  )
}

export default TournamentCard