import { ArrowUpRight, Swords } from 'lucide-react'

const quickLinks = [
  { label: 'Home', href: '/' },
  { label: 'Tournaments', href: '/tournaments' },
  { label: 'Quick Matches', href: '/quick-matches' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Match schedule', href: '/matches' },
]

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="page-width">
        <div className="site-footer__main">
          <div className="site-footer__brand-column">
            <a className="brand-lockup" href="/" aria-label="Undergraduate Hub E-Sports home">
              <span className="brand-lockup__mark"><Swords aria-hidden="true" size={20} /></span>
              <span className="brand-lockup__name">UNDERGRADUATE <b>HUB E-SPORTS</b></span>
            </a>
            <p>UNDERGRADUATE HUB E-Sports competitions for Free Fire, PUBG, and Chess.</p>
            <span className="site-footer__social-label">COMMUNITY CHANNELS <i>Coming soon</i></span>
          </div>
          <div className="site-footer__links-column">
            <h2>Explore</h2>
            {quickLinks.map((link) => <a key={link.label} href={link.href}>{link.label}</a>)}
          </div>
          <div className="site-footer__links-column">
            <h2>Tournaments</h2>
            <a href="/tournaments">Featured event</a>
            <a href="/tournaments">Upcoming events</a>
            <a href="/leaderboard">Season leaderboard</a>
            <a href="/contact">Support <ArrowUpRight aria-hidden="true" size={13} /></a>
          </div>
          <div className="site-footer__links-column">
            <h2>Platform</h2>
            <a href="/news">Newsroom</a>
            <a href="/contact">Contact RS</a>
          </div>
        </div>
        <div className="site-footer__disclaimer">
          <span className="site-footer__disclaimer-mark">i</span>
          <p>UNDERGRADUATE HUB E-Sports is independently operated and is not affiliated with or endorsed by game publishers.</p>
        </div>
        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} UNDERGRADUATE HUB E-Sports</span>
          <span>Independent competition. Shared passion.</span>
          <a href="/">Back to home <ArrowUpRight aria-hidden="true" size={14} /></a>
        </div>
      </div>
    </footer>
  )
}

export default SiteFooter