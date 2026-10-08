import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import AuthPage from './pages/AuthPage'
import ChatPage from './pages/ChatPage'
export default function App() {
  const [session, setSession] = useState(undefined)
  const [me, setMe] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return setMe(null)
    supabase.from('xs_profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => setMe(data))
  }, [session])
  if (session === undefined) return <div className="center">Loading…</div>
  if (!session) return <AuthPage />
  if (!me) return <div className="center">Loading your profile…</div>
  return <ChatPage me={me} />
}
