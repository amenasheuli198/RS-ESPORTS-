import { CalendarDays, CircleDollarSign, UsersRound } from 'lucide-react'
import type { Tournament } from '../types/homepage'
import MediaFrame from './MediaFrame'
import { PrimaryButton, SectionHeading, StatusBadge } from './ui'

interface FeaturedTournamentProps {
  tournament: Tournament
}

function FeaturedTournament({ tournament }: FeaturedTournamentProps) {
  return (
    <section className="section featured-section" aria-labelledby="featured-heading">
      <div className="page-width">
        <SectionHeading
          eyebrow="In the spotlight"
          title="The featured drop."
          description="One arena. A full squad. Your next shot at the top."
          action={<span className="spotlight-mark"><span /> FEATURED EVENT</span>}
        />
        <article className="featured-tournament">
          <MediaFrame src={tournament.image} alt={tournament.imageAlt} className="featured-tournament__image" />
          <div className="featured-tournament__shade" />
          <div className="featured-tournament__content">
            <div className="featured-tournament__topline">
              <span className="featured-tournament__tag">FEATURED TOURNAMENT</span>
              <StatusBadge status={tournament.status} />
            </div>
            <div className="featured-tournament__title-block">
              <p>{tournament.game} <span /> {tournament.mode}</p>
              <h3 id="featured-heading">{tournament.name}</h3>
            </div>
            <div className="featured-tournament__details">
              <div><CircleDollarSign aria-hidden="true" size={18} /><span><small>Entry fee</small><b>{tournament.entryFee}</b></span></div>
              <div><span className="featured-tournament__coin">$</span><span><small>Prize pool</small><b>{tournament.prizePool}</b></span></div>
              <div><UsersRound aria-hidden="true" size={18} /><span><small>Available slots</small><b>{tournament.slotsAvailable} <i>/ {tournament.slotsTotal}</i></b></span></div>
              <div><CalendarDays aria-hidden="true" size={18} /><span><small>Registration closes</small><b>{tournament.registrationDeadline}</b></span></div>
            </div>
            <div className="featured-tournament__bottom">
              <p>Match day <b>{tournament.matchDate}</b></p>
              <PrimaryButton href={`/tournaments/${tournament.id}`}>View tournament</PrimaryButton>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

export default FeaturedTournament