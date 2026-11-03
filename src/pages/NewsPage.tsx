import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import SiteHeader from '../components/SiteHeader'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface ArticleListItem {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image_url: string | null
  category_name: string | null
  category_slug: string | null
  author_name: string | null
  author_username: string | null
  published_at: string | null
  is_featured: boolean
}

function NewsPage() {
  const { slug } = useParams<{ slug: string }>()
  const { client } = useAuth()
  const [articles, setArticles] = useState<ArticleListItem[]>([])
  const [featured, setFeatured] = useState<ArticleListItem | null>(null)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'News is unavailable.')
      return () => { active = false }
    }

    const supabaseClient = client

    async function load() {
      try {
        let request = supabaseClient.from('article_listing_public').select('*').eq('status', 'published').order('published_at', { ascending: false })
        if (slug) request = request.eq('category_slug', slug)
        const { data, error } = await request
        if (!active) return
        if (error) throw error
        const next = (data ?? []) as ArticleListItem[]
        const featuredCandidate = next.find((item) => item.is_featured) ?? next[0] ?? null
        setArticles(next)
        setFeatured(featuredCandidate)
      } catch {
        if (!active) return
        setErrorMessage('News articles could not be loaded.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [client, configurationError, slug])

  const filteredArticles = articles.filter((article) => article.title.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <>
      <SiteHeader />
      <main className="news-page page-width">
        <header className="announcements-heading">
          <div>
            <p className="section-heading__eyebrow">RS / NEWSROOM</p>
            <h1>News and editorial coverage.</h1>
            <p>Match reports, tournament stories, and platform updates from RS Esports.</p>
          </div>
        </header>

        <label className="results-search" style={{ marginBottom: 18 }}>
          <Search size={16} />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search news stories" />
        </label>

        {errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}

        {isLoading ? <p role="status">Loading articles...</p> : (
          <>
            {featured && (
              <article className="featured-news">
                <img src={featured.cover_image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80'} alt={featured.title} />
                <div>
                  <span>{featured.category_name || 'News'}</span>
                  <h2><Link to={`/news/${featured.slug}`}>{featured.title}</Link></h2>
                  <p>{featured.excerpt || 'Read the latest update from RS Esports.'}</p>
                  <small>{featured.author_name || 'RS Esports'} · {featured.published_at ? new Date(featured.published_at).toLocaleDateString() : 'Recently published'}</small>
                </div>
              </article>
            )}

            <div className="news-grid">
              {filteredArticles.filter((item) => item.id !== featured?.id).map((item) => (
                <article className="announcement-card" key={item.id}>
                  <div className="announcement-card__image">
                    <img src={item.cover_image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=80'} alt={item.title} />
                  </div>
                  <div className="announcement-card__body">
                    <div className="announcement-card__meta">
                      <span>{item.category_name || 'News'}</span>
                      <time>{item.published_at ? new Date(item.published_at).toLocaleDateString() : 'Recent'}</time>
                    </div>
                    <h3><Link to={`/news/${item.slug}`}>{item.title}</Link></h3>
                    <p>{item.excerpt || 'Read the latest update from the RS Esports newsroom.'}</p>
                    <small>{item.author_name || 'RS Esports'}</small>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  )
}

export default NewsPage
