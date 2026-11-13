export function getSafeAuthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === 'SUPABASE_NOT_CONFIGURED') {
    return 'Authentication is temporarily unavailable. Please try again later.'
  }

  if (!error || typeof error !== 'object') return fallback

  const authError = error as { code?: string; status?: number }
  if (authError.status === 429 || authError.code?.includes('rate_limit')) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }

  if (authError.code === 'email_address_invalid' || authError.code === 'validation_failed') {
    return 'Enter a valid email address and try again.'
  }
  if (['email_provider_disabled', 'email_send_failed', 'smtp_error', 'email_address_not_authorized'].includes(authError.code ?? '')) {
    return 'Supabase could not deliver this email. Check the project email provider and SMTP configuration.'
  }
  if (authError.code === 'signup_disabled') {
    return 'New accounts are currently disabled for this platform.'
  }
  if (authError.code === 'user_already_exists') {
    return 'An account already exists for this email. Sign in to continue.'
  }

  switch (authError.code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.'
    case 'email_not_confirmed':
      return 'Unable to sign in with those details. Check your credentials or reset your password.'
    case 'weak_password':
      return 'Choose a password with at least 12 characters.'
    case 'over_email_send_rate_limit':
      return 'A message was sent recently. Wait a few minutes before requesting another.'
    default:
      return fallback
  }
}