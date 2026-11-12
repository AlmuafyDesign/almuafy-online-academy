import { useEffect, useMemo, useState } from 'react'
import type { AcademyProfile } from './services/supabase'
import { supabase } from './services/supabase'
import { clearTabMemory, readTabMemory, writeTabMemory } from './tab-memory'
import VideoCallManager from './VideoCallManager'

type IconName = 'grid' | 'users' | 'book' | 'calendar' | 'check' | 'layers' | 'bell' | 'settings' | 'search' | 'menu' | 'logout' | 'arrow' | 'clock' | 'plus' | 'chart'
const paths: Record<IconName, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
  check: <><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="9"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-1.9L6.1 12l1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 1.9Z" transform="translate(-1 -1)"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  plus: <><path d="M12 5v14m-7-7h14"/></>,
  chart: <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/></>,
}
function Icon({ name, size = 18 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg> }

type ClassSession = { id: string; title: string; starts_at: string; duration_minutes: number; status: string; meeting_url: string | null; classes?: { name: string; subject: string } | { name: string; subject: string }[] | null }
type DashboardData = { students: number | null; classes: number | null; homework: number | null; sessions: ClassSession[]; attendance: { present: number; total: number } | null; notice: { title: string; description: string; published_at: string | null } | null; activities: { id: string; action: string; entity_type: string; created_at: string }[] }
const EMPTY: DashboardData = { students: null, classes: null, homework: null, sessions: [], attendance: null, notice: null, activities: [] }
const navGroups: { title: string; items: { label: string; icon: IconName }[] }[] = [
  { title: 'একাডেমি', items: [{ label: 'ড্যাশবোর্ড', icon: 'grid' }, { label: 'শিক্ষার্থী', icon: 'users' }, { label: 'ভর্তি ব্যবস্থাপনা', icon: 'users' }, { label: 'ক্লাস ও পাঠ', icon: 'book' }, { label: 'সময়সূচি', icon: 'calendar' }, { label: 'উপস্থিতি', icon: 'check' }] },
  { title: 'শেখার উপকরণ', items: [{ label: 'দৈনিক পাঠ', icon: 'book' }, { label: 'পাঠের উপকরণ', icon: 'arrow' }, { label: 'হোমওয়ার্ক', icon: 'check' }, { label: 'হোমওয়ার্ক মূল্যায়ন', icon: 'check' }, { label: 'লাইব্রেরি', icon: 'layers' }] },
  { title: 'পরিচালনা', items: [{ label: 'নোটিশ', icon: 'bell' }, { label: 'শিক্ষার্থী বিজ্ঞপ্তি', icon: 'bell' }, { label: 'কার্যক্রম লগ', icon: 'clock' }, { label: 'রিপোর্ট', icon: 'chart' }, { label: 'সেটিংস', icon: 'settings' }] },
]
function dhakaDayBounds() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const part = (type: string) => parts.find(item => item.type === type)?.value ?? ''; const day = `${part('year')}-${part('month')}-${part('day')}`; return { start: new Date(`${day}T00:00:00+06:00`).toISOString(), end: new Date(`${day}T00:00:00+06:00`).getTime() + 86_400_000 } }
function bnDate(value: string, options?: Intl.DateTimeFormatOptions) { return new Intl.DateTimeFormat('bn-BD', { timeZone: 'Asia/Dhaka', ...options }).format(new Date(value)) }
function bnNumber(value: number) { return new Intl.NumberFormat('bn-BD').format(value) }

