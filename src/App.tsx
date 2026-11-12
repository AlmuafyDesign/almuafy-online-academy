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
      supabase.from('academy_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('classes').select('*').eq('public_visible', true).order('name'),
      supabase.from('notices').select('*').eq('status', 'published').eq('visibility', 'public').order('published_at', { ascending: false }),
      supabase.from('library_resources').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(6),
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
  const en = language === 'en'
  const text = (bn: string, english: string) => en ? english : bn
  const academyName = en ? (publicInfo?.academy_name_en?.trim() || 'Almuafy Online Academy') : (publicInfo?.academy_name?.trim() || 'আলমুয়াফী অনলাইন একাডেমি')
  const configuredSubjects = (en ? publicInfo?.subjects_en : publicInfo?.subjects)?.filter(Boolean)
  const configuredFeatures = (en ? publicInfo?.academy_features_en : publicInfo?.academy_features)?.filter(Boolean)
  const configuredSteps = (en ? publicInfo?.online_class_steps_en : publicInfo?.online_class_steps)?.filter(Boolean)
  const subjects = configuredSubjects?.length ? configuredSubjects : (en ? ['Qur’an', 'Hadith', 'Aqidah', 'Fiqh', 'Arabic', 'Noorani Qaida'] : ['কুরআন', 'হাদিস', 'আকিদা', 'ফিকহ', 'আরবি', 'নূরানী কায়দা'])
  const features = configuredFeatures?.length ? configuredFeatures : (en ? ['Live online classes', 'Daily lessons and practice', 'Homework submission and review', 'Attendance and learning progress', 'Digital Islamic library', 'Student notices and updates'] : ['অনলাইন ক্লাস', 'দৈনিক পাঠ ও অনুশীলন', 'হোমওয়ার্ক জমা ও পর্যালোচনা', 'উপস্থিতি ও অগ্রগতি', 'ইসলামি ডিজিটাল লাইব্রেরি', 'শিক্ষার্থীদের নোটিশ ও আপডেট'])
  const steps = configuredSteps?.length ? configuredSteps : (en ? ['Register for a student account.', 'Verify your email and sign in.', 'Wait for academy approval and class enrollment.', 'Open your schedule and join with the class link.', 'Study lessons and submit assigned homework.', 'Follow your attendance and progress in the portal.'] : ['শিক্ষার্থী অ্যাকাউন্টের জন্য নিবন্ধন করুন।', 'ইমেইল যাচাই করে লগইন করুন।', 'একাডেমির অনুমোদন ও ক্লাসে ভর্তির জন্য অপেক্ষা করুন।', 'সময়সূচি থেকে ক্লাসের লিংকে যোগ দিন।', 'পাঠ শিখুন ও নির্ধারিত হোমওয়ার্ক জমা দিন।', 'পোর্টালে উপস্থিতি ও অগ্রগতি দেখুন।'])
  const about = (en ? publicInfo?.about_text_en : publicInfo?.about_text)?.trim() || text('আলমুয়াফী অনলাইন একাডেমি জ্ঞান, শৃঙ্খলা ও উত্তম চরিত্র গঠনে সহায়ক মানসম্মত অনলাইন শিক্ষার সুযোগ তৈরি করে। শিক্ষার্থীরা নির্ধারিত পাঠ, ক্লাস, অনুশীলন ও অগ্রগতির তথ্য একটি নির্ভরযোগ্য শিক্ষাব্যবস্থায় পায়।', 'Almuafy Online Academy provides structured online learning that supports knowledge, discipline, and good character. Students can access scheduled classes, lessons, practice, and progress information through one learning platform.')
  const methodology = (en ? publicInfo?.teaching_methodology_en : publicInfo?.teaching_methodology)?.trim() || text('সহজ উপস্থাপন, ধারাবাহিক পাঠ, প্রশ্নোত্তর, নিয়মিত অনুশীলন এবং শিক্ষার্থীর অগ্রগতির প্রতি মনোযোগ—এই নীতিতে পাঠদান পরিচালিত হয়।', 'Lessons follow a clear approach: simple explanations, consistent study, questions and answers, regular practice, and attention to each student’s progress.')
  const homeDescription = (en ? publicInfo?.description_en : publicInfo?.description)?.trim() || text('ইলম, আমল ও আখলাকের সমন্বয়ে ঘরে বসে শিখুন। একাডেমির ক্লাস, পাঠ ও শিক্ষার্থী সেবার তথ্য এক জায়গায় দেখুন।', 'Learn from home with knowledge, practice, and good character. Explore academy classes, lessons, and student services in one place.')
  const libraryIntro = (en ? publicInfo?.library_intro_en : publicInfo?.library_intro)?.trim() || text('কুরআন, হাদিস, আকিদা, ফিকহ, আরবি ও নূরানী কায়দাসহ প্রকাশিত শিক্ষাসামগ্রী এখানে পাওয়া যাবে।', 'Browse published learning resources covering Qur’an, Hadith, Aqidah, Fiqh, Arabic, and Noorani Qaida.')
  const noticeIntro = (en ? publicInfo?.notices_intro_en : publicInfo?.notices_intro)?.trim() || text('একাডেমির সর্বশেষ ঘোষণা ও গুরুত্বপূর্ণ তথ্য এখানে প্রকাশ করা হয়।', 'The latest academy announcements and important updates are published here.')
  const visibleClasses = publicClasses.filter(item => !en || item.name_en?.trim())
  const visibleLibrary = publicLibrary.filter(item => !en || item.title_en?.trim())
  const visibleNotices = notices.filter(item => !en || item.title_en?.trim())
  const footerText = (en ? publicInfo?.footer_text_en : publicInfo?.footer_text)?.trim()
  return <main className="real-public real-public-complete">
    <header className="real-public-nav">
      <a href="#top"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="Almuafy Academy logo"/><span><b>{academyName}</b><small>{text('ইলম, আমল ও আখলাক', 'Knowledge, Practice & Character')}</small></span></a>
      <div>
        <nav className="real-public-links" aria-label={text('প্রধান মেনু', 'Main navigation')}><a href="#about">{text('একাডেমি', 'Academy')}</a><a href="#classes">{text('ক্লাস', 'Classes')}</a><a href="#facilities">{text('সুবিধা', 'Facilities')}</a><a href="#library">{text('লাইব্রেরি', 'Library')}</a><a href="#notices">{text('নোটিশ', 'Notices')}</a><a href="#contact">{text('যোগাযোগ', 'Contact')}</a></nav>
        <LanguageToggle/>
        {installEvent && <button className="real-install" onClick={installApp}>{text('অ্যাপ ইনস্টল', 'Install app')}</button>}
        <button onClick={() => setAuthMode('student-login')}>{text('শিক্ষার্থী লগইন', 'Student sign in')}</button>
        <button className="real-admin-link" onClick={() => setAuthMode('admin-login')}>{text('অ্যাডমিন লগইন', 'Admin sign in')}</button>
      </div>
    </header>
    <section className="real-hero" id="top">
      <div className="real-hero-copy">
        <span className="real-kicker">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</span>
        <h1>{text('ইলমে সমৃদ্ধ হই, প্রজ্ঞায় বেড়ে উঠি', 'Learn with Knowledge, Grow with Wisdom')}</h1>
        <p>{homeDescription}</p>
        <div className="real-hero-actions">
          <button className="primary-button" onClick={() => setAuthMode('student-register')}>{text('এখনই নিবন্ধন করুন', 'Join the academy')}</button>
          <a className="real-explore" href="#about">{text('একাডেমি সম্পর্কে জানুন', 'Explore the academy')} ↓</a>
        </div>
      </div>
      <div className="real-hero-photo"><img src={`${import.meta.env.BASE_URL}images/academy-founder.jpg`} alt="Academy representative seated at a desk"/></div>
    </section>
    {error && <div className="real-error real-error-public">{error}</div>}
    <section className="real-public-section" id="about"><div className="real-section-heading"><span>{text('আমাদের পরিচিতি', 'About the academy')}</span><h2>{text('জ্ঞান ও সুন্দর চরিত্র গঠনে একসাথে', 'Learning for knowledge and character')}</h2></div><article className="real-info-card"><p>{about}</p></article></section>
    <section className="real-public-section" id="classes"><div className="real-section-heading"><span>{text('একাডেমির ক্লাস', 'Academy classes')}</span><h2>{text('প্রকাশিত কোর্স ও ক্লাস', 'Published courses and classes')}</h2></div><div className="real-cards">{visibleClasses.length ? visibleClasses.map(item => <article key={item.id}><b>{en ? item.name_en : item.name}</b><span>{en ? item.subject_en : item.subject}{(en ? item.level_en : item.level) ? ` · ${en ? item.level_en : item.level}` : ''}</span>{(en ? item.description_en : item.description) && <p>{en ? item.description_en : item.description}</p>}</article>) : <div className="real-empty">{text(publicClasses.length ? 'ক্লাসের ইংরেজি তথ্য প্রস্তুত করা হচ্ছে।' : 'এখনো কোনো ক্লাস প্রকাশ করা হয়নি।', publicClasses.length ? 'English class details are being prepared.' : 'No classes have been published yet.')}</div>}</div></section>
    <section className="real-public-section real-tint" id="approach"><div className="real-section-heading"><span>{text('শেখার পদ্ধতি', 'Learning approach')}</span><h2>{text('মনোযোগী ও ধারাবাহিক পাঠদান', 'Clear and consistent teaching')}</h2></div><article className="real-info-card"><p>{methodology}</p></article></section>
    <section className="real-public-section" id="facilities"><div className="real-section-heading"><span>{text('শিক্ষার্থী সেবা', 'Student support')}</span><h2>{text('শেখার জন্য প্রয়োজনীয় সবকিছু', 'Tools for a complete learning journey')}</h2></div><div className="real-cards">{features.map((feature: string) => <article key={feature}><b>{feature}</b></article>)}</div></section>
    <section className="real-public-section real-tint"><div className="real-section-heading"><span>{text('পাঠ্য বিষয়', 'Subjects')}</span><h2>{text('যেসব বিষয়ে শেখানো হয়', 'What you can learn')}</h2></div><div className="real-subject-list">{subjects.map((subject: string) => <span key={subject}>{subject}</span>)}</div></section>
    <section className="real-public-section" id="library"><div className="real-section-heading"><span>{text('শেখার উপকরণ', 'Study resources')}</span><h2>{text('ডিজিটাল লাইব্রেরি', 'Digital library')}</h2><p>{libraryIntro}</p></div><div className="real-cards">{visibleLibrary.length ? visibleLibrary.map(item => <article key={item.id}><b>{en ? item.title_en : item.title}</b>{(en ? item.description_en : item.description) && <p>{en ? item.description_en : item.description}</p>}<a href={item.resource_url} target="_blank" rel="noreferrer">{text('উপকরণ খুলুন', 'Open resource')} ↗</a></article>) : <div className="real-empty">{text(publicLibrary.length ? 'লাইব্রেরির ইংরেজি তথ্য প্রস্তুত করা হচ্ছে।' : 'এখনো কোনো উপকরণ প্রকাশ করা হয়নি।', publicLibrary.length ? 'English resource details are being prepared.' : 'No resources have been published yet.')}</div>}</div></section>
    <section className="real-public-section real-tint" id="steps"><div className="real-section-heading"><span>{text('শুরু করুন', 'Get started')}</span><h2>{text('পড়াশোনা শুরু করার ধাপ', 'How it works')}</h2></div><ol className="real-steps">{steps.map((step: string, index: number) => <li key={`${index}-${step}`}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol></section>
    <section className="real-public-section" id="notices"><div className="real-section-heading"><span>{text('সর্বশেষ ঘোষণা', 'Latest updates')}</span><h2>{text('নোটিশ বোর্ড', 'Notice board')}</h2><p>{noticeIntro}</p></div><div className="real-cards">{visibleNotices.length ? visibleNotices.map(n => <article key={n.id}><b>{en ? n.title_en : n.title}</b>{(en ? n.description_en : n.description) && <p>{en ? n.description_en : n.description}</p>}<small>{n.published_at ? new Date(n.published_at).toLocaleDateString(en ? 'en-US' : 'bn-BD') : ''}</small></article>) : <div className="real-empty">{text(notices.length ? 'নোটিশের ইংরেজি অনুবাদ প্রস্তুত হচ্ছে।' : 'প্রকাশিত নোটিশ নেই।', notices.length ? 'English notice details are being prepared.' : 'No public notices yet.')}</div>}</div></section>
    <section className="real-public-section real-contact" id="contact"><div><span className="real-kicker">{text('যোগাযোগ', 'Contact')}</span><h2>{text('আমরা আপনার বার্তার অপেক্ষায় আছি', 'We would be glad to hear from you')}</h2><p>{text('ভর্তি, ক্লাস বা একাডেমি সম্পর্কে জানতে আমাদের সঙ্গে যোগাযোগ করুন।', 'Contact us for information about enrollment, classes, or the academy.')}</p></div><div className="real-contact-links">{publicInfo?.contact_email && <a href={`mailto:${publicInfo.contact_email}`}>{publicInfo.contact_email}</a>}{publicInfo?.contact_phone && <a href={`tel:${publicInfo.contact_phone}`}>{publicInfo.contact_phone}</a>}<span>{text('বাংলাদেশ', 'Bangladesh')}</span></div></section>
    <footer className="real-footer"><span>{footerText || `© ${new Date().getFullYear()} ${academyName} · ${text('সর্বস্বত্ব সংরক্ষিত', 'All rights reserved')}`}</span><div className="real-footer-links"><a href="#about">{text('একাডেমি', 'Academy')}</a><a href="#classes">{text('ক্লাস', 'Classes')}</a><a href="#library">{text('লাইব্রেরি', 'Library')}</a><a href="#contact">{text('যোগাযোগ', 'Contact')}</a></div>{publicInfo?.contact_email && <a href={`mailto:${publicInfo.contact_email}`}>{publicInfo.contact_email}</a>}{safeLink(socialLinks.facebook) && <a href={safeLink(socialLinks.facebook)} target="_blank" rel="noreferrer">Facebook</a>}{safeLink(socialLinks.youtube) && <a href={safeLink(socialLinks.youtube)} target="_blank" rel="noreferrer">YouTube</a>}</footer>
  </main>
}

export default App
