import { useState } from 'react'
import { Crosshair } from 'lucide-react'

interface MediaFrameProps {
  src: string
  alt: string
  className?: string
  decorative?: boolean
}

function MediaFrame({ src, alt, className = '', decorative = false }: MediaFrameProps) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={`media-frame ${className}`}>
      {!failed ? (
        <img
          src={src}
          alt={decorative ? '' : alt}
          aria-hidden={decorative || undefined}
          loading={decorative ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="media-frame__fallback" aria-hidden="true">
          <Crosshair size={34} strokeWidth={1.2} />
          <span>RS / ARENA</span>
        </div>
      )}
    </div>
  )
}

export default MediaFrame