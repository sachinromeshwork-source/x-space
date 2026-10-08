import { useState } from 'react'
import { supabase, toEmail, cleanMobile } from '../supabase'
export default function AuthPage() {
  const [reg, setReg] = useState(false)
  const [f, setF] = useState({ mobile: '', password: '', name: '' })
  const [dp, setDp] = useState(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault(); setErr('')
    if (cleanMobile(f.mobile).length < 8) return setErr('Enter your mobile number with country code, e.g. +91 98765 43210.')
    if (f.password.length < 6) return setErr('Password must be at least 6 characters.')
    if (reg && !f.name.trim()) return setErr('Enter your name.')
    if (dp && (!dp.type.startsWith('image/') || dp.size > 3e6)) return setErr('Profile picture must be an image under 3 MB.')
    setBusy(true)
    try {
      const email = toEmail(f.mobile)
      if (!reg) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: f.password })
        if (error) throw new Error('Mobile number or password is incorrect.')
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: f.password, options: { data: { xspace: 'true', mobile: cleanMobile(f.mobile), name: f.name.trim() } } })
        if (error) throw new Error(/registered/i.test(error.message) ? 'This number is already registered. Log in instead.' : error.message)
        if (!data.session) throw new Error('Account created, but email confirmation is still enabled in Supabase Auth. Turn it off and log in.')
        if (dp) {
          const path = `${data.user.id}/dp-${Date.now()}`
          const up = await supabase.storage.from('xs-avatars').upload(path, dp, { contentType: dp.type })
          if (!up.error) await supabase.from('xs_profiles').update({ avatar_url: path }).eq('id', data.user.id)
        }
      }
    } catch (x) { setErr(x.message); setBusy(false) }
  }
  return <div className="auth"><form onSubmit={submit}>
    <img src="/logo.png" alt="X Space" className="authlogo" />
    {reg && <input placeholder="Name" value={f.name} onChange={set('name')} />}
    <input placeholder="Mobile number (+country code)" inputMode="tel" value={f.mobile} onChange={set('mobile')} />
    <input type="password" placeholder="Password" value={f.password} onChange={set('password')} />
    {reg && <label className="file">Profile picture (optional)<input type="file" accept="image/*" onChange={(e) => setDp(e.target.files[0] || null)} /></label>}
    {err && <p className="err">{err}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Log in'}</button>
    <button type="button" className="link" onClick={() => { setReg(!reg); setErr('') }}>{reg ? 'Have an account? Log in' : 'New here? Register'}</button>
  </form></div>
}
