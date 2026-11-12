import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null

export type AcademyRole = 'student' | 'admin'
export type AcademyProfile = {
  id: string
  email: string | null
  full_name: string
  phone: string | null
  address: string | null
  role: AcademyRole
  status: 'active' | 'inactive' | 'blocked' | 'pending'
}
