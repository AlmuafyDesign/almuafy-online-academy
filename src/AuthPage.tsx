import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigured } from './services/supabase'

export type AuthMode = 'student-login' | 'student-register' | 'admin-login'

export default function AuthPage({ mode, onMode, onAuthenticated, onBack }: { mode: AuthMode; onMode: (mode: AuthMode) => void; onAuthenticated: () => void; onBack: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const isRegister = mode === 'student-register'
  const isAdmin = mode === 'admin-login'

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage('')
    if (!supabase) { setMessage('Supabase configuration এখনো যুক্ত করা হয়নি।'); return }
    setBusy(true)
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` } })
        if (error) throw error
        setMessage(data.session ? 'অ্যাকাউন্ট তৈরি হয়েছে। এখন আপনার ইমেইল যাচাই করুন।' : 'নিবন্ধন অনুরোধ গৃহীত হয়েছে। ইমেইলে যাচাইয়ের নির্দেশনা দেখুন।')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        onAuthenticated()
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail.toLowerCase().includes('invalid') ? 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।' : detail.toLowerCase().includes('confirm') ? 'প্রথমে ইমেইল যাচাই করুন।' : 'অনুরোধ সম্পন্ন হয়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।')
    } finally { setBusy(false) }
  }

  async function resetPassword() {
    if (!supabase || !email.trim()) { setMessage('পাসওয়ার্ড পুনরুদ্ধারের জন্য আগে ইমেইল লিখুন।'); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` })
    setBusy(false)
    setMessage(error ? 'পাসওয়ার্ড পুনরুদ্ধারের ইমেইল পাঠানো যায়নি।' : 'পুনরুদ্ধারের নির্দেশনা আপনার ইমেইলে পাঠানো হয়েছে।')
  }

  return <main className="auth-page"><button className="auth-back" onClick={onBack}>← একাডেমির সাইটে ফিরুন</button><section className="auth-card"><div className="auth-brand"><img src={`${import.meta.env.BASE_URL}images/my-own-logo.png`} alt="আলমুয়াফী একাডেমি"/><div><b>আলমুয়াফী</b><small>অনলাইন একাডেমি</small></div></div><span className="auth-kicker">{isAdmin ? 'নিরাপদ প্রশাসনিক প্রবেশ' : 'আপনার শেখার যাত্রা'}</span><h1>{isRegister ? 'শিক্ষার্থী নিবন্ধন' : isAdmin ? 'অ্যাডমিন লগইন' : 'শিক্ষার্থী লগইন'}</h1><p>{isAdmin ? 'অ্যাডমিন অনুমতি আপনার যাচাইকৃত অ্যাকাউন্টে নির্ধারিত থাকে।' : isRegister ? 'নতুন অ্যাকাউন্ট তৈরি করুন। নিবন্ধনের পর ডিফল্ট ভূমিকা শিক্ষার্থী থাকবে।' : 'আপনার একাডেমি অ্যাকাউন্টে প্রবেশ করুন।'}</p><form onSubmit={submit}>{isRegister && <label>পূর্ণ নাম<input autoComplete="name" required value={name} onChange={event => setName(event.target.value)} placeholder="আপনার পূর্ণ নাম"/></label>}<label>ইমেইল<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com"/></label><label>পাসওয়ার্ড<input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={event => setPassword(event.target.value)} placeholder="কমপক্ষে ৮ অক্ষর"/></label>{!isAdmin && !isRegister && <button type="button" className="forgot-link" onClick={resetPassword} disabled={busy}>পাসওয়ার্ড ভুলে গেছেন?</button>}<button className="primary-button auth-submit" disabled={busy}>{busy ? 'অপেক্ষা করুন…' : isRegister ? 'নিবন্ধন করুন' : 'লগইন করুন'}</button></form>{message && <div className="auth-message" role="status">{message}</div>}{!isAdmin && <div className="auth-switch">{isRegister ? 'আগে থেকেই অ্যাকাউন্ট আছে?' : 'অ্যাকাউন্ট নেই?'} <button onClick={() => onMode(isRegister ? 'student-login' : 'student-register')}>{isRegister ? 'লগইন করুন' : 'নিবন্ধন করুন'}</button></div>}{isAdmin && <div className="auth-note">সাইনআপ থেকে অ্যাডমিন অনুমতি পাওয়া যায় না।</div>}{!supabaseConfigured && <div className="auth-config">Supabase URL ও public anon key যুক্ত হলে নিরাপদ লগইন চালু হবে।</div>}</section><footer className="auth-footer">© ২০২৬ আলমুয়াফী অনলাইন একাডেমি</footer></main>
}
