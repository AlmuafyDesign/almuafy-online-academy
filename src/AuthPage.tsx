import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from './services/supabase'
import { bi } from './bilingual'

export type AuthMode = 'student-login' | 'student-register' | 'admin-login'

export default function AuthPage({ mode, onMode, onAuthenticated, onBack }: { mode: AuthMode; onMode: (mode: AuthMode) => void; onAuthenticated: () => void; onBack: () => void }) {
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
    if (!supabase) { setMessage(bi('Supabase configuration এখনো যুক্ত করা হয়নি।', 'Supabase is not configured yet.')); return }
    if (isRegister && password !== confirmPassword) { setMessage(bi('দুইবার লেখা পাসওয়ার্ড মিলছে না।', 'The passwords do not match.')); return }
    setBusy(true)
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` } })
        if (error) throw error
        setMessage(data.session ? bi('অ্যাকাউন্ট তৈরি হয়েছে। এখন আপনার ইমেইল যাচাই করুন।', 'Your account is ready. Please verify your email.') : bi('নিবন্ধন অনুরোধ গৃহীত হয়েছে। ইমেইলে যাচাইয়ের নির্দেশনা দেখুন।', 'Registration received. Check your email for verification instructions.'))
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        onAuthenticated()
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail.toLowerCase().includes('invalid') ? bi('ইমেইল বা পাসওয়ার্ড সঠিক নয়।', 'Incorrect email or password.') : detail.toLowerCase().includes('confirm') ? bi('প্রথমে ইমেইল যাচাই করুন।', 'Please verify your email first.') : bi('অনুরোধ সম্পন্ন হয়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।', 'Could not complete the request. Check your details and try again.'))
    } finally { setBusy(false) }
  }

  async function resetPassword() {
    if (!supabase || !email.trim()) { setMessage(bi('পাসওয়ার্ড পুনরুদ্ধারের জন্য আগে ইমেইল লিখুন।', 'Enter your email to reset your password.')); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` })
    setBusy(false)
    setMessage(error ? bi('পাসওয়ার্ড পুনরুদ্ধারের ইমেইল পাঠানো যায়নি।', 'Could not send the password reset email.') : bi('পুনরুদ্ধারের নির্দেশনা আপনার ইমেইলে পাঠানো হয়েছে।', 'Password reset instructions have been emailed to you.'))
  }

  const title = isRegister ? bi('শিক্ষার্থী নিবন্ধন', 'Student registration') : isAdmin ? bi('অ্যাডমিন লগইন', 'Admin sign in') : bi('শিক্ষার্থী লগইন', 'Student sign in')
  return <main className="auth-page">
    <button className="auth-back" onClick={onBack}>← {bi('একাডেমির সাইটে ফিরুন', 'Back to academy')}</button>
    <section className="auth-card">
      <div className="auth-brand"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="Almuafy Academy"/><div><b>আলমুয়াফী / Almuafy</b><small>{bi('অনলাইন একাডেমি', 'Online Academy')}</small></div></div>
      <span className="auth-kicker">{isAdmin ? bi('নিরাপদ প্রশাসনিক প্রবেশ', 'Secure administrator access') : bi('আপনার শেখার যাত্রা', 'Your learning journey')}</span>
      <h1>{title}</h1>
      <p>{isAdmin ? bi('অ্যাডমিন অনুমতি আপনার যাচাইকৃত অ্যাকাউন্টে নির্ধারিত থাকে।', 'Administrator access is assigned to your verified account.') : isRegister ? bi('নতুন অ্যাকাউন্ট তৈরি করুন। নিবন্ধনের পর ডিফল্ট ভূমিকা শিক্ষার্থী থাকবে।', 'Create an account. New registrations have the student role.') : bi('আপনার একাডেমি অ্যাকাউন্টে প্রবেশ করুন।', 'Sign in to your academy account.')}</p>
      <form onSubmit={submit}>
        {isRegister && <label>{bi('পূর্ণ নাম', 'Full name')}<input autoComplete="name" required value={name} onChange={event => setName(event.target.value)} placeholder={bi('আপনার পূর্ণ নাম', 'Your full name')}/></label>}
        <label>{bi('ইমেইল', 'Email')}<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label>
        <label>{bi('পাসওয়ার্ড', 'Password')}<input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={event => setPassword(event.target.value)} placeholder={bi('কমপক্ষে ৮ অক্ষর', 'At least 8 characters')}/></label>
        {isRegister && <label>{bi('পাসওয়ার্ড আবার লিখুন', 'Confirm password')}<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder={bi('পাসওয়ার্ড মিলিয়ে লিখুন', 'Enter the password again')}/></label>}
        {!isAdmin && !isRegister && <button type="button" className="forgot-link" onClick={resetPassword} disabled={busy}>{bi('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot password?')}</button>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? bi('অপেক্ষা করুন…', 'Please wait…') : isRegister ? bi('নিবন্ধন করুন', 'Register') : bi('লগইন করুন', 'Sign in')}</button>
      </form>
      {message && <div className="auth-message" role="status">{message}</div>}
      {!isAdmin && <div className="auth-switch">{isRegister ? bi('আগে থেকেই অ্যাকাউন্ট আছে?', 'Already have an account?') : bi('অ্যাকাউন্ট নেই?', 'New to the academy?')} <button onClick={() => onMode(isRegister ? 'student-login' : 'student-register')}>{isRegister ? bi('লগইন করুন', 'Sign in') : bi('নিবন্ধন করুন', 'Register')}</button></div>}
      {isAdmin && <div className="auth-note">{bi('সাইনআপ থেকে অ্যাডমিন অনুমতি পাওয়া যায় না।', 'Admin access is not granted through student registration.')}</div>}
      {!supabaseConfigured && <div className="auth-config">{bi('Supabase URL ও public anon key যুক্ত হলে নিরাপদ লগইন চালু হবে।', 'Secure sign in will work when the Supabase URL and public anon key are configured.')}</div>}
    </section>
    <footer className="auth-footer">© ২০২৬ / 2026 আলমুয়াফী / Almuafy Online Academy</footer>
  </main>
}
