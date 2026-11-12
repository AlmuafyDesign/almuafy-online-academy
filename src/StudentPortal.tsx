import { useEffect, useState, type FormEvent } from 'react'
import type { AcademyProfile } from './services/supabase'
import { supabase } from './services/supabase'

type PortalData = {
  enrollments: any[]; sessions: any[]; lessons: any[]; lessonLinks: any[]; homework: any[]; submissions: any[]; attendance: any[]; notices: any[]; notifications: any[]; library: any[]
}
const EMPTY: PortalData = { enrollments: [], sessions: [], lessons: [], lessonLinks: [], homework: [], submissions: [], attendance: [], notices: [], notifications: [], library: [] }
const bn = (value: number) => new Intl.NumberFormat('bn-BD').format(value)
const date = (value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', ...options }).format(new Date(value))
const relation = (value: any) => Array.isArray(value) ? value[0] : value

export default function StudentPortal({ profile, onSignOut, onProfileUpdated }: { profile: AcademyProfile; onSignOut: () => void; onProfileUpdated: (profile: AcademyProfile) => void }) {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [active, setActive] = useState('আমার পড়াশোনা')
  const [profileOpen, setProfileOpen] = useState(false)
  const [fullName, setFullName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [address, setAddress] = useState(profile.address ?? '')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { text: string; url: string }>>({})
  const [busyHomework, setBusyHomework] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')

  useEffect(() => {
    let live = true
    async function load() {
      if (!supabase) { setError('Supabase সংযোগ সেট করা নেই।'); setLoading(false); return }
      setLoading(true); setError('')
      const [enrollments, sessions, lessons, lessonLinks, homework, submissions, attendance, notices, notifications, library] = await Promise.all([
        supabase.from('class_enrollments').select('id,status,enrolled_at,classes(name,subject,description,level)').eq('student_id', profile.id).order('enrolled_at', { ascending: false }),
        supabase.from('class_sessions').select('id,title,starts_at,duration_minutes,meeting_url,status,classes(name,subject)').or(`status.eq.live,starts_at.gte.${new Date().toISOString()}`).in('status', ['scheduled', 'live']).order('starts_at').limit(50),
        supabase.from('daily_lessons').select('id,title,subject,description,lesson_date,classes(name)').eq('status', 'published').order('lesson_date', { ascending: false }).limit(50),
        supabase.from('lesson_links').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('homework').select('id,title,instructions,due_at,class_id').eq('status', 'published').order('due_at', { ascending: true }).limit(50),
        supabase.from('homework_submissions').select('*').eq('student_id', profile.id).order('submitted_at', { ascending: false }),
        supabase.from('attendance').select('status,recorded_at').eq('student_id', profile.id).order('recorded_at', { ascending: false }).limit(100),
        supabase.from('notices').select('id,title,description,published_at,priority').eq('status', 'published').in('visibility', ['public', 'students', 'all_users']).order('published_at', { ascending: false }).limit(30),
        supabase.from('notifications').select('id,title,body,kind,href,read_at,created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('library_resources').select('id,title,description,resource_url').eq('status', 'published').order('created_at', { ascending: false }).limit(100),
      ])
      if (!live) return
      const failed = [enrollments, sessions, lessons, lessonLinks, homework, submissions, attendance, notices, notifications, library].some(result => result.error)
      if (failed) setError('কিছু তথ্য লোড হয়নি। আপনার সক্রিয় ক্লাস বা ডেটাবেজ অনুমতি যাচাই করুন।')
      setData({ enrollments: enrollments.data ?? [], sessions: sessions.data ?? [], lessons: lessons.data ?? [], lessonLinks: lessonLinks.data ?? [], homework: homework.data ?? [], submissions: submissions.data ?? [], attendance: attendance.data ?? [], notices: notices.data ?? [], notifications: notifications.data ?? [], library: library.data ?? [] })
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [profile.id, reload])

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!supabase) return
    setSaving(true); setSaveMessage('')
    const { error: saveError } = await supabase.from('profiles').update({ full_name: fullName.trim(), phone: phone.trim() || null, address: address.trim() || null, updated_at: new Date().toISOString() }).eq('id', profile.id)
    setSaving(false)
    if (saveError) { setSaveMessage('তথ্য সংরক্ষণ হয়নি। আবার চেষ্টা করুন।'); return }
    onProfileUpdated({ ...profile, full_name: fullName.trim(), phone: phone.trim() || null })
    setSaveMessage('প্রোফাইল সংরক্ষিত হয়েছে।')
  }

  async function submitHomework(event: FormEvent, homeworkId: string) {
    event.preventDefault(); if (!supabase) return
    const answer = answers[homeworkId] ?? { text: '', url: '' }
    setBusyHomework(homeworkId); setSubmitMessage('')
    const existing = data.submissions.find(item => item.homework_id === homeworkId)
    const payload = { answer_text: answer.text.trim(), answer_url: answer.url.trim() || null }
    const result = existing
      ? await supabase.from('homework_submissions').update(payload).eq('id', existing.id)
      : await supabase.from('homework_submissions').insert({ ...payload, homework_id: homeworkId, student_id: profile.id, status: 'submitted' })
    setBusyHomework('')
    if (result.error) { setSubmitMessage('উত্তর জমা হয়নি। শুধু আপনার সক্রিয় ক্লাসের প্রকাশিত হোমওয়ার্কে জমা দেওয়া যায়।'); return }
    setSubmitMessage('হোমওয়ার্কের উত্তর জমা হয়েছে।'); setReload(value => value + 1)
  }

  async function markNotificationRead(id: string) {
    if (!supabase) return
    const now = new Date().toISOString()
    const { error: updateError } = await supabase.from('notifications').update({ read_at: now }).eq('id', id).eq('user_id', profile.id)
    if (updateError) { setError('বিজ্ঞপ্তির পড়া অবস্থা হালনাগাদ হয়নি।'); return }
    setData(current => ({ ...current, notifications: current.notifications.map(item => item.id === id ? { ...item, read_at: now } : item) }))
  }

  const present = data.attendance.filter(item => item.status === 'present').length
  const attendanceRate = data.attendance.length ? Math.round(present * 100 / data.attendance.length) : null
  const submissionByHomework = new Map(data.submissions.map(item => [item.homework_id, item]))
  const nav = ['আমার পড়াশোনা', 'ক্লাসের সময়সূচি', 'দৈনিক পাঠ', 'হোমওয়ার্ক', 'লাইব্রেরি', 'উপস্থিতি', 'নোটিশ', 'বিজ্ঞপ্তি']
  return <main className="student-portal"><header className="student-topbar"><div className="auth-brand"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="আলমুয়াফী একাডেমি"/><div><b>আলমুয়াফী</b><small>শিক্ষার্থী পোর্টাল</small></div></div><div className="student-top-actions"><button onClick={() => { setProfileOpen(!profileOpen); setSaveMessage('') }}>আমার প্রোফাইল</button><button onClick={onSignOut}>লগআউট</button></div></header>
    <div className="student-layout"><aside className="student-nav"><b>শেখার মেনু</b>{nav.map(item => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}>{item}</button>)}</aside>
      <section className="student-main"><div className="student-welcome"><span>আসসালামু আলাইকুম</span><h1>{profile.full_name || 'প্রিয় শিক্ষার্থী'}</h1><p>আপনার ক্লাস, পাঠ, উপস্থিতি ও হোমওয়ার্ক এখানে পাবেন।</p></div>
        {profileOpen && <form className="student-card student-profile-form" onSubmit={saveProfile}><h2>প্রোফাইলের তথ্য</h2><div className="student-form-grid"><label>পূর্ণ নাম<input required value={fullName} onChange={event => setFullName(event.target.value)}/></label><label>ফোন<input type="tel" value={phone} onChange={event => setPhone(event.target.value)}/></label><label className="student-wide">ঠিকানা<input value={address} onChange={event => setAddress(event.target.value)} placeholder="ঠিকানা (ঐচ্ছিক)"/></label></div>{saveMessage && <p role="status">{saveMessage}</p>}<button className="primary-button" disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'প্রোফাইল সংরক্ষণ'}</button></form>}
        {error && <div className="student-error" role="status">{error}</div>}
        <nav className="student-tabs">{nav.map(item => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}>{item}</button>)}</nav>
        {loading ? <div className="student-card">তথ্য লোড হচ্ছে…</div> : active === 'আমার পড়াশোনা' ? <><div className="student-stats"><article><small>সক্রিয় ক্লাস</small><b>{bn(data.enrollments.filter(item => item.status === 'active').length)}</b></article><article><small>আসন্ন ক্লাস</small><b>{bn(data.sessions.length)}</b></article><article><small>উপস্থিতি</small><b>{attendanceRate === null ? '—' : `${bn(attendanceRate)}%`}</b></article><article><small>জমা বাকি</small><b>{bn(data.homework.filter(item => !submissionByHomework.has(item.id)).length)}</b></article></div><PortalSection title="আমার ক্লাস">{data.enrollments.length ? data.enrollments.map(item => { const c = relation(item.classes); return <article className="student-record" key={item.id}><b>{c?.name ?? 'একাডেমি ক্লাস'}</b><span>{c?.subject ?? ''}{c?.level ? ` · ${c.level}` : ''} · {item.status === 'active' ? 'সক্রিয়' : item.status === 'pending' ? 'অনুমোদনের অপেক্ষায়' : 'নিষ্ক্রিয়'}</span>{c?.description && <p>{c.description}</p>}</article> }) : <StudentEmpty text="আপনার অ্যাকাউন্টে ক্লাস যুক্ত হলে এখানে দেখা যাবে।"/>}</PortalSection><PortalSection title="পরবর্তী ক্লাস">{data.sessions.slice(0, 3).length ? data.sessions.slice(0, 3).map(item => <SessionRecord item={item} key={item.id}/>) : <StudentEmpty text="এখনো কোনো আসন্ন ক্লাস নির্ধারিত নেই।"/>}</PortalSection></> : active === 'ক্লাসের সময়সূচি' ? <PortalSection title="আমার আসন্ন ক্লাস">{data.sessions.length ? data.sessions.map(item => <SessionRecord item={item} key={item.id}/>) : <StudentEmpty text="আপনার ক্লাসের সময়সূচি এখনো প্রকাশ করা হয়নি।"/>}</PortalSection> : active === 'দৈনিক পাঠ' ? <PortalSection title="প্রকাশিত দৈনিক পাঠ">{data.lessons.length ? data.lessons.map(item => <article className="student-record" key={item.id}><b>{item.title}</b><span>{item.subject} · {date(item.lesson_date, { day: 'numeric', month: 'long', year: 'numeric' })}</span><p>{item.description}</p>{data.lessonLinks.filter(link => link.lesson_id === item.id).map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</article>) : <StudentEmpty text="আপনার জন্য কোনো প্রকাশিত পাঠ নেই।"/>}</PortalSection> : active === 'হোমওয়ার্ক' ? <PortalSection title="প্রকাশিত হомওয়ার্ক">{submitMessage && <div className="student-feedback" role="status">{submitMessage}</div>}{data.homework.length ? data.homework.map(item => { const submission = submissionByHomework.get(item.id); const answer = answers[item.id] ?? { text: submission?.answer_text ?? '', url: submission?.answer_url ?? '' }; return <article className="student-record student-homework" key={item.id}><b>{item.title}</b>{item.due_at && <span>জমার শেষ সময়: {date(item.due_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>}<p>{item.instructions}</p><form onSubmit={event => void submitHomework(event, item.id)}><label>আপনার উত্তর<textarea required rows={3} value={answer.text} onChange={event => setAnswers(current => ({ ...current, [item.id]: { ...answer, text: event.target.value } }))}/></label><label>উত্তর/ফাইলের লিংক (ঐচ্ছিক)<input type="url" value={answer.url} onChange={event => setAnswers(current => ({ ...current, [item.id]: { ...answer, url: event.target.value } }))}/></label>{submission && <small>জমার অবস্থা: {submission.status === 'reviewed' || submission.status === 'completed' ? 'পর্যালোচনা হয়েছে' : 'জমা হয়েছে'}{submission.marks != null ? ` · নম্বর ${bn(submission.marks)}` : ''}{submission.teacher_feedback ? ` · শিক্ষকের মন্তব্য: ${submission.teacher_feedback}` : ''}</small>}<button className="primary-button" disabled={busyHomework === item.id}>{busyHomework === item.id ? 'জমা হচ্ছে…' : submission ? 'উত্তর হালনাগাদ' : 'উত্তর জমা দিন'}</button></form></article> }) : <StudentEmpty text="আপনার সক্রিয় ক্লাসের জন্য কোনো হোমওয়ার্ক প্রকাশিত নেই।"/>}</PortalSection> : active === 'লাইব্রেরি' ? <PortalSection title="প্রকাশিত লাইব্রেরি উপকরণ">{data.library.length ? data.library.map(item => <article className="student-record" key={item.id}><b>{item.title}</b><p>{item.description}</p><a href={item.resource_url} target="_blank" rel="noreferrer">উপকরণ খুলুন ↗</a></article>) : <StudentEmpty text="এখনো কোনো লাইব্রেরি উপকরণ প্রকাশিত হয়নি।"/>}</PortalSection> : active === 'উপস্থিতি' ? <PortalSection title="আমার উপস্থিতি">{data.attendance.length ? data.attendance.map((item, index) => <article className="student-record" key={`${item.recorded_at}-${index}`}><b>{item.status === 'present' ? 'উপস্থিত' : item.status === 'late' ? 'দেরি' : 'অনুপস্থিত'}</b><span>{date(item.recorded_at, { day: 'numeric', month: 'long', year: 'numeric' })}</span></article>) : <StudentEmpty text="এখনো কোনো উপস্থিতির রেকর্ড নেই।"/>}</PortalSection> : active === 'নোটিশ' ? <PortalSection title="শিক্ষার্থীদের নোটিশ">{data.notices.length ? data.notices.map(item => <article className="student-record" key={item.id}><b>{item.title}{item.priority === 'important' ? ' · জরুরি' : ''}</b><p>{item.description}</p>{item.published_at && <span>{date(item.published_at, { day: 'numeric', month: 'long', year: 'numeric' })}</span>}</article>) : <StudentEmpty text="এখনো কোনো নোটিশ প্রকাশিত হয়নি।"/>}</PortalSection> : <PortalSection title="আমার বিজ্ঞপ্তি">{data.notifications.length ? data.notifications.map(item => <article className={`student-record ${item.read_at ? '' : 'student-unread'}`} key={item.id}><b>{item.title}</b><p>{item.body}</p><span>{date(item.created_at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>{item.href?.startsWith('/') && <a href={`${import.meta.env.BASE_URL}${item.href.replace(/^\//, '')}`}>বিজ্ঞপ্তি খুলুন ↗</a>}{!item.read_at && <button className="student-read-button" onClick={() => void markNotificationRead(item.id)}>পড়া হয়েছে চিহ্নিত করুন</button>}</article>) : <StudentEmpty text="আপনার জন্য কোনো বিজ্ঞপ্তি নেই।"/>}</PortalSection>}
        <footer className="student-footer">আলমুয়াফী অনলাইন একাডেমি · {date(new Date().toISOString(), { day: 'numeric', month: 'long', year: 'numeric' })}</footer>
      </section></div>
  </main>
}
function PortalSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="student-card"><h2>{title}</h2><div className="student-records">{children}</div></section> }
function StudentEmpty({ text }: { text: string }) { return <div className="student-empty">{text}</div> }
function SessionRecord({ item }: { item: any }) { const cls = relation(item.classes); return <article className="student-record"><b>{item.title || cls?.name || 'ক্লাস সেশন'}</b><span>{cls?.subject ?? ''} · {date(item.starts_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · {bn(item.duration_minutes)} মিনিট</span>{item.meeting_url && <a href={item.meeting_url} target="_blank" rel="noreferrer">ক্লাসে যোগ দিন ↗</a>}</article> }
