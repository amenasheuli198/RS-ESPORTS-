import { useEffect, useState } from 'react'
import AnnouncementCard from '../components/AnnouncementCard'
import HeroSection from '../components/HeroSection'
import LeaderboardPreview from '../components/LeaderboardPreview'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import StatisticsSection from '../components/StatisticsSection'
import TournamentFilters from '../components/TournamentFilters'
import { PrimaryButton, SectionHeading } from '../components/ui'
import { demoAnnouncements } from '../data/homepage'
import type { TournamentFilter } from '../types/homepage'
import { ArrowDownRight, Award, CalendarDays, Check, ChevronRight, Crosshair, Flag, Gamepad2, Medal, Trophy, UsersRound } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'

const steps = [
  { number: '01', title: 'Create your account', description: 'Set up your player profile and get ready to compete.', icon: Flag },
  { number: '02', title: 'Build your team', description: 'Bring your squad together with four starting players.', icon: UsersRound },
  { number: '03', title: 'Register for a tournament', description: 'Choose your event, review the rules, and enter as a team.', icon: Check },
  { number: '04', title: 'Enter the arena', description: 'Check the schedule, join your lobby, and play your game.', icon: ChevronRight },
]

const supportedGames = [
  { name: 'Free Fire', icon: Gamepad2 },
  { name: 'PUBG', icon: Crosshair },
  { name: 'Chess', icon: Trophy },
]

const platformFeatures = [
  { title: 'Competitive tournaments', description: 'Find events, enter competitions, and prove your skills.', icon: Trophy },
  { title: 'Live rankings', description: 'Follow standings, points, and player or team performance.', icon: Medal },
  { title: 'Active community', description: 'Meet teammates, build a squad, and follow arena updates.', icon: UsersRound },
  { title: 'Rewards & recognition', description: 'Celebrate placements and rewards only when they are verified.', icon: Award },
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
  banner_path: string | null
}

