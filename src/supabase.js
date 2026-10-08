import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const cleanMobile = (m) => '+' + String(m).replace(/\D/g, '')
export const toEmail = (m) => `${cleanMobile(m).slice(1)}@xspace.example.com`
export const avatarUrl = (path) => path ? supabase.storage.from('xs-avatars').getPublicUrl(path).data.publicUrl : null
