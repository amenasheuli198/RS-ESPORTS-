export type TournamentStatus = 'Registration Open' | 'Upcoming' | 'Completed'

export type TournamentFilter = 'All' | TournamentStatus

export interface Tournament {
  id: string
  name: string
  game: string
  mode: string
  entryFee: string
  prizePool: string
  slotsTotal: number
  slotsAvailable: number
  matchDate: string
  registrationDeadline: string
  status: TournamentStatus
  image: string
  imageAlt: string
}

export interface PlatformStatistic {
  value: string
  label: string
}

export interface LeaderboardEntry {
  rank: number
  team: string
  matches: number
  wins: number
  kills: number
  points: number
}

export interface Announcement {
  id: string
  category: string
  title: string
  publishedAt: string
  summary: string
  image: string
  imageAlt: string
  href: string
}