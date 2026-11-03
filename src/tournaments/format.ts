import type { TournamentStatus } from './types'

export { toDateTimeLocal, toTimestamp } from './bannerValidation'

export function formatTournamentDate(value: string, timeZone = 'UTC', includeTime = false): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date to be announced'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone,
    timeZoneName: includeTime ? 'short' : undefined,
  }).format(date)
}

export function formatTournamentMoney(value: number, entryType?: 'free' | 'paid'): string {
  if (entryType === 'free') return 'Free entry'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

export function getTournamentStatusClass(status: TournamentStatus): string {
  return status.toLowerCase().replaceAll(' ', '-')
}

export function getScheduleLines(schedule: unknown): Array<{ title: string; starts_at: string; notes?: string }> {
  if (!Array.isArray(schedule)) return []
  return schedule.filter((item): item is { title: string; starts_at: string; notes?: string } => (
    Boolean(item)
    && typeof item === 'object'
    && typeof item.title === 'string'
    && typeof item.starts_at === 'string'
  ))
}