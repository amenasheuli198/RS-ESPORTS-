import { ArrowUpRight } from 'lucide-react'
import type { Announcement } from '../types/homepage'
import MediaFrame from './MediaFrame'

interface AnnouncementCardProps {
  announcement: Announcement
}

function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  return (
    <article className="announcement-card">
      <MediaFrame src={announcement.image} alt={announcement.imageAlt} className="announcement-card__image" />
      <div className="announcement-card__body">
        <div className="announcement-card__meta"><span>{announcement.category}</span><time>{announcement.publishedAt}</time></div>
        <h3>{announcement.title}</h3>
        <p>{announcement.summary}</p>
        <a className="text-link" href={announcement.href}>Read more <ArrowUpRight aria-hidden="true" size={15} /></a>
      </div>
    </article>
  )
}

export default AnnouncementCard