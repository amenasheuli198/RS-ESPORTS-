import { useEffect, useState } from 'react'
import { ShieldAlert, Swords } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

interface TournamentBannerProps {
  path: string | null
  name: string
  className?: string
}

function TournamentBanner({ path, name, className = '' }: TournamentBannerProps) {
  const { client } = useAuth()
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setSignedUrl(null)
    setFailed(false)
    if (!path || !client) return () => { active = false }

    void client.storage.from('tournament-banners').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (active) {
        if (error) setFailed(true)
        else setSignedUrl(data.signedUrl)
      }
    }).catch(() => {
      if (active) setFailed(true)
    })

    return () => { active = false }
  }, [client, path])

  return (
    <div className={`tournament-banner ${className}`}>
      {signedUrl && !failed ? (
        <img src={signedUrl} alt={`${name} tournament banner`} onError={() => setFailed(true)} />
      ) : (
        <div className="tournament-banner__fallback" aria-hidden="true">
          {failed ? <ShieldAlert size={26} strokeWidth={1.3} /> : <Swords size={28} strokeWidth={1.2} />}
          <span>RS / ARENA</span>
        </div>
      )}
    </div>
  )
}

export default TournamentBanner