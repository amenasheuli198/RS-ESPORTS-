import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'

interface TeamLogoProps {
  path: string | null | undefined
  teamName: string
  className?: string
}

function TeamLogo({ path, teamName, className = '' }: TeamLogoProps) {
  const { client } = useAuth()
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setSignedUrl(null)
    if (!path || !client) return () => { active = false }

    void client.storage.from('team-logos').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (active && !error) setSignedUrl(data.signedUrl)
    }).catch(() => {
      if (active) setSignedUrl(null)
    })

    return () => { active = false }
  }, [client, path])

  return (
    <span className={`team-logo ${className}`}>
      {signedUrl ? <img src={signedUrl} alt={`${teamName} logo`} /> : <span aria-hidden="true">{teamName.slice(0, 1).toUpperCase() || 'T'}</span>}
    </span>
  )
}

export default TeamLogo