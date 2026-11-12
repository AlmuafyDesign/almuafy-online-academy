import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
type FloatingSize = 'compact' | 'large' | 'max'

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export default function VideoCallManager({ profile }: { profile: AcademyProfile }) {
  const { language } = useLanguage()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsOpen, setContactsOpen] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [incoming, setIncoming] = useState<CallRow | null>(null)
  const [activeCall, setActiveCall] = useState<CallInfo | null>(null)
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'failed'>('ringing')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const [floatingSize, setFloatingSize] = useState<FloatingSize>('compact')
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState('')
  const [callerName, setCallerName] = useState('')
  const alertChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const signalChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const activeCallRef = useRef<CallInfo | null>(null)
  const incomingRef = useRef<CallRow | null>(null)
  const queuedIceRef = useRef<(RTCIceCandidateInit | null)[]>([])
  const offerStartedRef = useRef(false)
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
    peerRef.current?.close()
    peerRef.current = null
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    queuedIceRef.current = []
    offerStartedRef.current = false
  }, [])

  const removeChannel = useCallback((ref: typeof signalChannelRef | typeof alertChannelRef) => {
    if (ref.current && supabase) void supabase.removeChannel(ref.current)
    ref.current = null
  }, [])

  const closeCallWindow = useCallback(() => {
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
        if (activeCallRef.current?.direction === 'outgoing') void makeOffer()
      })
      .on('broadcast', { event: 'call_signal' }, ({ payload }) => { void receiveSignal(payload as Record<string, any>) })
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

  const makeOffer = useCallback(async () => {
    if (offerStartedRef.current || !peerRef.current) return
    offerStartedRef.current = true
    try {
      const offer = await peerRef.current.createOffer()
      await peerRef.current.setLocalDescription(offer)
      await sendSignal('call_signal', { kind: 'offer', description: offer })
    } catch {
      offerStartedRef.current = false
      setCallStatus('failed')
    }
  }, [sendSignal])

  const receiveSignal = useCallback(async (payload: Record<string, any>) => {
    const peer = peerRef.current
    if (!peer) return
    try {
      if (payload.kind === 'offer' && payload.description) {
        await peer.setRemoteDescription(payload.description as RTCSessionDescriptionInit)
        for (const candidate of queuedIceRef.current.splice(0)) await peer.addIceCandidate(candidate)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        await sendSignal('call_signal', { kind: 'answer', description: answer })
      } else if (payload.kind === 'answer' && payload.description) {
        await peer.setRemoteDescription(payload.description as RTCSessionDescriptionInit)
        for (const candidate of queuedIceRef.current.splice(0)) await peer.addIceCandidate(candidate)
      } else if (payload.kind === 'ice') {
        const candidate = payload.candidate as RTCIceCandidateInit | null
        if (peer.remoteDescription) await peer.addIceCandidate(candidate)
        else queuedIceRef.current.push(candidate)
      }
    } catch {
      setCallStatus('failed')
    }
  }, [sendSignal])

  const createPeer = useCallback((stream: MediaStream, mode: 'audio' | 'video') => {
    peerRef.current?.close()
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 })
    peerRef.current = peer
    stream.getTracks().forEach(track => peer.addTrack(track, stream))
    if (!stream.getAudioTracks().length) peer.addTransceiver('audio', { direction: 'recvonly' })
    if (mode === 'video' && !stream.getVideoTracks().length) peer.addTransceiver('video', { direction: 'recvonly' })
    peer.ontrack = event => { setRemoteStream(event.streams[0] ?? new MediaStream([event.track])); setCallStatus('connecting') }
    peer.onicecandidate = event => { void sendSignal('call_signal', { kind: 'ice', candidate: event.candidate?.toJSON() ?? null }) }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setCallStatus('connected')
      else if (peer.connectionState === 'disconnected') setCallStatus('reconnecting')
      else if (peer.connectionState === 'failed') setCallStatus('failed')
    }
  }, [sendSignal])

  const requestMedia = useCallback(async (mode: 'audio' | 'video') => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(localText('এই browser-এ audio/video call সমর্থিত নয়। HTTPS-এ খুলুন।', 'Audio/video calling is unavailable in this browser. Open the secure HTTPS site.'))
    let stream: MediaStream
    let cameraUnavailable = false
    if (mode === 'video') {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } })
      } catch (error) {
        const noCamera = error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')
        if (!noCamera) throw error
        cameraUnavailable = true
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }
    } else stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    setLocalStream(stream)
    setMicEnabled(stream.getAudioTracks().some(track => track.enabled))
    setCameraEnabled(stream.getVideoTracks().some(track => track.enabled))
    if (cameraUnavailable) setNotice(localText('আপনার device-এ camera নেই। আপনি audio-তে কথা বলতে পারবেন, অপর পক্ষের video দেখতে পারবেন।', 'No camera was found on your device. You can speak by audio and still see the other person.'))
    return stream
  }, [localText])

  const loadContacts = useCallback(async () => {
    if (!supabase) return
    setContactsLoading(true)
    const { data, error } = await supabase.rpc('get_academy_video_call_contacts')
    setContactsLoading(false)
    if (error) { setNotice(localText('কলের সুবিধা চালু হয়নি। Supabase setup সম্পন্ন করতে হবে।', 'Calling is not set up yet. The Supabase setup must be completed.')); return }
    setContacts((data ?? []) as Contact[])
  }, [localText])

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
    const channel = supabase.channel(`academy-call-alerts:${profile.id}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        const callId = typeof payload?.callId === 'string' ? payload.callId : ''
        if (callId) void showIncoming(callId)
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') alertChannelRef.current = channel })
    void supabase.from('academy_video_calls')
      .select('id,caller_id,callee_id,media_mode,status,created_at,expires_at,answered_at')
      .eq('callee_id', profile.id).eq('status', 'ringing').gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) void showIncoming(data.id) })
    return () => { removeChannel({ current: channel }) }
  }, [loadContacts, profile.id, removeChannel, showIncoming])

  useEffect(() => {
    if (!activeCall) return
    const client = supabase
    if (!client) return
    const timer = window.setInterval(async () => {
      const { data } = await client.from('academy_video_calls').select('status,expires_at,answered_at').eq('id', activeCall.id).maybeSingle()
      if (!data) return
      if (data.status === 'rejected' || data.status === 'missed' || data.status === 'ended') {
        setNotice(data.status === 'rejected' ? localText('কলটি গ্রহণ করা হয়নি।', 'The call was declined.') : data.status === 'missed' ? localText('কলের উত্তর পাওয়া যায়নি।', 'There was no answer.') : localText('কল শেষ হয়েছে।', 'The call has ended.'))
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
    const timer = window.setInterval(() => {
      const state = peerRef.current?.connectionState
      if (state && !['failed', 'closed', 'disconnected'].includes(state)) {
        void client.rpc('keep_academy_video_call_alive', { p_call_id: activeCall.id })
      }
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [activeCall])

  useEffect(() => {
    if (!incoming) return
    const remaining = Math.max(0, new Date(incoming.expires_at).getTime() - Date.now())
    const timer = window.setTimeout(() => setIncoming(current => current?.id === incoming.id ? null : current), remaining)
    return () => window.clearTimeout(timer)
  }, [incoming])

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
    let stream: MediaStream | null = null
    try {
      stream = await requestMedia(mode)
      const { data: callId, error } = await supabase.rpc('create_academy_video_call', { p_recipient_id: contact.user_id, p_media_mode: mode })
      if (error || !callId) throw new Error(error?.message ?? 'Could not create call.')
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
      void signalChannel
      createPeer(stream, mode)
      const sent = await targetAlert.send({ type: 'broadcast', event: 'incoming_call', payload: { callId } })
      void supabase.removeChannel(targetAlert)
      if (sent !== 'ok') throw new Error(localText('কলের অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।', 'The call invitation could not be sent. Please try again.'))
    } catch (error) {
      if (stream) { stream.getTracks().forEach(track => track.stop()); localStreamRef.current = null; setLocalStream(null) }
      const msg = error instanceof Error ? error.message : ''
      const permission = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
      setNotice(permission ? localText('কল করতে camera/microphone permission দিন।', 'Allow camera and microphone access to call.') : msg || localText('কল শুরু করা যায়নি। আবার চেষ্টা করুন।', 'Could not start the call. Please try again.'))
      closeCallWindow()
    } finally { setBusy('') }
  }

  const acceptCall = async () => {
    if (!supabase || !incoming || busy) return
    const invite = incoming
    setBusy(invite.id); setNotice('')
    let stream: MediaStream | null = null
    try {
      stream = await requestMedia(invite.media_mode)
      const info: CallInfo = { id: invite.id, peerId: invite.caller_id, peerName: callerName, mode: invite.media_mode, direction: 'incoming' }
      const channel = await joinSignalChannel(invite.id)
      createPeer(stream, invite.media_mode)
      const { data: accepted, error } = await supabase.rpc('respond_to_academy_video_call', { p_call_id: invite.id, p_accept: true })
      if (error || !accepted) throw new Error(localText('এই কলটি আর চালু নেই।', 'This call is no longer available.'))
      activeCallRef.current = info; setActiveCall(info); setCallStatus('connecting'); setIncoming(null); setMinimized(false)
      await channel.send({ type: 'broadcast', event: 'call_ready', payload: { userId: profile.id } })
    } catch (error) {
      if (stream) { stream.getTracks().forEach(track => track.stop()); localStreamRef.current = null; setLocalStream(null) }
      const msg = error instanceof Error ? error.message : ''
      const permission = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
      setNotice(permission ? localText('কল নিতে camera/microphone permission দিন।', 'Allow camera and microphone access to answer.') : msg || localText('কল গ্রহণ করা যায়নি।', 'Could not answer the call.'))
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
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = next })
    setMicEnabled(next)
  }
  const toggleCamera = () => {
    const next = !cameraEnabled
    localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = next })
    setCameraEnabled(next)
  }
  const formatDuration = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
  const statusText = callStatus === 'ringing' ? activeCall?.direction === 'outgoing' ? localText('কল করা হচ্ছে…', 'Calling…') : localText('সংযোগ হচ্ছে…', 'Connecting…')
    : callStatus === 'connecting' ? localText('সংযোগ করা হচ্ছে…', 'Connecting…')
      : callStatus === 'connected' ? formatDuration(seconds)
        : callStatus === 'reconnecting' ? localText('আবার সংযোগ হচ্ছে…', 'Reconnecting…') : localText('নেটওয়ার্কে সংযোগ হয়নি', 'Could not connect to the network')

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
        <div className="academy-call-contact-list">
          {contactsLoading ? <div className="academy-call-empty">{localText('তালিকা লোড হচ্ছে…', 'Loading contacts…')}</div>
            : contacts.length ? contacts.map(contact => <article className="academy-call-contact" key={contact.user_id}>
              <span className="academy-call-avatar">{Array.from(contact.full_name)[0] || (contact.role === 'admin' ? 'A' : 'শ')}</span>
              <div className="academy-call-contact-name"><b>{contact.full_name}</b><small>{contact.role === 'admin' ? localText('একাডেমি Admin', 'Academy admin') : localText('শিক্ষার্থী', 'Student')}</small></div>
              <button className="academy-call-mode audio" disabled={Boolean(busy)} onClick={() => void startCall(contact, 'audio')} aria-label={`${localText('অডিও কল করুন', 'Start audio call')} ${contact.full_name}`} title={localText('অডিও কল', 'Audio call')}>☎</button>
              <button className="academy-call-mode video" disabled={Boolean(busy)} onClick={() => void startCall(contact, 'video')} aria-label={`${localText('ভিডিও কল করুন', 'Start video call')} ${contact.full_name}`} title={localText('ভিডিও কল', 'Video call')}>▣</button>
            </article>)
              : <div className="academy-call-empty">{localText('এখন কল করার মতো সক্রিয় account নেই।', 'No active call contacts are available.')}</div>}
        </div>
        <footer><span>🔒</span> {localText('অন্যজন app খোলা রেখে sign in করে থাকলে কলটি পৌঁছাবে।', 'The other person must have the app open and be signed in.')}</footer>
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
          {activeCall.mode === 'video' && localStream?.getVideoTracks().length ? <button className={!cameraEnabled ? 'muted' : ''} onClick={toggleCamera} title={cameraEnabled ? localText('Camera বন্ধ করুন', 'Turn camera off') : localText('Camera চালু করুন', 'Turn camera on')} aria-label={cameraEnabled ? localText('Camera বন্ধ করুন', 'Turn camera off') : localText('Camera চালু করুন', 'Turn camera on')}><span>{cameraEnabled ? '▣' : '×'}</span><small>{cameraEnabled ? localText('Camera', 'Camera') : localText('বন্ধ', 'Off')}</small></button> : null}
          <button className="academy-hangup" onClick={() => void hangup()} title={localText('কল শেষ করুন', 'End call')} aria-label={localText('কল শেষ করুন', 'End call')}>☎</button>
        </div>
      </div>
    </section>, document.body)}
  </>
}
