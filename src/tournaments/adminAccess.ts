import type { User } from '@supabase/supabase-js'

export function hasTournamentAdminClaim(user: User | null): boolean {
  if (!user) return false
  const appMetadata = user.app_metadata as Record<string, unknown> | undefined
  return appMetadata?.role === 'admin'
}