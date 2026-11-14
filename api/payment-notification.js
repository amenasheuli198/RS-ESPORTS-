import { createClient } from '@supabase/supabase-js'

const reviewerRoles = new Set(['admin', 'super_admin', 'super-admin', 'payment_reviewer'])

function hasReviewerRole(user) {
  const metadata = user?.app_metadata ?? {}
  const values = [metadata.role, metadata.admin_role, metadata.roles].flatMap((value) => Array.isArray(value) ? value : [value])
  return values.some((value) => typeof value === 'string' && reviewerRoles.has(value.trim().toLowerCase()))
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  const contentType = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') return response.status(415).json({ error: 'Request denied.' })

  const origin = String(request.headers.origin ?? '')
  const requestHost = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '').split(',')[0].trim().toLowerCase()
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== requestHost) return response.status(403).json({ error: 'Request denied.' })
    } catch {
      return response.status(403).json({ error: 'Request denied.' })
    }
  }

  const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const paymentId = request.body?.payment_id
  const expectedStatus = request.body?.status
  if (!token || !/^[0-9a-f-]{36}$/i.test(String(paymentId ?? '')) || !['approved', 'rejected'].includes(expectedStatus)) {
    return response.status(400).json({ error: 'Invalid notification request.' })
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!supabaseUrl || !serviceRoleKey) return response.status(503).json({ error: 'Payment notification verification is not configured.' })
  if (!resendApiKey || !from) return response.status(503).json({ error: 'Email delivery is not configured.' })

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  try {
    const { data: { user: actor }, error: actorError } = await supabase.auth.getUser(token)
    if (actorError || !hasReviewerRole(actor)) return response.status(403).json({ error: 'Payment reviewer authorization required.' })

    const { data: payment, error: paymentError } = await supabase.from('payments')
      .select('id, entry_id, submitted_by, amount, currency, status, rejection_reason, reviewed_by')
      .eq('id', paymentId).maybeSingle()
    if (paymentError || !payment) return response.status(404).json({ error: 'Payment not found.' })
    if (payment.status !== expectedStatus || payment.reviewed_by !== actor.id || payment.submitted_by === actor.id) {
      return response.status(409).json({ error: 'The payment is not in the expected reviewed state.' })
    }

    const { data: claimed, error: claimError } = await supabase.rpc('claim_payment_email_notification', {
      p_payment_id: payment.id,
      p_payment_status: payment.status,
    })
    if (claimError) return response.status(503).json({ error: 'Email notification could not be claimed.' })
    if (!claimed) return response.status(200).json({ sent: true, duplicate: true })

    let deliveryStatus = 'failed'
    let failureReason = 'Notification delivery failed.'
    try {
      const [{ data: entry }, { data: profile }, { data: recipient }] = await Promise.all([
        supabase.from('competition_entries').select('competition_id').eq('id', payment.entry_id).maybeSingle(),
        supabase.from('profiles').select('full_name, phone').eq('id', payment.submitted_by).maybeSingle(),
        supabase.auth.admin.getUserById(payment.submitted_by),
      ])
      if (!entry || !recipient.user?.email || !recipient.user.email_confirmed_at) {
        throw new Error('VERIFIED_RECIPIENT_NOT_FOUND')
      }
      const { data: competition, error: competitionError } = await supabase.from('competitions')
        .select('title, game_code, format_code, competition_type').eq('id', entry.competition_id).maybeSingle()
      if (competitionError || !competition) throw new Error('COMPETITION_NOT_FOUND')

      const approved = payment.status === 'approved'
      const memberName = escapeHtml(profile?.full_name || 'Player')
      const competitionName = escapeHtml(competition.title)
      const game = escapeHtml(competition.game_code.replaceAll('_', ' '))
      const amount = `${escapeHtml(payment.currency)} ${Number(payment.amount).toFixed(2)}`
      const reason = escapeHtml(payment.rejection_reason || '')
      const subject = approved
        ? 'Payment Approved — UNDERGRADUATE HUB E-Sports'
        : 'Payment Rejected — UNDERGRADUATE HUB E-Sports'
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${payment.id}-${payment.status}`,
        },
        body: JSON.stringify({
          from,
          to: [recipient.user.email],
          subject,
          html: `<p>Hello ${memberName},</p><p>Your manual bKash payment for <b>${competitionName}</b> (${game}) was <b>${approved ? 'approved' : 'rejected'}</b>.</p><p>Amount: ${amount}<br>Payment status: ${approved ? 'Approved' : 'Rejected'}<br>Registration status: ${approved ? 'Confirmed' : 'Payment rejected'}</p>${approved ? '<p>Next step: check your competition dashboard for match assignment and room release details.</p>' : `<p>Reason: ${reason || 'Please contact support for details.'}</p>`}<p>UNDERGRADUATE HUB E-Sports</p>`,
        }),
      })
      if (!result.ok) throw new Error(`EMAIL_PROVIDER_HTTP_${result.status}`)
      deliveryStatus = 'sent'
      failureReason = ''
    } catch (error) {
      failureReason = error instanceof Error ? error.message : 'Notification delivery failed.'
    }

    const { error: finishError } = await supabase.rpc('finish_payment_email_notification', {
      p_payment_id: payment.id,
      p_payment_status: payment.status,
      p_delivery_status: deliveryStatus,
      p_error: failureReason || null,
    })
    if (finishError) return response.status(503).json({ error: 'Email result could not be recorded.' })
    if (deliveryStatus !== 'sent') return response.status(502).json({ error: 'Payment was reviewed, but email delivery failed.' })
    return response.status(200).json({ sent: true })
  } catch {
    return response.status(502).json({ error: 'Payment notification service is temporarily unavailable.' })
  }
}
