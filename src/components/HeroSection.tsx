import { ArrowDown, Crosshair } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'
import MediaFrame from './MediaFrame'
import { featuredTournament } from '../data/homepage'

function HeroSection() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <MediaFrame src={featuredTournament.image} alt="" className="hero__media" decorative />
      <div className="hero__scrim" />
      <div className="hero__grid page-width">
        <div className="hero__content">
          <p className="eyebrow"><span /> Independent Free Fire competition</p>
          <h1 id="hero-title">ENTER THE <em>ARENA.</em></h1>
          <p className="hero__motto">Compete. Dominate. Become a Champion.</p>
          <p className="hero__description">
            Join the battlefield, build your squad, and compete in exciting Free Fire tournaments with RS Esports.
          </p>
          <div className="hero__actions">
            <PrimaryButton href="#tournaments">Explore tournaments</PrimaryButton>
            <SecondaryButton href="/register">Create your team</SecondaryButton>
          </div>
          <a className="hero__scroll" href="#platform-pulse">
            <span>Scroll to explore</span><ArrowDown aria-hidden="true" size={15} />
          </a>
        </div>
        <div className="hero__stamp" aria-hidden="true">
          <span className="hero__stamp-icon"><Crosshair size={19} /></span>
          <span>Drop in.<br />Stand out.</span>
          <i />
        </div>
      </div>
      <div className="hero__index" aria-hidden="true"><span>01</span> / THE ARENA</div>
    </section>
  )
}

export default HeroSection