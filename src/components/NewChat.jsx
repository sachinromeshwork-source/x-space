import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Avatar from './Avatar'
export default function NewChat({ me, onOpen, onClose }) {
  const [q, setQ] = useState(''), [res, setRes] = useState(null), [err, setErr] = useState('')
  useEffect(() => {
    const s = q.replace(/[,()%*]/g, '').trim()
    if (s.length < 2) return setRes(null)
    const t = setTimeout(async () => {
      const { data, error } = await supabase.from('xs_profiles').select('id,name,mobile,avatar_url').or(`name.ilike.%${s}%,mobile.ilike.%${s.replace(/\D/g, '') || s}%`).neq('id', me.id).limit(20)
      if (error) setErr('Search failed. Check your connection.'); else { setErr(''); setRes(data) }
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  async function open(u) {
    const { data, error } = await supabase.rpc('xs_start_dm', { other: u.id })
    if (error) return setErr(/blocked/.test(error.message) ? 'You can’t message this user.' : 'Could not open chat.')
    onOpen(data)
  }
  return <div className="modal" onClick={onClose}><div className="sheet" onClick={(e) => e.stopPropagation()}>
    <h3>New chat</h3>
    <input autoFocus placeholder="Search name or mobile number" value={q} onChange={(e) => setQ(e.target.value)} />
    {err && <p className="err">{err}</p>}
    {res?.length === 0 && <p className="empty">No user found. Check the number and try again.</p>}
    {res?.map((u) => <button key={u.id} className="row" onClick={() => open(u)}><Avatar path={u.avatar_url} name={u.name} /><div><b>{u.name}</b><small>{u.mobile}</small></div></button>)}
    <button className="link" onClick={onClose}>Close</button>
  </div></div>
}
