import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { timeShort, lastSeen } from '../lib/format'
import Avatar from './Avatar'
const PAGE = 30
const merge = (l, m) => [...l.filter((x) => x.id !== m.id), m].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
export default function ChatView({ chat, me, online, onBack }) {
  const id = chat.cid
  const [msgs, setMsgs] = useState([]), [more, setMore] = useState(false), [text, setText] = useState('')
  const [other, setOther] = useState(null), [otherRead, setOtherRead] = useState(0), [typing, setTyping] = useState(''), [err, setErr] = useState('')
  const [incomingCall, setIncomingCall] = useState(null)
  const ch = useRef(), box = useRef(), lastTyped = useRef(0), tt = useRef()
  const markRead = () => supabase.rpc('xs_mark_read', { cid: id })
  useEffect(() => {
    setMsgs([]); setErr(''); setTyping(''); setOther(null)
    supabase.from('xs_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(PAGE)
      .then(({ data, error }) => { if (error) return setErr('Could not load messages.'); setMsgs(data.reverse()); setMore(data.length === PAGE); markRead(); setTimeout(() => box.current && (box.current.scrollTop = 1e9), 30) })
    if (chat.other_id) {
      supabase.from('xs_profiles').select('*').eq('id', chat.other_id).maybeSingle().then(({ data }) => setOther(data))
      supabase.from('xs_members').select('last_read_at').eq('conversation_id', id).eq('user_id', chat.other_id).maybeSingle().then(({ data }) => data && setOtherRead(new Date(data.last_read_at)))
    }
  const callChannel = supabase
  .channel('incoming-calls-' + me.id)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'xs_calls',
    },
    async (payload) => {
      const call = payload.new
      console.log('INCOMING CALL EVENT:', call)


      if (call.callee_id !== me.id) return

      const result = await supabase
        .from('xs_profiles')
        .select('*')
        .eq('id', call.caller_id)
        .maybeSingle()

      setIncomingCall({
        ...call,
        caller: result.data,
      })
    }
  )
  .subscribe((status) => {
  console.log('CALL REALTIME:', status)
})
   const c = supabase.channel('chat:' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'xs_messages', filter: `conversation_id=eq.${id}` }, ({ new: m }) => { setMsgs((l) => merge(l, m)); if (m.sender_id !== me.id) markRead(); setTimeout(() => box.current && (box.current.scrollTop = 1e9), 30) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'xs_messages', filter: `conversation_id=eq.${id}` }, ({ new: m }) => setMsgs((l) => l.map((x) => x.id === m.id ? m : x)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'xs_members', filter: `conversation_id=eq.${id}` }, ({ new: r }) => r.user_id !== me.id && setOtherRead(new Date(r.last_read_at)))
      .on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload.uid === me.id) return; setTyping(payload.name); clearTimeout(tt.current); tt.current = setTimeout(() => setTyping(''), 3000) })
      .subscribe()
    ch.current = c
    return () => { supabase.removeChannel(c); clearTimeout(tt.current) }
  }, [id])
  async function older() {
    const h = box.current.scrollHeight
    const { data } = await supabase.from('xs_messages').select('*').eq('conversation_id', id).lt('created_at', msgs[0].created_at).order('created_at', { ascending: false }).limit(PAGE)
    if (!data) return setErr('Could not load older messages.')
    setMsgs((l) => [...data.reverse(), ...l]); setMore(data.length === PAGE)
    setTimeout(() => (box.current.scrollTop = box.current.scrollHeight - h), 0)
  }
  async function send(e) {
    e.preventDefault()
    const body = text.trim(); if (!body) return
    if (!navigator.onLine) return setErr('You’re offline. Message not sent.')
    setText(''); setErr('')
    const tmp = { id: 'tmp-' + Date.now(), sender_id: me.id, body, created_at: new Date().toISOString(), tmp: true }
    setMsgs((l) => merge(l, tmp))
    const { data, error } = await supabase.from('xs_messages').insert({ conversation_id: id, sender_id: me.id, body }).select().single()
    setMsgs((l) => { const r = l.filter((x) => x.id !== tmp.id); return error ? [...r, { ...tmp, failed: true }] : merge(r, data) })
    if (error) setErr(/blocked/.test(error.message) ? 'You can’t message this user.' : 'Message failed to send.')
    setTimeout(() => box.current && (box.current.scrollTop = 1e9), 30)
  }
  function onType(v) {
    setText(v)
    if (Date.now() - lastTyped.current > 2000) { lastTyped.current = Date.now(); ch.current?.send({ type: 'broadcast', event: 'typing', payload: { uid: me.id, name: me.name } }) }
  }
  const status = chat.is_group ? '' : online.has(chat.other_id) ? 'Online' : lastSeen(other?.last_seen)
  const tick = (m) => m.failed ? '!' : m.tmp ? '…' : !chat.is_group && new Date(m.created_at) <= otherRead ? '✓✓' : '✓'
  return <section className="chat">
