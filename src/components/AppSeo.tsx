import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const defaultDescription = 'RS Esports is a premium competitive platform for tournaments, teams, match results, and esports community updates.'

function getPageConfig(pathname: string) {
  if (pathname === '/') {
    return {
      title: 'RS Esports | Find Your Next Tournament',
      description: 'Discover esports tournaments, team rosters, match results, and player profiles on the RS Esports platform.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/tournaments')) {
    return {
      title: 'Tournaments | RS Esports',
      description: 'Browse upcoming and active esports tournaments, team registration, and match schedules.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/leaderboard')) {
    return {
      title: 'Leaderboard | RS Esports',
      description: 'Track competitive standings, result rankings, and active tournament performance.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/news')) {
    return {
      title: 'News & Editorial | RS Esports',
      description: 'Follow the latest RS Esports updates, tournament coverage, announcements, and competitive stories.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/players')) {
    return {
      title: 'Player Profile | RS Esports',
      description: 'View player stats, competitive history, team affiliations, and match records.',
      isPublic: true,
    }
  }

  if (pathname === '/contact') {
    return {
      title: 'Contact RS Esports',
      description: 'Reach the RS Esports team for support, tournament questions, or platform inquiries.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/account') || pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname === '/verify-email') {
    return {
      title: 'Private Area | RS Esports',
      description: 'Private account or administrative area of the RS Esports platform.',
      isPublic: false,
    }
  }

  return {
    title: 'RS Esports',
    description: defaultDescription,
    isPublic: true,
  }
}

function AppSeo() {
  const location = useLocation()

  useEffect(() => {
    const { title, description, isPublic } = getPageConfig(location.pathname)
    const canonicalUrl = `${window.location.origin}${location.pathname}`

    document.title = title

    const setMeta = (selector: string, value: string, attr: 'name' | 'property', content?: string) => {
      const tag = document.head.querySelector(`${attr === 'name' ? 'meta[name="' : 'meta[property="'}${selector}"]`) ?? document.createElement('meta')
      tag.setAttribute(attr, selector)
      tag.setAttribute('content', content ?? value)
      document.head.appendChild(tag)
    }

    const updateMeta = (key: string, value: string, attribute: 'name' | 'property') => {
      let tag = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(attribute, key)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', value)
    }

    updateMeta('description', description, 'name')
    updateMeta('robots', isPublic ? 'index,follow' : 'noindex,nofollow', 'name')
    updateMeta('og:title', title, 'property')
    updateMeta('og:description', description, 'property')
    updateMeta('og:type', 'website', 'property')
    updateMeta('og:url', canonicalUrl, 'property')
    updateMeta('twitter:card', 'summary_large_image', 'name')
    updateMeta('twitter:title', title, 'name')
    updateMeta('twitter:description', description, 'name')

    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', canonicalUrl)
  }, [location])

  return null
}

export default AppSeo
