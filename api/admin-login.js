import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const trustedAdminRoles = new Set(['admin', 'super_admin', 'super-admin'])

function hasAdminRole(user) {
  const metadata = user?.app_metadata ?? {}
  const candidates = [metadata.role, metadata.admin_role, metadata.roles]

  return candidates.some((candidate) => {
    const roles = Array.isArray(candidate) ? candidate : [candidate]
    return roles.some((role) => (
      typeof role === 'string' && trustedAdminRoles.has(role.trim().toLowerCase())
    ))
  })
}

function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true

  const payload = key.split('.')[1]
  if (!payload) return false

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return claims.role === 'service_role'
  } catch {
    return false
  }
}

function matchesAccessKey(provided, configured) {
  const providedHash = createHash('sha256').update(provided, 'utf8').digest()
  const configuredHash = createHash('sha256').update(configured, 'utf8').digest()
  return timingSafeEqual(providedHash, configuredHash)
}

async function updateLockout(supabase, lockHash, result) {
  const { data, error } = await supabase.rpc('record_admin_access_key_attempt', {
    p_lock_hash: lockHash,
    p_result: result,
  })
  return { state: Array.isArray(data) ? data[0] : data, error }
}

async function findSingleAdmin(supabase) {
  const admins = []

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return { user: null, error }

    admins.push(...data.users.filter(hasAdminRole))
    if (admins.length > 1) return { user: null, error: new Error('AMBIGUOUS_ADMIN_USERS') }
    if (data.users.length < 1000) break
  }

  return admins.length === 1
    ? { user: admins[0], error: null }
    : { user: null, error: new Error('ADMIN_USER_NOT_CONFIGURED') }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const origin = String(request.headers.origin ?? '')
  const requestHost = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase()

  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== requestHost) {
        return response.status(403).json({ error: 'Request denied.' })
      }
    } catch {
      return response.status(403).json({ error: 'Request denied.' })
    }
  }

  const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    return response.status(415).json({ error: 'Request denied.' })
  }

  const accessKey = request.body?.access_key
  if (typeof accessKey !== 'string' || accessKey.length === 0 || accessKey.length > 4096) {
    return response.status(400).json({ error: 'Unable to sign in.' })
  }

  const configuredAccessKey = process.env.ADMIN_ACCESS_KEY
  const sessionSecret = process.env.ADMIN_SESSION_SECRET
  const supabaseUrl = process.env.SUPABASE_URL
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (
    !configuredAccessKey || !/^[\da-f]{64}$/i.test(configuredAccessKey)
    || !sessionSecret || !/^[\da-f]{64}$/i.test(sessionSecret)
    || !supabaseUrl || !serviceRoleKey || !isSecretKey(serviceRoleKey)
  ) {
    return response.status(503).json({ error: 'Admin sign-in is not configured.' })
  }

  let parsedUrl
  try {
    parsedUrl = new URL(supabaseUrl)
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
      return response.status(503).json({ error: 'Admin sign-in is not configured.' })
    }
  } catch {
    return response.status(503).json({ error: 'Admin sign-in is not configured.' })
  }

  try {
    const supabase = createClient(parsedUrl.origin, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const sourceAddress = String(request.headers['x-real-ip'] ?? request.socket?.remoteAddress ?? 'unknown')
      .split(',')[0]
      .trim() || 'unknown'
    const lockHash = createHmac('sha256', Buffer.from(sessionSecret, 'hex'))
      .update(sourceAddress)
      .digest('hex')

    const { state: currentLock, error: lockError } = await updateLockout(supabase, lockHash, 'check')
    if (lockError || !currentLock) {
      return response.status(503).json({ error: 'Admin sign-in is temporarily unavailable.' })
    }
    if (currentLock.is_locked) {
      return response.status(429).json({ error: 'Too many incorrect attempts. Try again in 15 minutes.' })
    }

    if (!matchesAccessKey(accessKey, configuredAccessKey)) {
      const { state: failureState, error: failureError } = await updateLockout(supabase, lockHash, 'failure')
      if (failureError || !failureState) {
        return response.status(503).json({ error: 'Admin sign-in is temporarily unavailable.' })
      }
      if (failureState.is_locked) {
        return response.status(429).json({ error: 'Too many incorrect attempts. Try again in 15 minutes.' })
      }
      return response.status(401).json({ error: 'Unable to sign in. Check the access key and try again.' })
    }

    const { error: clearLockError } = await updateLockout(supabase, lockHash, 'success')
    if (clearLockError) {
      return response.status(503).json({ error: 'Admin sign-in is temporarily unavailable.' })
    }

    const { user, error: adminLookupError } = await findSingleAdmin(supabase)
    if (adminLookupError || !user?.email) {
      return response.status(503).json({ error: 'Configure exactly one Supabase Auth admin for shared-key sign-in.' })
    }

    const { data: linkResult, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })
    const tokenHash = linkResult?.properties?.hashed_token
    if (linkError || !tokenHash || linkResult.user?.id !== user.id || !hasAdminRole(linkResult.user)) {
      return response.status(401).json({ error: 'Unable to establish an admin session.' })
    }

    const { data: sessionResult, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    })
    if (sessionError || !sessionResult.session || !hasAdminRole(sessionResult.user)) {
      return response.status(401).json({ error: 'Unable to establish an admin session.' })
    }

    return response.status(200).json({
      access_token: sessionResult.session.access_token,
      refresh_token: sessionResult.session.refresh_token,
    })
  } catch {
    return response.status(502).json({ error: 'Admin sign-in is temporarily unavailable.' })
  }
}
