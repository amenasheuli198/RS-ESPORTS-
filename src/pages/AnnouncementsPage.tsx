import { useEffect, useState } from 'react'
import { Megaphone, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import type { AnnouncementType, PublicAnnouncement } from '../announcements/types'
import { formatTournamentDate } from '../tournaments/format'

const categories: Array<'all' | AnnouncementType> = [
  'all', 'general', 'tournament_update', 'registration_notice', 'match_schedule_update',
  'room_information', 'result_announcement', 'maintenance_notice', 'important_alert',
]

function categoryLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function AnnouncementsPage() {
  const { client } = useAuth()
  const [items, setItems] = useState<PublicAnnouncement[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'all' | AnnouncementType>('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()
  const pageSize = 10

  useEffect(() => {
    let active = true
    if (!client || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Announcements are unavailable.')
      return () => { active = false }
    }
    setIsLoading(true)
    let request = client.from('announcements_public').select('*', { count: 'exact' })
    if (search.trim()) request = request.ilike('title', `%${search.trim().replace(/[%_]/g, '\\$&')}%`)
    if (category !== 'all') request = request.eq('announcement_type', category)
    void request.order('published_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1)
      .then(({ data, error, count }) => {
        if (!active) return
        if (error) {
          setErrorMessage('Announcements could not be loaded. Please try again.')
          setItems([])
          setTotal(0)
        } else {
          setErrorMessage('')
          setItems((data ?? []) as PublicAnnouncement[])
          setTotal(count ?? 0)
        }
        setIsLoading(false)
      }).catch(() => {
        if (!active) return
        setErrorMessage('Announcements could not be loaded. Please try again.')
        setItems([])
        setTotal(0)
        setIsLoading(false)
      })
    return () => { active = false }
  }, [client, configurationError, search, category, page])

  return <><SiteHeader /><main className="announcements-page"><div className="page-width announcements-content"><div className="announcements-heading"><div><p className="section-heading__eyebrow">RS / OFFICIAL UPDATES</p><h1>Announcements.</h1><p>News, tournament updates, and operational notices from the RS Esports team.</p></div><Megaphone size={22} /></div>
    <div className="announcements-controls"><label className="results-search"><Search size={16} /><span className="visually-hidden">Search announcements</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search announcements" /></label><label className="announcement-category-filter"><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value as 'all' | AnnouncementType); setPage(0) }}>{categories.map((item) => <option key={item} value={item}>{item === 'all' ? 'All categories' : categoryLabel(item)}</option>)}</select></label></div>
    {isLoading ? <div className="announcement-skeleton-list" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>
      : errorMessage ? <div className="arena-state arena-state--error" role="alert"><h2>Announcements unavailable.</h2><p>{errorMessage}</p></div>
        : items.length ? <><div className="announcement-list">{items.map((item) => <article className="announcement-public-card" key={item.id}><div className="announcement-public-card__meta"><span>{categoryLabel(item.announcement_type)}</span><time>{formatTournamentDate(item.published_at, 'UTC', true)}</time></div><h2><Link to={`/announcements/${item.id}`}>{item.title}</Link></h2>{item.tournament_name && item.tournament_slug && <Link className="announcement-public-card__tournament" to={`/tournaments/${item.tournament_slug}`}>{item.tournament_name}</Link>}{item.match_id && <span className="announcement-public-card__match">{item.round_name} / Match {item.match_number}</span>}<p>{item.content}</p><Link className="text-link" to={`/announcements/${item.id}`}>Read full announcement <span>↗</span></Link></article>)}</div><nav className="arena-pagination" aria-label="Announcement pages"><button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}</span><button type="button" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((value) => value + 1)}>Next</button></nav></>
          : <div className="arena-state"><Megaphone size={24} /><h2>{search || category !== 'all' ? 'No announcements match.' : 'No announcements yet.'}</h2><p>{search || category !== 'all' ? 'Change your search or category filter to see other updates.' : 'Public announcements will appear here when the RS Esports team publishes them.'}</p></div>}
  </div></main><SiteFooter /></>
}

export default AnnouncementsPage