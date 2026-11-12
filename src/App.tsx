import { useEffect, useState } from 'react'
import AuthPage, { type AuthMode } from './AuthPage'
import AdminDashboard from './AdminDashboard'
import StudentPortal from './StudentPortal'
import { supabase, type AcademyProfile } from './services/supabase'
import { bi } from './bilingual'
import { LanguageToggle, useLanguage } from './language'

function App() {
  const { language } = useLanguage()
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<AcademyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [publicInfo, setPublicInfo] = useState<any>(null)
  const [publicClasses, setPublicClasses] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
  const [publicLibrary, setPublicLibrary] = useState<any[]>([])
  const [error, setError] = useState('')
  const [installEvent, setInstallEvent] = useState<any>(null)

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallEvent(event) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  async function installApp() {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => { setSession(current); if (!current) setProfile(null) })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user?.id || !supabase) return
    setLoading(true)
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data, error: err }) => {
      setProfile(data)
      if (err) setError(bi('অ্যাকাউন্টের প্রোফাইল লোড করা যায়নি।', 'Could not load your account profile.', language))
      setLoading(false)
    })
  }, [session])

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('academy_settings').select('academy_name, description, subjects, teaching_methodology, academy_features, online_class_steps, contact_email, contact_phone, social_links, footer_text').eq('id', 1).maybeSingle(),
      supabase.from('classes').select('id, name, subject, description, level').eq('public_visible', true).order('name'),
      supabase.from('notices').select('id, title, description, published_at').eq('status', 'published').eq('visibility', 'public').order('published_at', { ascending: false }),
      supabase.from('library_resources').select('id,title,description,resource_url').eq('status', 'published').order('created_at', { ascending: false }).limit(6),
    ]).then(([settings, classes, noticeRows, libraryRows]) => {
      setPublicInfo(settings.data)
      setPublicClasses(classes.data ?? [])
      setNotices(noticeRows.data ?? [])
      setPublicLibrary(libraryRows.data ?? [])
      if (settings.error || classes.error || noticeRows.error || libraryRows.error) setError(bi('পাবলিক তথ্য লোডে সমস্যা হয়েছে।', 'Some public information could not be loaded.', language))
    })
  }, [])

  if (loading) return <main className="auth-page"><div className="auth-page-toolbar"><LanguageToggle/></div><section className="auth-card"><p>{bi('অ্যাকাউন্ট যাচাই হচ্ছে…', 'Checking your account…', language)}</p></section></main>
  if (authMode) return <AuthPage mode={authMode} onMode={setAuthMode} onAuthenticated={() => setAuthMode(null)} onBack={() => setAuthMode(null)} />
  if (session && profile?.role === 'admin' && profile.status === 'active') return <AdminDashboard profile={profile} onSignOut={() => supabase?.auth.signOut()} />
  if (session && !profile && !loading) return <main className="auth-page"><div className="auth-page-toolbar"><LanguageToggle/></div><section className="auth-card"><h1>{bi('অ্যাকাউন্ট যাচাই হয়নি', 'Account not verified', language)}</h1><p>{error || bi('এই একাডেমি অ্যাকাউন্টের প্রবেশাধিকার পাওয়া যায়নি।', 'This academy account could not be accessed.', language)}</p><button className="primary-button" onClick={() => supabase?.auth.signOut()}>{bi('লগআউট', 'Sign out', language)}</button></section></main>
  if (session && profile?.status !== 'active') return <main className="auth-page"><div className="auth-page-toolbar"><LanguageToggle/></div><section className="auth-card"><h1>{bi('অ্যাকাউন্ট সক্রিয় নয়', 'Account is inactive', language)}</h1><p>{bi('একাডেমি কর্তৃপক্ষের সঙ্গে যোগাযোগ করুন।', 'Please contact the academy administrator.', language)}</p><button className="primary-button" onClick={() => supabase?.auth.signOut()}>{bi('লগআউট', 'Sign out', language)}</button></section></main>
  if (session && profile) return <StudentPortal profile={profile} onSignOut={() => { void supabase?.auth.signOut() }} onProfileUpdated={setProfile} />

  const socialLinks = publicInfo?.social_links ?? {}
  const safeLink = (value?: string) => value && /^https?:\/\//i.test(value) ? value : ''
  return <main className="real-public">
    <header className="real-public-nav">
      <a href="#top"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="Almuafy Academy logo"/><span><b>{publicInfo?.academy_name || bi('আলমুয়াফী অনলাইন একাডেমি', 'Almuafy Online Academy', language)}</b><small>{bi('ইলম, আমল ও আখলাক', 'Knowledge, Practice & Character', language)}</small></span></a>
      <div>
        <LanguageToggle/>
        {installEvent && <button className="real-install" onClick={installApp}>{bi('অ্যাপ ইনস্টল', 'Install app', language)}</button>}
        <button onClick={() => setAuthMode('student-login')}>{bi('শিক্ষার্থী লগইন', 'Student sign in', language)}</button>
        <button className="real-admin-link" onClick={() => setAuthMode('admin-login')}>{bi('অ্যাডমিন লগইন', 'Admin sign in', language)}</button>
      </div>
    </header>
    <section className="real-hero" id="top">
      <span className="real-kicker">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</span>
      <h1>{publicInfo?.academy_name || bi('আলমুয়াফী অনলাইন একাডেমি', 'Almuafy Online Academy', language)}</h1>
      <p>{publicInfo?.description || bi('অনলাইন শিক্ষার জন্য একাডেমির তথ্য ও ক্লাস এখানে প্রকাশিত হবে।', 'Academy information and online classes will appear here.', language)}</p>
      <button className="primary-button" onClick={() => setAuthMode('student-register')}>{bi('শিক্ষার্থী নিবন্ধন', 'Student registration', language)}</button>
      <a className="real-explore" href="#classes">{bi('একাডেমি সম্পর্কে জানুন', 'Explore the academy', language)} ↓</a>
      <div className="real-arch"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/></div>
    </section>
    {error && <div className="real-error real-error-public">{error}</div>}
    <section className="real-public-section" id="classes">
      <div className="real-section-heading"><span>{bi('একাডেমির ক্লাস', 'Academy classes', language)}</span><h2>{bi('প্রকাশিত কোর্স ও ক্লাস', 'Published courses and classes', language)}</h2></div>
      <div className="real-cards">{publicClasses.length ? publicClasses.map(item => <article key={item.id}><b>{item.name}</b><span>{item.subject}{item.level ? ` · ${item.level}` : ''}</span><p>{item.description}</p></article>) : <div className="real-empty">{bi('প্রকাশিত ক্লাস এখনো যোগ করা হয়নি।', 'No classes have been published yet.', language)}</div>}</div>
    </section>
    {publicInfo?.subjects?.length > 0 && <section className="real-public-section"><div className="real-section-heading"><span>{bi('পাঠ্য বিষয়', 'Subjects', language)}</span><h2>{bi('যেসব বিষয়ে শেখানো হয়', 'What you can learn', language)}</h2></div><div className="real-subject-list">{publicInfo.subjects.map((subject: string) => <span key={subject}>{subject}</span>)}</div></section>}
    {publicInfo?.teaching_methodology && <section className="real-public-section real-tint"><div className="real-section-heading"><span>{bi('শেখার পদ্ধতি', 'Learning approach', language)}</span><h2>{bi('আমাদের পাঠদান', 'How we teach', language)}</h2></div><article className="real-info-card"><p>{publicInfo.teaching_methodology}</p></article></section>}
    {publicInfo?.academy_features?.length > 0 && <section className="real-public-section"><div className="real-section-heading"><span>{bi('কেন এই একাডেমি', 'Why this academy', language)}</span><h2>{bi('শেখার সুবিধা', 'Learning benefits', language)}</h2></div><div className="real-cards">{publicInfo.academy_features.map((feature: string) => <article key={feature}><b>{feature}</b></article>)}</div></section>}
    {publicInfo?.online_class_steps?.length > 0 && <section className="real-public-section real-tint"><div className="real-section-heading"><span>{bi('অনলাইন শিক্ষা', 'Online learning', language)}</span><h2>{bi('ক্লাসে অংশ নেবেন যেভাবে', 'How to join a class', language)}</h2></div><ol className="real-steps">{publicInfo.online_class_steps.map((step: string) => <li key={step}>{step}</li>)}</ol></section>}
    {publicLibrary.length > 0 && <section className="real-public-section"><div className="real-section-heading"><span>{bi('শেখার উপকরণ', 'Study resources', language)}</span><h2>{bi('প্রকাশ্য লাইব্রেরি', 'Public library', language)}</h2></div><div className="real-cards">{publicLibrary.map(item => <article key={item.id}><b>{item.title}</b><p>{item.description}</p><a href={item.resource_url} target="_blank" rel="noreferrer">{bi('উপকরণ খুলুন', 'Open resource', language)} ↗</a></article>)}</div></section>}
    <section className="real-public-section real-tint"><div className="real-section-heading"><span>{bi('সর্বশেষ ঘোষণা', 'Latest updates', language)}</span><h2>{bi('নোটিশ', 'Notices', language)}</h2></div><div className="real-cards">{notices.length ? notices.map(n => <article key={n.id}><b>{n.title}</b><p>{n.description}</p><small>{n.published_at ? new Date(n.published_at).toLocaleDateString('bn-BD') : ''}</small></article>) : <div className="real-empty">{bi('প্রকাশিত নোটিশ নেই।', 'No public notices yet.', language)}</div>}</div></section>
    <footer className="real-footer"><span>{publicInfo?.footer_text || `© ${new Date().getFullYear()} ${publicInfo?.academy_name || bi('আলমুয়াফী অনলাইন একাডেমি', 'Almuafy Online Academy', language)}`}</span>{publicInfo?.contact_phone && <span>{bi('যোগাযোগ', 'Contact', language)}: {publicInfo.contact_phone}</span>}{publicInfo?.contact_email && <a href={`mailto:${publicInfo.contact_email}`}>{publicInfo.contact_email}</a>}{safeLink(socialLinks.facebook) && <a href={safeLink(socialLinks.facebook)} target="_blank" rel="noreferrer">Facebook</a>}{safeLink(socialLinks.youtube) && <a href={safeLink(socialLinks.youtube)} target="_blank" rel="noreferrer">YouTube</a>}</footer>
  </main>
}

export default App
