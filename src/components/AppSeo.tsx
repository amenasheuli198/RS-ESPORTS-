import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const defaultDescription = 'UNDERGRADUATE HUB E-Sports hosts Free Fire, PUBG, and Chess competitions.'

function getPageConfig(pathname: string) {
  if (pathname === '/') {
    return {
      title: 'UNDERGRADUATE HUB E-Sports | Competitions',
      description: 'Discover Free Fire, PUBG, and Chess tournaments, matches, and results.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/quick-matches')) {
    return {
      title: 'Quick Matches | UNDERGRADUATE HUB E-Sports',
      description: 'Standalone esports matches from UNDERGRADUATE HUB E-Sports.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/tournaments')) {
    return {
      title: 'Tournaments | UNDERGRADUATE HUB E-Sports',
      description: 'Browse upcoming and active esports tournaments, team registration, and match schedules.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/leaderboard')) {
    return {
      title: 'Leaderboard | UNDERGRADUATE HUB E-Sports',
      description: 'Track competitive standings, result rankings, and active tournament performance.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/news')) {
    return {
      title: 'News & Editorial | UNDERGRADUATE HUB E-Sports',
      description: 'Follow organization updates, tournament coverage, announcements, and competitive stories.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/players')) {
    return {
      title: 'Player Profile | UNDERGRADUATE HUB E-Sports',
      description: 'View player stats, competitive history, team affiliations, and match records.',
      isPublic: true,
    }
  }

  if (pathname === '/contact') {
    return {
      title: 'Contact | UNDERGRADUATE HUB E-Sports',
      description: 'Reach UNDERGRADUATE HUB E-Sports for support, tournament questions, or platform inquiries.',
      isPublic: true,
    }
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/account') || pathname.startsWith('/auth') || pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password') {
    return {
      title: 'Private Area | UNDERGRADUATE HUB E-Sports',
      description: 'Private account or administrative area of UNDERGRADUATE HUB E-Sports.',
      isPublic: false,
    }
  }

  return {
    title: 'UNDERGRADUATE HUB E-Sports',
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
