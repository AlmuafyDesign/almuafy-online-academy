import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const dailyKey = Deno.env.get('DAILY_API_KEY')
  const dailyDomain = Deno.env.get('DAILY_DOMAIN')?.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!token || !supabaseUrl || !serviceRoleKey) return json({ error: 'Sign in is required.' }, 401)
  if (!dailyKey || !dailyDomain) return json({ error: 'Daily calling is not configured yet. Add DAILY_API_KEY and DAILY_DOMAIN to the Edge Function secrets.' }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const user = authData.user
  if (authError || !user) return json({ error: 'Your sign-in has expired. Sign in again.' }, 401)

  let callId = ''
  let action = 'join'
  try {
    const body = await request.json()
    callId = typeof body?.callId === 'string' ? body.callId : ''
    action = typeof body?.action === 'string' ? body.action : 'join'
  } catch { /* Return the same safe validation response below. */ }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId)) return json({ error: 'Invalid call request.' }, 400)

  const [{ data: profile }, { data: call, error: callError }] = await Promise.all([
    admin.from('profiles').select('id,full_name,role,status').eq('id', user.id).maybeSingle(),
    admin.from('academy_video_calls').select('id,caller_id,callee_id,media_mode,status,expires_at,daily_room_name').eq('id', callId).maybeSingle(),
  ])
  if (!profile || profile.status !== 'active' || !['admin', 'student'].includes(profile.role)) return json({ error: 'This academy account cannot join calls.' }, 403)
  if (callError || !call || (call.caller_id !== user.id && call.callee_id !== user.id)) return json({ error: 'This call is not available to your account.' }, 404)
  if (action === 'end') {
    if (call.daily_room_name) {
      const deletion = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(call.daily_room_name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${dailyKey}` } })
      if (!deletion.ok && deletion.status !== 404) return json({ error: 'The Daily call room could not be closed.' }, 502)
    }
    return json({ ended: true })
  }
  if (action !== 'join') return json({ error: 'Invalid call action.' }, 400)
  if (!['ringing', 'accepted'].includes(call.status) || new Date(call.expires_at).getTime() <= Date.now()) return json({ error: 'This call has ended or expired.' }, 410)

  const roomExpiry = Math.floor(Date.now() / 1000) + 4 * 60 * 60
  let roomName = call.daily_room_name as string | null
  if (!roomName) {
    if (call.caller_id !== user.id) return json({ error: 'The caller has not prepared the call room yet. Please try again.' }, 409)
    roomName = `academy-${call.id}`
    const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${dailyKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',
        properties: {
          exp: roomExpiry,
          max_participants: 2,
          enable_chat: false,
          enable_knocking: false,
          start_video_off: true,
          start_audio_off: true,
          eject_at_room_exp: true,
        },
      }),
    })
    if (!roomResponse.ok) return json({ error: 'The secure call room could not be created. Check the Daily account configuration.' }, 502)
    const { error: saveError } = await admin.from('academy_video_calls').update({ daily_room_name: roomName, provider: 'daily' }).eq('id', call.id).is('daily_room_name', null)
    if (saveError) return json({ error: 'The secure call room could not be saved.' }, 500)
  }

  const tokenExpiry = roomExpiry
  const tokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dailyKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: {
      room_name: roomName,
      user_id: user.id,
      user_name: profile.full_name || (profile.role === 'admin' ? 'Academy admin' : 'Student'),
      is_owner: false,
      exp: Math.min(tokenExpiry, roomExpiry),
      eject_at_token_exp: true,
      start_video_off: true,
      start_audio_off: true,
      permissions: {
        hasPresence: true,
        canSend: call.media_mode === 'audio' ? ['audio'] : ['audio', 'video'],
        canAdmin: false,
      },
    } }),
  })
  if (!tokenResponse.ok) return json({ error: 'A secure call access token could not be created.' }, 502)
  const tokenData = await tokenResponse.json()

  // Deliver a real push only for a newly prepared outgoing invitation. Realtime remains
  // the foreground notification path; missing VAPID setup must not block an active call.
  if (call.caller_id === user.id && Deno.env.get('VAPID_PUBLIC_KEY') && Deno.env.get('VAPID_PRIVATE_KEY') && Deno.env.get('VAPID_SUBJECT')) {
    try {
      webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
      const [{ data: recipient }, { data: subscriptions }] = await Promise.all([
        admin.from('profiles').select('full_name').eq('id', call.callee_id).maybeSingle(),
        admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', call.callee_id),
      ])
      const publicUrl = Deno.env.get('ACADEMY_PUBLIC_URL') ?? 'https://almuafydesign.github.io/almuafy-online-academy/'
      const payload = JSON.stringify({
        title: recipient?.full_name ? `কল: ${profile.full_name || 'Academy member'}` : 'Almuafy Academy call',
        body: call.media_mode === 'video' ? 'Incoming video call' : 'Incoming audio call',
        icon: `${publicUrl.replace(/\/$/, '')}/icons/icon-192.png`,
        data: { url: `${publicUrl}?incomingCall=${call.id}` },
      })
      await Promise.allSettled((subscriptions ?? []).map(async subscription => {
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 45 })
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        }
      }))
    } catch (error) {
      console.error('Optional call push delivery failed:', error instanceof Error ? error.message : 'unknown error')
    }
  }

  return json({ url: `https://${dailyDomain}/${roomName}`, token: tokenData.token, mode: call.media_mode })
})
