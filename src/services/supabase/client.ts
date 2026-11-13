import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

function readEnvValue(...names: string[]) {
  for (const name of names) {
    const value = import.meta.env[name]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true

  const payload = key.split('.')[1]
  if (!payload) return false

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return (JSON.parse(decoded) as { role?: string }).role === 'service_role'
  } catch {
    return false
  }
}

function getConfiguredValues() {
  return {
    url: readEnvValue('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'),
    publicKey: readEnvValue(
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_ANON_KEY',
    ),
  }
}

export function getSupabaseConfigurationError(): string | null {
  const { url, publicKey } = getConfiguredValues()

  if (!url || !publicKey) {
    return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or your equivalent deployed env vars) before launching the app.'
  }

  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
      return 'The Supabase URL must use HTTPS, except for a local development instance.'
    }
  } catch {
    return 'The Supabase URL is invalid. Check your Supabase URL environment variable.'
  }

  if (isSecretKey(publicKey)) {
    return 'A server-only Supabase secret key cannot be used in the browser. Configure a publishable key instead.'
  }

  return null
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient

  const { url, publicKey } = getConfiguredValues()

  if (getSupabaseConfigurationError() || !url || !publicKey) return null

  supabaseClient = createClient(url, publicKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
  return supabaseClient
}