import { useEffect, useState } from 'react'
import AnnouncementCard from '../components/AnnouncementCard'
import HeroSection from '../components/HeroSection'
import LeaderboardPreview from '../components/LeaderboardPreview'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import StatisticsSection from '../components/StatisticsSection'
import TournamentCard from '../components/TournamentCard'
import TournamentFilters from '../components/TournamentFilters'
import { PrimaryButton, SectionHeading } from '../components/ui'
import { demoAnnouncements, demoTournaments } from '../data/homepage'
import type { TournamentFilter } from '../types/homepage'
import { ArrowDownRight, Award, Check, ChevronRight, Crosshair, Flag, Gamepad2, Medal, Trophy, UsersRound } from 'lucide-react'

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

function HomePage() {
  const [activeFilter, setActiveFilter] = useState<TournamentFilter>('All')
  const visibleTournaments = demoTournaments.filter((tournament) => (
    activeFilter === 'All' || tournament.status === activeFilter
  ))

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
            {visibleTournaments.length > 0 ? (
              <div className="tournament-grid" aria-live="polite" aria-relevant="additions removals">
                {visibleTournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}
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
                const eventCount = demoTournaments.filter((tournament) => tournament.game.toLowerCase().includes(game.name.toLowerCase())).length
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