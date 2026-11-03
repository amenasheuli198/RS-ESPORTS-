import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, FileText, ImageUp, Plus, Search, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface ArticleCategory {
  id: string
  name: string
  slug: string
  description: string | null
  is_active: boolean
}

interface ArticleRecord {
  id: string
  title: string
  slug: string
  excerpt: string
  content: Array<Record<string, unknown>>
  cover_image_url: string | null
  category_id: string | null
  category_name: string | null
  author_name: string | null
  author_username: string | null
  status: 'draft' | 'published' | 'archived'
  is_featured: boolean
  published_at: string | null
}

function AdminContentPage() {
  const { client } = useAuth()
  const [articles, setArticles] = useState<ArticleRecord[]>([])
  const [categories, setCategories] = useState<ArticleCategory[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  const loadData = useCallback(async () => {
    if (!client || configurationError) {
      setErrorMessage(configurationError ?? 'Content data is unavailable.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const [articlesResult, categoriesResult] = await Promise.all([
        client.from('article_listing_public').select('*').order('published_at', { ascending: false }),
        client.from('article_categories').select('*').order('name', { ascending: true }),
      ])

      if (articlesResult.error || categoriesResult.error) throw new Error('LOAD_FAILED')
      setArticles((articlesResult.data ?? []) as ArticleRecord[])
      setCategories((categoriesResult.data ?? []) as ArticleCategory[])
    } catch {
      setErrorMessage('Content records could not be loaded. Confirm admin access and migration status.')
    } finally {
      setIsLoading(false)
    }
  }, [client, configurationError])

  useEffect(() => { void loadData() }, [loadData])

  const visibleArticles = useMemo(() => articles.filter((article) => {
    const matchesSearch = article.title.toLowerCase().includes(search.trim().toLowerCase())
    const matchesStatus = statusFilter === 'all' || article.status === statusFilter
    return matchesSearch && matchesStatus
  }), [articles, search, statusFilter])

  return (
    <section className="admin-content-page">
      <div className="admin-tournament-heading">
        <div>
          <p className="section-heading__eyebrow">CONTROL ROOM / CONTENT</p>
          <h1>News and editorial CMS.</h1>
          <p>Manage articles, categories, and public content.</p>
        </div>
        <button type="button" className="arena-state__button"><Plus size={15} /> New article</button>
      </div>

      <div className="admin-registration-controls">
        <label className="admin-registration-search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search article title" />
        </label>
        <label className="admin-registration-status">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'draft' | 'published' | 'archived')}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button type="button" className="admin-refresh-button" onClick={() => void loadData()}>Refresh</button>
      </div>

      {errorMessage && <p className="admin-form-error" role="alert">{errorMessage}</p>}

      {isLoading ? <div className="admin-tournament-skeletons" aria-busy="true">{Array.from({ length: 3 }, (_, index) => <div key={index} />)}</div>
        : <div className="admin-dashboard-panels admin-dashboard-panels--wide">
          <section className="admin-dashboard-panel">
            <div className="admin-dashboard-panel__head">
              <div><p className="section-heading__eyebrow">CONTENT</p><h2>Recent stories</h2></div>
              <FileText size={16} />
            </div>
            <div className="admin-dashboard-list">
              {visibleArticles.length ? visibleArticles.map((article) => (
                <div className="admin-dashboard-list__item" key={article.id}>
                  <div>
                    <strong>{article.title}</strong>
                    <small>{article.category_name || 'Uncategorized'} · {article.status}</small>
                  </div>
                  <span>{article.is_featured ? 'Featured' : 'Standard'}</span>
                </div>
              )) : <p className="admin-dashboard-empty">No articles match the current filter.</p>}
            </div>
          </section>

          <section className="admin-dashboard-panel">
            <div className="admin-dashboard-panel__head">
              <div><p className="section-heading__eyebrow">CATEGORIES</p><h2>Editorial groups</h2></div>
              <Sparkles size={16} />
            </div>
            <div className="admin-dashboard-list">
              {categories.length ? categories.map((category) => (
                <div className="admin-dashboard-list__item" key={category.id}>
                  <div>
                    <strong>{category.name}</strong>
                    <small>{category.slug}</small>
                  </div>
                  <span>{category.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              )) : <p className="admin-dashboard-empty">No categories have been created.</p>}
            </div>
          </section>
        </div>}

      <div className="admin-dashboard-panels admin-dashboard-panels--wide">
        <section className="admin-dashboard-panel">
          <div className="admin-dashboard-panel__head">
            <div><p className="section-heading__eyebrow">ASSETS</p><h2>Media workflow</h2></div>
            <ImageUp size={16} />
          </div>
          <div className="admin-dashboard-list">
            <div className="admin-dashboard-list__item"><div><strong>Cover images</strong><small>Admin-only uploads are supported through the existing Storage architecture.</small></div><span>Ready</span></div>
            <div className="admin-dashboard-list__item"><div><strong>Preview mode</strong><small>Draft and published article previews should be loaded from the trusted article record.</small></div><span>Planned</span></div>
          </div>
        </section>

        <section className="admin-dashboard-panel">
          <div className="admin-dashboard-panel__head">
            <div><p className="section-heading__eyebrow">PUBLISHING</p><h2>Workflow</h2></div>
            <CalendarRange size={16} />
          </div>
          <div className="admin-dashboard-list">
            <div className="admin-dashboard-list__item"><div><strong>Draft</strong><small>Private and editable by admins.</small></div><span>Supported</span></div>
            <div className="admin-dashboard-list__item"><div><strong>Published</strong><small>Visible to public readers.</small></div><span>Supported</span></div>
            <div className="admin-dashboard-list__item"><div><strong>Archived</strong><small>Hidden from public listings.</small></div><span>Supported</span></div>
          </div>
        </section>
      </div>
    </section>
  )
}

export default AdminContentPage
