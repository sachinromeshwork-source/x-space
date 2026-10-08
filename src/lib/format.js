export const timeShort = (d) => { const x = new Date(d), n = new Date()
  return x.toDateString() === n.toDateString() ? x.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : x.toLocaleDateString([], { day: 'numeric', month: 'short' }) }
export const lastSeen = (d) => d ? 'Last seen ' + timeShort(d) : 'Offline'
export const beep = () => { try { const c = new AudioContext(), o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.12) } catch {} }
