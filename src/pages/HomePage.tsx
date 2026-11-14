import { useEffect, useState } from 'react'
import HeroSection from '../components/HeroSection'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import { PrimaryButton } from '../components/ui'
import { ArrowRight, CalendarDays, ChartNoAxesColumnIncreasing, Coins, Gift, Trophy, UsersRound } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'

const platformFeatures = [
  { title: 'Competitive tournaments', description: 'Enter events and prove your skills.', icon: Trophy },
  { title: 'Active community', description: 'Find teammates and build your squad.', icon: UsersRound },
  { title: 'Live rankings', description: 'Track standings and player performance.', icon: ChartNoAxesColumnIncreasing },
  { title: 'Rewards & recognition', description: 'Celebrate verified results and rewards.', icon: Gift },
]

interface HomepageCompetition {
  competition_id: string
  competition_type: 'tournament' | 'quick_match'
  legacy_tournament_id: string | null
  title: string
  slug: string
  description: string
  game_code: string
  game_name: string
  format_code: string
  format_name: string
  entry_type: 'free' | 'paid'
  entry_fee: number
  currency: string
  capacity: number
  registered_count: number
  registration_opens_at: string
  registration_closes_at: string
  starts_at: string
  timezone: string
  status: string
  display_status: string
  banner_path: string | null
}

function getCompetitionStatusLabel(item: HomepageCompetition): string {
  if (item.display_status) return item.display_status
  return item.status === 'published' ? 'Registration Open' : item.status
}

function HomePage() {
  const { client } = useAuth()
  const [competitions, setCompetitions] = useState<HomepageCompetition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true

    async function loadCompetitions() {
      if (!client) {
        if (active) {
          setCompetitions([])
          setIsLoading(false)
        }
        return
      }

      try {
        const { data, error } = await client.rpc('get_homepage_competitions')
        if (!active) return

        if (error) {
          setErrorMessage('Homepage competition data could not be loaded.')
          setCompetitions([])
        } else {
          setCompetitions((data ?? []) as HomepageCompetition[])
          setErrorMessage('')
        }
      } catch {
        if (!active) return
        setErrorMessage('Homepage competition data could not be loaded.')
        setCompetitions([])
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadCompetitions()
    return () => { active = false }
  }, [client])

  const visibleTournaments = competitions.filter((item) => {
    const status = getCompetitionStatusLabel(item)
    return item.competition_type === 'tournament'
      && ['Registration Open', 'Registration Closing Soon', 'Upcoming'].includes(status)
  }).slice(0, 4)
  const featuredTournament = visibleTournaments[0]
  const sideTournaments = visibleTournaments.slice(1)

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="homepage-reference">
        <SiteHeader />
        <main id="main-content">
        <HeroSection />
          <section className="home-showcase" id="tournaments" aria-labelledby="home-showcase-title">
            <div className="page-width">
              <div className="home-showcase__heading">
                <h2 id="home-showcase-title">Upcoming <em>tournaments</em></h2>
                <PrimaryButton href="/tournaments" className="home-showcase__all">View all tournaments <ArrowRight size={15} /></PrimaryButton>
              </div>
              {isLoading ? (
                <p className="home-showcase__message" role="status">Loading upcoming tournaments...</p>
              ) : errorMessage ? (
                <p className="home-showcase__message" role="status">{errorMessage}</p>
              ) : featuredTournament ? (
                <div className={`home-showcase__grid${sideTournaments.length ? '' : ' is-solo'}`}>
                  <article className="home-featured-event">
                    <img src={featuredTournament.banner_path ?? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=900&q=85'} alt="" />
                    <div className="home-featured-event__content">
                      <span className="home-event-status"><i />{getCompetitionStatusLabel(featuredTournament)}</span>
                      <p>{featuredTournament.game_name} <i /> {featuredTournament.format_name}</p>
                      <h3>{featuredTournament.title}</h3>
                      {featuredTournament.description && <p className="home-featured-event__description">{featuredTournament.description}</p>}
                      <div className="home-event-meta">
                        <span><CalendarDays size={14} />{formatTournamentDate(featuredTournament.starts_at, featuredTournament.timezone, true)}</span>
                        <span><UsersRound size={14} />{featuredTournament.registered_count} / {featuredTournament.capacity}</span>
                        <span><Coins size={14} />{formatTournamentMoney(featuredTournament.entry_fee, featuredTournament.entry_type, featuredTournament.currency)}</span>
                      </div>
                      <PrimaryButton href={featuredTournament.slug ? `/tournaments/${featuredTournament.slug}` : '/tournaments'}>Register now <ArrowRight size={15} /></PrimaryButton>
                    </div>
                  </article>
                  {sideTournaments.length > 0 && <div className="home-side-events" aria-label="More upcoming tournaments">
                    {sideTournaments.map((tournament) => (
                      <a className="home-side-event" href={tournament.slug ? `/tournaments/${tournament.slug}` : '/tournaments'} key={tournament.competition_id}>
                        <img src={tournament.banner_path ?? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=500&q=75'} alt="" />
                        <span><b>{tournament.title}</b><small>{tournament.game_name} · {formatTournamentDate(tournament.starts_at, tournament.timezone, true)}</small></span>
                        <ArrowRight size={16} />
                      </a>
                    ))}
                  </div>}
                </div>
              ) : (
                <p className="home-showcase__message">No upcoming tournaments are published yet.</p>
              )}
            </div>
          </section>
          <section className="home-benefits" aria-label="Platform benefits">
            <div className="page-width home-benefits__grid">
              {platformFeatures.map((feature) => {
                const Icon = feature.icon
                return <article className="home-benefit" key={feature.title}><Icon aria-hidden="true" size={24} /><span><b>{feature.title}</b><small>{feature.description}</small></span></article>
              })}
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </>
  )
}

export default HomePage