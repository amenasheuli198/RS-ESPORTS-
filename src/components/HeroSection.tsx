import { ArrowDown } from 'lucide-react'
import { PlatformEmblem, PrimaryButton, SecondaryButton } from './ui'
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
          <p className="eyebrow"><span /> PLAY <i>•</i> COMPETE <i>•</i> BELONG</p>
          <h1 id="hero-title"><span>UNDERGRADUATE</span><em>E-SPORTS</em></h1>
          <p className="hero__motto">One platform. Endless possibilities.</p>
          <p className="hero__description">
            Find your next tournament, bring your squad together, and earn your place in the arena.
          </p>
          <div className="hero__actions">
            <PrimaryButton href="/register">Join the arena</PrimaryButton>
            <SecondaryButton href="#tournaments">Explore tournaments</SecondaryButton>
          </div>
          <a className="hero__scroll" href="#platform-pulse">
            <span>Scroll to explore</span><ArrowDown aria-hidden="true" size={15} />
          </a>
        </div>
        <div className="hero__stamp" aria-hidden="true">
          <PlatformEmblem className="hero__emblem" />
          <span>DREAM.<br />COMPETE.<br />WIN.</span>
          <i />
        </div>
      </div>
      <div className="hero__index" aria-hidden="true"><span>01</span> / LIVE PLATFORM</div>
    </section>
  )
}

export default HeroSection