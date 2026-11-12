import { useEffect, useState, type FormEvent } from 'react'
import type { AcademyProfile } from './services/supabase'
import { supabase } from './services/supabase'
import { bi } from './bilingual'
import { LanguageToggle, useLanguage, type Language } from './language'
import { readTabMemory, writeTabMemory } from './tab-memory'
import VideoCallManager from './VideoCallManager'

type PortalData = {
  enrollments: any[]; sessions: any[]; lessons: any[]; lessonLinks: any[]; homework: any[]; submissions: any[]; attendance: any[]; notices: any[]; notifications: any[]; library: any[]
}
const EMPTY: PortalData = { enrollments: [], sessions: [], lessons: [], lessonLinks: [], homework: [], submissions: [], attendance: [], notices: [], notifications: [], library: [] }
const count = (value: number) => new Intl.NumberFormat('en-US').format(value)
const date = (value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }, language: Language = 'bn') => new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: 'Asia/Dhaka', ...options }).format(new Date(value))
const relation = (value: any) => Array.isArray(value) ? value[0] : value
const studentEnglish: Record<string, string> = {
  'তথ্য লোড হচ্ছে…': 'Loading your information…', 'সক্রিয় ক্লাস': 'Active classes', 'আসন্ন ক্লাস': 'Upcoming classes', 'উপস্থিতি': 'Attendance', 'জমা বাকি': 'Homework due',
  'আমার ক্লাস': 'My classes', 'পরবর্তী ক্লাস': 'Next classes', 'আমার আসন্ন ক্লাস': 'My upcoming classes', 'প্রকাশিত দৈনিক পাঠ': 'Published lessons',
  'প্রকাশিত হোমওয়ার্ক': 'Published homework', 'প্রকাশিত লাইব্রেরি উপকরণ': 'Published library resources',
  'আমার উপস্থিতি': 'My attendance', 'শিক্ষার্থীদের নোটিশ': 'Student notices', 'আমার বিজ্ঞপ্তি': 'My notifications',
  'আপনার অ্যাকাউন্টে ক্লাস যুক্ত হলে এখানে দেখা যাবে।': 'Your classes will appear here after you are enrolled.', 'এখনো কোনো আসন্ন ক্লাস নির্ধারিত নেই।': 'No upcoming classes have been scheduled yet.',
  'আপনার ক্লাসের সময়সূচি এখনো প্রকাশ করা হয়নি।': 'Your class schedule has not been published yet.', 'আপনার জন্য কোনো প্রকাশিত পাঠ নেই।': 'No lessons have been published for you yet.',
  'আপনার সক্রিয় ক্লাসের জন্য কোনো হোমওয়ার্ক প্রকাশিত নেই।': 'No homework has been published for your active classes.', 'এখনো কোনো লাইব্রেরি উপকরণ প্রকাশিত হয়নি।': 'No library resources have been published yet.',
  'এখনো কোনো উপস্থিতির রেকর্ড নেই।': 'No attendance records are available yet.', 'এখনো কোনো নোটিশ প্রকাশিত হয়নি।': 'No notices have been published yet.', 'আপনার জন্য কোনো বিজ্ঞপ্তি নেই।': 'You have no notifications yet.',
  'আপনার উত্তর': 'Your answer', 'উত্তর/ফাইলের লিংক (ঐচ্ছিক)': 'Answer or file link (optional)', 'জমার শেষ সময়': 'Due', 'জমার অবস্থা': 'Submission status',
  'পর্যালোচনা হয়েছে': 'Reviewed', 'জমা হয়েছে': 'Submitted', 'নম্বর': 'Marks', 'শিক্ষকের মন্তব্য': 'Teacher feedback', 'জমা হচ্ছে…': 'Submitting…',
  'উত্তর হালনাগাদ': 'Update answer', 'উত্তর জমা দিন': 'Submit answer', 'উপকরণ খুলুন': 'Open resource', 'পড়া হয়েছে চিহ্নিত করুন': 'Mark as read',
  'উপস্থিত': 'Present', 'দেরি': 'Late', 'অনুপস্থিত': 'Absent', 'সক্রিয়': 'Active', 'অনুমোদনের অপেক্ষায়': 'Pending approval', 'নিষ্ক্রিয়': 'Inactive',
  'জরুরি': 'Important', 'ক্লাস সেশন': 'Class session', 'মিনিট': 'minutes', 'প্রিয় শিক্ষার্থী': 'Dear student',
}
const studentText = (bangla: string, language: Language) => bi(bangla, studentEnglish[bangla] ?? bangla, language)

