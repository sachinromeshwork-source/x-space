import { avatarUrl } from '../supabase'
export default function Avatar({ path, name = '?', size = 40, online }) {
  const url = avatarUrl(path)
  return <span className="av" style={{ width: size, height: size }}>
    {url ? <img src={url} alt="" /> : <b style={{ fontSize: size / 2.4 }}>{name.trim()[0]?.toUpperCase() || '?'}</b>}
    {online && <i className="dot" />}
  </span>
}
