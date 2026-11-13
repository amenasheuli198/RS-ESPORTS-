import { ArrowDown, Crosshair } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'
import MediaFrame from './MediaFrame'

const heroImage = arenaPhoto()

function arenaPhoto() {
  return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1800&q=85'
}

function HeroSection() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <MediaFrame src={heroImage} alt="Competitive gaming arena" className="hero__media" decorative />
      <div className="hero__scrim" />
      <div className="hero__grid page-width">
        <div className="hero__content">
          <p className="eyebrow"><span /> Free Fire / PUBG / Chess</p>
          <h1 id="hero-title">ENTER THE <em>ARENA.</em></h1>
          <p className="hero__motto">Compete. Dominate. Become a Champion.</p>
          <p className="hero__description">
            Enter team and individual competitions hosted by UNDERGRADUATE HUB E-Sports.
          </p>
          <div className="hero__actions">
            <PrimaryButton href="#tournaments">Explore events</PrimaryButton>
            <SecondaryButton href="/register">Create your team</SecondaryButton>
          </div>
          <a className="hero__scroll" href="#platform-pulse">
            <span>Scroll to explore</span><ArrowDown aria-hidden="true" size={15} />
          </a>
        </div>
        <div className="hero__stamp" aria-hidden="true">
          <span className="hero__stamp-icon"><Crosshair size={19} /></span>
          <span>Ready.<br />Set.<br />Launch.</span>
          <i />
        </div>
      </div>
      <div className="hero__index" aria-hidden="true"><span>01</span> / LIVE PLATFORM</div>
    </section>
  )
}

export default HeroSection