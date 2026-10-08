import { useState } from 'react'
import { supabase } from '../supabase'
import { timeShort } from '../lib/format'
import Avatar from './Avatar'
export default function Sidebar({ me, list, sel, online, onSelect, onNew }) {
  const [q, setQ] = useState('')
  const shown = list.filter((c) => (c.title || '').toLowerCase().includes(q.toLowerCase()))
  return <aside>
    <div className="top"><img src="/logo.png" alt="X Space" /><button className="primary sm" onClick={onNew}>New chat</button></div>
    <input className="filter" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="list">
      {shown.length === 0 && <p className="empty">{list.length ? 'No matches.' : 'No conversations yet. Tap New chat and search a mobile number.'}</p>}
      {shown.map((c) => <button key={c.cid} className={'row' + (sel === c.cid ? ' on' : '')} onClick={() => onSelect(c.cid)}>
        <Avatar path={c.avatar} name={c.title || '?'} online={online.has(c.other_id)} />
        <div className="grow"><b>{c.title || 'Deleted user'}</b><small>{c.last_text || 'No messages yet'}</small></div>
        <div className="meta"><small>{c.last_text ? timeShort(c.last_at) : ''}</small>{c.unread > 0 && <span className="badge">{c.unread}</span>}</div>
      </button>)}
    </div>
    <div className="me"><Avatar path={me.avatar_url} name={me.name} size={34} /><div className="grow"><b>{me.name}</b><small>{me.mobile}</small></div>
      <button className="link" onClick={async () => { await supabase.from('xs_profiles').update({ last_seen: new Date().toISOString() }).eq('id', me.id); supabase.auth.signOut() }}>Log out</button></div>
  </aside>
}
