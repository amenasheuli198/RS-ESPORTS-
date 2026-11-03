import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { PublicAnnouncement } from '../announcements/types'
import { formatTournamentDate } from '../tournaments/format'

function AnnouncementDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const { client } = useAuth()
  const [announcement, setAnnouncement] = useState<PublicAnnouncement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || !id || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Announcement is unavailable.')
      return () => { active = false }
    }

    async function loadAnnouncement() {
      try {
        const { data, error } = await client.from('announcements_public').select('*').eq('id', id).maybeSingle()
        if (!active) return
        if (error) setErrorMessage('Announcement could not be loaded.')
        else setAnnouncement(data as PublicAnnouncement | null)
      } catch {
        if (!active) return
        setErrorMessage('Announcement could not be loaded.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadAnnouncement()
    return () => { active = false }
  }, [client, id, configurationError])

  return <><SiteHeader /><main className="announcement-detail-page"><div className="page-width announcement-detail-content"><Link className="tournament-back-link" to="/announcements">← Announcements</Link>
    {isLoading ? <div className="tournament-detail-state" role="status">Loading announcement...</div>
      : errorMessage || !announcement ? <div className="tournament-detail-state"><h1>{errorMessage ? 'Announcement unavailable.' : 'Announcement not found.'}</h1><p>{errorMessage || 'This update may have expired or was not published publicly.'}</p></div>
        : <article className="announcement-article"><p className="section-heading__eyebrow">{announcement.announcement_type.replaceAll('_', ' ')}</p><h1>{announcement.title}</h1><time>{formatTournamentDate(announcement.published_at, 'UTC', true)} / UTC</time>{announcement.tournament_name && announcement.tournament_slug && <Link className="announcement-article__tournament" to={`/tournaments/${announcement.tournament_slug}`}>{announcement.tournament_name}</Link>}{announcement.match_id && <p className="announcement-article__match">{announcement.round_name} / Match {announcement.match_number}</p>}<div className="announcement-article__content">{announcement.content}</div></article>}
  </div></main><SiteFooter /></>
}

export default AnnouncementDetailsPage