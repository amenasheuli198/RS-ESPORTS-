import { Medal } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface LeaderboardRow {
  rank: number
  team_id: string
  team_name: string
  tournament_name?: string
  tournament_slug?: string
  tournaments?: string[]
  tournaments_played?: number
  matches_played: number
  first_place_finishes: number
  total_kills: number
  placement_points: number
  kill_points: number
  total_points: number
  highest_placement?: number
}

function LeaderboardTable({ rows, showTournament = false }: { rows: LeaderboardRow[]; showTournament?: boolean }) {
  return (
    <div className="results-table-wrap">
      <table className="results-table">
        <caption className="visually-hidden">Published tournament standings</caption>
        <thead><tr><th scope="col">Rank</th><th scope="col">Team</th>{showTournament && <th scope="col">Tournament</th>}<th scope="col">Matches</th><th scope="col">Wins</th><th scope="col">Kills</th><th scope="col">Placement</th><th scope="col">Kill pts</th><th scope="col">Points</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.team_id}-${row.tournament_slug ?? 'global'}`} className={row.rank <= 3 ? `is-top-${row.rank}` : ''}>
          <td><span className={`results-rank${row.rank <= 3 ? ` results-rank--${row.rank}` : ''}`}>{row.rank === 1 ? <Medal size={16} aria-label="First place" /> : row.rank}</span></td>
          <th scope="row">{row.team_name}</th>
          {showTournament && <td>{row.tournament_slug ? <Link to={`/tournaments/${row.tournament_slug}`}>{row.tournament_name}</Link> : row.tournaments?.join(', ') || `${row.tournaments_played ?? 0} tournaments`}</td>}
          <td>{row.matches_played}</td><td>{row.first_place_finishes}</td><td>{row.total_kills}</td><td>{Number(row.placement_points).toFixed(2)}</td><td>{Number(row.kill_points).toFixed(2)}</td><td className="results-total-points">{Number(row.total_points).toFixed(2)}</td>
        </tr>)}</tbody>
      </table>
      <div className="results-mobile-list">{rows.map((row) => <article key={`${row.team_id}-${row.tournament_slug ?? 'global'}`} className={`results-mobile-card${row.rank <= 3 ? ` is-top-${row.rank}` : ''}`}>
        <div className="results-mobile-card__heading"><span className={`results-rank${row.rank <= 3 ? ` results-rank--${row.rank}` : ''}`}>{row.rank === 1 ? <Medal size={16} aria-label="First place" /> : row.rank}</span><div><h3>{row.team_name}</h3>{showTournament && <small>{row.tournament_name ?? row.tournaments?.join(', ')}</small>}</div><b className="results-total-points">{Number(row.total_points).toFixed(2)}<small> pts</small></b></div>
        <div className="results-mobile-card__stats"><span><b>{row.matches_played}</b> Matches</span><span><b>{row.first_place_finishes}</b> Wins</span><span><b>{row.total_kills}</b> Kills</span><span><b>{Number(row.placement_points).toFixed(2)}</b> Placement</span><span><b>{Number(row.kill_points).toFixed(2)}</b> Kill pts</span></div>
      </article>)}</div>
    </div>
  )
}

export default LeaderboardTable