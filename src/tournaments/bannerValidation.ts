const signatures = {
  'image/png': (bytes: Uint8Array) => bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  'image/jpeg': (bytes: Uint8Array) => bytes.length >= 3
    && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/webp': (bytes: Uint8Array) => bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP',
} as const

export type TournamentBannerMime = keyof typeof signatures

export async function validateTournamentBanner(file: File): Promise<TournamentBannerMime> {
  if (!file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('Banner must be a non-empty image no larger than 5 MB.')
  }
  const check = signatures[file.type as TournamentBannerMime]
  if (!check) throw new Error('Choose a PNG, JPG, or WEBP banner.')
  if (!check(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) {
    throw new Error('The selected file does not match its image format.')
  }
  return file.type as TournamentBannerMime
}

export function getTournamentBannerExtension(type: TournamentBannerMime) {
  return type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)
}

export function slugifyTournamentName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-+$/g, '')
}

export function toDateTimeLocal(value: string | null | undefined, timeZone = 'UTC') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

export function toTimestamp(value: string, timeZone = 'UTC') {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('Enter valid tournament dates.')

  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const targetParts = [Number(yearText), Number(monthText), Number(dayText), Number(hourText), Number(minuteText)]
  const [year, month, day, hour, minute] = targetParts
  const target = Date.UTC(year, month - 1, day, hour, minute)
  const normalized = new Date(target)
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new Error('Enter valid tournament dates.')
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  let candidate = target
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, Number(part.value)]))
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    const adjustment = represented - target
    if (adjustment === 0) return new Date(candidate).toISOString()
    candidate -= adjustment
  }

  throw new Error('This local time is invalid in the selected timezone. Choose another time.')
}