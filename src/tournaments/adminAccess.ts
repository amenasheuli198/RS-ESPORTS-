import type { User } from '@supabase/supabase-js'

const TRUSTED_ADMIN_ROLES = new Set(['admin', 'super_admin', 'super-admin'])

function normalizeRoleValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export function hasTournamentAdminClaim(user: User | null): boolean {
  if (!user) return false

  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>
  const candidates = [appMetadata.role, appMetadata.admin_role, appMetadata.roles]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const role of candidate) {
        const normalized = normalizeRoleValue(role)
        if (normalized && TRUSTED_ADMIN_ROLES.has(normalized)) {
          return true
        }
      }
      continue
    }

    const normalized = normalizeRoleValue(candidate)
    if (normalized && TRUSTED_ADMIN_ROLES.has(normalized)) {
      return true
    }
  }

  return false
}