import { ArrowRight, Banknote, Gamepad2, ShieldCheck, Swords, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'

const plannedGames = [
  { name: 'Garena Free Fire', format: 'Team entries', accent: 'free-fire' },
  { name: 'PUBG', format: 'Configurable squads', accent: 'pubg' },
  { name: 'Chess', format: 'Individual entries', accent: 'chess' },
]

function QuickMatchesPage() {
  return (
    <>
      <SiteHeader />
      <main className="quick-matches-page">
        <section className="quick-matches-intro page-width" aria-labelledby="quick-matches-title">
          <div className="quick-matches-intro__copy">
            <p className="section-heading__eyebrow">UNDERGRADUATE HUB / OPEN PLAY</p>
            <h1 id="quick-matches-title">Quick Matches.</h1>
            <p>Standalone competitions with their own entry, lobby, and result flow. No tournament bracket required.</p>
            <div className="quick-matches-intro__actions">
              <Link className="arena-state__button" to="/tournaments">Browse tournaments <ArrowRight size={16} /></Link>
              <Link className="quick-matches-text-link" to="/matches">Tournament schedule</Link>
            </div>
          </div>
          <div className="quick-matches-intro__mark" aria-hidden="true"><Swords size={36} /><span>OPEN<br />QUEUE</span></div>
        </section>

        <section className="quick-matches-status page-width" aria-labelledby="quick-matches-status-title">
          <div className="quick-matches-status__heading">
            <div><p className="section-heading__eyebrow">MATCH QUEUE</p><h2 id="quick-matches-status-title">Standalone events are not connected yet.</h2></div>
            <span className="quick-matches-status__badge"><i /> Awaiting backend support</span>
          </div>
          <p className="quick-matches-status__message">The current match service only lists tournament matches. Quick Match creation, registration, payment verification, room access, and results need the shared competition backend before events can be published here.</p>
          <div className="quick-matches-flow" aria-label="Planned Quick Match operations">
            <div><UsersRound size={18} /><span>Team or player entry</span></div>
            <div><Banknote size={18} /><span>Free or bKash payment</span></div>
            <div><ShieldCheck size={18} /><span>Admin verification</span></div>
            <div><Gamepad2 size={18} /><span>Room and results</span></div>
          </div>
        </section>

        <section className="quick-matches-games page-width" aria-labelledby="quick-matches-games-title">
          <div className="quick-matches-games__heading"><div><p className="section-heading__eyebrow">GAME FORMATS</p><h2 id="quick-matches-games-title">One queue, different rules.</h2></div><span>03 GAMES</span></div>
          <div className="quick-matches-game-list">
            {plannedGames.map((game, index) => (
              <article className={`quick-matches-game quick-matches-game--${game.accent}`} key={game.name}>
                <span className="quick-matches-game__index">0{index + 1}</span>
                <div><h3>{game.name}</h3><p>{game.format}</p></div>
                <span className="quick-matches-game__status">Planned</span>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

export default QuickMatchesPage
