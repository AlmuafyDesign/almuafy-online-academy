import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DailyCall } from '@daily-co/daily-js'
import type { AcademyProfile } from './services/supabase'
import { supabase } from './services/supabase'
import { bi } from './bilingual'
import { useLanguage } from './language'
import './video-call.css'

type Contact = { user_id: string; full_name: string; role: 'admin' | 'student' }
type CallRow = {
  id: string
  caller_id: string
  callee_id: string
  media_mode: 'audio' | 'video'
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed'
  created_at: string
  expires_at: string
  answered_at: string | null
}
type CallInfo = { id: string; peerId: string; peerName: string; mode: 'audio' | 'video'; direction: 'outgoing' | 'incoming' }
type CallHistoryRow = { id: string; caller_id: string; callee_id: string; caller_name: string; callee_name: string; call_type: 'audio' | 'video'; status: string; created_at: string; duration_seconds: number }
type FloatingSize = 'compact' | 'large' | 'max'

function decodeVapidKey(value: string): ArrayBuffer {
  const padded = value + '='.repeat((4 - value.length % 4) % 4)
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index)
  return bytes.buffer
}

export default function VideoCallManager({ profile }: { profile: AcademyProfile }) {
  const { language } = useLanguage()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [onlineContacts, setOnlineContacts] = useState<Set<string>>(new Set())
  const [contactsOpen, setContactsOpen] = useState(false)
  const [callTab, setCallTab] = useState<'contacts' | 'history'>('contacts')
  const [contactsLoading, setContactsLoading] = useState(false)
  const [history, setHistory] = useState<CallHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [usage, setUsage] = useState<{ participant_minutes: number; monthly_limit: number } | null>(null)
  const [usageLimitDraft, setUsageLimitDraft] = useState('10000')
  const [pushState, setPushState] = useState<'unknown' | 'enabled' | 'unsupported' | 'setup-needed'>('unknown')
  const [pushBusy, setPushBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [incoming, setIncoming] = useState<CallRow | null>(null)
  const [activeCall, setActiveCall] = useState<CallInfo | null>(null)
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'failed'>('ringing')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [speakerOutputIndex, setSpeakerOutputIndex] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const [floatingSize, setFloatingSize] = useState<FloatingSize>('compact')
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState('')
  const [callerName, setCallerName] = useState('')
  const alertChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const signalChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const dailyCallRef = useRef<DailyCall | null>(null)
  const dailyCredentialsRef = useRef<{ url: string; token: string } | null>(null)
  const joinDailyRoomRef = useRef<(callId: string, mode: 'audio' | 'video') => Promise<void>>(async () => undefined)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const activeCallRef = useRef<CallInfo | null>(null)
  const incomingRef = useRef<CallRow | null>(null)
  const connectedAtRef = useRef<number | null>(null)
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null)
  const callStatusRef = useRef(callStatus)
  const localText = useCallback((bn: string, en: string) => bi(bn, en, language), [language])

  useEffect(() => { activeCallRef.current = activeCall }, [activeCall])
  useEffect(() => { incomingRef.current = incoming }, [incoming])
  useEffect(() => { callStatusRef.current = callStatus }, [callStatus])
  useEffect(() => { if (localVideoRef.current) localVideoRef.current.srcObject = localStream }, [localStream])
  useEffect(() => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream }, [remoteStream])
  useEffect(() => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream }, [remoteStream])

  const cleanMedia = useCallback(() => {
    const dailyCall = dailyCallRef.current
    dailyCallRef.current = null
    dailyCredentialsRef.current = null
    if (dailyCall && !dailyCall.isDestroyed()) void dailyCall.leave().catch(() => undefined).finally(() => void dailyCall.destroy().catch(() => undefined))
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
  }, [])

  const removeChannel = useCallback((ref: typeof signalChannelRef | typeof alertChannelRef) => {
    if (ref.current && supabase) void supabase.removeChannel(ref.current)
    ref.current = null
  }, [])

  const closeCallWindow = useCallback(() => {
    const callId = activeCallRef.current?.id
    if (callId) void supabase?.functions.invoke('daily-call-session', { body: { callId, action: 'end' } })
    removeChannel(signalChannelRef)
    cleanMedia()
    activeCallRef.current = null
    setActiveCall(null)
    setCallStatus('ringing')
    setMinimized(false)
    setFloatingSize('compact')
    setPosition(null)
    setSeconds(0)
    connectedAtRef.current = null
  }, [cleanMedia, removeChannel])

  const sendSignal = useCallback(async (event: string, payload: Record<string, unknown> = {}) => {
    const channel = signalChannelRef.current
    if (!channel) return false
    try {
      const result = await channel.send({ type: 'broadcast', event, payload })
      return result === 'ok'
    } catch { return false }
  }, [])

  const joinSignalChannel = useCallback((callId: string) => new Promise<ReturnType<NonNullable<typeof supabase>['channel']>>((resolve, reject) => {
    if (!supabase) return reject(new Error('Supabase connection is not configured.'))
    if (signalChannelRef.current) void supabase.removeChannel(signalChannelRef.current)
    const channel = supabase.channel(`academy-call:${callId}`, { config: { private: true, broadcast: { self: false, ack: true } } })
      .on('broadcast', { event: 'call_ready' }, () => {
        if (activeCallRef.current?.direction === 'outgoing') void joinDailyRoomRef.current(callId, activeCallRef.current.mode)
      })
      .on('broadcast', { event: 'call_rejected' }, () => {
        setNotice(localText('কলটি গ্রহণ করা হয়নি।', 'The call was declined.'))
        closeCallWindow()
      })
      .on('broadcast', { event: 'call_ended' }, () => {
        setNotice(localText('কল শেষ হয়েছে।', 'The call has ended.'))
        closeCallWindow()
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { signalChannelRef.current = channel; resolve(channel) }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reject(new Error(localText('কল সংযোগ তৈরি করা যায়নি। আবার চেষ্টা করুন।', 'Could not connect to call signaling. Please try again.')))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [closeCallWindow, localText])

  const syncDailyTracks = useCallback((call: DailyCall) => {
    const participants = Object.values(call.participants()) as Array<any>
    const local = participants.find(participant => participant.local)
    const remote = participants.find(participant => !participant.local)
    const toStream = (participant: any) => {
      if (!participant) return null
      const tracks = [participant.tracks?.audio?.persistentTrack, participant.tracks?.video?.persistentTrack]
        .filter((track): track is MediaStreamTrack => Boolean(track && track.readyState === 'live'))
      return tracks.length ? new MediaStream(tracks) : null
    }
    const localMedia = toStream(local)
    const remoteMedia = toStream(remote)
    localStreamRef.current = localMedia
    setLocalStream(localMedia)
    setRemoteStream(remoteMedia)
    setMicEnabled(Boolean(local?.tracks?.audio?.state === 'playable' || call.localAudio()))
    setCameraEnabled(Boolean(local?.tracks?.video?.state === 'playable' || call.localVideo()))
    if (remote) setCallStatus('connected')
    else if (call.meetingState() === 'joined-meeting') setCallStatus('connecting')
  }, [])

  const joinDailyRoom = useCallback(async (callId: string, mode: 'audio' | 'video', credentials?: { url: string; token: string }) => {
    if (dailyCallRef.current) return
    setCallStatus('connecting')
    let access = credentials ?? dailyCredentialsRef.current
    if (!access) {
      const { data, error } = await supabase!.functions.invoke('daily-call-session', { body: { callId } })
      if (error || !data?.url || !data?.token) throw new Error(data?.error ?? localText('নিরাপদ কল সংযোগ তৈরি হয়নি। Daily সেটিংস যাচাই করুন।', 'Could not prepare a secure call connection. Check the Daily settings.'))
      access = { url: data.url, token: data.token }
    }
    const { default: DailyIframe } = await import('@daily-co/daily-js')
    const call = DailyIframe.createCallObject()
    dailyCallRef.current = call
    const sync = () => syncDailyTracks(call)
    call.on('joined-meeting', sync).on('participant-joined', sync).on('participant-updated', sync).on('participant-left', sync).on('track-started', sync).on('track-stopped', sync)
      .on('network-connection', (event: any) => /disconnect|interrupt|fail/i.test(event?.event ?? '') ? setCallStatus('reconnecting') : sync())
      .on('error', () => {
        setCallStatus('failed')
        const current = activeCallRef.current
        if (current) void supabase?.rpc('fail_academy_video_call', { p_call_id: current.id })
      })
      .on('left-meeting', () => { if (activeCallRef.current) setCallStatus('reconnecting') })
    try {
      await call.join({ url: access.url, token: access.token, startAudioOff: true, startVideoOff: true, userName: profile.full_name || 'Academy member' })
      try { await call.setLocalAudio(true) } catch {
        setMicEnabled(false)
        setNotice(localText('আপনার device-এ microphone নেই বা অনুমতি বন্ধ। অপর পক্ষের কথা শুনতে পারবেন।', 'No microphone was found or microphone access is blocked. You can still hear the other person.'))
      }
      if (mode === 'video') {
        try { await call.setLocalVideo(true) } catch {
          setCameraEnabled(false)
          setNotice(localText('আপনার device-এ camera নেই বা অনুমতি বন্ধ। Audio call চলবে; অপর পক্ষের video দেখতে পারবেন।', 'No camera was found or camera access is blocked. Audio will work; you can still see the other person.'))
        }
      }
      sync()
    } catch (error) {
      setCallStatus('failed')
      const message = error instanceof Error ? error.message : ''
      setNotice(message || localText('কল সংযোগ তৈরি হয়নি।', 'The call could not connect.'))
      dailyCallRef.current = null
      void call.leave().catch(() => undefined).finally(() => void call.destroy().catch(() => undefined))
      throw error
    }
  }, [localText, profile.full_name, syncDailyTracks])

  const prepareDailyRoom = useCallback(async (callId: string) => {
    const { data, error } = await supabase!.functions.invoke('daily-call-session', { body: { callId } })
    if (error || !data?.url || !data?.token) throw new Error(data?.error ?? localText('নিরাপদ কল রুম তৈরি হয়নি। Daily সেটিংস যাচাই করুন।', 'Could not create a secure call room. Check the Daily settings.'))
    dailyCredentialsRef.current = { url: data.url, token: data.token }
  }, [localText])
  joinDailyRoomRef.current = (callId, mode) => joinDailyRoom(callId, mode)

  const loadContacts = useCallback(async () => {
    if (!supabase) return
    setContactsLoading(true)
    const { data, error } = await supabase.rpc('get_academy_video_call_contacts')
    setContactsLoading(false)
    if (error) { setNotice(localText('কলের সুবিধা চালু হয়নি। Supabase setup সম্পন্ন করতে হবে।', 'Calling is not set up yet. The Supabase setup must be completed.')); return }
    setContacts((data ?? []) as Contact[])
  }, [localText])

  const loadCallHistory = useCallback(async () => {
    if (!supabase) return
    setHistoryLoading(true)
    const { data, error } = await supabase.rpc('get_academy_call_history', { p_limit: 50 })
    setHistoryLoading(false)
    if (error) { setNotice(localText('কলের ইতিহাস লোড হয়নি। নতুন database migration চালাতে হবে।', 'Call history is unavailable. Apply the new database migration.')); return }
    setHistory((data ?? []) as CallHistoryRow[])
  }, [localText])

  const loadCallUsage = useCallback(async () => {
    if (profile.role !== 'admin' || !supabase) return
    const { data, error } = await supabase.rpc('get_academy_call_usage')
    if (!error && data?.[0]) { setUsage(data[0]); setUsageLimitDraft(String(data[0].monthly_limit)) }
  }, [profile.role])

  const enableCallPush = async () => {
    if (!supabase || pushBusy) return
    setPushBusy(true)
    try {
      if (pushState === 'enabled') {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await supabase.from('push_subscriptions').delete().eq('user_id', profile.id).eq('endpoint', subscription.endpoint)
          await subscription.unsubscribe()
        }
        setPushState('unknown')
        setNotice(localText('কলের push notification বন্ধ হয়েছে।', 'Call push notifications are off.'))
        return
      }
      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushState('unsupported')
        throw new Error(localText('এই browser-এ push notification সমর্থিত নয়।', 'This browser does not support push notifications.'))
      }
      if (!publicKey) {
        setPushState('setup-needed')
        throw new Error(localText('Push চালু করতে VAPID public key configure করতে হবে।', 'A VAPID public key must be configured before push notifications can be enabled.'))
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') throw new Error(localText('Browser settings-এ notification অনুমতি দিন।', 'Allow notifications in your browser settings.'))
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) })
      const saved = subscription.toJSON()
      if (!saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) throw new Error(localText('Push subscription সংরক্ষণ করা যায়নি।', 'The push subscription could not be saved.'))
      const { error } = await supabase.from('push_subscriptions').upsert({ user_id: profile.id, endpoint: saved.endpoint, p256dh: saved.keys.p256dh, auth: saved.keys.auth, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
      if (error) throw error
      setPushState('enabled')
      setNotice(localText('ইনকামিং call notification চালু হয়েছে।', 'Incoming call notifications are enabled.'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : localText('Push notification চালু হয়নি।', 'Push notifications could not be enabled.'))
    } finally { setPushBusy(false) }
  }

  const saveUsageLimit = async () => {
    if (!supabase) return
    const limit = Number(usageLimitDraft)
    const { data, error } = await supabase.rpc('set_academy_call_monthly_limit', { p_limit: limit })
    if (error) { setNotice(localText('মাসিক call limit সংরক্ষণ হয়নি।', 'The monthly calling limit was not saved.')); return }
    setUsage(current => current ? { ...current, monthly_limit: data } : current)
    setNotice(localText('মাসিক usage limit সংরক্ষিত হয়েছে।', 'The monthly usage limit has been saved.'))
  }

  const showIncoming = useCallback(async (callId: string) => {
    if (!supabase || activeCallRef.current || incomingRef.current) return
    const { data } = await supabase.from('academy_video_calls')
      .select('id,caller_id,callee_id,media_mode,status,created_at,expires_at,answered_at')
      .eq('id', callId).eq('callee_id', profile.id).eq('status', 'ringing').gt('expires_at', new Date().toISOString()).maybeSingle()
    if (!data) return
    setIncoming(data as CallRow)
    setCallerName(localText('একাডেমি সদস্য', 'Academy member'))
  }, [localText, profile.id])

  useEffect(() => {
    if (!supabase) return
    void loadContacts()
    void loadCallUsage()
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) setPushState('unsupported')
    else void navigator.serviceWorker.ready.then(async registration => {
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) return
      const { data } = await supabase!.from('push_subscriptions').select('id').eq('user_id', profile.id).eq('endpoint', subscription.endpoint).maybeSingle()
      if (data) setPushState('enabled')
    }).catch(() => undefined)
    const channel = supabase.channel(`academy-call-alerts:${profile.id}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        const callId = typeof payload?.callId === 'string' ? payload.callId : ''
        if (callId) void showIncoming(callId)
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') alertChannelRef.current = channel })
    const presence = supabase.channel('academy-call-presence', { config: { private: true, presence: { key: profile.id } } })
      .on('presence', { event: 'sync' }, () => setOnlineContacts(new Set(Object.keys(presence.presenceState()))))
      .subscribe(status => { if (status === 'SUBSCRIBED') void presence.track({ online_at: new Date().toISOString() }) })
    void supabase.from('academy_video_calls')
      .select('id,caller_id,callee_id,media_mode,status,created_at,expires_at,answered_at')
      .eq('callee_id', profile.id).eq('status', 'ringing').gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) void showIncoming(data.id) })
    return () => { removeChannel({ current: channel }); removeChannel({ current: presence }) }
  }, [loadCallUsage, loadContacts, profile.id, removeChannel, showIncoming])

  useEffect(() => {
    if (!activeCall) return
    const client = supabase
    if (!client) return
    const timer = window.setInterval(async () => {
      const { data } = await client.from('academy_video_calls').select('status,expires_at,answered_at').eq('id', activeCall.id).maybeSingle()
      if (!data) return
      if (data.status === 'rejected' || data.status === 'missed' || data.status === 'ended' || data.status === 'failed') {
        setNotice(data.status === 'rejected' ? localText('কলটি গ্রহণ করা হয়নি।', 'The call was declined.') : data.status === 'missed' ? localText('কলের উত্তর পাওয়া যায়নি।', 'There was no answer.') : data.status === 'failed' ? localText('কলের সংযোগ ব্যর্থ হয়েছে।', 'The call connection failed.') : localText('কল শেষ হয়েছে।', 'The call has ended.'))
        closeCallWindow()
      } else if (data.status === 'accepted' && new Date(data.expires_at).getTime() <= Date.now()) {
        await client.rpc('finish_academy_video_call', { p_call_id: activeCall.id })
        setNotice(localText('অন্যজনের সংযোগ বিচ্ছিন্ন হয়েছে।', 'The other person disconnected.'))
        closeCallWindow()
      } else if (data.status === 'accepted') setCallStatus(current => current === 'ringing' ? 'connecting' : current)
      if (callStatusRef.current === 'ringing' && data.status === 'ringing' && new Date(data.expires_at).getTime() <= Date.now()) {
        await client.rpc('finish_academy_video_call', { p_call_id: activeCall.id })
        setNotice(localText('কলের উত্তর পাওয়া যায়নি।', 'There was no answer.'))
        closeCallWindow()
      }
    }, 8000)
    return () => window.clearInterval(timer)
  }, [activeCall, closeCallWindow, localText])

  useEffect(() => {
    if (!activeCall) return
    const client = supabase
    if (!client) return
    const timer = window.setInterval(async () => {
      const state = dailyCallRef.current?.meetingState()
      if (state === 'joined-meeting') {
        const { data, error } = await client.rpc('keep_academy_video_call_alive', { p_call_id: activeCall.id })
        if (!error && data === false && activeCallRef.current?.id === activeCall.id) {
          await sendSignal('call_ended', { userId: profile.id, reason: 'monthly-limit' })
          setNotice(localText('কল বন্ধ হয়েছে। মাসিক call limit বা কলের অবস্থা যাচাই করুন।', 'The call has ended. Check the monthly calling limit or call status.'))
          closeCallWindow()
        }
      }
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [activeCall, closeCallWindow, localText, profile.id, sendSignal])

  useEffect(() => {
    if (!incoming) return
    const remaining = Math.max(0, new Date(incoming.expires_at).getTime() - Date.now())
    const timer = window.setTimeout(() => setIncoming(current => current?.id === incoming.id ? null : current), remaining)
    return () => window.clearTimeout(timer)
  }, [incoming])

  useEffect(() => {
    if (!incoming) return
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return
    let context: AudioContext
    try { context = new AudioContextClass() } catch { return }
    const ring = () => {
      if (context.state !== 'running') return
      const start = context.currentTime
      ;[0, 0.24].forEach(offset => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = offset ? 784 : 659
        gain.gain.setValueAtTime(0.0001, start + offset)
        gain.gain.exponentialRampToValueAtTime(0.08, start + offset + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18)
        oscillator.connect(gain); gain.connect(context.destination)
        oscillator.start(start + offset); oscillator.stop(start + offset + 0.19)
      })
    }
    void context.resume().then(ring).catch(() => undefined)
    const timer = window.setInterval(ring, 1800)
    return () => { window.clearInterval(timer); void context.close().catch(() => undefined) }
  }, [incoming?.id])

  useEffect(() => {
    if (!incoming) return
    const caller = contacts.find(item => item.user_id === incoming.caller_id)
    if (caller) setCallerName(caller.full_name)
  }, [contacts, incoming])

  useEffect(() => {
    if (!activeCall || (callStatus !== 'connected' && connectedAtRef.current === null)) return
    if (callStatus === 'connected' && connectedAtRef.current === null) connectedAtRef.current = Date.now()
    const start = connectedAtRef.current ?? Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [activeCall, callStatus])

  const startCall = async (contact: Contact, mode: 'audio' | 'video') => {
    if (!supabase || busy || activeCallRef.current) return
    setBusy(contact.user_id); setNotice('')
    let callId: string | null = null
    let targetAlertChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    try {
      const { data, error } = await supabase.rpc('create_academy_video_call', { p_recipient_id: contact.user_id, p_media_mode: mode })
      if (error || !data) throw new Error(error?.message ?? 'Could not create call.')
      callId = data as string
      const callInfo: CallInfo = { id: callId, peerId: contact.user_id, peerName: contact.full_name, mode, direction: 'outgoing' }
      activeCallRef.current = callInfo
      setActiveCall(callInfo); setCallStatus('ringing'); setContactsOpen(false); setMinimized(false)
      const [signalChannel, targetAlert] = await Promise.all([
        joinSignalChannel(callId),
        (async () => {
          const channel = supabase.channel(`academy-call-alerts:${contact.user_id}`, { config: { private: true, broadcast: { self: false, ack: true } } })
          const result = await new Promise<string>((resolve, reject) => channel.subscribe(status => {
            if (status === 'SUBSCRIBED') resolve('SUBSCRIBED')
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reject(new Error('Could not reach this account.'))
          }))
          if (result !== 'SUBSCRIBED') throw new Error('Could not reach this account.')
          return channel
        })(),
      ])
      targetAlertChannel = targetAlert
      void signalChannel
      await prepareDailyRoom(callId)
      const sent = await targetAlert.send({ type: 'broadcast', event: 'incoming_call', payload: { callId } })
      void supabase.removeChannel(targetAlert)
      targetAlertChannel = null
      if (sent !== 'ok') throw new Error(localText('কলের অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।', 'The call invitation could not be sent. Please try again.'))
    } catch (error) {
      if (targetAlertChannel) void supabase.removeChannel(targetAlertChannel)
      const msg = error instanceof Error ? error.message : ''
      const permission = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
      const limit = msg.toLowerCase().includes('monthly calling limit')
      const busyUser = msg.toLowerCase().includes('already in a call')
      setNotice(permission ? localText('কল করতে camera/microphone permission দিন।', 'Allow camera and microphone access to call.') : limit ? localText('এই মাসের নির্ধারিত call limit পূর্ণ হয়েছে।', 'The configured monthly calling limit has been reached.') : busyUser ? localText('আপনি বা অন্যজন ইতিমধ্যে কলে আছেন।', 'You or the other person is already in a call.') : msg || localText('কল শুরু করা যায়নি। আবার চেষ্টা করুন।', 'Could not start the call. Please try again.'))
      if (callId) await supabase.rpc('fail_academy_video_call', { p_call_id: callId })
      closeCallWindow()
    } finally { setBusy('') }
  }

  const acceptCall = async () => {
    if (!supabase || !incoming || busy) return
    const invite = incoming
    setBusy(invite.id); setNotice('')
    try {
      const info: CallInfo = { id: invite.id, peerId: invite.caller_id, peerName: callerName, mode: invite.media_mode, direction: 'incoming' }
      const channel = await joinSignalChannel(invite.id)
      const { data: accepted, error } = await supabase.rpc('respond_to_academy_video_call', { p_call_id: invite.id, p_accept: true })
      if (error || !accepted) throw new Error(localText('এই কলটি আর চালু নেই।', 'This call is no longer available.'))
      activeCallRef.current = info; setActiveCall(info); setCallStatus('connecting'); setIncoming(null); setMinimized(false)
      await joinDailyRoom(invite.id, invite.media_mode)
      await channel.send({ type: 'broadcast', event: 'call_ready', payload: { userId: profile.id } })
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      const permission = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
      setNotice(permission ? localText('কল নিতে camera/microphone permission দিন।', 'Allow camera and microphone access to answer.') : msg || localText('কল গ্রহণ করা যায়নি।', 'Could not answer the call.'))
      if (activeCallRef.current?.id === invite.id) await supabase.rpc('fail_academy_video_call', { p_call_id: invite.id })
      removeChannel(signalChannelRef)
      setIncoming(null)
    } finally { setBusy('') }
  }

  const declineCall = async () => {
    if (!supabase || !incoming) return
    const invite = incoming
    try {
      const channel = await joinSignalChannel(invite.id)
      await channel.send({ type: 'broadcast', event: 'call_rejected', payload: { userId: profile.id } })
    } catch { /* The invitation may have expired while the user was deciding. */ }
    await supabase.rpc('respond_to_academy_video_call', { p_call_id: invite.id, p_accept: false })
    void supabase.functions.invoke('daily-call-session', { body: { callId: invite.id, action: 'end' } })
    removeChannel(signalChannelRef)
    setIncoming(null)
  }

  const hangup = async () => {
    if (!supabase || !activeCallRef.current) return
    const id = activeCallRef.current.id
    await sendSignal('call_ended', { userId: profile.id })
    await supabase.rpc('finish_academy_video_call', { p_call_id: id })
    closeCallWindow()
  }

  const toggleMic = () => {
    const next = !micEnabled
    dailyCallRef.current?.setLocalAudio(next)
    setMicEnabled(next)
  }
  const toggleCamera = () => {
    const next = !cameraEnabled
    if (!localStreamRef.current?.getVideoTracks().length && next) {
      setNotice(localText('এই device-এ camera পাওয়া যায়নি।', 'No camera is available on this device.'))
      return
    }
    dailyCallRef.current?.setLocalVideo(next)
    setCameraEnabled(next)
  }
  const cycleSpeaker = async () => {
    const call = dailyCallRef.current
    if (!call) return
    try {
      const { devices } = await call.enumerateDevices()
      const outputs = devices.filter(device => device.kind === 'audiooutput' && device.deviceId)
      if (!outputs.length) throw new Error(localText('এই browser-এ speaker নির্বাচন সমর্থিত নয়।', 'Speaker selection is not supported in this browser.'))
      const nextIndex = (speakerOutputIndex + 1) % outputs.length
      await call.setOutputDeviceAsync({ outputDeviceId: outputs[nextIndex].deviceId })
      setSpeakerOutputIndex(nextIndex)
      setNotice(outputs.length > 1 ? localText(`Speaker: ${outputs[nextIndex].label || nextIndex + 1}`, `Speaker: ${outputs[nextIndex].label || nextIndex + 1}`) : localText('Default speaker ব্যবহার হচ্ছে। Volume device থেকে বদলান।', 'Using the default speaker. Change volume on your device.'))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : localText('Speaker বদলানো যায়নি।', 'Could not change the speaker.'))
    }
  }
  const formatDuration = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
  const statusText = callStatus === 'ringing' ? activeCall?.direction === 'outgoing' ? localText('কল করা হচ্ছে…', 'Calling…') : localText('সংযোগ হচ্ছে…', 'Connecting…')
    : callStatus === 'connecting' ? localText('সংযোগ করা হচ্ছে…', 'Connecting…')
      : callStatus === 'connected' ? formatDuration(seconds)
        : callStatus === 'reconnecting' ? localText('আবার সংযোগ হচ্ছে…', 'Reconnecting…') : localText('ইন্টারনেট সচল থাকতে পারে, তবে কল সেবায় সংযোগ হয়নি। আবার চেষ্টা করুন।', 'Your internet may be working, but the call service could not connect. Please try again.')

  const onDragStart = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const rect = event.currentTarget.closest('.academy-call-window')?.getBoundingClientRect()
    if (!rect) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    setPosition({ x: rect.left, y: rect.top })
  }
  const onDragMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const width = Math.min(900, window.innerWidth - 20)
    const height = Math.min(720, window.innerHeight - 20)
    setPosition({ x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.dx)), y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - drag.dy)) })
  }
  const onDragEnd = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  if (!supabase) return null
  return <>
    <div className="academy-call-launcher-wrap">
      <button className="academy-call-launcher" onClick={() => { setContactsOpen(value => !value); setNotice(''); if (!contacts.length) void loadContacts() }} aria-expanded={contactsOpen}>
        <span className="academy-call-launcher-icon" aria-hidden="true">☎</span>
        <span>{localText('কল করুন', 'Call')}</span>
        {incoming && <i className="academy-call-incoming-dot" aria-label={localText('ইনকামিং কল', 'Incoming call')}/>}
      </button>
      {contactsOpen && createPortal(<section className="academy-call-contacts" aria-label={localText('কলের জন্য একাডেমি সদস্য', 'Academy call contacts')}>
        <header><div><small>{localText('যেকোনো সময়', 'ANYTIME')}</small><h2>{localText('অডিও বা ভিডিও কল', 'Audio or video call')}</h2></div><button className="academy-call-close" onClick={() => setContactsOpen(false)} aria-label={localText('বন্ধ করুন', 'Close')}>×</button></header>
        <p>{profile.role === 'admin' ? localText('শিক্ষার্থী নির্বাচন করে audio বা video call করুন।', 'Choose a student for an audio or video call.') : localText('একাডেমি Admin-কে audio বা video call করুন।', 'Call an academy administrator by audio or video.')}</p>
        {notice && <div className="academy-call-notice" role="status">{notice}</div>}
        <div className="academy-call-tabs"><button className={callTab === 'contacts' ? 'active' : ''} onClick={() => setCallTab('contacts')}>{localText('কল করুন', 'Call someone')}</button><button className={callTab === 'history' ? 'active' : ''} onClick={() => { setCallTab('history'); void loadCallHistory() }}>{localText('কলের ইতিহাস', 'Call history')}</button></div>
        {profile.role === 'admin' && usage && <div className="academy-call-usage"><div><b>{localText('এই মাসের ব্যবহার', 'This month')}</b><span>{usage.participant_minutes.toLocaleString()} / {usage.monthly_limit.toLocaleString()} {localText('অংশগ্রহণকারী-মিনিট', 'participant minutes')}</span></div><div className="academy-call-usage-bar"><i style={{ width: `${Math.min(100, usage.participant_minutes / usage.monthly_limit * 100)}%` }}/></div>{usage.participant_minutes >= usage.monthly_limit * .8 && <small className="usage-warning">{localText('মাসিক সীমার কাছাকাছি—Daily.co account-এ ব্যবহার দেখুন।', 'Near the monthly limit—check usage in the Daily.co account.')}</small>}<div className="academy-call-limit"><label>{localText('মাসিক সীমা', 'Monthly limit')}<input type="number" min="1" max="10000000" value={usageLimitDraft} onChange={event => setUsageLimitDraft(event.target.value)}/></label><button onClick={() => void saveUsageLimit()}>{localText('সংরক্ষণ', 'Save')}</button></div></div>}
        {callTab === 'contacts' ? <div className="academy-call-contact-list">
          {contactsLoading ? <div className="academy-call-empty">{localText('তালিকা লোড হচ্ছে…', 'Loading contacts…')}</div>
            : contacts.length ? contacts.map(contact => <article className="academy-call-contact" key={contact.user_id}>
              <span className="academy-call-avatar">{Array.from(contact.full_name)[0] || (contact.role === 'admin' ? 'A' : 'শ')}</span>
              <div className="academy-call-contact-name"><b>{contact.full_name}</b><small>{contact.role === 'admin' ? localText('একাডেমি Admin', 'Academy admin') : localText('শিক্ষার্থী', 'Student')} · {onlineContacts.has(contact.user_id) ? localText('অনলাইন', 'Online') : localText('অফলাইন', 'Offline')}</small></div>
              <button className="academy-call-mode audio" disabled={Boolean(busy)} onClick={() => void startCall(contact, 'audio')} aria-label={`${localText('অডিও কল করুন', 'Start audio call')} ${contact.full_name}`} title={localText('অডিও কল', 'Audio call')}>☎</button>
              <button className="academy-call-mode video" disabled={Boolean(busy)} onClick={() => void startCall(contact, 'video')} aria-label={`${localText('ভিডিও কল করুন', 'Start video call')} ${contact.full_name}`} title={localText('ভিডিও কল', 'Video call')}>▣</button>
            </article>)
              : <div className="academy-call-empty">{localText('এখন কল করার মতো সক্রিয় account নেই।', 'No active call contacts are available.')}</div>}
        </div> : <div className="academy-call-history-list">{historyLoading ? <div className="academy-call-empty">{localText('ইতিহাস লোড হচ্ছে…', 'Loading history…')}</div> : history.length ? history.map(item => <article key={item.id}><span className={`history-mark ${item.call_type}`}>{item.call_type === 'video' ? '▣' : '☎'}</span><div><b>{item.caller_id === profile.id ? item.callee_name : item.caller_name}</b><small>{new Date(item.created_at).toLocaleString(language === 'en' ? 'en-US' : 'bn-BD')} · {item.duration_seconds ? formatDuration(item.duration_seconds).replace(/^0:/, '') : ''}</small></div><em>{item.status === 'ended' ? localText('সম্পন্ন', 'Completed') : item.status === 'missed' ? localText('মিসড', 'Missed') : item.status === 'rejected' ? localText('প্রত্যাখ্যাত', 'Rejected') : item.status === 'failed' ? localText('ব্যর্থ', 'Failed') : item.status}</em></article>) : <div className="academy-call-empty">{localText('এখনও কোনো কলের ইতিহাস নেই।', 'There is no call history yet.')}</div>}</div>}
        <div className="academy-call-push"><div><b>{localText('কলের notification', 'Call notifications')}</b><small>{localText('App বন্ধ বা background-এ থাকলেও incoming call-এর খবর পান।', 'Get incoming call alerts when the app is in the background.')}</small></div><button disabled={pushBusy || pushState === 'unsupported'} onClick={() => void enableCallPush()}>{pushBusy ? '…' : pushState === 'enabled' ? localText('বন্ধ করুন', 'Turn off') : pushState === 'unsupported' ? localText('সমর্থিত নয়', 'Unavailable') : localText('চালু করুন', 'Enable')}</button></div>
        <footer><span>🔒</span> {localText('কলের media Daily.co পরিচালনা করে; app বন্ধ থাকলে notification browser-এর সমর্থনের ওপর নির্ভর করে।', 'Daily.co carries call media; notifications while closed depend on browser support.')}</footer>
      </section>, document.body)}
    </div>

    {notice && !contactsOpen && !activeCall && !incoming && createPortal(<div className="academy-call-toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label={localText('বন্ধ করুন', 'Dismiss')}>×</button></div>, document.body)}

    {incoming && !activeCall && createPortal(<section className="academy-incoming-call" role="dialog" aria-modal="false" aria-label={localText('ইনকামিং কল', 'Incoming call')}>
      <div className="academy-incoming-wave" aria-hidden="true">◖</div><small>{localText('ইনকামিং কল', 'INCOMING CALL')}</small><h2>{callerName || localText('একাডেমি সদস্য', 'Academy member')}</h2><p>{incoming.media_mode === 'video' ? localText('ভিডিও কল করছেন', 'is video calling you') : localText('অডিও কল করছেন', 'is audio calling you')}</p>
      <div className="academy-incoming-actions"><button className="decline" onClick={() => void declineCall()} aria-label={localText('কল বাতিল', 'Decline call')}>×</button><button className="accept" disabled={Boolean(busy)} onClick={() => void acceptCall()} aria-label={localText('কল গ্রহণ', 'Answer call')}>{incoming.media_mode === 'video' ? '▣' : '☎'}</button></div>
      {notice && <div className="academy-call-notice">{notice}</div>}
    </section>, document.body)}

    {activeCall && createPortal(<section className={`academy-call-window size-${floatingSize} ${minimized ? 'is-minimized' : ''} ${activeCall.mode === 'audio' ? 'audio-only' : ''}`} style={position && !minimized && floatingSize !== 'max' ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined} role="dialog" aria-label={localText('ভিডিও কল', 'Video call')}>
      <header className="academy-call-titlebar" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
        <span className="academy-call-live-dot"/><div><b>{activeCall.peerName}</b><small>{statusText}</small></div>
        <div className="academy-call-window-tools">
          <button onClick={() => setMinimized(value => !value)} title={minimized ? localText('ফিরিয়ে আনুন', 'Restore') : localText('ছোট করুন', 'Minimize')} aria-label={minimized ? localText('ফিরিয়ে আনুন', 'Restore') : localText('ছোট করুন', 'Minimize')}>{minimized ? '□' : '−'}</button>
          {!minimized && <button onClick={() => { setFloatingSize(size => size === 'compact' ? 'large' : size === 'large' ? 'max' : 'compact'); setPosition(null) }} title={localText('স্ক্রিনের আকার বদলান', 'Resize call window')} aria-label={localText('স্ক্রিনের আকার বদলান', 'Resize call window')}>{floatingSize === 'max' ? '↙' : '↗'}</button>}
          <button className="close-call" onClick={() => void hangup()} title={localText('কল শেষ করুন', 'End call')} aria-label={localText('কল শেষ করুন', 'End call')}>×</button>
        </div>
      </header>
      <div className={`academy-call-body ${minimized ? 'is-hidden' : ''}`}>
        <div className="academy-call-stage">
          {activeCall.mode === 'video' ? <>
            <video className="academy-remote-video" ref={remoteVideoRef} autoPlay playsInline muted/>
            {!remoteStream && <div className="academy-call-placeholder"><span>{Array.from(activeCall.peerName)[0] || 'A'}</span><b>{activeCall.peerName}</b><small>{callStatus === 'failed' ? localText('অন্য device বা network দিয়ে চেষ্টা করুন।', 'Try another device or network.') : localText('অন্যজনের camera যুক্ত হওয়ার অপেক্ষায়…', 'Waiting for the other camera…')}</small></div>}
            <video className="academy-local-video" ref={localVideoRef} autoPlay playsInline muted/>
            {!localStream?.getVideoTracks().length && <div className="academy-camera-off">{localText('আপনার device-এ camera নেই — audio call চলবে, অপর পক্ষের video দেখতে পারবেন', 'No camera on your device — audio will work, and you can still see the other person')}</div>}
          </> : <div className="academy-audio-stage"><audio ref={remoteAudioRef} autoPlay/><span>{Array.from(activeCall.peerName)[0] || 'A'}</span><h2>{activeCall.peerName}</h2><small>{statusText}</small></div>}
          {activeCall.mode === 'video' && <audio ref={remoteAudioRef} autoPlay/>}
          <div className="academy-call-quality" aria-live="polite"><i className={callStatus === 'connected' ? 'connected' : ''}/>{statusText}</div>
        </div>
        <div className="academy-call-controls">
          <button className={!micEnabled ? 'muted' : ''} onClick={toggleMic} title={micEnabled ? localText('মাইক বন্ধ করুন', 'Mute microphone') : localText('মাইক চালু করুন', 'Unmute microphone')} aria-label={micEnabled ? localText('মাইক বন্ধ করুন', 'Mute microphone') : localText('মাইক চালু করুন', 'Unmute microphone')}><span>{micEnabled ? '♬' : '×'}</span><small>{micEnabled ? localText('মাইক', 'Mic') : localText('বন্ধ', 'Muted')}</small></button>
          <button onClick={() => void cycleSpeaker()} title={localText('Speaker বদলান', 'Change speaker output')} aria-label={localText('Speaker বদলান', 'Change speaker output')}><span>◖</span><small>{localText('Speaker', 'Speaker')}</small></button>
          {activeCall.mode === 'video' && localStream?.getVideoTracks().length ? <button className={!cameraEnabled ? 'muted' : ''} onClick={toggleCamera} title={cameraEnabled ? localText('Camera বন্ধ করুন', 'Turn camera off') : localText('Camera চালু করুন', 'Turn camera on')} aria-label={cameraEnabled ? localText('Camera বন্ধ করুন', 'Turn camera off') : localText('Camera চালু করুন', 'Turn camera on')}><span>{cameraEnabled ? '▣' : '×'}</span><small>{cameraEnabled ? localText('Camera', 'Camera') : localText('বন্ধ', 'Off')}</small></button> : null}
          <button className="academy-hangup" onClick={() => void hangup()} title={localText('কল শেষ করুন', 'End call')} aria-label={localText('কল শেষ করুন', 'End call')}>☎</button>
        </div>
      </div>
    </section>, document.body)}
  </>
}