function HomePage() {
  const { client } = useAuth()
  const [activeFilter, setActiveFilter] = useState<TournamentFilter>('All')
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

  const visibleTournaments = competitions.filter((item) => item.competition_type === 'tournament' && (activeFilter === 'All' || item.status === activeFilter))
  const visibleQuickMatches = competitions.filter((item) => item.competition_type === 'quick_match')

  useEffect(() => {
    const revealElements = Array.from(document.querySelectorAll<HTMLElement>('[data-home-reveal]'))
    if (revealElements.length === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      revealElements.forEach((element) => element.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          currentObserver.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' })

    revealElements.forEach((element) => {
      element.classList.add('home-reveal-pending')
      observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <HeroSection />
        <StatisticsSection />

        <section className="section tournaments-section" id="tournaments" aria-labelledby="tournaments-heading" data-home-reveal>
          <div className="page-width">
            <SectionHeading
              eyebrow="Arena schedule"
              title="Upcoming tournaments"
              description="Verified tournaments will appear here once they are published from the admin dashboard."
              id="tournaments-heading"
              action={<span className="section-count">{visibleTournaments.length.toString().padStart(2, '0')} <i>EVENTS</i></span>}
            />
            <div className="tournaments-toolbar">
              <TournamentFilters activeFilter={activeFilter} onChange={setActiveFilter} />
              <span className="demo-note"><span /> OFFICIAL EVENTS ONLY</span>
            </div>
            {isLoading ? (
              <div className="empty-state" role="status"><ArrowDownRight aria-hidden="true" size={24} /><h3>Loading competitions…</h3><p>Fetching published tournaments and quick matches.</p></div>
            ) : errorMessage ? (
              <div className="empty-state" role="status"><ArrowDownRight aria-hidden="true" size={24} /><h3>Competitions unavailable</h3><p>{errorMessage}</p></div>
            ) : visibleTournaments.length > 0 ? (
              <div className="tournament-grid" aria-live="polite" aria-relevant="additions removals">
                {visibleTournaments.map((tournament) => (
                  <article className="tournament-card" key={tournament.competition_id}>
                    <div className="tournament-card__image-wrap">
                      <img src={tournament.banner_path ?? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'} alt={tournament.title} className="tournament-card__image" />
                      <span className="status-badge status-badge--live">{tournament.status}</span>
                    </div>
                    <div className="tournament-card__body">
                      <p className="tournament-card__game">{tournament.game_name}<span />{tournament.format_name}</p>
                      <h3>{tournament.title}</h3>
                      <div className="tournament-card__details">
                        <div><span className="tournament-card__coin">৳</span><span><b>{formatTournamentMoney(tournament.entry_fee, tournament.entry_type, tournament.currency)}</b><small>Entry</small></span></div>
                        <div><UsersRound aria-hidden="true" size={16} /><span><b>{tournament.registered_count} / {tournament.capacity}</b><small>Registered</small></span></div>
                        <div><CalendarDays aria-hidden="true" size={16} /><span><b>{formatTournamentDate(tournament.starts_at, tournament.timezone, true)}</b><small>Starts</small></span></div>
                      </div>
                      <PrimaryButton className="tournament-card__button" href={tournament.slug ? `/tournaments/${tournament.slug}` : '/tournaments'}>View details</PrimaryButton>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state" role="status">
                <ArrowDownRight aria-hidden="true" size={24} />
                <h3>No events are published yet</h3>
                <p>Create a tournament in the admin dashboard and it will show up here automatically.</p>
              </div>
            )}
          </div>
        </section>

        <section className="section games-section" aria-labelledby="games-heading" data-home-reveal>
          <div className="page-width">
            <SectionHeading
              eyebrow="Officially supported titles"
              title="Choose your battle"
              description="Explore competitions by game. Event details appear only after they are published."
              id="games-heading"
            />
            <div className="games-grid">
              {supportedGames.map((game) => {
                const Icon = game.icon
                const eventCount = competitions.filter((competition) => competition.game_name.toLowerCase().includes(game.name.toLowerCase())).length
                return (
                  <a className="game-tile" href="#tournaments" key={game.name} data-home-reveal>
                    <span className="game-tile__icon"><Icon aria-hidden="true" size={24} /></span>
                    <span className="game-tile__body"><b>{game.name}</b><small>{eventCount} published events</small></span>
                    <ArrowDownRight aria-hidden="true" size={18} />
                  </a>
                )
              })}
            </div>
          </div>
        </section>

        <section className="section features-section" aria-labelledby="features-heading" data-home-reveal>
          <div className="page-width">
            <SectionHeading
              eyebrow="Built for every competitor"
              title="Your arena. Your next move."
              description="Everything you need to compete, track progress, and find your people."
              id="features-heading"
            />
            <div className="features-grid">
              {platformFeatures.map((feature) => {
                const Icon = feature.icon
                return (
                  <article className="feature-tile" key={feature.title} data-home-reveal>
                    <Icon aria-hidden="true" size={23} />
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="section how-section" aria-labelledby="how-heading" data-home-reveal>
          <div className="page-width">
            <SectionHeading
              eyebrow="Your path to the lobby"
              title="Four steps. One squad."
              description="A clear path from first signup to your first match."
              id="how-heading"
              action={<span className="how-section__aside">READY WHEN YOU ARE <span>↘</span></span>}
            />
            <ol className="steps-grid">
              {steps.map((step, index) => {
                const Icon = step.icon
                return (
                  <li className="step-card" key={step.number} data-home-reveal>
                    <div className="step-card__top"><span>{step.number}</span><Icon aria-hidden="true" size={22} strokeWidth={1.6} /></div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {index < steps.length - 1 && <span className="step-card__connector" aria-hidden="true" />}
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        <section className="section" aria-labelledby="quick-matches-heading" data-home-reveal>
          <div className="page-width">
            <SectionHeading
              eyebrow="Quick play"
              title="Quick matches"
              description="Standalone matches with their own entry, schedule, and assignment flow."
              id="quick-matches-heading"
            />
            {visibleQuickMatches.length > 0 ? (
              <div className="tournament-grid">
                {visibleQuickMatches.map((match) => (
                  <article className="tournament-card" key={match.competition_id}>
                    <div className="tournament-card__image-wrap">
                      <img src={match.banner_path ?? 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'} alt={match.title} className="tournament-card__image" />
                      <span className="status-badge status-badge--live">{match.status}</span>
                    </div>
                    <div className="tournament-card__body">
                      <p className="tournament-card__game">{match.game_name}<span />{match.format_name}</p>
                      <h3>{match.title}</h3>
                      <div className="tournament-card__details">
                        <div><span className="tournament-card__coin">৳</span><span><b>{formatTournamentMoney(match.entry_fee, match.entry_type, match.currency)}</b><small>Entry</small></span></div>
                        <div><UsersRound aria-hidden="true" size={16} /><span><b>{match.registered_count} / {match.capacity}</b><small>Players</small></span></div>
                        <div><CalendarDays aria-hidden="true" size={16} /><span><b>{formatTournamentDate(match.starts_at, match.timezone, true)}</b><small>Start</small></span></div>
                      </div>
                      <PrimaryButton className="tournament-card__button" href="/quick-matches">View details</PrimaryButton>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state" role="status"><ArrowDownRight aria-hidden="true" size={24} /><h3>No quick matches published yet</h3><p>Published quick matches will appear here automatically.</p></div>
            )}
          </div>
        </section>

        <LeaderboardPreview />

        <section className="section news-section" id="news" aria-labelledby="news-heading" data-home-reveal>
          <div className="page-width">
            <SectionHeading
              eyebrow="From the arena"
              title="Latest updates"
              description="News and announcements will appear here once your first content post is published."
              id="news-heading"
              action={<a className="text-link news-section__all" href="/news">All news <ArrowDownRight aria-hidden="true" size={16} /></a>}
            />
            <div className="news-grid">
              {demoAnnouncements.length > 0 ? (
                demoAnnouncements.map((announcement) => <AnnouncementCard key={announcement.id} announcement={announcement} />)
              ) : (
                <div className="empty-state" role="status">
                  <ArrowDownRight aria-hidden="true" size={24} />
                  <h3>No announcement published yet</h3>
                  <p>Content created from the admin panel will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="community-callout" aria-labelledby="community-heading" data-home-reveal>
          <div className="community-callout__inner page-width">
            <div>
              <p className="section-heading__eyebrow">PLAY. COMPETE. BELONG.</p>
              <h2 id="community-heading">YOUR SQUAD <em>IS WAITING.</em></h2>
              <p>Find your people, build your team, and take your place in the arena.</p>
            </div>
            <PrimaryButton href="/register">Build your squad</PrimaryButton>
          </div>
        </section>

        <section className="closing-cta" aria-labelledby="closing-heading" data-home-reveal>
          <div className="closing-cta__inner page-width">
            <div>
              <p className="section-heading__eyebrow">The next move is yours</p>
              <h2 id="closing-heading">DREAM. <em>COMPETE. WIN.</em></h2>
            </div>
            <PrimaryButton href="#tournaments">Explore events</PrimaryButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

export default HomePage