<header>
  <button className="back" onClick={onBack} aria-label="Back">
    ‹
  </button>

  <Avatar
    path={chat.avatar}
    name={chat.title || '?'}
    online={online.has(chat.other_id)}
  />

  <div className="chat-head-info">
    <b>{chat.title || 'Deleted user'}</b>
    <small>{status}</small>
  </div>

  {!chat.is_group && (
    <div className="call-buttons">
   <button
  className="call-button"
  type="button"
  onClick={async () => {
    const { error } = await supabase
      .from('xs_calls')
      .insert({
        conversation_id: id,
        caller_id: me.id,
        callee_id: chat.other_id,
        call_type: 'voice'
      })

    if (error) {
      setErr('Could not start voice call.')
    }
  }}
 >
  📞
</button>
      <button
        className="call-button"
        type="button"
        onClick={async () => {
  const { error } = await supabase
    .from('xs_calls')
    .insert({
      conversation_id: id,
      caller_id: me.id,
      callee_id: chat.other_id,
      call_type: 'video',
    })

  if (error) {
    setErr('Could not start video call.')
  }
}}
      >
        📹
      </button>
    </div>
  )}
</header>
    <div className="msgs" ref={box}>
      {more && <button className="link" onClick={older}>Load older messages</button>}
      {!msgs.length && <p className="empty">No messages yet. Say hello.</p>}
      {msgs.map((m) => <div key={m.id} className={'bubble ' + (m.sender_id === me.id ? 'mine' : 'theirs') + (m.failed ? ' failed' : '')}>
        {m.deleted_at ? <i>Message deleted</i> : m.body}
        <small>{m.edited_at && !m.deleted_at ? 'edited · ' : ''}{timeShort(m.created_at)}{m.sender_id === me.id && <span className={'tick' + (tick(m) === '✓✓' ? ' read' : '')}> {tick(m)}</span>}</small>
      </div>)}
    </div>
    {err && <p className="err bar">{err}</p>}
    <form className="composer" onSubmit={send}><input placeholder="Message" value={text} onChange={(e) => onType(e.target.value)} /><button className="primary">Send</button></form>
{incomingCall && (
  <CallModal
    type={incomingCall.call_type}
    caller={incomingCall.caller}
    incoming={true}
    onAccept={async () => {
      const result = await supabase
        .from('xs_calls')
        .update({
          status: 'accepted',
          answered_at: new Date().toISOString()
        })
        .eq('id', incomingCall.id)

      if (result.error) {
        alert(result.error.message)
        return
      }

      alert('CALL ACCEPTED')

    
setIncomingCall(null)
    }}
    onReject={async () => {
  const result = await supabase
    .from('xs_calls')
    .update({
      status: 'rejected',
      ended_at: new Date().toISOString()
    })
    .eq('id', incomingCall.id)

  if (result.error) {
    alert(result.error.message)
    return
  }

  alert('CALL REJECTED')

  setIncomingCall(null)
}}
  />
)}

</section>
}
