import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'
import TournamentBanner from '../components/tournaments/TournamentBanner'
import TournamentCardLive from '../components/tournaments/TournamentCardLive'
import TournamentStatusBadge from '../components/tournaments/TournamentStatusBadge'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import { formatTournamentDate, formatTournamentMoney } from '../tournaments/format'
import type { PublicTournament, TournamentSort, TournamentStatus } from '../tournaments/types'

type StatusFilter = 'All' | Extract<TournamentStatus, 'Registration Open' | 'Upcoming' | 'Live' | 'Completed'>
const PAGE_SIZE = 9
const statusFilters: StatusFilter[] = ['All', 'Registration Open', 'Upcoming', 'Live', 'Completed']

function TournamentArenaPage() {
  const { client } = useAuth()
  const [tournaments, setTournaments] = useState<PublicTournament[]>([])
  const [featured, setFeatured] = useState<PublicTournament | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('All')
  const [game, setGame] = useState('All')
  const [mode, setMode] = useState('All')
  const [entryType, setEntryType] = useState<'All' | 'free' | 'paid'>('All')
  const [sort, setSort] = useState<TournamentSort>('soonest')
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const configurationError = getSupabaseConfigurationError()

  const filterKey = useMemo(() => JSON.stringify([query.trim(), status, game, mode, entryType, sort]), [query, status, game, mode, entryType, sort])

  useEffect(() => {
    if (!client || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'Tournament data is unavailable.')
      setTournaments([])
      return
    }

    let active = true
    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      setErrorMessage('')

      let request = client.from('tournaments_public').select('*', { count: 'exact' })
      if (query.trim()) request = request.ilike('name', `%${query.trim().replace(/[%_]/g, '\\$&')}%`)
      if (status === 'Registration Open') request = request.in('tournament_status', ['Registration Open', 'Registration Closing Soon'])
      else if (status !== 'All') request = request.eq('tournament_status', status)
      if (game !== 'All') request = request.eq('game_code', game)
      if (mode !== 'All') request = request.eq('mode_code', mode)
      if (entryType !== 'All') request = request.eq('entry_type', entryType)

      const sortMap: Record<TournamentSort, { column: string; ascending: boolean }> = {
        soonest: { column: 'starts_at', ascending: true },
        deadline: { column: 'registration_closes_at', ascending: true },
        prize: { column: 'prize_pool', ascending: false },
        name: { column: 'name', ascending: true },
      }
      const ordering = sortMap[sort]
      const { data, error, count: resultCount } = await request
        .order(ordering.column, { ascending: ordering.ascending })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

      if (!active) return
      if (error) {
        setErrorMessage('Tournament information could not be loaded. Please try again.')
        setTournaments([])
        setCount(0)
      } else {
        setTournaments((data ?? []) as PublicTournament[])
        setCount(resultCount ?? 0)
      }
      setIsLoading(false)
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [client, configurationError, filterKey, page])

  useEffect(() => {
    if (!client || configurationError) return
    let active = true

    async function loadFeaturedTournament() {
      try {
        const { data } = await client.from('tournaments_public')
          .select('*')
          .eq('is_featured', true)
          .order('starts_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (active) setFeatured(data as PublicTournament | null)
      } catch {
        if (active) setFeatured(null)
      }
    }

    void loadFeaturedTournament()
    return () => { active = false }
  }, [client, configurationError])

  useEffect(() => { setPage(0) }, [filterKey])

  const totalPages = Math.ceil(count / PAGE_SIZE)
  const hasFilters = Boolean(query.trim() || status !== 'All' || game !== 'All' || mode !== 'All' || entryType !== 'All')

  function clearFilters() {
    setQuery('')
    setStatus('All')
    setGame('All')
    setMode('All')
    setEntryType('All')
    setSort('soonest')
  }

  return (
    <>
    <SiteHeader />
    <main className="tournament-arena-page">
      <section className="tournament-arena-hero page-width" aria-labelledby="arena-title">
        <div className="tournament-arena-hero__copy">
          <p className="section-heading__eyebrow"><span /> THE COMPETITION FLOOR</p>
          <h1 id="arena-title">TOURNAMENT <em>ARENA</em></h1>
          <p>Find your next drop. Bring your squad. Make every match count.</p>
        </div>
        <span className="tournament-arena-hero__index" aria-hidden="true"><Swords size={19} /> RS / EVENTS</span>
      </section>

      <div className="page-width tournament-arena-content">
        {featured && (
          <section className="arena-featured" aria-labelledby="arena-featured-title">
            <div className="arena-featured__media"><TournamentBanner path={featured.banner_path} name={featured.name} /></div>
            <div className="arena-featured__scrim" />
            <div className="arena-featured__content">
              <div className="arena-featured__topline"><span>FEATURED EVENT</span><TournamentStatusBadge status={featured.tournament_status} /></div>
              <div><p>{featured.game_code.replaceAll('_', ' ')} <i /> {featured.mode_code.replaceAll('_', ' ')}</p><h2 id="arena-featured-title">{featured.name}</h2></div>
              <div className="arena-featured__meta">
                <span><small>Entry</small><b>{formatTournamentMoney(featured.entry_fee, featured.entry_type)}</b></span>
                <span><small>Prize pool</small><b className="is-gold">{formatTournamentMoney(featured.prize_pool)}</b></span>
                <span><small>Slots available</small><b>{featured.available_slots} / {featured.max_teams}</b></span>
                <span><small>Starts</small><b>{formatTournamentDate(featured.starts_at, featured.timezone)}</b></span>
              </div>
              <Link className="arena-featured__button" to={`/tournaments/${featured.slug}`}>Explore featured event <ChevronRight size={16} /></Link>
            </div>
          </section>
        )}

        <section className="arena-listing" aria-labelledby="arena-listing-title">
          <div className="arena-listing__heading">
            <div><p className="section-heading__eyebrow">LIVE FROM THE PLATFORM</p><h2 id="arena-listing-title">Find your tournament.</h2><p>Only published tournament listings appear here.</p></div>
            <span className="arena-listing__count">{count.toString().padStart(2, '0')} <small>EVENTS</small></span>
          </div>
          <div className="arena-controls">
            <div className="arena-search"><Search aria-hidden="true" size={17} /><label className="visually-hidden" htmlFor="tournament-search">Search tournaments</label><input id="tournament-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tournaments" /></div>
            <div className="arena-selects">
              <label><span>Game</span><select value={game} onChange={(event) => setGame(event.target.value)}><option value="All">All games</option><option value="free_fire">Free Fire</option></select></label>
              <label><span>Mode</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="All">All modes</option><option value="battle_royale">Battle Royale</option></select></label>
              <label><span>Entry</span><select value={entryType} onChange={(event) => setEntryType(event.target.value as 'All' | 'free' | 'paid')}><option value="All">All entry types</option><option value="free">Free</option><option value="paid">Paid</option></select></label>
              <label><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as TournamentSort)}><option value="soonest">Soonest start</option><option value="deadline">Registration deadline</option><option value="prize">Prize pool</option><option value="name">Name</option></select></label>
            </div>
          </div>
          <div className="arena-status-filters" role="group" aria-label="Filter by tournament status">
            <SlidersHorizontal aria-hidden="true" size={15} />
            {statusFilters.map((filter) => <button key={filter} type="button" aria-pressed={status === filter} className={status === filter ? 'is-active' : ''} onClick={() => setStatus(filter)}>{filter}</button>)}
            {hasFilters && <button className="arena-clear-filter" type="button" onClick={clearFilters}>Clear filters</button>}
          </div>

          {isLoading ? (
            <div className="arena-card-grid" aria-label="Loading tournaments" aria-busy="true">
              {Array.from({ length: 6 }, (_, index) => <div className="arena-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}
            </div>
          ) : errorMessage ? (
            <div className="arena-state arena-state--error" role="alert"><CalendarDays size={23} /><h3>Events are temporarily unavailable.</h3><p>{errorMessage}</p></div>
          ) : tournaments.length ? (
            <div className="arena-card-grid">{tournaments.map((tournament) => <TournamentCardLive key={tournament.id} tournament={tournament} />)}</div>
          ) : (
            <div className="arena-state"><Swords size={26} /><h3>{hasFilters ? 'No events match those filters.' : 'The arena is getting ready.'}</h3><p>{hasFilters ? 'Adjust your search or filters to see other published tournaments.' : 'Published tournaments will appear here when they are ready to compete.'}</p>{hasFilters && <button className="arena-state__button" type="button" onClick={clearFilters}>Clear filters</button>}</div>
          )}

          {!isLoading && !errorMessage && totalPages > 1 && (
            <nav className="arena-pagination" aria-label="Tournament pages">
              <button type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /> Previous</button>
              <span>Page {page + 1} of {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight size={16} /></button>
            </nav>
          )}
        </section>
      </div>
    </main>
    <SiteFooter />
    </>
  )
}

export default TournamentArenaPage