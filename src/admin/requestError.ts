interface SupabaseRequestError {
  code?: string
  message?: string
}

export function getAdminRequestErrorMessage(error: unknown, fallback: string): string {
  const requestError = error && typeof error === 'object' ? error as SupabaseRequestError : {}
  const code = requestError.code ?? ''
  const message = requestError.message ?? ''

  if (code === '42501' || message.includes('ADMIN_REQUIRED') || message.includes('PAYMENT_REVIEWER_REQUIRED')) {
    return 'Your account does not have permission for this admin view. Sign out and back in after an administrator verifies your role.'
  }
  if (code === 'PGRST202') {
    return `${fallback} The Supabase API schema does not recognize this RPC; reload the database schema and retry.`
  }
  if (code === 'PGRST200') {
    return `${fallback} A referenced table relationship is missing from the Supabase API schema.`
  }
  if (code === '42703' || code === '42P01') {
    return `${fallback} The query references a database column or table that does not exist (${code}).`
  }
  return code ? `${fallback} (Supabase error ${code}).` : fallback
}
