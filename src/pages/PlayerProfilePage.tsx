import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface PlayerProfileRecord {
  id: string
  username: string | null
  full_name: string | null
  display_name: string | null
  avatar_url: string | null
  free_fire_ign: string | null
  free_fire_uid: string | null
  region: string | null
  bio: string | null
  profile_visibility: 'public' | 'private'
  uid_visibility: 'public' | 'private'
  match_history_visibility: 'public' | 'private'
  created_at: string
  updated_at: string
}

interface PlayerStatRecord {
  user_id: string
  matches_played: number | null
  total_kills: number | null
  total_points: number | null
  wins: number | null
  top_3_finishes: number | null
  top_5_finishes: number | null
  average_placement: number | null
  average_kills_per_match: number | null
  win_rate: number | null
  best_placement: number | null
}

interface PlayerMatchRecord {
  user_id: string
  result_id: string
  match_id: string
  tournament_id: string
  tournament_name: string
  match_number: number
  match_date: string
  team_id: string
  team_name: string
  placement_rank: number
  total_kills: number
  total_points: number
  status: string
  published_at: string | null
}

function PlayerProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { client, user } = useAuth()
  const [profile, setProfile] = useState<PlayerProfileRecord | null>(null)
  const [stats, setStats] = useState<PlayerStatRecord | null>(null)
  const [matchHistory, setMatchHistory] = useState<PlayerMatchRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || !username || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Player profile is unavailable.')
      return () => { active = false }
    }

    const safeClient = client

    async function load() {
      try {
        const profileResult = await safeClient.rpc('get_player_profile', { p_username: username }).maybeSingle()

        if (profileResult.error || !profileResult.data) {
          if (!active) return
          setErrorMessage('Player not found or profile is private.')
          setProfile(null)
          setIsLoading(false)
          return
        }

        const nextProfile = profileResult.data as PlayerProfileRecord
        if (nextProfile.profile_visibility !== 'public' && (!user || nextProfile.id !== user.id)) {
          if (!active) return
          setErrorMessage('This player profile is private.')
          setProfile(null)
          setIsLoading(false)
          return
        }

        setProfile(nextProfile)

        const [statsResult, historyResult] = await Promise.all([
          safeClient.from('player_stats_public').select('*').eq('user_id', nextProfile.id).maybeSingle(),
          safeClient.from('player_match_history_public').select('*').eq('user_id', nextProfile.id).order('match_date', { ascending: false }).limit(20),
        ])

        if (!active) return
        if (statsResult.error) {
          setStats(null)
        } else {
          setStats((statsResult.data ?? null) as PlayerStatRecord | null)
        }

        if (historyResult.error) {
          setMatchHistory([])
        } else {
          setMatchHistory((historyResult.data ?? []) as PlayerMatchRecord[])
        }
      } catch {
        if (!active) return
        setErrorMessage('Player profile could not be loaded.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [client, configurationError, username, user])

  if (isLoading) return <main className="page-width player-profile-page"><p role="status">Loading player profile...</p></main>
  if (errorMessage || !profile) {
    return <main className="page-width player-profile-page"><div className="arena-state"><h1>Player not found.</h1><p>{errorMessage || 'No public player record is available for this username.'}</p><Link className="arena-state__button" to="/leaderboard">Back to leaderboard</Link></div></main>
  }

  const displayName = profile.display_name || profile.full_name || username || 'Player'
  const freeFireUidDisplay = profile.uid_visibility === 'public' ? profile.free_fire_uid : null
  const matchHistoryVisible = profile.match_history_visibility === 'public' || (user && profile.id === user.id)

  return (
    <main className="player-profile-page">
      <div className="page-width player-profile-shell">
        <section className="player-profile-card">
          <div className="player-profile-identity">
            <div className="player-profile-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt={displayName} /> : displayName.slice(0, 1).toUpperCase()}</div>
            <div>
              <p className="section-heading__eyebrow">PLAYER / PROFILE</p>
              <h1>{displayName}</h1>
              <p className="player-profile-username">@{profile.username || username}</p>
            </div>
          </div>
          <div className="player-profile-meta-grid">
            <div><span>Free Fire IGN</span><strong>{profile.free_fire_ign || 'Not shared'}</strong></div>
            <div><span>Free Fire UID</span><strong>{freeFireUidDisplay || 'Private'}</strong></div>
            <div><span>Region</span><strong>{profile.region || 'Unknown'}</strong></div>
            <div><span>Joined</span><strong>{new Date(profile.created_at).toLocaleDateString()}</strong></div>
          </div>
        </section>

        <section className="player-profile-stats">
          <div className="player-stat"><span>Matches played</span><strong>{stats?.matches_played ?? 0}</strong></div>
          <div className="player-stat"><span>Total kills</span><strong>{stats?.total_kills ?? 0}</strong></div>
          <div className="player-stat"><span>Total points</span><strong>{stats?.total_points ?? 0}</strong></div>
          <div className="player-stat"><span>Wins</span><strong>{stats?.wins ?? 0}</strong></div>
          <div className="player-stat"><span>Top 3</span><strong>{stats?.top_3_finishes ?? 0}</strong></div>
          <div className="player-stat"><span>Top 5</span><strong>{stats?.top_5_finishes ?? 0}</strong></div>
          <div className="player-stat"><span>Avg placement</span><strong>{stats?.average_placement ? Number(stats.average_placement).toFixed(1) : '—'}</strong></div>
          <div className="player-stat"><span>Avg kills</span><strong>{stats?.average_kills_per_match ? Number(stats.average_kills_per_match).toFixed(1) : '—'}</strong></div>
          <div className="player-stat"><span>Win rate</span><strong>{stats?.win_rate ? `${Number(stats.win_rate).toFixed(1)}%` : '—'}</strong></div>
          <div className="player-stat"><span>Best placement</span><strong>{stats?.best_placement ? `${stats.best_placement}th` : '—'}</strong></div>
        </section>

        <section className="player-profile-panels">
          <article className="player-profile-panel">
            <h2>Bio</h2>
            <p>{profile.bio || 'This player has not shared a bio yet.'}</p>
          </article>
          <article className="player-profile-panel">
            <h2>Team history</h2>
            <p>Current and previous team membership is available only when the roster data exists in the platform records.</p>
          </article>
        </section>

        <section className="player-profile-panel player-profile-panel--wide">
          <h2>Match history</h2>
          {!matchHistoryVisible ? <p>Player match history is private.</p> : matchHistory.length ? (
            <div className="player-history-table-wrap">
              <table className="player-history-table">
                <thead>
                  <tr>
                    <th>Tournament</th>
                    <th>Match</th>
                    <th>Date</th>
                    <th>Team</th>
                    <th>Placement</th>
                    <th>Kills</th>
                    <th>Points</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {matchHistory.map((match) => (
                    <tr key={match.result_id}>
                      <td>{match.tournament_name}</td>
                      <td>#{match.match_number}</td>
                      <td>{new Date(match.match_date).toLocaleDateString()}</td>
                      <td>{match.team_name}</td>
                      <td>{match.placement_rank}</td>
                      <td>{match.total_kills}</td>
                      <td>{match.total_points}</td>
                      <td>{match.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No published match results are available for this player yet.</p>}
        </section>
      </div>
    </main>
  )
}

export default PlayerProfilePage
