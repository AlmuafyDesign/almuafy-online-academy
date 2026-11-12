import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from './services/supabase'
import { bi } from './bilingual'
import { LanguageToggle, useLanguage } from './language'

export type AuthMode = 'student-login' | 'student-register' | 'admin-login'

export default function AuthPage({ mode, onMode, onAuthenticated, onBack }: { mode: AuthMode; onMode: (mode: AuthMode) => void; onAuthenticated: () => void; onBack: () => void }) {
  const { language } = useLanguage()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const isRegister = mode === 'student-register'
  const isAdmin = mode === 'admin-login'

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage('')
    if (!supabase) { setMessage(bi('Supabase configuration এখনো যুক্ত করা হয়নি।', 'Supabase is not configured yet.', language)); return }
    if (isRegister && password !== confirmPassword) { setMessage(bi('দুইবার লেখা পাসওয়ার্ড মিলছে না।', 'The passwords do not match.', language)); return }
    setBusy(true)
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` } })
        if (error) throw error
        setMessage(data.session ? bi('অ্যাকাউন্ট তৈরি হয়েছে। এখন আপনার ইমেইল যাচাই করুন।', 'Your account is ready. Please verify your email.', language) : bi('নিবন্ধন অনুরোধ গৃহীত হয়েছে। ইমেইলে যাচাইয়ের নির্দেশনা দেখুন।', 'Registration received. Check your email for verification instructions.', language))
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        onAuthenticated()
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail.toLowerCase().includes('invalid') ? bi('ইমেইল বা পাসওয়ার্ড সঠিক নয়।', 'Incorrect email or password.', language) : detail.toLowerCase().includes('confirm') ? bi('প্রথমে ইমেইল যাচাই করুন।', 'Please verify your email first.', language) : bi('অনুরোধ সম্পন্ন হয়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।', 'Could not complete the request. Check your details and try again.', language))
    } finally { setBusy(false) }
  }

  async function resetPassword() {
    if (!supabase || !email.trim()) { setMessage(bi('পাসওয়ার্ড পুনরুদ্ধারের জন্য আগে ইমেইল লিখুন।', 'Enter your email to reset your password.', language)); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` })
    setBusy(false)
    setMessage(error ? bi('পাসওয়ার্ড পুনরুদ্ধারের ইমেইল পাঠানো যায়নি।', 'Could not send the password reset email.', language) : bi('পুনরুদ্ধারের নির্দেশনা আপনার ইমেইলে পাঠানো হয়েছে।', 'Password reset instructions have been emailed to you.', language))
  }

  const title = isRegister ? bi('শিক্ষার্থী নিবন্ধন', 'Student registration', language) : isAdmin ? bi('অ্যাডমিন লগইন', 'Admin sign in', language) : bi('শিক্ষার্থী লগইন', 'Student sign in', language)
  return <main className="auth-page">
    <div className="auth-page-toolbar"><button className="auth-back" onClick={onBack}>← {bi('একাডেমির সাইটে ফিরুন', 'Back to academy', language)}</button><LanguageToggle/></div>
    <section className="auth-card">
      <div className="auth-brand"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="Almuafy Academy"/><div><b>{bi('আলমুয়াফী', 'Almuafy', language)}</b><small>{bi('অনলাইন একাডেমি', 'Online Academy', language)}</small></div></div>
      <span className="auth-kicker">{isAdmin ? bi('নিরাপদ প্রশাসনিক প্রবেশ', 'Secure administrator access', language) : bi('আপনার শেখার যাত্রা', 'Your learning journey', language)}</span>
      <h1>{title}</h1>
      <p>{isAdmin ? bi('অ্যাডমিন অনুমতি আপনার যাচাইকৃত অ্যাকাউন্টে নির্ধারিত থাকে।', 'Administrator access is assigned to your verified account.', language) : isRegister ? bi('নতুন অ্যাকাউন্ট তৈরি করুন। নিবন্ধনের পর ডিফল্ট ভূমিকা শিক্ষার্থী থাকবে।', 'Create an account. New registrations have the student role.', language) : bi('আপনার একাডেমি অ্যাকাউন্টে প্রবেশ করুন।', 'Sign in to your academy account.', language)}</p>
      <form onSubmit={submit}>
        {isRegister && <label>{bi('পূর্ণ নাম', 'Full name', language)}<input autoComplete="name" required value={name} onChange={event => setName(event.target.value)} placeholder={bi('আপনার পূর্ণ নাম', 'Your full name', language)}/></label>}
        <label>{bi('ইমেইল', 'Email', language)}<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
        <label>{bi('পাসওয়ার্ড', 'Password', language)}<input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={event => setPassword(event.target.value)} placeholder={bi('কমপক্ষে ৮ অক্ষর', 'At least 8 characters', language)}/></label>
        {isRegister && <label>{bi('পাসওয়ার্ড আবার লিখুন', 'Confirm password', language)}<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder={bi('পাসওয়ার্ড মিলিয়ে লিখুন', 'Enter the password again', language)}/></label>}
        {!isAdmin && !isRegister && <button type="button" className="forgot-link" onClick={resetPassword} disabled={busy}>{bi('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot password?', language)}</button>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? bi('অপেক্ষা করুন…', 'Please wait…', language) : isRegister ? bi('নিবন্ধন করুন', 'Register', language) : bi('লগইন করুন', 'Sign in', language)}</button>
      </form>
      {message && <div className="auth-message" role="status">{message}</div>}
      {!isAdmin && <div className="auth-switch">{isRegister ? bi('আগে থেকেই অ্যাকাউন্ট আছে?', 'Already have an account?', language) : bi('অ্যাকাউন্ট নেই?', 'New to the academy?', language)} <button onClick={() => onMode(isRegister ? 'student-login' : 'student-register')}>{isRegister ? bi('লগইন করুন', 'Sign in', language) : bi('নিবন্ধন করুন', 'Register', language)}</button></div>}
      {isAdmin && <div className="auth-note">{bi('সাইনআপ থেকে অ্যাডমিন অনুমতি পাওয়া যায় না।', 'Admin access is not granted through student registration.', language)}</div>}
      {!supabaseConfigured && <div className="auth-config">{bi('Supabase URL ও public anon key যুক্ত হলে নিরাপদ লগইন চালু হবে।', 'Secure sign in will work when the Supabase URL and public anon key are configured.', language)}</div>}
    </section>
    <footer className="auth-footer">© {new Date().getFullYear()} {bi('আলমুয়াফী অনলাইন একাডেমি', 'Almuafy Online Academy', language)}</footer>
  </main>
}
