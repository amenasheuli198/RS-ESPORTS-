import type { User } from '@supabase/supabase-js'

export const AUTHORIZED_ADMIN_EMAIL = 'Nishuthetomlover@gmail.com'

export function hasTournamentAdminClaim(user: User | null): boolean {
  if (!user) return false
  const appMetadata = user.app_metadata as Record<string, unknown> | undefined
  const roleValue = appMetadata?.role
  const emailValue = user.email?.toLowerCase()
  return (roleValue === 'admin' || emailValue === AUTHORIZED_ADMIN_EMAIL.toLowerCase()) && emailValue === AUTHORIZED_ADMIN_EMAIL.toLowerCase()
}