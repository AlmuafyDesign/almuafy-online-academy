import { useEffect, useState } from 'react'
import AuthPage, { type AuthMode } from './AuthPage'
import AdminDashboard from './AdminDashboard'
import StudentPortal from './StudentPortal'
import { supabase, type AcademyProfile } from './services/supabase'

function App() {
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
  useEffect(() => { const handler = (event: Event) => { event.preventDefault(); setInstallEvent(event) }; window.addEventListener('beforeinstallprompt', handler); return () => window.removeEventListener('beforeinstallprompt', handler) }, [])
  async function installApp() { if (!installEvent) return; await installEvent.prompt(); setInstallEvent(null) }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => { setSession(current); if (!current) setProfile(null) })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session?.user?.id || !supabase) return
    setLoading(true)
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data, error: err }) => { setProfile(data); if (err) setError('অ্যাকাউন্টের প্রোফাইল লোড করা যায়নি।'); setLoading(false) })
  }, [session])
  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('academy_settings').select('academy_name, description, subjects, teaching_methodology, academy_features, online_class_steps, contact_email, contact_phone, social_links, footer_text').eq('id', 1).maybeSingle(),
      supabase.from('classes').select('id, name, subject, description, level').eq('public_visible', true).order('name'),
      supabase.from('notices').select('id, title, description, published_at').eq('status', 'published').eq('visibility', 'public').order('published_at', { ascending: false }),
      supabase.from('library_resources').select('id,title,description,resource_url').eq('status', 'published').order('created_at', { ascending: false }).limit(6)
    ]).then(([settings, classes, noticeRows, libraryRows]) => { setPublicInfo(settings.data); setPublicClasses(classes.data ?? []); setNotices(noticeRows.data ?? []); setPublicLibrary(libraryRows.data ?? []); if (settings.error || classes.error || noticeRows.error || libraryRows.error) setError('পাবলিক তথ্য লোডে সমস্যা হয়েছে।') })
  }, [])

  if (loading) return <main className="auth-page"><section className="auth-card"><p>একাডেমি অ্যাকাউন্ট যাচাই হচ্ছে…</p></section></main>
  if (authMode) return <AuthPage mode={authMode} onMode={setAuthMode} onAuthenticated={() => setAuthMode(null)} onBack={() => setAuthMode(null)} />
  if (session && profile?.role === 'admin' && profile.status === 'active') return <AdminDashboard profile={profile} onSignOut={() => supabase?.auth.signOut()} />
  if (session && !profile && !loading) return <main className="auth-page"><section className="auth-card"><h1>অ্যাকাউন্ট যাচাই হয়নি</h1><p>{error || 'এই একাডেমি অ্যাকাউন্টের প্রবেশাধিকার পাওয়া যায়নি।'}</p><button className="primary-button" onClick={() => supabase?.auth.signOut()}>লগআউট</button></section></main>
  if (session && profile?.status !== 'active') return <main className="auth-page"><section className="auth-card"><h1>অ্যাকাউন্ট সক্রিয় নয়</h1><p>একাডেমি কর্তৃপক্ষের সঙ্গে যোগাযোগ করুন।</p><button className="primary-button" onClick={() => supabase?.auth.signOut()}>লগআউট</button></section></main>
  if (session && profile) return <StudentPortal profile={profile} onSignOut={() => { void supabase?.auth.signOut() }} onProfileUpdated={setProfile} />
  const socialLinks = publicInfo?.social_links ?? {}
  const safeLink = (value?: string) => value && /^https?:\/\//i.test(value) ? value : ''
  return <main className="real-public"><header className="real-public-nav"><a href="#top"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="আলমুয়াফী লোগো"/><span><b>{publicInfo?.academy_name || 'আলমুয়াফী অনলাইন একাডেমি'}</b><small>ইলম, আমল ও আখলাক</small></span></a><div>{installEvent && <button className="real-install" onClick={installApp}>অ্যাপ ইনস্টল</button>}<button onClick={() => setAuthMode('student-login')}>শিক্ষার্থী লগইন</button><button className="real-admin-link" onClick={() => setAuthMode('admin-login')}>অ্যাডমিন লগইন</button></div></header><section className="real-hero" id="top"><span className="real-kicker">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</span><h1>{publicInfo?.academy_name || 'আলমুয়াফী অনলাইন একাডেমি'}</h1><p>{publicInfo?.description || 'অনলাইন শিক্ষার জন্য একাডেমির তথ্য ও ক্লাস এখানে প্রকাশিত হবে।'}</p><button className="primary-button" onClick={() => setAuthMode('student-register')}>শিক্ষার্থী নিবন্ধন</button><a className="real-explore" href="#classes">একাডেমি সম্পর্কে জানুন ↓</a><div className="real-arch"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/></div></section>{error && <div className="real-error real-error-public">{error}</div>}<section className="real-public-section" id="classes"><div className="real-section-heading"><span>একাডেমির ক্লাস</span><h2>প্রকাশিত কোর্স ও ক্লাস</h2></div><div className="real-cards">{publicClasses.length ? publicClasses.map(item => <article key={item.id}><b>{item.name}</b><span>{item.subject}{item.level ? ` · ${item.level}` : ''}</span><p>{item.description}</p></article>) : <div className="real-empty">প্রকাশিত ক্লাস এখনো যোগ করা হয়নি।</div>}</div></section>{publicInfo?.subjects?.length > 0 && <section className="real-public-section"><div className="real-section-heading"><span>পাঠ্য বিষয়</span><h2>যেসব বিষয়ে শেখানো হয়</h2></div><div className="real-subject-list">{publicInfo.subjects.map((subject: string) => <span key={subject}>{subject}</span>)}</div></section>}{publicInfo?.teaching_methodology && <section className="real-public-section real-tint"><div className="real-section-heading"><span>শেখার পদ্ধতি</span><h2>আমাদের পাঠদান</h2></div><article className="real-info-card"><p>{publicInfo.teaching_methodology}</p></article></section>}{publicInfo?.academy_features?.length > 0 && <section className="real-public-section"><div className="real-section-heading"><span>কেন এই একাডেমি</span><h2>শেখার সুবিধা</h2></div><div className="real-cards">{publicInfo.academy_features.map((feature: string) => <article key={feature}><b>{feature}</b></article>)}</div></section>}{publicInfo?.online_class_steps?.length > 0 && <section className="real-public-section real-tint"><div className="real-section-heading"><span>অনলাইন শিক্ষা</span><h2>ক্লাসে অংশ নেবেন যেভাবে</h2></div><ol className="real-steps">{publicInfo.online_class_steps.map((step: string) => <li key={step}>{step}</li>)}</ol></section>}{publicLibrary.length > 0 && <section className="real-public-section"><div className="real-section-heading"><span>শেখার উপকরণ</span><h2>প্রকাশ্য লাইব্রেরি</h2></div><div className="real-cards">{publicLibrary.map(item => <article key={item.id}><b>{item.title}</b><p>{item.description}</p><a href={item.resource_url} target="_blank" rel="noreferrer">উপকরণ খুলুন ↗</a></article>)}</div></section>}<section className="real-public-section real-tint"><div className="real-section-heading"><span>সর্বশেষ ঘোষণা</span><h2>নোটিশ</h2></div><div className="real-cards">{notices.length ? notices.map(n => <article key={n.id}><b>{n.title}</b><p>{n.description}</p><small>{n.published_at ? new Date(n.published_at).toLocaleDateString('bn-BD') : ''}</small></article>) : <div className="real-empty">প্রকাশিত নোটিশ নেই।</div>}</div></section><footer className="real-footer"><span>{publicInfo?.footer_text || `© ${new Date().getFullYear()} ${publicInfo?.academy_name || 'আলমুয়াফী অনলাইন একাডেমি'}`}</span>{publicInfo?.contact_phone && <span>যোগাযোগ: {publicInfo.contact_phone}</span>}{publicInfo?.contact_email && <a href={`mailto:${publicInfo.contact_email}`}>{publicInfo.contact_email}</a>}{safeLink(socialLinks.facebook) && <a href={safeLink(socialLinks.facebook)} target="_blank" rel="noreferrer">Facebook</a>}{safeLink(socialLinks.youtube) && <a href={safeLink(socialLinks.youtube)} target="_blank" rel="noreferrer">YouTube</a>}</footer></main>
}

export default App
