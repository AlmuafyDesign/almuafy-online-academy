import { useEffect, useState } from 'react'
import AuthPage, { type AuthMode } from './AuthPage'
import { supabase, type AcademyProfile } from './services/supabase'

function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<AcademyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [publicInfo, setPublicInfo] = useState<any>(null)
  const [publicClasses, setPublicClasses] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
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
      supabase.from('academy_settings').select('academy_name, description, teacher_name, teacher_bio, contact_email, contact_phone, footer_text').eq('id', 1).maybeSingle(),
      supabase.from('classes').select('id, name, subject, description, level').eq('public_visible', true).order('name'),
      supabase.from('notices').select('id, title, description, published_at').eq('status', 'published').eq('visibility', 'public').order('published_at', { ascending: false })
    ]).then(([settings, classes, noticeRows]) => { setPublicInfo(settings.data); setPublicClasses(classes.data ?? []); setNotices(noticeRows.data ?? []); if (settings.error || classes.error || noticeRows.error) setError('পাবলিক তথ্য লোডে সমস্যা হয়েছে।') })
  }, [])

  if (loading) return <main className="auth-page"><section className="auth-card"><p>একাডেমি অ্যাকাউন্ট যাচাই হচ্ছে…</p></section></main>
  if (authMode) return <AuthPage mode={authMode} onMode={setAuthMode} onAuthenticated={() => setAuthMode(null)} onBack={() => setAuthMode(null)} />
  if (session && profile?.role === 'admin') return <main className="real-app"><header><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/><b>আলমুয়াফী অনলাইন একাডেমি</b><span>অ্যাডমিন</span><button onClick={() => supabase?.auth.signOut()}>লগআউট</button></header><div className="real-wrap"><h1>একাডেমি ব্যবস্থাপনা</h1><p>আপনার Supabase একাডেমি ডেটা এখান থেকে পরিচালনা করুন। এখনো যোগ না করা তথ্য এখানে খালি থাকবে।</p>{error && <div className="real-error">{error}</div>}<div className="real-grid">{['শিক্ষার্থী','ক্লাস ও পাঠ','সময়সূচি','উপস্থিতি','দৈনিক পাঠ','হোমওয়ার্ক','লাইব্রেরি','নোটিশ','সেটিংস'].map((label) => <AdminSection key={label} name={label}/>)}</div></div></main>
  if (session && !profile && !loading) return <main className="auth-page"><section className="auth-card"><h1>অ্যাকাউন্ট যাচাই হয়নি</h1><p>{error || 'এই একাডেমি অ্যাকাউন্টের প্রবেশাধিকার পাওয়া যায়নি।'}</p><button className="primary-button" onClick={() => supabase?.auth.signOut()}>লগআউট</button></section></main>
  if (session && profile?.status !== 'active') return <main className="auth-page"><section className="auth-card"><h1>অ্যাকাউন্ট সক্রিয় নয়</h1><p>একাডেমি কর্তৃপক্ষের সঙ্গে যোগাযোগ করুন।</p><button className="primary-button" onClick={() => supabase?.auth.signOut()}>লগআউট</button></section></main>
  if (session) return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/><div><b>আলমুয়াফী</b><small>শিক্ষার্থী পোর্টাল</small></div></div><h1>আসসালামু আলাইকুম, {profile?.full_name || session.user.email}</h1><p>আপনার অ্যাকাউন্টে যুক্ত ক্লাস, পাঠ ও হোমওয়ার্ক এখানে দেখা যাবে।</p><StudentData userId={session.user.id}/><button className="primary-button" onClick={() => supabase?.auth.signOut()}>লগআউট</button></section></main>
  return <main className="real-public"><header className="real-public-nav"><a href="#top"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="আলমুয়াফী লোগো"/><span><b>{publicInfo?.academy_name || 'আলমুয়াফী অনলাইন একাডেমি'}</b><small>ইলম, আমল ও আখলাক</small></span></a><div>{installEvent && <button className="real-install" onClick={installApp}>অ্যাপ ইনস্টল</button>}<button onClick={() => setAuthMode('student-login')}>শিক্ষার্থী লগইন</button><button className="real-admin-link" onClick={() => setAuthMode('admin-login')}>অ্যাডমিন লগইন</button></div></header><section className="real-hero" id="top"><span className="real-kicker">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</span><h1>{publicInfo?.academy_name || 'আলমুয়াফী অনলাইন একাডেমি'}</h1><p>{publicInfo?.description || 'অনলাইন শিক্ষার জন্য একাডেমির তথ্য ও ক্লাস এখানে প্রকাশিত হবে।'}</p><button className="primary-button" onClick={() => setAuthMode('student-register')}>শিক্ষার্থী নিবন্ধন</button><div className="real-arch"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt=""/></div></section>{error && <div className="real-error real-error-public">{error}</div>}<section className="real-public-section"><div className="real-section-heading"><span>একাডেমির ক্লাস</span><h2>প্রকাশিত কোর্স ও ক্লাস</h2></div><div className="real-cards">{publicClasses.length ? publicClasses.map(item => <article key={item.id}><b>{item.name}</b><span>{item.subject}{item.level ? ` · ${item.level}` : ''}</span><p>{item.description}</p></article>) : <div className="real-empty">প্রকাশিত ক্লাস এখনো যোগ করা হয়নি।</div>}</div></section><section className="real-public-section real-tint"><div className="real-section-heading"><span>সর্বশেষ ঘোষণা</span><h2>নোটিশ</h2></div><div className="real-cards">{notices.length ? notices.map(n => <article key={n.id}><b>{n.title}</b><p>{n.description}</p><small>{n.published_at ? new Date(n.published_at).toLocaleDateString('bn-BD') : ''}</small></article>) : <div className="real-empty">প্রকাশিত নোটিশ নেই।</div>}</div></section><footer className="real-footer">© {new Date().getFullYear()} {publicInfo?.academy_name || 'আলমুয়াফী অনলাইন একাডেমি'}{publicInfo?.contact_phone && <span>যোগাযোগ: {publicInfo.contact_phone}</span>}</footer></main>
}

