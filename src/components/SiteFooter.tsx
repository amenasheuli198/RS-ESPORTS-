import { ArrowUpRight, Swords } from 'lucide-react'

const quickLinks = [
  { label: 'Home', href: '#top' },
  { label: 'Tournaments', href: '#tournaments' },
  { label: 'Leaderboard', href: '#leaderboard' },
  { label: 'Match schedule', href: '/schedule' },
]

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-width">
        <div className="site-footer__main">
          <div className="site-footer__brand-column">
            <a className="brand-lockup" href="#top" aria-label="RS Esports home">
              <span className="brand-lockup__mark"><Swords aria-hidden="true" size={20} /></span>
              <span className="brand-lockup__name">RS <b>ESPORTS</b></span>
            </a>
            <p>Built for squads with something to prove. Find your next drop and make every match count.</p>
            <span className="site-footer__social-label">COMMUNITY CHANNELS <i>Coming soon</i></span>
          </div>
          <div className="site-footer__links-column">
            <h2>Explore</h2>
            {quickLinks.map((link) => <a key={link.label} href={link.href}>{link.label}</a>)}
          </div>
          <div className="site-footer__links-column">
            <h2>Tournaments</h2>
            <a href="#featured-heading">Featured event</a>
            <a href="#tournaments">Upcoming events</a>
            <a href="/leaderboard">Season leaderboard</a>
            <a href="/support">Support <ArrowUpRight aria-hidden="true" size={13} /></a>
          </div>
          <div className="site-footer__links-column">
            <h2>Platform</h2>
            <a href="/about">About RS</a>
            <a href="/terms">Terms and conditions</a>
            <a href="/privacy">Privacy policy</a>
          </div>
        </div>
        <div className="site-footer__disclaimer">
          <span className="site-footer__disclaimer-mark">i</span>
          <p>RS Esports is an independently operated esports tournament platform and is not affiliated with or endorsed by Garena.</p>
        </div>
        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} RS Esports</span>
          <span>Independent competition. Shared passion.</span>
          <a href="#top">Back to top <ArrowUpRight aria-hidden="true" size={14} /></a>
        </div>
      </div>
    </footer>
  )
}

export default SiteFooter