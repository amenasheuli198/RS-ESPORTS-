import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SiteHeader from '../components/SiteHeader'
import { useAuth } from '../auth/AuthProvider'
import { getSupabaseConfigurationError } from '../services/supabase/client'

interface ArticleDetail {
  id: string
  title: string
  slug: string
  excerpt: string
  content: Array<Record<string, unknown>>
  cover_image_url: string | null
  category_name: string | null
  category_slug: string | null
  author_name: string | null
  author_username: string | null
  published_at: string | null
}

function renderRichText(blocks: Array<Record<string, unknown>> | undefined) {
  if (!blocks || !blocks.length) return <p>Article content is unavailable.</p>

  return (
    <>
      {blocks.map((block, index) => {
        const type = String(block.type ?? '')
        const text = typeof block.text === 'string' ? block.text : ''
        const children = Array.isArray(block.children) ? block.children : []

        if (type === 'heading') return <h2 key={index}>{text || children.map((child) => String((child as Record<string, unknown>)?.text ?? '')).join('')}</h2>
        if (type === 'quote') return <blockquote key={index}>{text || children.map((child) => String((child as Record<string, unknown>)?.text ?? '')).join('')}</blockquote>
        if (type === 'list') return <ul key={index}>{children.map((child, childIndex) => <li key={`${index}-${childIndex}`}>{String((child as Record<string, unknown>)?.text ?? '')}</li>)}</ul>
        return <p key={index}>{text || children.map((child) => String((child as Record<string, unknown>)?.text ?? '')).join('')}</p>
      })}
    </>
  )
}

function NewsArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const { client } = useAuth()
  const [article, setArticle] = useState<ArticleDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const configurationError = getSupabaseConfigurationError()

  useEffect(() => {
    let active = true
    if (!client || !slug || configurationError) {
      setIsLoading(false)
      setErrorMessage(configurationError ?? 'The article is unavailable.')
      return () => { active = false }
    }

    async function load() {
      try {
        const { data, error } = await client.from('article_detail_public').select('*').eq('slug', slug).maybeSingle()
        if (!active) return
        if (error || !data) {
          setErrorMessage('This article is not available or is no longer public.')
          return
        }
        setArticle(data as ArticleDetail)
      } catch {
        if (!active) return
        setErrorMessage('The article could not be loaded.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [client, configurationError, slug])

  if (isLoading) return <><SiteHeader /><main className="page-width"><p role="status">Loading article...</p></main></>
  if (errorMessage || !article) {
    return <><SiteHeader /><main className="page-width"><div className="arena-state"><h1>Article unavailable.</h1><p>{errorMessage || 'This story may have been archived or removed.'}</p><Link className="arena-state__button" to="/news">Back to news</Link></div></main></>
  }

  return (
    <>
      <SiteHeader />
      <main className="page-width article-page">
        <Link className="tournament-back-link" to="/news">← Back to news</Link>
        <article className="news-article">
          <p className="section-heading__eyebrow">{article.category_name || 'Editorial'}</p>
          <h1>{article.title}</h1>
          <div className="news-article__meta">
            <span>{article.author_name || 'RS Esports'}</span>
            <time>{article.published_at ? new Date(article.published_at).toLocaleDateString() : 'Recently published'}</time>
          </div>
          {article.cover_image_url && <img src={article.cover_image_url} alt={article.title} className="news-article__cover" />}
          <div className="news-article__content">
            {renderRichText(article.content as Array<Record<string, unknown>>)}
          </div>
        </article>
      </main>
    </>
  )
}

export default NewsArticlePage
