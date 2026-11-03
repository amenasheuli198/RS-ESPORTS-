import { ArrowUpRight, Medal } from 'lucide-react'
import { demoLeaderboard } from '../data/homepage'
import { SecondaryButton, SectionHeading } from './ui'

function LeaderboardPreview() {
  return (
    <section className="section leaderboard-section" id="leaderboard" aria-labelledby="leaderboard-heading">
      <div className="page-width">
        <SectionHeading
          eyebrow="The current standings"
          title="Every point counts."
          description="Sample season standings. Published results only shape the real leaderboard."
          id="leaderboard-heading"
          action={<SecondaryButton href="/leaderboard">View full leaderboard</SecondaryButton>}
        />
        <div className="leaderboard" aria-label="Demo leaderboard">
          <table className="leaderboard__table">
            <caption className="visually-hidden">Demo leaderboard standings and match statistics</caption>
            <thead>
              <tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Matches</th><th scope="col">Wins</th><th scope="col">Kills</th><th scope="col">Points</th></tr>
            </thead>
            <tbody>
              {demoLeaderboard.map((entry) => (
                <tr className={entry.rank === 1 ? 'is-first' : ''} key={entry.team}>
                  <td><span className="leaderboard__rank">{entry.rank === 1 ? <Medal aria-label="First place" size={17} /> : `0${entry.rank}`}</span></td>
                  <th scope="row" className="leaderboard__team">{entry.team}</th>
                  <td>{entry.matches}</td><td>{entry.wins}</td><td>{entry.kills}</td>
                  <td className="leaderboard__points">{entry.points}<ArrowUpRight aria-hidden="true" size={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="leaderboard__mobile">
            {demoLeaderboard.map((entry) => (
              <article className={`leaderboard-player${entry.rank === 1 ? ' is-first' : ''}`} key={entry.team}>
                <div className="leaderboard-player__heading">
                  <span className="leaderboard__rank">{entry.rank === 1 ? <Medal aria-label="First place" size={17} /> : `0${entry.rank}`}</span>
                  <h3>{entry.team}</h3>
                  <b className="leaderboard__points">{entry.points} pts</b>
                </div>
                <div className="leaderboard-player__stats">
                  <span><b>{entry.matches}</b> Matches</span>
                  <span><b>{entry.wins}</b> Wins</span>
                  <span><b>{entry.kills}</b> Kills</span>
                </div>
              </article>
            ))}
          </div>
          <p className="demo-note"><span /> SAMPLE LEADERBOARD DATA</p>
        </div>
      </div>
    </section>
  )
}

export default LeaderboardPreview