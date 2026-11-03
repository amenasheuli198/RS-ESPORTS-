import { useState } from 'react'
import AnnouncementCard from '../components/AnnouncementCard'
import FeaturedTournament from '../components/FeaturedTournament'
import HeroSection from '../components/HeroSection'
import LeaderboardPreview from '../components/LeaderboardPreview'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import StatisticsSection from '../components/StatisticsSection'
import TournamentCard from '../components/TournamentCard'
import TournamentFilters from '../components/TournamentFilters'
import { PrimaryButton, SectionHeading } from '../components/ui'
import { demoAnnouncements, demoTournaments, featuredTournament } from '../data/homepage'
import type { TournamentFilter } from '../types/homepage'
import { ArrowDownRight, Check, ChevronRight, Flag, UsersRound } from 'lucide-react'

const steps = [
  { number: '01', title: 'Create your account', description: 'Set up your player profile and get ready to compete.', icon: Flag },
  { number: '02', title: 'Build your team', description: 'Bring your squad together with four starting players.', icon: UsersRound },
  { number: '03', title: 'Register for a tournament', description: 'Choose your event, review the rules, and enter as a team.', icon: Check },
  { number: '04', title: 'Enter the arena', description: 'Check the schedule, join your lobby, and play your game.', icon: ChevronRight },
]

function HomePage() {
  const [activeFilter, setActiveFilter] = useState<TournamentFilter>('All')
  const visibleTournaments = demoTournaments.filter((tournament) => (
    activeFilter === 'All' || tournament.status === activeFilter
  ))

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <HeroSection />
        <StatisticsSection />
        <FeaturedTournament tournament={featuredTournament} />

        <section className="section tournaments-section" id="tournaments" aria-labelledby="tournaments-heading">
          <div className="page-width">
            <SectionHeading
              eyebrow="Choose your next drop"
              title="Find your tournament."
              description="Squad up and find a competition that fits your play. Sample event listings."
              id="tournaments-heading"
              action={<span className="section-count">{visibleTournaments.length.toString().padStart(2, '0')} <i>EVENTS</i></span>}
            />
            <div className="tournaments-toolbar">
              <TournamentFilters activeFilter={activeFilter} onChange={setActiveFilter} />
              <span className="demo-note"><span /> DEMO TOURNAMENTS</span>
            </div>
            {visibleTournaments.length > 0 ? (
              <div className="tournament-grid" aria-live="polite" aria-relevant="additions removals">
                {visibleTournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}
              </div>
            ) : (
              <div className="empty-state" role="status">
                <ArrowDownRight aria-hidden="true" size={24} />
                <h3>No tournaments in this filter</h3>
                <p>Check another status to see more sample events.</p>
              </div>
            )}
          </div>
        </section>

        <section className="section how-section" aria-labelledby="how-heading">
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
                  <li className="step-card" key={step.number}>
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

        <section className="section news-section" id="news" aria-labelledby="news-heading">
          <div className="page-width">
            <SectionHeading
              eyebrow="From the arena"
              title="The latest briefing."
              description="Tournament notes, squad ideas, and updates from our sample newsroom."
              id="news-heading"
              action={<a className="text-link news-section__all" href="/news">All news <ArrowDownRight aria-hidden="true" size={16} /></a>}
            />
            <div className="news-grid">
              {demoAnnouncements.map((announcement) => <AnnouncementCard key={announcement.id} announcement={announcement} />)}
            </div>
          </div>
        </section>

        <section className="closing-cta" aria-labelledby="closing-heading">
          <div className="closing-cta__inner page-width">
            <div>
              <p className="section-heading__eyebrow">The next move is yours</p>
              <h2 id="closing-heading">YOUR SQUAD. <em>YOUR MOMENT.</em></h2>
            </div>
            <PrimaryButton href="#tournaments">Find your tournament</PrimaryButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

export default HomePage