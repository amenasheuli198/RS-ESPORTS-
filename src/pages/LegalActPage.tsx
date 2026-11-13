import { ArrowUpRight, Landmark, ShieldAlert } from 'lucide-react'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'

const sources = [
  {
    title: 'Bangladesh Sangbad Sangstha (BSS)',
    detail: 'E-sports get official "sport" recognition, 15 July 2025.',
    href: 'https://www.bssnews.net/news/292443',
  },
  {
    title: 'National Sports Council Act, 2018',
    detail: 'Bangladesh Laws, official legal database.',
    href: 'https://bdlaws.minlaw.gov.bd/act-print-1264.html',
  },
  {
    title: 'Ministry of Youth and Sports: Laws and Rules',
    detail: 'Government page listing the National Sports Council Act, 2018.',
    href: 'https://moysports.gov.bd/pages/static-pages/694032af35ce18e1c056088c',
  },
]

function LegalActPage() {
  return (
    <>
      <SiteHeader />
      <main className="legal-act-page">
        <header className="legal-act-hero">
          <div className="page-width legal-act-hero__inner">
            <div>
              <p className="section-heading__eyebrow">Bangladesh / Policy reference</p>
              <h1>Legal <em>&amp; Act</em></h1>
              <p className="legal-act-hero__summary">
                Government recognition of electronic sports as a sport in Bangladesh.
              </p>
              <p className="legal-act-hero__date">Evidence summary / Prepared 13 November 2026</p>
            </div>
            <div className="legal-act-hero__seal" aria-hidden="true">
              <Landmark size={35} strokeWidth={1.4} />
              <span>National Sports<br />Council Act, 2018</span>
            </div>
          </div>
        </header>

        <div className="legal-act-content">
          <section className="legal-act-keypoint" aria-labelledby="legal-keypoint-title">
            <p className="legal-act-kicker" id="legal-keypoint-title">Key point</p>
            <p>
              Bangladesh's Ministry of Youth and Sports officially recognized electronic sports
              (e-sports) as a sport in July 2025 under sections 2(2) and 6 of the National Sports
              Council Act, 2018.
            </p>
          </section>

          <section className="legal-act-section" aria-labelledby="legal-announcement-title">
            <p className="legal-act-kicker">The announcement</p>
            <h2 id="legal-announcement-title">What was announced</h2>
            <p>
              According to Bangladesh Sangbad Sangstha (BSS), the Ministry announced its decision
              through a letter dated 14 July 2025, signed by Faisal Raihan, Senior Assistant
              Secretary, Sports Branch-1. BSS published its report on 15 July 2025.
            </p>
          </section>

          <section className="legal-act-section" aria-labelledby="legal-basis-title">
            <p className="legal-act-kicker">National Sports Council Act, 2018</p>
            <h2 id="legal-basis-title">Legal basis</h2>
            <div className="legal-act-basis-grid">
              <article className="legal-act-basis">
                <span>Section 2(2)</span>
                <p>Defines "sports" and includes games declared by the Government under section 6.</p>
              </article>
              <article className="legal-act-basis">
                <span>Section 6</span>
                <p>Empowers the Government to declare a game as a sport by notification in the official Gazette.</p>
              </article>
            </div>
          </section>

          <section className="legal-act-limits" aria-labelledby="legal-limits-title">
            <div className="legal-act-limits__heading">
              <ShieldAlert aria-hidden="true" size={24} />
              <div>
                <p className="legal-act-kicker">Important limitation</p>
                <h2 id="legal-limits-title">Recognition is not an operating licence</h2>
              </div>
            </div>
            <p>This recognition concerns e-sports as an activity. It does not by itself:</p>
            <ul>
              <li>Register or license a private e-sports company or tournament organizer.</li>
              <li>Affiliate an organization with the National Sports Council.</li>
              <li>Grant permission to use game publishers' trademarks or to run commercial tournaments.</li>
              <li>Exempt an organizer from trade licensing, tax, data protection, cybersecurity, venue, or other applicable requirements.</li>
              <li>Make betting or gambling lawful.</li>
            </ul>
            <p className="legal-act-guidance">
              For UNDERGRADUATE E-SPORTS, this is evidence of government recognition of the activity,
              not a business operating licence or formal affiliation certificate.
            </p>
          </section>

          <section className="legal-act-section" aria-labelledby="legal-statement-title">
            <p className="legal-act-kicker">Suggested short statement</p>
            <h2 id="legal-statement-title">Recognition in brief</h2>
            <blockquote>
              Electronic Sports (e-sports) received official recognition as a sport in Bangladesh
              from the Ministry of Youth and Sports in July 2025, under sections 2(2) and 6 of the
              National Sports Council Act, 2018.
            </blockquote>
          </section>

          <section className="legal-act-section" aria-labelledby="legal-sources-title">
            <p className="legal-act-kicker">Reference material</p>
            <h2 id="legal-sources-title">Sources</h2>
            <ol className="legal-act-sources">
              {sources.map((source) => (
                <li key={source.href}>
                  <div>
                    <b>{source.title}</b>
                    <p>{source.detail}</p>
                  </div>
                  <a href={source.href} target="_blank" rel="noreferrer">
                    Open source <ArrowUpRight aria-hidden="true" size={15} />
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <aside className="legal-act-disclaimer" aria-label="Disclaimer">
            <b>For information only</b>
            <p>
              This page is an informational evidence summary. It is not the Ministry's original
              signed letter, an official Gazette notification, or legal advice. For formal submission
              to an institution or authority, obtain the original ministry letter or applicable
              Gazette notification directly from the Ministry of Youth and Sports and ask a
              Bangladeshi lawyer to verify the current legal position.
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

export default LegalActPage