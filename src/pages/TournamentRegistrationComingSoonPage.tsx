import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'

function TournamentRegistrationComingSoonPage() {
  const { slug } = useParams<{ slug: string }>()
  return (
    <>
    <SiteHeader />
    <main className="registration-coming-soon page-width">
      <span className="team-feature-icon"><ShieldCheck aria-hidden="true" size={22} /></span>
      <p className="section-heading__eyebrow">REGISTRATION / NOT OPEN</p>
      <h1>Team registration is coming soon.</h1>
      <p>No registration has been submitted and no slot has been reserved. Tournament registration will be available in a future platform update.</p>
      <Link to={`/tournaments/${slug}`}><ArrowLeft size={15} /> Return to tournament details</Link>
    </main>
    <SiteFooter />
    </>
  )
}

export default TournamentRegistrationComingSoonPage