function AdminSection({ name }: { name: string }) {
  const [rows, setRows] = useState<any[]>([]); const [problem, setProblem] = useState('')
  useEffect(() => { if (!supabase) return; const table: Record<string,string> = {'শিক্ষার্থী':'profiles','ক্লাস ও পাঠ':'classes','সময়সূচি':'class_sessions','উপস্থিতি':'attendance','দৈনিক পাঠ':'daily_lessons','হোমওয়ার্ক':'homework','লাইব্রেরি':'library_resources','নোটিশ':'notices','সেটিংস':'academy_settings'}; const t=table[name]; supabase.from(t).select('*').limit(100).then(({data,error})=>{if(error)setProblem('তথ্য পড়া যায়নি');else setRows(data??[])}) },[name])
  return <article className="real-card"><h2>{name}</h2><strong>{rows.length.toLocaleString('bn-BD')}</strong><p>{problem || (rows.length ? 'ডেটাবেজ রেকর্ড' : 'এখনো কোনো রেকর্ড নেই')}</p></article>
}
function StudentData({ userId }: { userId: string }) { const [count,setCount]=useState<number|null>(null); useEffect(()=>{if(!supabase)return; supabase.from('class_enrollments').select('id',{count:'exact',head:true}).eq('student_id', userId).eq('status','active').then(({count})=>setCount(count??0))},[userId]); return <p>আপনার সক্রিয় নিবন্ধিত ক্লাস {count === null ? 'লোড হচ্ছে…' : count ? `: ${count.toLocaleString('bn-BD')}টি` : 'এখনো যুক্ত করা হয়নি।'}</p> }
export default App