export default function AdminDashboard({ profile, onSignOut }: { profile: AcademyProfile; onSignOut: () => void }) {
  const activeMemoryKey = `almuafy-admin-section:${profile.id}`
  const [active, setActive] = useState(() => {
    const saved = readTabMemory<string>(activeMemoryKey, 'ড্যাশবোর্ড')
    return navGroups.some(group => group.items.some(item => item.label === saved)) || saved === 'রিপোর্ট' || saved === 'সেটিংস' ? saved : 'ড্যাশবোর্ড'
  })
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const name = profile.full_name.trim() || 'প্রশাসক'
  const selectSection = (section: string) => { setActive(section); writeTabMemory(activeMemoryKey, section) }
  const greetingDate = useMemo(() => new Intl.DateTimeFormat('bn-BD', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' }).format(new Date()), [])
  const { start: todayStart, end: todayEnd } = dhakaDayBounds()

  useEffect(() => {
    let live = true
    async function load() {
      if (!supabase) { setProblem('Supabase সংযোগ সেট করা নেই।'); setLoading(false); return }
      setLoading(true); setProblem('')
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const [students, classes, homework, sessions, attendance, notice, activities] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('homework_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('class_sessions').select('id,title,starts_at,duration_minutes,status,meeting_url,classes(name,subject)').gte('starts_at', todayStart).lt('starts_at', new Date(todayEnd).toISOString()).neq('status', 'cancelled').order('starts_at').limit(6),
        supabase.from('attendance').select('status').gte('recorded_at', sevenDaysAgo),
        supabase.from('notices').select('title,description,published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('activity_logs').select('id,action,entity_type,created_at').order('created_at', { ascending: false }).limit(5),
      ])
      const failed = [students, classes, homework, sessions, attendance, notice, activities].some(item => item.error)
      if (!live) return
      setProblem(failed ? 'কিছু তথ্য লোড করা যায়নি। Supabase policy ও সংযোগ যাচাই করুন।' : '')
      const attendanceRows = attendance.data ?? []
      setData({ students: students.count ?? 0, classes: classes.count ?? 0, homework: homework.count ?? 0, sessions: sessions.data ?? [], attendance: attendanceRows.length ? { present: attendanceRows.filter(row => row.status === 'present').length, total: attendanceRows.length } : null, notice: notice.data, activities: activities.data ?? [] })
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [todayStart, todayEnd])

  const attendancePercent = data.attendance ? Math.round((data.attendance.present / data.attendance.total) * 100) : null
  const stats = [
    { label: 'মোট শিক্ষার্থী', value: data.students, note: 'নিবন্ধিত শিক্ষার্থী', icon: 'users' as const, color: 'mint' },
    { label: 'চলমান ক্লাস', value: data.classes, note: 'সক্রিয় ক্লাস', icon: 'book' as const, color: 'gold' },
    { label: 'উপস্থিতি', value: attendancePercent === null ? null : `${bnNumber(attendancePercent)}%`, note: data.attendance ? 'গত ৭ দিনের রেকর্ড' : 'রেকর্ড যোগ হলে দেখা যাবে', icon: 'check' as const, color: 'lavender' },
    { label: 'যাচাই বাকি', value: data.homework, note: 'জমা হওয়া হোমওয়ার্ক', icon: 'layers' as const, color: 'rose' },
  ]

  return <div className="premium-app-shell">
    {menuOpen && <button className="premium-scrim" aria-label="মেনু বন্ধ করুন" onClick={() => setMenuOpen(false)} />}
    <aside className={`premium-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <div className="premium-brand"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="আলমুয়াফী লোগো"/><div><b>আলমুয়াফী</b><small>অনলাইন একাডেমি</small></div><button className="premium-close" onClick={() => setMenuOpen(false)}>×</button></div>
      <div className="premium-switch"><span>م</span><div><b>একাডেমি প্যানেল</b><small>প্রশাসন</small></div><span className="switch-caret">⌄</span></div>
      <nav className="premium-nav">{navGroups.map(group => <section key={group.title}><h2>{group.title}</h2>{group.items.map(item => <button key={item.label} className={active === item.label ? 'active' : ''} onClick={() => { selectSection(item.label); setMenuOpen(false); setQuery('') }}><span className="nav-icon"><Icon name={item.icon}/></span><span>{item.label}</span>{item.label === 'ড্যাশবোর্ড' && <i/>}</button>)}</section>)}</nav>
      <div className="premium-side-bottom"><div className="premium-quote"><span>۞</span><div><b>ইলমের পথে একসাথে</b><small>শিক্ষাই হোক আলোর পথ</small></div></div><div className="premium-account"><span className="premium-avatar">{Array.from(name)[0] ?? 'আ'}</span><div><b>{name}</b><small>অ্যাডমিন</small></div><button aria-label="লগআউট" onClick={onSignOut}><Icon name="logout" size={17}/></button></div></div>
    </aside>
    <main className="premium-main"><header className="premium-topbar"><button className="premium-menu" aria-label="মেনু খুলুন" onClick={() => setMenuOpen(true)}><Icon name="menu"/></button><div className="premium-crumb">একাডেমি <span>›</span> <b>{active}</b></div><div className="premium-actions"><VideoCallManager profile={profile}/><label><Icon name="search" size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="খুঁজুন…" aria-label="ড্যাশবোর্ডে খুঁজুন"/><kbd>⌕</kbd></label><span className="premium-top-avatar">{Array.from(name)[0] ?? 'আ'}</span><div className="premium-top-user"><b>{name}</b><small>একাডেমি অ্যাডমিন</small></div><button className="premium-logout" onClick={onSignOut}><Icon name="logout" size={17}/><span>লগআউট</span></button></div></header>
      <div className="premium-content">
        {problem && <div className="premium-alert" role="status">{problem}</div>}
        {active === 'ড্যাশবোর্ড' ? <>
          <div className="premium-welcome"><div><div className="premium-date"><span/> {greetingDate}</div><h1>আসসালামু আলাইকুম, <em>{name}</em> <span>☀</span></h1><p>আপনার একাডেমির আজকের কার্যক্রম এক নজরে দেখুন।</p></div><button className="premium-add" onClick={() => selectSection('শিক্ষার্থী')}><Icon name="plus" size={17}/> শিক্ষার্থী দেখুন</button></div>
          <section className="premium-hero"><div className="premium-hero-copy"><span>আজকের অনুপ্রেরণা</span><h2>জ্ঞান অন্বেষণ<br/><em>জীবনের আলো।</em></h2><p>ইলম, আমল ও আখলাকের পথে প্রতিদিন এগিয়ে চলুন।</p><small>শিক্ষা · আমল · আখলাক</small></div><div className="premium-hero-logo"><span>ٱقْرَأْ</span><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/></div><i className="hero-glow one"/><i className="hero-glow two"/></section>
          <div className="premium-section-title"><div><h2>একাডেমির সারসংক্ষেপ</h2><p>ডেটাবেজে থাকা বর্তমান তথ্য</p></div><span className="live-pill"><i/> লাইভ ডেটা</span></div>
          <section className="premium-stats">{stats.map(stat => <article className={`premium-stat ${stat.color}`} key={stat.label}><span className="stat-symbol"><Icon name={stat.icon} size={19}/></span><small>{stat.label}</small><strong>{loading ? '…' : stat.value === null ? '—' : typeof stat.value === 'number' ? bnNumber(stat.value) : stat.value}</strong><span className="stat-note">{stat.note}</span><i className="stat-orb"/></article>)}</section>
          <section className="premium-columns"><article className="premium-panel schedule-panel"><div className="premium-panel-head"><div><span className="panel-symbol teal"><Icon name="calendar" size={17}/></span><div><h3>আজকের সময়সূচি</h3><p>{bnDate(new Date().toISOString(), { day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka' })} · নির্ধারিত ক্লাস</p></div></div><button onClick={() => selectSection('সময়সূচি')}>সব দেখুন <Icon name="arrow" size={14}/></button></div><div className="premium-records">{loading ? <Empty label="সময়সূচি লোড হচ্ছে…"/> : data.sessions.length ? data.sessions.map(item => { const classInfo = Array.isArray(item.classes) ? item.classes[0] : item.classes; return <div className="premium-session" key={item.id}><span className="session-time"><b>{bnDate(item.starts_at, { hour: '2-digit', minute: '2-digit' })}</b><small>{item.duration_minutes} মিনিট</small></span><span className="session-mark"><Icon name="book" size={16}/></span><div className="session-info"><b>{item.title || classInfo?.name || 'ক্লাস সেশন'}</b><small>{classInfo?.subject || classInfo?.name || 'একাডেমি ক্লাস'} · {item.status === 'live' ? 'লাইভ' : item.status === 'completed' ? 'সম্পন্ন' : 'নির্ধারিত'}</small></div>{item.meeting_url && <a className="join-link" href={item.meeting_url} target="_blank" rel="noreferrer">ক্লাসে যান →</a>}</div> }) : <Empty label="আজকের জন্য কোনো ক্লাস নির্ধারিত নেই।"/>}</div><button className="panel-foot-link" onClick={() => selectSection('সময়সূচি')}>সম্পূর্ণ সময়সূচি <Icon name="arrow" size={14}/></button></article>
            <article className="premium-panel attendance-panel"><div className="premium-panel-head"><div><span className="panel-symbol gold"><Icon name="check" size={17}/></span><div><h3>উপস্থিতির সারাংশ</h3><p>গত ৭ দিনের নথিভুক্ত তথ্য</p></div></div><button onClick={() => selectSection('উপস্থিতি')}>বিস্তারিত <Icon name="arrow" size={14}/></button></div>{data.attendance ? <div className="attendance-live"><div className="attendance-ring" style={{ '--attendance': `${attendancePercent ?? 0}%` } as React.CSSProperties}><div><b>{bnNumber(attendancePercent ?? 0)}<small>%</small></b><span>উপস্থিত</span></div></div><div className="attendance-legend"><div><i className="present-dot"/><span>উপস্থিত</span><b>{bnNumber(data.attendance.present)}</b></div><div><i className="absent-dot"/><span>অন্যান্য</span><b>{bnNumber(data.attendance.total - data.attendance.present)}</b></div><small>মোট {bnNumber(data.attendance.total)}টি attendance record</small></div></div> : <Empty label="উপস্থিতির রেকর্ড যোগ হলে সারাংশ এখানে দেখা যাবে।"/>}<button className="panel-foot-link" onClick={() => selectSection('উপস্থিতি')}>উপস্থিতির তথ্য <Icon name="arrow" size={14}/></button></article></section>
          <section className="premium-columns lower"><article className="premium-panel"><div className="premium-panel-head"><div><span className="panel-symbol violet"><Icon name="layers" size={17}/></span><div><h3>সাম্প্রতিক কার্যক্রম</h3><p>অ্যাডমিন activity log থেকে</p></div></div><button onClick={() => selectSection('কার্যক্রম লগ')}>সব দেখুন <Icon name="arrow" size={14}/></button></div><div className="activity-records">{loading ? <Empty label="কার্যক্রম লোড হচ্ছে…"/> : data.activities.length ? data.activities.map(item => <div className="activity-line" key={item.id}><span><Icon name="clock" size={15}/></span><div><b>{item.action} · {item.entity_type}</b><small>{bnDate(item.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></div>) : <Empty label="নতুন কার্যক্রম হলে এখানে দেখা যাবে।"/>}</div></article><article className="premium-notice"><div className="notice-label"><span><Icon name="bell" size={16}/></span> সর্বশেষ প্রকাশিত নোটিশ</div>{loading ? <Empty label="নোটিশ লোড হচ্ছে…"/> : data.notice ? <><h3>{data.notice.title}</h3><p>{data.notice.description}</p><small>{data.notice.published_at ? bnDate(data.notice.published_at, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</small></> : <Empty label="এখনো কোনো প্রকাশিত নোটিশ নেই।"/>}<button onClick={() => selectSection('নোটিশ')}>নোটিশ দেখুন <Icon name="arrow" size={14}/></button></article></section>
        </> : active === 'সেটিংস' ? <AcademySettings profile={profile} /> : active === 'রিপোর্ট' ? <Reports profile={profile} /> : <ModuleManager key={active} active={active} profile={profile} query={query} />}
        <footer className="premium-footer"><span>© {new Date().getFullYear()} আলমুয়াফী অনলাইন একাডেমি</span><span>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</span></footer>
      </div>
    </main>
  </div>
}

function Empty({ label }: { label: string }) { return <div className="premium-empty"><span>✦</span><p>{label}</p></div> }

type AcademySettingsRecord = {
  academy_name: string; academy_name_en: string; description: string; description_en: string; about_text: string; about_text_en: string;
  subjects: string; subjects_en: string; teaching_methodology: string; teaching_methodology_en: string;
  academy_features: string; academy_features_en: string; online_class_steps: string; online_class_steps_en: string;
  library_intro: string; library_intro_en: string; notices_intro: string; notices_intro_en: string;
  contact_email: string; contact_phone: string; facebook: string; youtube: string;
  footer_text: string; footer_text_en: string;
}
const EMPTY_SETTINGS: AcademySettingsRecord = {
  academy_name: '', academy_name_en: '', description: '', description_en: '', about_text: '', about_text_en: '',
  subjects: '', subjects_en: '', teaching_methodology: '', teaching_methodology_en: '', academy_features: '', academy_features_en: '',
  online_class_steps: '', online_class_steps_en: '', library_intro: '', library_intro_en: '', notices_intro: '', notices_intro_en: '',
  contact_email: '', contact_phone: '', facebook: '', youtube: '', footer_text: '', footer_text_en: '',
}
function AcademySettings({ profile }: { profile: AcademyProfile }) {
  const [form, setForm] = useState(EMPTY_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    async function load() {
      if (!supabase) { setError('Supabase সংযোগ সেট করা নেই।'); setLoading(false); return }
      const { data, error: loadError } = await supabase.from('academy_settings').select('*').eq('id', 1).maybeSingle()
      if (!live) return
      if (loadError) setError('একাডেমির সেটিংস পড়া যায়নি। ডেটাবেজ সংযোগ ও অনুমতি যাচাই করুন।')
      if (data) setForm({
        academy_name: data.academy_name ?? '', academy_name_en: data.academy_name_en ?? '',
        description: data.description ?? '', description_en: data.description_en ?? '',
        about_text: data.about_text ?? '', about_text_en: data.about_text_en ?? '',
        subjects: (data.subjects ?? []).join('\n'), subjects_en: (data.subjects_en ?? []).join('\n'),
        teaching_methodology: data.teaching_methodology ?? '', teaching_methodology_en: data.teaching_methodology_en ?? '',
        academy_features: (data.academy_features ?? []).join('\n'), academy_features_en: (data.academy_features_en ?? []).join('\n'),
        online_class_steps: (data.online_class_steps ?? []).join('\n'), online_class_steps_en: (data.online_class_steps_en ?? []).join('\n'),
        library_intro: data.library_intro ?? '', library_intro_en: data.library_intro_en ?? '',
        notices_intro: data.notices_intro ?? '', notices_intro_en: data.notices_intro_en ?? '',
        contact_email: data.contact_email ?? '', contact_phone: data.contact_phone ?? '',
        facebook: data.social_links?.facebook ?? '', youtube: data.social_links?.youtube ?? '', footer_text: data.footer_text ?? '', footer_text_en: data.footer_text_en ?? '',
      })
      setLoading(false)
    }
    void load()
    return () => { live = false }
  }, [])
  function change(field: keyof AcademySettingsRecord, value: string) { setForm(current => ({ ...current, [field]: value })); setMessage(''); setError('') }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(''); setError('')
    if (!supabase) { setError('Supabase সংযোগ সেট করা নেই।'); setSaving(false); return }
    const payload = {
      id: 1, academy_name: form.academy_name.trim(), academy_name_en: form.academy_name_en.trim() || null,
      description: form.description.trim(), description_en: form.description_en.trim() || null,
      about_text: form.about_text.trim(), about_text_en: form.about_text_en.trim(),
      subjects: form.subjects.split('\n').map(item => item.trim()).filter(Boolean), subjects_en: form.subjects_en.split('\n').map(item => item.trim()).filter(Boolean),
      teaching_methodology: form.teaching_methodology.trim(), teaching_methodology_en: form.teaching_methodology_en.trim(),
      academy_features: form.academy_features.split('\n').map(item => item.trim()).filter(Boolean), academy_features_en: form.academy_features_en.split('\n').map(item => item.trim()).filter(Boolean),
      online_class_steps: form.online_class_steps.split('\n').map(item => item.trim()).filter(Boolean), online_class_steps_en: form.online_class_steps_en.split('\n').map(item => item.trim()).filter(Boolean),
      library_intro: form.library_intro.trim(), library_intro_en: form.library_intro_en.trim(), notices_intro: form.notices_intro.trim(), notices_intro_en: form.notices_intro_en.trim(),
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      social_links: { facebook: form.facebook.trim(), youtube: form.youtube.trim() },
      footer_text: form.footer_text.trim(), footer_text_en: form.footer_text_en.trim(), updated_at: new Date().toISOString(),
    }
    let result = await supabase.from('academy_settings').upsert(payload, { onConflict: 'id' })
    let savedLegacyOnly = false
    const publicContentFields = ['academy_name_en', 'description_en', 'about_text', 'about_text_en', 'teaching_methodology_en', 'subjects_en', 'academy_features_en', 'online_class_steps_en', 'library_intro', 'library_intro_en', 'notices_intro', 'notices_intro_en', 'footer_text_en']
    const corePublicFields = ['subjects', 'teaching_methodology', 'academy_features', 'online_class_steps']
    const isMissingField = (error: { code?: string; message: string } | null, fields: string[]) => Boolean(error && (error.code === 'PGRST204' || fields.some(name => error.message.includes(name)) || /schema cache/i.test(error.message)))
    if (isMissingField(result.error, publicContentFields)) {
      const compatiblePayload = { ...payload }
      publicContentFields.forEach(field => { delete compatiblePayload[field as keyof typeof compatiblePayload] })
      result = await supabase.from('academy_settings').upsert(compatiblePayload, { onConflict: 'id' })
      savedLegacyOnly = !result.error
      if (result.error && isMissingField(result.error, corePublicFields)) {
        corePublicFields.forEach(field => { delete compatiblePayload[field as keyof typeof compatiblePayload] })
        result = await supabase.from('academy_settings').upsert(compatiblePayload, { onConflict: 'id' })
        savedLegacyOnly = !result.error
      }
    }
    setSaving(false)
    if (result.error) setError(`সেটিংস সংরক্ষণ হয়নি: ${result.error.message}`)
    else if (savedLegacyOnly) setMessage('সেটিংস সংরক্ষিত হয়েছে। বিষয়/বাংলা-ইংরেজি অতিরিক্ত তথ্য চালু করতে Supabase migration 20261112020000 এবং 20261112050000 চালান।')
    else setMessage('একাডেমির সেটিংস সফলভাবে সংরক্ষিত হয়েছে।')
  }
  const field = (label: string, key: keyof AcademySettingsRecord, options: { type?: string; multiline?: boolean; hint?: string } = {}) => <label className="advanced-field" key={key}><span>{label}</span>{options.multiline ? <textarea value={form[key]} onChange={event => change(key, event.target.value)} rows={3}/> : <input type={options.type ?? 'text'} value={form[key]} onChange={event => change(key, event.target.value)} />}{options.hint && <small>{options.hint}</small>}</label>
  return <section className="premium-module advanced-settings"><div className="premium-section-title"><div><div className="premium-date"><span/> একাডেমি পরিচালনা</div><h2>অ্যাডভান্সড সেটিংস</h2><p>প্রকাশ্য সাইটে দেখানো একাডেমির তথ্য ও যোগাযোগ পরিচালনা করুন।</p></div><span className="live-pill"><i/> বাস্তব সেটিংস</span></div>
    {loading ? <article className="premium-panel"><Empty label="একাডেমির সেটিংস পড়া হচ্ছে…"/></article> : <form className="premium-panel advanced-form" onSubmit={save}>
      <div className="advanced-settings-intro"><span className="panel-symbol teal"><Icon name="settings" size={18}/></span><div><b>{profile.full_name || 'অ্যাডমিন'} · একাডেমি কনফিগারেশন</b><small>পরিবর্তন Supabase-এ সংরক্ষিত হবে এবং পাবলিক সাইটে ব্যবহৃত হবে।</small></div></div>
      <fieldset><legend>একাডেমির পরিচিতি · বাংলা</legend><div className="advanced-grid">{field('একাডেমির নাম', 'academy_name')}{field('হোমপেজের পরিচিতি', 'description', { multiline: true })}{field('আমাদের সম্পর্কে', 'about_text', { multiline: true })}{field('পড়ানো বিষয় · প্রতি লাইনে একটি', 'subjects', { multiline: true })}{field('পাঠদানের পদ্ধতি', 'teaching_methodology', { multiline: true })}{field('একাডেমির সুবিধা · প্রতি লাইনে একটি', 'academy_features', { multiline: true })}{field('অনলাইন ক্লাসের ধাপ · প্রতি লাইনে একটি', 'online_class_steps', { multiline: true })}{field('লাইব্রেরির পরিচিতি', 'library_intro', { multiline: true })}{field('নোটিশের পরিচিতি', 'notices_intro', { multiline: true })}{field('ফুটারের লেখা', 'footer_text', { multiline: true })}</div></fieldset>
      <fieldset><legend>Academy content · English</legend><div className="advanced-grid">{field('Academy name', 'academy_name_en')}{field('Home introduction', 'description_en', { multiline: true })}{field('About the academy', 'about_text_en', { multiline: true })}{field('Subjects · one per line', 'subjects_en', { multiline: true })}{field('Teaching approach', 'teaching_methodology_en', { multiline: true })}{field('Learning facilities · one per line', 'academy_features_en', { multiline: true })}{field('How to join · one per line', 'online_class_steps_en', { multiline: true })}{field('Library introduction', 'library_intro_en', { multiline: true })}{field('Notice introduction', 'notices_intro_en', { multiline: true })}{field('Footer text', 'footer_text_en', { multiline: true })}</div></fieldset>
      <fieldset><legend>যোগাযোগ ও প্রকাশনা · Contact & publishing</legend><div className="advanced-grid">{field('যোগাযোগের ইমেইল / Contact email', 'contact_email', { type: 'email' })}{field('যোগাযোগের ফোন / Contact phone', 'contact_phone', { type: 'tel' })}{field('Facebook URL', 'facebook', { type: 'url' })}{field('YouTube URL', 'youtube', { type: 'url' })}</div></fieldset>
      {(error || message) && <div className={error ? 'advanced-feedback is-error' : 'advanced-feedback'} role="status">{error || message}</div>}
      <div className="advanced-actions"><span>সেটিংস পরিবর্তন করলে পাবলিক সাইটের তথ্যও বদলাবে।</span><button className="premium-add" type="submit" disabled={saving || !form.academy_name.trim()}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'সেটিংস সংরক্ষণ করুন'}</button></div>
    </form>}
  </section>
}

type ReportRow = Record<string, string | number | null>
function csvValue(value: unknown) { const text = String(value ?? ''); return `"${text.replaceAll('"', '""')}"` }
function downloadCsv(filename: string, headers: string[], rows: ReportRow[]) {
  const csv = '\uFEFF' + [headers.map(csvValue).join(','), ...rows.map(row => headers.map(header => csvValue(row[header])).join(','))].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}
function Reports({ profile }: { profile: AcademyProfile }) {
  const [report, setReport] = useState<'students' | 'attendance' | 'homework' | 'enrollments'>('students')
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let live = true
    async function load() {
      if (!supabase) { setError('Supabase সংযোগ সেট করা নেই।'); setLoading(false); return }
      setLoading(true); setError('')
      let result: { data: any[] | null; error: any }
      if (report === 'students') result = await supabase.from('profiles').select('id,full_name,email,phone,status,created_at').eq('role', 'student').order('created_at', { ascending: false }).limit(1000)
      else if (report === 'attendance') {
        const { start } = dhakaDayBounds(); const from = new Date(new Date(start).getTime() - 30 * 86_400_000).toISOString()
        const response = await supabase.from('attendance').select('status,note,recorded_at,profiles(full_name,email),class_sessions(title,classes(name))').gte('recorded_at', from).order('recorded_at', { ascending: false }).limit(2000)
        result = { data: response.data ? response.data.map(item => ({ শিক্ষার্থী: (Array.isArray(item.profiles) ? item.profiles[0] : item.profiles)?.full_name || (Array.isArray(item.profiles) ? item.profiles[0] : item.profiles)?.email || '', ক্লাস: (Array.isArray(item.class_sessions) ? item.class_sessions[0] : item.class_sessions)?.title || '', অবস্থা: statusLabels[item.status] || item.status, তারিখ: bnDate(item.recorded_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), মন্তব্য: item.note })) : null, error: response.error }
      } else if (report === 'homework') {
        const response = await supabase.from('homework_submissions').select('status,marks,teacher_feedback,submitted_at,profiles(full_name,email),homework(title)').order('submitted_at', { ascending: false }).limit(2000)
        result = { data: response.data ? response.data.map(item => ({ শিক্ষার্থী: (Array.isArray(item.profiles) ? item.profiles[0] : item.profiles)?.full_name || (Array.isArray(item.profiles) ? item.profiles[0] : item.profiles)?.email || '', হোমওয়ার্ক: (Array.isArray(item.homework) ? item.homework[0] : item.homework)?.title || '', অবস্থা: statusLabels[item.status] || item.status, নম্বর: item.marks, শিক্ষকের_মন্তব্য: item.teacher_feedback, জমার_তারিখ: bnDate(item.submitted_at, { year: 'numeric', month: '2-digit', day: '2-digit' }) })) : null, error: response.error }
      } else {
        const response = await supabase.from('class_enrollments').select('status,enrolled_at,profiles(full_name,email),classes(name,subject)').order('enrolled_at', { ascending: false }).limit(2000)
        result = { data: response.data ? response.data.map(item => ({ শিক্ষার্থী: (Array.isArray(item.profiles) ? item.profiles[0] : item.profiles)?.full_name || (Array.isArray(item.profiles) ? item.profiles[0] : item.profiles)?.email || '', ক্লাস: (Array.isArray(item.classes) ? item.classes[0] : item.classes)?.name || '', বিষয়: (Array.isArray(item.classes) ? item.classes[0] : item.classes)?.subject || '', অবস্থা: statusLabels[item.status] || item.status, ভর্তির_তারিখ: bnDate(item.enrolled_at, { year: 'numeric', month: '2-digit', day: '2-digit' }) })) : null, error: response.error }
      }
      if (!live) return
      if (result.error) setError('রিপোর্টের তথ্য লোড হয়নি। Supabase সংযোগ ও অ্যাডমিন অনুমতি যাচাই করুন।')
      setRows(result.data ?? []); setLoading(false)
      void supabase.from('activity_logs').insert({ actor_id: profile.id, action: 'রিপোর্ট দেখা', entity_type: `report_${report}`, details: { rows: result.data?.length ?? 0 } })
    }
    void load()
    return () => { live = false }
  }, [profile.id, report, reload])
  const columns = report === 'students' ? ['full_name', 'email', 'phone', 'status', 'created_at'] : report === 'attendance' ? ['শিক্ষার্থী', 'ক্লাস', 'অবস্থা', 'তারিখ', 'মন্তব্য'] : report === 'homework' ? ['শিক্ষার্থী', 'হোমওয়ার্ক', 'অবস্থা', 'নম্বর', 'শিক্ষকের_মন্তব্য', 'জমার_তারিখ'] : ['শিক্ষার্থী', 'ক্লাস', 'বিষয়', 'অবস্থা', 'ভর্তির_তারিখ']
  const labels: Record<string, string> = { full_name: 'শিক্ষার্থী', email: 'ইমেইল', phone: 'ফোন', status: 'অবস্থা', created_at: 'নিবন্ধন', 'শিক্ষার্থী': 'শিক্ষার্থী', 'ক্লাস': 'ক্লাস', 'বিষয়': 'বিষয়', 'অবস্থা': 'অবস্থা', 'তারিখ': 'তারিখ', 'মন্তব্য': 'মন্তব্য', 'হোমওয়ার্ক': 'হোমওয়ার্ক', 'নম্বর': 'নম্বর', 'শিক্ষকের_মন্তব্য': 'শিক্ষকের মন্তব্য', 'জমার_তারিখ': 'জমার তারিখ', 'ভর্তির_তারিখ': 'ভর্তির তারিখ' }
  const reportLabel = ({ students: 'শিক্ষার্থী তালিকা', attendance: 'উপস্থিতি · গত ৩০ দিন', homework: 'হোমওয়ার্ক জমা ও মূল্যায়ন', enrollments: 'ক্লাস ভর্তি তালিকা' } as Record<string, string>)[report]
  function exportReport() {
    const headerNames = columns.map(key => labels[key] || key)
    const exportRows = rows.map(row => Object.fromEntries(columns.map(key => [labels[key] || key, key.endsWith('_at') && typeof row[key] === 'string' ? bnDate(row[key] as string, { year: 'numeric', month: '2-digit', day: '2-digit' }) : row[key]])))
    downloadCsv(`almuafy-${report}.csv`, headerNames, exportRows)
  }
  return <section className="premium-module"><div className="premium-section-title"><div><div className="premium-date"><span/> একাডেমি পরিচালনা</div><h2>বাস্তব রিপোর্ট</h2><p>Supabase-এর বর্তমান তথ্য; ডেমো রেকর্ড নেই।</p></div><span className="live-pill"><i/> লাইভ ডেটা</span></div>{error && <div className="premium-alert" role="status">{error}</div>}<article className="premium-panel report-panel"><div className="report-toolbar"><label>রিপোর্ট ধরন<select value={report} onChange={event => setReport(event.target.value as typeof report)}><option value="students">শিক্ষার্থী তালিকা</option><option value="attendance">উপস্থিতি · গত ৩০ দিন</option><option value="homework">হোমওয়ার্ক জমা ও মূল্যায়ন</option><option value="enrollments">ক্লাস ভর্তি তালিকা</option></select></label><div><button className="manager-cancel" onClick={() => setReload(value => value + 1)}>হালনাগাদ</button><button className="premium-add" disabled={loading || rows.length === 0} onClick={exportReport}><Icon name="arrow" size={15}/> CSV ডাউনলোড</button></div></div><div className="report-summary"><b>{reportLabel}</b><span>{loading ? 'লোড হচ্ছে…' : `${bnNumber(rows.length)}টি রেকর্ড`}</span></div>{loading ? <Empty label="রিপোর্ট তৈরি হচ্ছে…"/> : rows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr>{columns.map(key => <th key={key}>{labels[key] || key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.email ?? `${index}`)}>{columns.map(key => <td key={key}>{key === 'status' || key === 'অবস্থা' ? statusLabels[String(row[key])] || row[key] : row[key] == null ? '—' : String(row[key])}</td>)}</tr>)}</tbody></table></div> : <Empty label={`${reportLabel}-এ এখনো কোনো রেকর্ড নেই।`} />}</article></section>
}

type ManagerField = { key: string; label: string; type?: 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'date' | 'datetime-local' | 'number' | 'select' | 'checkbox'; required?: boolean; options?: { value: string; label: string }[]; hint?: string }
type ManagerConfig = { table: string; titleKeys: string[]; detailKeys: string[]; fields: ManagerField[]; create?: boolean; editable?: boolean; retireStatus?: string; retireLabel?: string }
const statusOptions = (values: string[]) => values.map(value => ({ value, label: ({ active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়', archived: 'আর্কাইভ', draft: 'খসড়া', published: 'প্রকাশিত', scheduled: 'নির্ধারিত', live: 'চলমান', completed: 'সম্পন্ন', cancelled: 'বাতিল', present: 'উপস্থিত', absent: 'অনুপস্থিত', late: 'দেরি', pending: 'অপেক্ষমাণ' } as Record<string, string>)[value] ?? value }))
const moduleConfigs: Record<string, ManagerConfig> = {
  'শিক্ষার্থী': { table: 'profiles', create: false, retireStatus: 'inactive', retireLabel: 'নিষ্ক্রিয় করুন', titleKeys: ['full_name', 'email'], detailKeys: ['phone', 'status'], fields: [
    { key: 'full_name', label: 'পূর্ণ নাম', required: true }, { key: 'phone', label: 'ফোন', type: 'tel' },
    { key: 'status', label: 'অ্যাকাউন্ট অবস্থা', type: 'select', options: statusOptions(['active', 'pending', 'inactive', 'blocked']), required: true },
  ] },
  'ভর্তি ব্যবস্থাপনা': { table: 'class_enrollments', retireStatus: 'inactive', retireLabel: 'ভর্তি নিষ্ক্রিয় করুন', titleKeys: ['student_id'], detailKeys: ['class_id', 'status'], fields: [
    { key: 'class_id', label: 'ক্লাস নির্বাচন', type: 'select', required: true }, { key: 'student_id', label: 'শিক্ষার্থী নির্বাচন', type: 'select', required: true },
    { key: 'status', label: 'ভর্তির অবস্থা', type: 'select', required: true, options: statusOptions(['pending', 'active', 'inactive']) },
  ] },
  'ক্লাস ও পাঠ': { table: 'classes', retireStatus: 'archived', titleKeys: ['name'], detailKeys: ['subject', 'level', 'status'], fields: [
    { key: 'name', label: 'ক্লাসের নাম · বাংলা', required: true }, { key: 'name_en', label: 'Class name · English' },
    { key: 'subject', label: 'বিষয় · বাংলা', required: true }, { key: 'subject_en', label: 'Subject · English' },
    { key: 'level', label: 'শ্রেণি বা স্তর · বাংলা' }, { key: 'level_en', label: 'Level · English' },
    { key: 'description', label: 'বর্ণনা · বাংলা', type: 'textarea' }, { key: 'description_en', label: 'Description · English', type: 'textarea' }, { key: 'status', label: 'অবস্থা', type: 'select', required: true, options: statusOptions(['active', 'inactive', 'archived']) },
    { key: 'public_visible', label: 'পাবলিক সাইটে দেখান', type: 'checkbox' },
  ] },
  'সময়সূচি': { table: 'class_sessions', retireStatus: 'cancelled', retireLabel: 'সেশন বাতিল করুন', titleKeys: ['title'], detailKeys: ['starts_at', 'status'], fields: [
    { key: 'class_id', label: 'ক্লাস নির্বাচন', type: 'select', required: true }, { key: 'title', label: 'সেশনের শিরোনাম', required: true },
    { key: 'starts_at', label: 'শুরুর সময়', type: 'datetime-local', required: true }, { key: 'duration_minutes', label: 'সময় (মিনিট)', type: 'number', required: true },
    { key: 'meeting_url', label: 'ক্লাস লিংক', type: 'url', hint: 'এখনকার বাহ্যিক মিটিং লিংক; ইন-অ্যাপ ভিডিও কল পরে যুক্ত হবে।' },
    { key: 'status', label: 'অবস্থা', type: 'select', required: true, options: statusOptions(['scheduled', 'live', 'completed', 'cancelled']) },
  ] },
  'উপস্থিতি': { table: 'attendance', titleKeys: ['status'], detailKeys: ['student_id', 'session_id', 'note', 'recorded_at'], fields: [
    { key: 'session_id', label: 'ক্লাস সেশন', type: 'select', required: true }, { key: 'student_id', label: 'শিক্ষার্থী', type: 'select', required: true },
    { key: 'status', label: 'উপস্থিতির অবস্থা', type: 'select', required: true, options: statusOptions(['present', 'absent', 'late']) }, { key: 'note', label: 'মন্তব্য', type: 'textarea' },
  ] },
  'দৈনিক পাঠ': { table: 'daily_lessons', retireStatus: 'archived', titleKeys: ['title'], detailKeys: ['subject', 'lesson_date', 'status'], fields: [
    { key: 'class_id', label: 'ক্লাস নির্বাচন', type: 'select', required: true }, { key: 'title', label: 'পাঠের শিরোনাম', required: true }, { key: 'subject', label: 'বিষয়', required: true },
    { key: 'description', label: 'পাঠের বিবরণ', type: 'textarea' }, { key: 'lesson_date', label: 'পাঠের তারিখ', type: 'date', required: true },
    { key: 'status', label: 'অবস্থা', type: 'select', required: true, options: statusOptions(['draft', 'published', 'archived']) },
  ] },
  'পাঠের উপকরণ': { table: 'lesson_links', titleKeys: ['label'], detailKeys: ['lesson_id', 'url'], fields: [
    { key: 'lesson_id', label: 'প্রকাশিত পাঠ নির্বাচন', type: 'select', required: true }, { key: 'label', label: 'লিংকের নাম', required: true }, { key: 'url', label: 'বাহ্যিক লিংক', type: 'url', required: true },
  ] },
  'হোমওয়ার্ক': { table: 'homework', retireStatus: 'archived', titleKeys: ['title'], detailKeys: ['due_at', 'status'], fields: [
    { key: 'class_id', label: 'ক্লাস নির্বাচন', type: 'select', required: true }, { key: 'title', label: 'হোমওয়ার্কের শিরোনাম', required: true },
    { key: 'instructions', label: 'নির্দেশনা', type: 'textarea' }, { key: 'due_at', label: 'জমা দেওয়ার শেষ সময়', type: 'datetime-local' },
    { key: 'status', label: 'অবস্থা', type: 'select', required: true, options: statusOptions(['draft', 'published', 'closed', 'archived']) },
  ] },
  'হোমওয়ার্ক মূল্যায়ন': { table: 'homework_submissions', create: false, titleKeys: ['answer_text', 'id'], detailKeys: ['student_id', 'homework_id', 'status', 'marks', 'submitted_at'], fields: [
    { key: 'status', label: 'মূল্যায়নের অবস্থা', type: 'select', required: true, options: statusOptions(['submitted', 'reviewed', 'completed', 'needs_revision']) },
    { key: 'marks', label: 'নম্বর (০–১০০)', type: 'number' }, { key: 'teacher_feedback', label: 'শিক্ষকের মতামত', type: 'textarea' },
  ] },
  'লাইব্রেরি বিভাগ': { table: 'library_categories', titleKeys: ['name'], detailKeys: ['slug', 'sort_order'], fields: [
    { key: 'name', label: 'বিভাগের নাম', required: true }, { key: 'slug', label: 'লিংক নাম (ইংরেজি)', required: true }, { key: 'sort_order', label: 'ক্রম', type: 'number' },
  ] },
  'লাইব্রেরি': { table: 'library_resources', retireStatus: 'archived', titleKeys: ['title'], detailKeys: ['resource_url', 'status'], fields: [
    { key: 'title', label: 'নাম', required: true }, { key: 'resource_url', label: 'লিংক', type: 'url', required: true },
    { key: 'description', label: 'বিবরণ', type: 'textarea' },
  ] },
  'নোটিশ': { table: 'notices', retireStatus: 'archived', titleKeys: ['title'], detailKeys: ['visibility', 'priority', 'status'], fields: [
    { key: 'title', label: 'নোটিশের শিরোনাম · বাংলা', required: true }, { key: 'title_en', label: 'Notice title · English' }, { key: 'description', label: 'নোটিশের লেখা · বাংলা', type: 'textarea', required: true }, { key: 'description_en', label: 'Notice text · English', type: 'textarea' },
    { key: 'visibility', label: 'কারা দেখবে', type: 'select', required: true, options: [{ value: 'public', label: 'সবার জন্য' }, { value: 'students', label: 'শুধু শিক্ষার্থী' }, { value: 'all_users', label: 'লগইন করা সবাই' }] },
    { key: 'priority', label: 'গুরুত্ব', type: 'select', required: true, options: [{ value: 'normal', label: 'সাধারণ' }, { value: 'important', label: 'জরুরি' }] },
    { key: 'status', label: 'অবস্থা', type: 'select', required: true, options: statusOptions(['draft', 'published', 'archived']) },
    { key: 'expires_at', label: 'মেয়াদ শেষ', type: 'datetime-local' },
  ] },
  'শিক্ষার্থী বিজ্ঞপ্তি': { table: 'notifications', titleKeys: ['title'], detailKeys: ['kind', 'created_at'], fields: [
    { key: 'user_id', label: 'শিক্ষার্থী নির্বাচন', type: 'select', required: true }, { key: 'title', label: 'বিজ্ঞপ্তির শিরোনাম', required: true },
    { key: 'body', label: 'বিজ্ঞপ্তির লেখা', type: 'textarea', required: true }, { key: 'kind', label: 'ধরন', required: true }, { key: 'href', label: 'অ্যাপের ভেতরের পথ (ঐচ্ছিক)' },
  ] },
  'কার্যক্রম লগ': { table: 'activity_logs', create: false, editable: false, titleKeys: ['action'], detailKeys: ['entity_type', 'created_at'], fields: [] },
}
const managerTitles: Record<string, string> = { full_name: 'নাম', email: 'ইমেইল', name: 'ক্লাস', title: 'শিরোনাম', status: 'অবস্থা', starts_at: 'শুরু', lesson_date: 'তারিখ', due_at: 'জমার শেষ সময়', resource_url: 'উপকরণের লিংক', note: 'মন্তব্য', description: 'বিবরণ', phone: 'ফোন', subject: 'বিষয়', level: 'স্তর', visibility: 'দর্শক', priority: 'গুরুত্ব', recorded_at: 'নথিভুক্ত', created_at: 'যোগের সময়', submitted_at: 'জমার সময়', student_id: 'শিক্ষার্থী', session_id: 'ক্লাস সেশন', homework_id: 'হোমওয়ার্ক', marks: 'নম্বর', kind: 'ধরন', slug: 'লিংক নাম', sort_order: 'ক্রম' }
const statusLabels: Record<string, string> = { active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়', pending: 'অপেক্ষমাণ', blocked: 'বন্ধ', archived: 'আর্কাইভ', draft: 'খসড়া', published: 'প্রকাশিত', scheduled: 'নির্ধারিত', live: 'চলমান', completed: 'সম্পন্ন', cancelled: 'বাতিল', present: 'উপস্থিত', absent: 'অনুপস্থিত', late: 'দেরি', submitted: 'জমা হয়েছে', reviewed: 'পর্যালোচিত', needs_revision: 'সংশোধন দরকার', closed: 'বন্ধ', important: 'জরুরি', normal: 'সাধারণ', public: 'সবার জন্য', students: 'শিক্ষার্থীদের জন্য', all_users: 'লগইন করা সবাই' }
function inputDate(value: unknown, dateOnly = false) {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, dateOnly ? 10 : 16)
}
function ModuleManager({ active, profile, query }: { active: string; profile: AcademyProfile; query: string }) {
  const config = moduleConfigs[active]
  const libraryDraftKey = `almuafy-library-draft:${profile.id}`
  const savedLibraryDraft = config.table === 'library_resources'
    ? readTabMemory<{ form: Record<string, string | boolean>; formOpen: boolean; editingId: string | null }>(libraryDraftKey, { form: {}, formOpen: false, editingId: null })
    : { form: {}, formOpen: false, editingId: null }
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [references, setReferences] = useState<Record<string, { value: string; label: string }[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(savedLibraryDraft.formOpen)
  const [editing, setEditing] = useState<Record<string, any> | null>(null)
  const [pendingEditingId, setPendingEditingId] = useState<string | null>(savedLibraryDraft.editingId)
  const [form, setForm] = useState<Record<string, string | boolean>>(savedLibraryDraft.form)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (config.table !== 'library_resources' || !pendingEditingId || loading) return
    setEditing(rows.find(row => row.id === pendingEditingId) ?? null)
    setPendingEditingId(null)
  }, [config.table, loading, pendingEditingId, rows])
  useEffect(() => {
    if (config.table !== 'library_resources') return
    if (formOpen || Object.keys(form).length || editing || pendingEditingId) {
      writeTabMemory(libraryDraftKey, { form, formOpen, editingId: editing?.id ?? pendingEditingId })
    } else clearTabMemory(libraryDraftKey)
  }, [config.table, editing, form, formOpen, libraryDraftKey, pendingEditingId])
  useEffect(() => {
    let live = true
    async function load() {
      if (!supabase) { setError('Supabase সংযোগ সেট করা নেই।'); setLoading(false); return }
      setLoading(true); setError('')
      const orderColumn = ({ class_enrollments: 'enrolled_at', attendance: 'recorded_at', homework_submissions: 'submitted_at' } as Record<string, string>)[config.table] ?? 'created_at'
      const profileQuery = supabase.from(config.table).select('*')
      const scopedQuery = config.table === 'profiles' ? profileQuery.eq('role', 'student') : profileQuery
      const { data, error: loadError } = await scopedQuery.order(orderColumn, { ascending: false }).limit(100)
      if (!live) return
      if (loadError) setError('তথ্য লোড হয়নি। ডেটাবেজ সংযোগ ও অনুমতি যাচাই করুন।')
      setRows(data ?? [])
      const refs: Record<string, { value: string; label: string }[]> = {}
      if (config.fields.some(field => field.key === 'class_id')) {
        const { data: classes } = await supabase.from('classes').select('id,name,subject').order('name')
        refs.class_id = (classes ?? []).map((item: any) => ({ value: item.id, label: `${item.name} · ${item.subject}` }))
      }
      if (config.fields.some(field => field.key === 'category_id')) {
        const { data: categories } = await supabase.from('library_categories').select('id,name').order('sort_order')
        refs.category_id = (categories ?? []).map((item: any) => ({ value: item.id, label: item.name }))
      }
      if (config.fields.some(field => field.key === 'lesson_id')) {
        const { data: lessons } = await supabase.from('daily_lessons').select('id,title,lesson_date').order('lesson_date', { ascending: false }).limit(100)
        refs.lesson_id = (lessons ?? []).map((item: any) => ({ value: item.id, label: `${item.title} · ${item.lesson_date}` }))
      }
      if (config.fields.some(field => field.key === 'student_id') || config.fields.some(field => field.key === 'user_id')) {
        const { data: students } = await supabase.from('profiles').select('id,full_name,email').eq('role', 'student').order('full_name').limit(300)
        const options = (students ?? []).map((item: any) => ({ value: item.id, label: item.full_name || item.email || item.id }))
        if (config.fields.some(field => field.key === 'student_id')) refs.student_id = options
        if (config.fields.some(field => field.key === 'user_id')) refs.user_id = options
      }
      if (config.table === 'homework_submissions') {
        const [{ data: students }, { data: assignments }] = await Promise.all([
          supabase.from('profiles').select('id,full_name,email').eq('role', 'student').order('full_name').limit(300),
          supabase.from('homework').select('id,title').order('created_at', { ascending: false }).limit(300),
        ])
        refs.student_id = (students ?? []).map((item: any) => ({ value: item.id, label: item.full_name || item.email || item.id }))
        refs.homework_id = (assignments ?? []).map((item: any) => ({ value: item.id, label: item.title }))
      }
      if (config.fields.some(field => field.key === 'session_id')) {
        const { data: sessions } = await supabase.from('class_sessions').select('id,title,starts_at').order('starts_at', { ascending: false }).limit(100)
        refs.session_id = (sessions ?? []).map((item: any) => ({ value: item.id, label: `${item.title} · ${inputDate(item.starts_at)}` }))
      }
      if (live) { setReferences(refs); setLoading(false) }
    }
    void load()
    return () => { live = false }
  }, [config, reload])
  function begin(row?: Record<string, any>) {
    const next: Record<string, string | boolean> = {}
    for (const field of config.fields) {
      let value: any = row?.[field.key] ?? (field.type === 'checkbox' ? false : '')
      if (field.type === 'datetime-local') value = inputDate(value)
      if (field.type === 'date') value = inputDate(value, true)
      next[field.key] = field.type === 'checkbox' ? Boolean(value) : String(value ?? '')
    }
    setEditing(row ?? null); setPendingEditingId(row?.id ?? null); setForm(next); setFormOpen(true); setError(''); setMessage('')
  }
  function closeForm() { setEditing(null); setPendingEditingId(null); setForm({}); setFormOpen(false); clearTabMemory(libraryDraftKey) }
  function setValue(key: string, value: string | boolean) { setForm(current => ({ ...current, [key]: value })) }
  async function retire(row: Record<string, any>) {
    if (!supabase || !config.retireStatus) return
    const label = config.titleKeys.map(key => row[key] ? displayValue(key, row[key]) : '').find(Boolean) || row.id
    const action = config.retireLabel ?? 'আর্কাইভ করুন'
    if (!window.confirm(`“${label}” ${action}? রেকর্ডটি মুছে যাবে না; শুধু নিষ্ক্রিয়/আর্কাইভ হবে এবং পরে ফিরিয়ে আনা যাবে।`)) return
    setSaving(true); setError(''); setMessage('')
    const payload: Record<string, string> = { status: config.retireStatus }
    if (config.table !== 'class_enrollments') payload.updated_at = new Date().toISOString()
    const { error: retireError } = await supabase.from(config.table).update(payload).eq('id', row.id)
    setSaving(false)
    if (retireError) { setError(`পরিবর্তন করা যায়নি: ${retireError.message}`); return }
    void supabase.from('activity_logs').insert({ actor_id: profile.id, action, entity_type: config.table, entity_id: row.id, details: { retained: true } })
    setMessage('রেকর্ডটি মুছিনি—নিষ্ক্রিয়/আর্কাইভ করা হয়েছে। পরিবর্তন সংরক্ষিত হয়েছে।')
    setReload(value => value + 1)
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    setSaving(true); setError(''); setMessage('')
    const payload: Record<string, any> = {}
    for (const field of config.fields) {
      let value = form[field.key]
      if (field.type === 'checkbox') payload[field.key] = Boolean(value)
      else if (field.type === 'datetime-local') payload[field.key] = value ? new Date(String(value)).toISOString() : null
      else if (field.type === 'number') payload[field.key] = value ? Number(value) : field.key === 'duration_minutes' ? 45 : field.key === 'sort_order' ? 0 : null
      else payload[field.key] = String(value ?? '').trim() || null
    }
    if (!editing && ['daily_lessons', 'homework', 'library_resources', 'notices'].includes(config.table)) payload.created_by = profile.id
    if (!editing && config.table === 'attendance') payload.recorded_by = profile.id
    if (config.table === 'notices' && payload.status === 'published') payload.published_at = editing?.published_at || new Date().toISOString()
    if (config.table === 'homework_submissions') payload.reviewed_at = ['reviewed', 'completed', 'needs_revision'].includes(String(payload.status)) ? new Date().toISOString() : null
    if (config.table === 'library_resources') payload.status = editing ? editing.status : 'published'
    if (['classes', 'class_sessions', 'daily_lessons', 'homework', 'library_resources', 'notices'].includes(config.table)) payload.updated_at = new Date().toISOString()
    let result = editing ? await supabase.from(config.table).update(payload).eq('id', editing.id) : await supabase.from(config.table).insert(payload)
    let savedWithoutEnglishFields = false
    const translationFields = config.table === 'classes'
      ? ['name_en', 'subject_en', 'level_en', 'description_en']
      : config.table === 'notices' ? ['title_en', 'description_en']
        : config.table === 'library_resources' ? ['title_en', 'description_en'] : []
    const missingOptionalTranslations = translationFields.length > 0 && result.error &&
      (result.error.code === 'PGRST204' || translationFields.some(field => result.error?.message.includes(field)) || /schema cache/i.test(result.error.message))
    if (missingOptionalTranslations) {
      const compatiblePayload = { ...payload }
      translationFields.forEach(field => { delete compatiblePayload[field] })
      result = editing
        ? await supabase.from(config.table).update(compatiblePayload).eq('id', editing.id)
        : await supabase.from(config.table).insert(compatiblePayload)
      savedWithoutEnglishFields = !result.error
    }
    setSaving(false)
    if (result.error) { setError(`সংরক্ষণ হয়নি: ${result.error.message}`); return }
    const entityId = editing?.id ?? null
    void supabase.from('activity_logs').insert({ actor_id: profile.id, action: editing ? 'পরিবর্তন' : 'নতুন রেকর্ড', entity_type: config.table, entity_id: entityId ?? null, details: { label: active } })
    setMessage(savedWithoutEnglishFields
      ? 'তথ্য সংরক্ষিত হয়েছে। English translation field চালু করতে Supabase-এ 20261112050000 migration চালান।'
      : editing ? 'পরিবর্তন সংরক্ষিত হয়েছে।' : 'নতুন রেকর্ড যোগ হয়েছে.')
    setEditing(null); setForm({}); setFormOpen(false); setReload(count => count + 1)
  }
  const visibleRows = rows.filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))
  const labelFor = (field: ManagerField) => field.options ?? references[field.key] ?? []
  const displayValue = (key: string, value: any) => references[key]?.find(option => option.value === value)?.label ?? statusLabels[String(value)] ?? String(value)
  return <section className="premium-module"><div className="premium-section-title"><div><div className="premium-date"><span/> একাডেমি পরিচালনা</div><h2>{active}</h2><p>রেকর্ড যোগ করুন, পরিবর্তন করুন ও প্রকাশনার অবস্থা নিয়ন্ত্রণ করুন।</p></div><span className="live-pill"><i/> লাইভ ডেটা</span></div>
    {error && <div className="premium-alert" role="status">{error}</div>}{message && <div className="advanced-feedback" role="status">{message}</div>}
    <article className="premium-panel manager-panel"><div className="manager-toolbar"><div className="module-summary"><span className="panel-symbol teal"><Icon name={navGroups.flatMap(group => group.items).find(item => item.label === active)?.icon ?? 'grid'} size={18}/></span><div><b>{active} পরিচালনা</b><small>{loading ? 'তথ্য পড়া হচ্ছে…' : `${bnNumber(visibleRows.length)}টি রেকর্ড`}</small></div></div>{config.create !== false && <button className="premium-add manager-add" onClick={() => begin()}><Icon name="plus" size={16}/> নতুন যোগ করুন</button>}</div>
      {formOpen && <form className="manager-form" onSubmit={save}><div className="manager-form-head"><h3>{editing ? 'রেকর্ড পরিবর্তন' : 'নতুন রেকর্ড'}</h3><button type="button" onClick={closeForm}>বন্ধ করুন</button></div><div className="manager-fields">{config.fields.map(field => <label className={`advanced-field ${field.type === 'checkbox' ? 'manager-checkbox' : ''}`} key={field.key}><span>{field.label}</span>{field.type === 'textarea' ? <textarea required={field.required} value={String(form[field.key] ?? '')} onChange={event => setValue(field.key, event.target.value)} rows={3}/> : field.type === 'select' ? <select required={field.required} value={String(form[field.key] ?? '')} onChange={event => setValue(field.key, event.target.value)}><option value="">নির্বাচন করুন</option>{labelFor(field).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(form[field.key])} onChange={event => setValue(field.key, event.target.checked)}/> : <input type={field.type ?? 'text'} required={field.required} min={field.type === 'number' ? 1 : undefined} max={field.key === 'duration_minutes' ? 600 : undefined} value={String(form[field.key] ?? '')} onChange={event => setValue(field.key, event.target.value)} />}{field.hint && <small>{field.hint}</small>}</label>)}</div><div className="manager-form-actions"><button type="button" className="manager-cancel" onClick={closeForm}>বাতিল</button><button className="premium-add" type="submit" disabled={saving}>{saving ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</button></div></form>}
      {loading ? <Empty label="তথ্য লোড হচ্ছে…"/> : visibleRows.length ? <div className="manager-list">{visibleRows.map(row => <div className="manager-row" key={row.id}><div><b>{config.titleKeys.map(key => row[key] ? displayValue(key, row[key]) : '').find(Boolean) || row.id}</b><small>{config.detailKeys.map(key => { const value = row[key]; if (value == null || value === '') return null; return `${managerTitles[key] ?? key}: ${key.endsWith('_at') || key === 'lesson_date' ? inputDate(value, key === 'lesson_date') : displayValue(key, value)}` }).filter(Boolean).join(' · ')}</small></div><div className="manager-row-actions">{config.editable !== false && <button onClick={() => begin(row)}>পরিবর্তন</button>}{config.retireStatus && row.status !== config.retireStatus && !(config.table === 'class_sessions' && row.status === 'completed') && <button className="manager-retire" disabled={saving} onClick={() => void retire(row)}>{config.retireLabel ?? 'আর্কাইভ'}</button>}</div></div>)}</div> : <Empty label={query ? 'এই অনুসন্ধানে কোনো রেকর্ড নেই।' : `এখনো ${active} রেকর্ড নেই।`} />}</article>
  </section>
}
