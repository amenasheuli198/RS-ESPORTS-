const imageSignatures = {
  'image/png': (bytes: Uint8Array) => bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  'image/jpeg': (bytes: Uint8Array) => bytes.length >= 3
    && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/webp': (bytes: Uint8Array) => bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP',
} as const

export type TeamLogoMimeType = keyof typeof imageSignatures

export async function validateTeamLogo(file: File): Promise<TeamLogoMimeType> {
  if (file.size === 0 || file.size > 2 * 1024 * 1024) {
    throw new Error('Logo must be a non-empty image no larger than 2 MB.')
  }

  const signature = imageSignatures[file.type as TeamLogoMimeType]
  if (!signature) throw new Error('Choose a PNG, JPG, or WEBP image.')

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!signature(bytes)) throw new Error('The selected file does not match its image format.')

  return file.type as TeamLogoMimeType
}

export function getTeamLogoExtension(mimeType: TeamLogoMimeType): string {
  return mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length)
}

export function validateTeamFields(name: string, ign: string, freeFireUid: string) {
  const normalizedName = name.trim()
  const normalizedIgn = ign.trim()
  const normalizedUid = freeFireUid.trim()

  if (normalizedName.length < 3 || normalizedName.length > 40 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
    return 'Team name must be 3-40 characters and cannot contain control characters.'
  }
  if (normalizedIgn.length < 2 || normalizedIgn.length > 32 || /[\u0000-\u001f\u007f]/.test(normalizedIgn)) {
    return 'IGN must be 2-32 characters and cannot contain control characters.'
  }
  if (!/^\d{5,20}$/.test(normalizedUid)) {
    return 'Free Fire UID must contain 5-20 digits.'
  }

  return null
}