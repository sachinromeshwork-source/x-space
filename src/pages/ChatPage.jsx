import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { beep } from '../lib/format'
import Sidebar from '../components/Sidebar'
import ChatView from '../components/ChatView'
import NewChat from '../components/NewChat'
export default function ChatPage({ me }) {
  const [list, setList] = useState([]), [sel, setSel] = useState(null), [online, setOnline] = useState(new Set()), [showNew, setShowNew] = useState(false), [err, setErr] = useState('')
  const selRef = useRef(null); selRef.current = sel
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('xs_list')
    if (error) setErr('Could not load conversations.'); else { setErr(''); setList(data) }
  }, [])
  useEffect(() => {
    load()
    const g = supabase.channel('xs-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'xs_messages' }, ({ new: m }) => {
        load()
        if (m.sender_id !== me.id && (m.conversation_id !== selRef.current || document.hidden)) {
          beep()
          if ('Notification' in window && Notification.permission === 'granted') new Notification('X Space', { body: m.body || 'New attachment' })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xs_members' }, load).subscribe()
    const p = supabase.channel('xs-presence', { config: { presence: { key: me.id } } })
    p.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(p.presenceState())))).subscribe((s) => s === 'SUBSCRIBED' && p.track({ at: Date.now() }))
    const bye = () => supabase.from('xs_profiles').update({ last_seen: new Date().toISOString() }).eq('id', me.id)
    document.addEventListener('visibilitychange', () => document.hidden && bye())
    return () => { supabase.removeChannel(g); supabase.removeChannel(p) }
  }, [])
  const chat = list.find((c) => c.cid === sel)
  return <div className={'app' + (sel ? ' has-chat' : '')}>
    <Sidebar me={me} list={list} sel={sel} online={online} onSelect={setSel} onNew={() => setShowNew(true)} />
    <main>{err && <p className="err bar">{err}</p>}
      {chat ? <ChatView chat={chat} me={me} online={online} onBack={() => setSel(null)} /> : <div className="center"><img src="/logo.png" alt="" width="180" /><p className="empty">Select a conversation or start a new chat.</p></div>}</main>
    {showNew && <NewChat me={me} onClose={() => setShowNew(false)} onOpen={async (cid) => { setShowNew(false); await load(); setSel(cid) }} />}
  </div>
}