export default function StudentPortal({ profile, onSignOut, onProfileUpdated }: { profile: AcademyProfile; onSignOut: () => void; onProfileUpdated: (profile: AcademyProfile) => void }) {
  const { language } = useLanguage()
  const activeMemoryKey = `almuafy-student-section:${profile.id}`
  const [active, setActive] = useState(() => readTabMemory(activeMemoryKey, 'আমার পড়াশোনা'))
  const selectSection = (section: string) => { setActive(section); writeTabMemory(activeMemoryKey, section) }
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
      if (!supabase) { setError(bi('Supabase সংযোগ সেট করা নেই।', 'Supabase is not connected.', language)); setLoading(false); return }
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
      if (failed) setError(bi('কিছু তথ্য লোড হয়নি। আপনার সক্রিয় ক্লাস বা ডেটাবেজ অনুমতি যাচাই করুন।', 'Some information could not be loaded. Check your active classes and database access.', language))
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
    if (saveError) { setSaveMessage(bi('তথ্য সংরক্ষণ হয়নি। আবার চেষ্টা করুন।', 'Your changes were not saved. Please try again.', language)); return }
    onProfileUpdated({ ...profile, full_name: fullName.trim(), phone: phone.trim() || null })
    setSaveMessage(bi('প্রোফাইল সংরক্ষিত হয়েছে।', 'Profile saved.', language))
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
    if (result.error) { setSubmitMessage(bi('উত্তর জমা হয়নি। শুধু আপনার সক্রিয় ক্লাসের প্রকাশিত হোমওয়ার্কে জমা দেওয়া যায়।', 'The answer was not submitted. You can submit only to published homework in your active classes.', language)); return }
    setSubmitMessage(bi('হোমওয়ার্কের উত্তর জমা হয়েছে।', 'Homework answer submitted.', language)); setReload(value => value + 1)
  }

  async function markNotificationRead(id: string) {
    if (!supabase) return
    const now = new Date().toISOString()
    const { error: updateError } = await supabase.from('notifications').update({ read_at: now }).eq('id', id).eq('user_id', profile.id)
    if (updateError) { setError(bi('বিজ্ঞপ্তির পড়া অবস্থা হালনাগাদ হয়নি।', 'The notification could not be marked as read.', language)); return }
    setData(current => ({ ...current, notifications: current.notifications.map(item => item.id === id ? { ...item, read_at: now } : item) }))
  }

  const present = data.attendance.filter(item => item.status === 'present').length
  const attendanceRate = data.attendance.length ? Math.round(present * 100 / data.attendance.length) : null
  const submissionByHomework = new Map(data.submissions.map(item => [item.homework_id, item]))
  const dateForLanguage = (value: string, options: Intl.DateTimeFormatOptions) => date(value, options, language)
  const nav = ['আমার পড়াশোনা', 'ক্লাসের সময়সূচি', 'দৈনিক পাঠ', 'হোমওয়ার্ক', 'লাইব্রেরি', 'উপস্থিতি', 'নোটিশ', 'বিজ্ঞপ্তি']
  const navEnglish: Record<string, string> = { 'আমার পড়াশোনা': 'My Learning', 'ক্লাসের সময়সূচি': 'Class Schedule', 'দৈনিক পাঠ': 'Daily Lessons', 'হোমওয়ার্ক': 'Homework', 'লাইব্রেরি': 'Library', 'উপস্থিতি': 'Attendance', 'নোটিশ': 'Notices', 'বিজ্ঞপ্তি': 'Notifications' }
  const navIcons: Record<string, string> = { 'আমার পড়াশোনা': '⌂', 'ক্লাসের সময়সূচি': '◷', 'দৈনিক পাঠ': '▤', 'হোমওয়ার্ক': '✓', 'লাইব্রেরি': '▧', 'উপস্থিতি': '◉', 'নোটিশ': '◈', 'বিজ্ঞপ্তি': '♧' }
  return <main className="student-portal"><header className="student-topbar"><a className="student-brand" href="#student-home" aria-label="Almuafy Student Portal"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/><span><b>{bi('আলমুয়াফী', 'Almuafy', language)}</b><small>{bi('শিক্ষার্থী পোর্টাল', 'Student Portal', language)}</small></span></a><div className="student-top-actions"><LanguageToggle/><VideoCallManager profile={profile}/><button className="student-profile-action" onClick={() => { setProfileOpen(!profileOpen); setSaveMessage('') }}><span className="student-user-mark">{Array.from(profile.full_name || 'আ')[0]}</span><span>{bi('আমার প্রোফাইল', 'My Profile', language)}</span></button><button className="student-logout" onClick={onSignOut}>{bi('লগআউট', 'Sign out', language)}</button></div></header>
    <div className="student-layout"><aside className="student-nav" aria-label={bi('শিক্ষার্থীর মেনু', 'Student navigation', language)}><div className="student-nav-heading"><span>{bi('শেখার মেনু', 'Learning menu', language)}</span><small>{bi('আপনার পড়াশোনা', 'Your studies', language)}</small></div>{nav.map(item => <button key={item} className={active === item ? 'active' : ''} aria-current={active === item ? 'page' : undefined} onClick={() => selectSection(item)}><i aria-hidden="true">{navIcons[item]}</i><span>{bi(item, navEnglish[item], language)}</span>{active === item && <b aria-hidden="true">›</b>}</button>)}</aside>
      <section className="student-main" id="student-home"><div className="student-welcome"><div><span className="student-greeting">{bi('আসসালামু আলাইকুম', 'Assalamu Alaikum', language)}</span><h1>{profile.full_name || bi('প্রিয় শিক্ষার্থী', 'Dear student', language)}</h1><p>{bi('আপনার ক্লাস, পাঠ, উপস্থিতি ও হোমওয়ার্ক এক জায়গায়।', 'Your classes, lessons, attendance and homework in one place.', language)}</p></div><div className="student-welcome-mark" aria-hidden="true"><span>اقرأ</span><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/></div></div>
        {profileOpen && <form className="student-card student-profile-form" onSubmit={saveProfile}><h2>{bi('প্রোফাইলের তথ্য', 'Profile details', language)}</h2><div className="student-form-grid"><label>{bi('পূর্ণ নাম', 'Full name', language)}<input required value={fullName} onChange={event => setFullName(event.target.value)}/></label><label>{bi('ফোন', 'Phone', language)}<input type="tel" value={phone} onChange={event => setPhone(event.target.value)}/></label><label className="student-wide">{bi('ঠিকানা', 'Address', language)}<input value={address} onChange={event => setAddress(event.target.value)} placeholder={bi('ঠিকানা (ঐচ্ছিক)', 'Address (optional)', language)}/></label></div>{saveMessage && <p role="status">{saveMessage}</p>}<button className="primary-button" disabled={saving}>{saving ? bi('সংরক্ষণ হচ্ছে…', 'Saving…', language) : bi('প্রোফাইল সংরক্ষণ', 'Save profile', language)}</button></form>}
        {error && <div className="student-error" role="status">{error}</div>}
        {loading ? <div className="student-card">{studentText('তথ্য লোড হচ্ছে…', language)}</div> : active === 'আমার পড়াশোনা' ? <><div className="student-stats"><article><small>{studentText('সক্রিয় ক্লাস', language)}</small><b>{count(data.enrollments.filter(item => item.status === 'active').length)}</b></article><article><small>{studentText('আসন্ন ক্লাস', language)}</small><b>{count(data.sessions.length)}</b></article><article><small>{studentText('উপস্থিতি', language)}</small><b>{attendanceRate === null ? '—' : `${count(attendanceRate)}%`}</b></article><article><small>{studentText('জমা বাকি', language)}</small><b>{count(data.homework.filter(item => !submissionByHomework.has(item.id)).length)}</b></article></div><PortalSection title={studentText('আমার ক্লাস', language)}>{data.enrollments.length ? data.enrollments.map(item => { const c = relation(item.classes); return <article className="student-record" key={item.id}><b>{c?.name ?? bi('একাডেমি ক্লাস', 'Academy class', language)}</b><span>{c?.subject ?? ''}{c?.level ? ` · ${c.level}` : ''} · {item.status === 'active' ? bi('সক্রিয়', 'Active', language) : item.status === 'pending' ? bi('অনুমোদনের অপেক্ষায়', 'Pending approval', language) : bi('নিষ্ক্রিয়', 'Inactive', language)}</span>{c?.description && <p>{c.description}</p>}</article> }) : <StudentEmpty text={studentText("আপনার অ্যাকাউন্টে ক্লাস যুক্ত হলে এখানে দেখা যাবে।", language)}/>}</PortalSection><PortalSection title={studentText('পরবর্তী ক্লাস', language)}>{data.sessions.slice(0, 3).length ? data.sessions.slice(0, 3).map(item => <SessionRecord item={item} language={language} key={item.id}/>) : <StudentEmpty text={studentText("এখনো কোনো আসন্ন ক্লাস নির্ধারিত নেই।", language)}/>}</PortalSection></> : active === 'ক্লাসের সময়সূচি' ? <PortalSection title={studentText('আমার আসন্ন ক্লাস', language)}>{data.sessions.length ? data.sessions.map(item => <SessionRecord item={item} language={language} key={item.id}/>) : <StudentEmpty text={studentText("আপনার ক্লাসের সময়সূচি এখনো প্রকাশ করা হয়নি.", language)}/>}</PortalSection> : active === 'দৈনিক পাঠ' ? <PortalSection title={studentText('প্রকাশিত দৈনিক পাঠ', language)}>{data.lessons.length ? data.lessons.map(item => <article className="student-record" key={item.id}><b>{item.title}</b><span>{item.subject} · {dateForLanguage(item.lesson_date, { day: 'numeric', month: 'long', year: 'numeric' })}</span><p>{item.description}</p>{data.lessonLinks.filter(link => link.lesson_id === item.id).map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</article>) : <StudentEmpty text={studentText("আপনার জন্য কোনো প্রকাশিত পাঠ নেই।", language)}/>}</PortalSection> : active === 'হোমওয়ার্ক' ? <PortalSection title="প্রকাশিত হомওয়ার্ক">{submitMessage && <div className="student-feedback" role="status">{submitMessage}</div>}{data.homework.length ? data.homework.map(item => { const submission = submissionByHomework.get(item.id); const answer = answers[item.id] ?? { text: submission?.answer_text ?? '', url: submission?.answer_url ?? '' }; return <article className="student-record student-homework" key={item.id}><b>{item.title}</b>{item.due_at && <span>{bi('জমার শেষ সময়', 'Due', language)}: {dateForLanguage(item.due_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>}<p>{item.instructions}</p><form onSubmit={event => void submitHomework(event, item.id)}><label>{studentText('আপনার উত্তর', language)}<textarea required rows={3} value={answer.text} onChange={event => setAnswers(current => ({ ...current, [item.id]: { ...answer, text: event.target.value } }))}/></label><label>{studentText('উত্তর/ফাইলের লিংক (ঐচ্ছিক)', language)}<input type="url" value={answer.url} onChange={event => setAnswers(current => ({ ...current, [item.id]: { ...answer, url: event.target.value } }))}/></label>{submission && <small>{bi('জমার অবস্থা', 'Submission status', language)}: {submission.status === 'reviewed' || submission.status === 'completed' ? bi('পর্যালোচনা হয়েছে', 'Reviewed', language) : bi('জমা হয়েছে', 'Submitted', language)}{submission.marks != null ? ` · ${bi('নম্বর', 'Marks', language)} ${count(submission.marks)}` : ''}{submission.teacher_feedback ? ` · ${bi('শিক্ষকের মন্তব্য', 'Teacher feedback', language)}: ${submission.teacher_feedback}` : ''}</small>}<button className="primary-button" disabled={busyHomework === item.id}>{busyHomework === item.id ? bi('জমা হচ্ছে…', 'Submitting…', language) : submission ? bi('উত্তর হালনাগাদ', 'Update answer', language) : bi('উত্তর জমা দিন', 'Submit answer', language)}</button></form></article> }) : <StudentEmpty text={studentText("আপনার সক্রিয় ক্লাসের জন্য কোনো হোমওয়ার্ক প্রকাশিত নেই।", language)}/>}</PortalSection> : active === 'লাইব্রেরি' ? <PortalSection title={studentText('প্রকাশিত লাইব্রেরি উপকরণ', language)}>{data.library.length ? data.library.map(item => <article className="student-record" key={item.id}><b>{item.title}</b><p>{item.description}</p><a href={item.resource_url} target="_blank" rel="noreferrer">{studentText('উপকরণ খুলুন', language)} ↗</a></article>) : <StudentEmpty text={studentText("এখনো কোনো লাইব্রেরি উপকরণ প্রকাশিত হয়নি।", language)}/>}</PortalSection> : active === 'উপস্থিতি' ? <PortalSection title={studentText('আমার উপস্থিতি', language)}>{data.attendance.length ? data.attendance.map((item, index) => <article className="student-record" key={`${item.recorded_at}-${index}`}><b>{item.status === 'present' ? bi('উপস্থিত', 'Present', language) : item.status === 'late' ? bi('দেরি', 'Late', language) : bi('অনুপস্থিত', 'Absent', language)}</b><span>{dateForLanguage(item.recorded_at, { day: 'numeric', month: 'long', year: 'numeric' })}</span></article>) : <StudentEmpty text={studentText("এখনো কোনো উপস্থিতির রেকর্ড নেই।", language)}/>}</PortalSection> : active === 'নোটিশ' ? <PortalSection title={studentText('শিক্ষার্থীদের নোটিশ', language)}>{data.notices.length ? data.notices.map(item => <article className="student-record" key={item.id}><b>{item.title}{item.priority === 'important' ? ` · ${bi('জরুরি', 'Important', language)}` : ''}</b><p>{item.description}</p>{item.published_at && <span>{dateForLanguage(item.published_at, { day: 'numeric', month: 'long', year: 'numeric' })}</span>}</article>) : <StudentEmpty text={studentText("এখনো কোনো নোটিশ প্রকাশিত হয়নি।", language)}/>}</PortalSection> : <PortalSection title={studentText('আমার বিজ্ঞপ্তি', language)}>{data.notifications.length ? data.notifications.map(item => <article className={`student-record ${item.read_at ? '' : 'student-unread'}`} key={item.id}><b>{item.title}</b><p>{item.body}</p><span>{dateForLanguage(item.created_at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>{item.href?.startsWith('/') && <a href={`${import.meta.env.BASE_URL}${item.href.replace(/^\//, '')}`}>{bi('বিজ্ঞপ্তি খুলুন', 'Open notification', language)} ↗</a>}{!item.read_at && <button className="student-read-button" onClick={() => void markNotificationRead(item.id)}>{studentText('পড়া হয়েছে চিহ্নিত করুন', language)}</button>}</article>) : <StudentEmpty text={studentText("আপনার জন্য কোনো বিজ্ঞপ্তি নেই।", language)}/>}</PortalSection>}
        <footer className="student-footer">{bi('আলমুয়াফী অনলাইন একাডেমি', 'Almuafy Online Academy', language)} · {dateForLanguage(new Date().toISOString(), { day: 'numeric', month: 'long', year: 'numeric' })}</footer>
      </section></div>
  </main>
}
function PortalSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="student-card"><h2>{title}</h2><div className="student-records">{children}</div></section> }
function StudentEmpty({ text }: { text: string }) { return <div className="student-empty">{text}</div> }
function SessionRecord({ item, language }: { item: any; language: Language }) { const cls = relation(item.classes); return <article className="student-record"><b>{item.title || cls?.name || bi('ক্লাস সেশন', 'Class session', language)}</b><span>{cls?.subject ?? ''} · {date(item.starts_at, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }, language)} · {count(item.duration_minutes)} {bi('মিনিট', 'minutes', language)}</span>{item.meeting_url && <a href={item.meeting_url} target="_blank" rel="noreferrer">{bi('ক্লাসে যোগ দিন', 'Join class', language)} ↗</a>}</article> }
