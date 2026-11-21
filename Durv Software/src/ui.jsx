import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

export const TILE = 150, TILE_FOCUS = 236, GAP = 22
const SPRING = { type: 'spring', stiffness: 340, damping: 32 }
export const glass = 'bg-white/10 backdrop-blur-[40px] border border-white/25 shadow-[0_20px_40px_rgba(0,0,0,.35),inset_0_0_20px_rgba(255,255,255,.12)]'
const card = 'bg-navy/85 backdrop-blur-xl border border-white/10 shadow-[0_12px_30px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.1)]'

const Svg = ({ children, size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/85">{children}</svg>
)

export function Tile({ g, focused }) {
  const size = focused ? TILE_FOCUS : TILE
  const sys = g.kind === 'settings' || g.kind === 'power'
  const bg = g.tile ? `url("${g.tile}") center/cover`
    : sys ? 'linear-gradient(150deg,#2b2d38,#17181d)'
    : `linear-gradient(150deg, ${g.accent}d9 0%, ${g.accent}33 48%, #14152a 100%)`
  return (
    <motion.div animate={{ width: size, height: size }} transition={SPRING} className="relative flex-none">
      <motion.div className="absolute inset-0 overflow-hidden rounded-[22px]" style={{ background: bg }}
        animate={{ boxShadow: focused ? `0 0 0 4px #fff, 0 0 46px 6px ${g.accent || '#22e6ff'}99` : '0 8px 20px rgba(0,0,0,.45)' }}>
        {g.kind === 'settings' && <Svg size={size * 0.38}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>}
        {g.kind === 'power' && <Svg size={size * 0.38}><path d="M12 3v9" /><path d="M6.4 6.4a8 8 0 1 0 11.2 0" /></Svg>}
        {!sys && !g.tile && (g.icon
          ? <img src={g.icon} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_6px_14px_rgba(0,0,0,.5)]" style={{ width: size * 0.34, height: size * 0.34 }} />
          : <span className="absolute inset-0 grid place-items-center font-semibold text-white/80" style={{ fontSize: size * 0.4 }}>{g.name[0]}</span>)}
      </motion.div>
      <motion.div animate={{ opacity: focused ? 1 : 0 }} className="pointer-events-none absolute left-1 top-full mt-4 whitespace-nowrap">
        <div className="text-3xl font-medium">{g.name}</div>
        {g.sub && <div className="text-lg text-white/60">{g.sub}</div>}
      </motion.div>
    </motion.div>
  )
}

export function TopBar() {
  const [now, setNow] = useState(new Date())
  const [bat, setBat] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    navigator.getBattery?.().then((b) => {
      const upd = () => setBat(Math.round(b.level * 100))
      upd(); b.addEventListener('levelchange', upd)
    })
    return () => { clearInterval(t); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return (
    <div className="absolute left-[120px] right-[90px] top-9 z-20 flex items-center justify-between">
      <span className="text-4xl font-semibold">Games</span>
      <div className="flex items-center gap-7 text-2xl">
        <span className="flex items-center gap-2"><i className={`h-3 w-3 rounded-full ${online ? 'bg-cyan shadow-[0_0_10px_#22e6ff]' : 'bg-white/30'}`} />{online ? 'Online' : 'Offline'}</span>
        {bat !== null && <span>{bat}%</span>}
        <span className="tabular-nums">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet to-magenta text-lg font-semibold shadow-[0_0_18px_rgba(139,92,255,.6)]">P1</div>
      </div>
    </div>
  )
}

const gb = (n) => (n / 1024 ** 3).toFixed(n > 1024 ** 4 ? 0 : 1)
export function Widgets({ games, folder, storage, connected }) {
  const used = storage ? Math.round((1 - storage.free / storage.total) * 100) : 0
  return (
    <div className="absolute bottom-28 left-[120px] flex gap-6">
      <div className={`h-[150px] w-[360px] rounded-3xl p-6 ${card}`}>
        <div className="text-xl text-white/70">Library</div>
        <div className="mt-1 text-5xl font-semibold text-gold">{games}</div>
        <div className="mt-2 truncate text-base text-white/50">{folder || 'No games folder set'}</div>
      </div>
      <div className={`h-[150px] w-[360px] rounded-3xl p-6 ${card}`}>
        <div className="text-xl text-white/70">Storage {storage ? `(${storage.root})` : ''}</div>
        {storage ? (<>
          <div className="mt-2 text-3xl font-semibold">{gb(storage.free)} GB free</div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan to-violet" style={{ width: `${used}%` }} /></div>
          <div className="mt-2 text-base text-white/50">of {gb(storage.total)} GB</div>
        </>) : <div className="mt-3 text-lg text-white/50">Set a games folder to see space</div>}
      </div>
      <div className={`flex h-[150px] w-[360px] items-center gap-5 rounded-3xl p-6 ${card}`}>
        <div className={`h-16 w-16 flex-none rounded-full border-4 ${connected ? 'border-cyan shadow-[0_0_20px_rgba(34,230,255,.6)]' : 'border-white/20'}`} />
        <div className="text-xl">{connected ? 'Controller connected' : 'No controller found'}<div className="text-base text-white/50">{connected ? 'Ready' : 'Press any button'}</div></div>
      </div>
    </div>
  )
}

const Key = ({ k, label }) => (
  <span className="flex items-center gap-2.5"><b className="grid h-9 min-w-9 place-items-center rounded-full border border-white/40 bg-white/10 px-2 text-lg">{k}</b>{label}</span>
)
export function Prompts({ mode, canArt }) {
  if (!mode) return null
  return (
    <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-10 text-xl text-white/85">
      <Key k="A" label="Select" /><Key k="B" label="Back" />
      {mode === 'home' && canArt && <Key k="Y" label="Artwork" />}
      {mode === 'home' && <Key k="≡" label="Settings" />}
    </div>
  )
}

const Overlay = ({ children }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/55 backdrop-blur-sm">
    <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} transition={SPRING}>{children}</motion.div>
  </motion.div>
)

const Row = ({ r, active }) => (
  <motion.div animate={{ scale: active ? 1.03 : 1 }}
    className={`rounded-2xl px-6 py-4 ${active ? 'bg-white text-[#14152a] shadow-[0_0_32px_rgba(34,230,255,.55)]' : 'bg-white/10 text-white'}`}>
    <div className="truncate text-2xl font-medium">{r.label}</div>
    {r.sub && <div className={`truncate text-base ${active ? 'text-[#14152a]/60' : 'text-white/55'}`}>{r.sub}</div>}
  </motion.div>
)

export function Menu({ title, sub, rows, sel }) {
  return (
    <Overlay>
      <div className={`w-[600px] rounded-[28px] p-9 ${glass}`}>
        <h2 className="text-4xl font-semibold">{title}</h2>
        {sub && <p className="mt-2 text-xl text-white/65">{sub}</p>}
        <div className="mt-6 flex flex-col gap-3">{rows.map((r, i) => <Row key={r.label} r={r} active={i === sel} />)}</div>
      </div>
    </Overlay>
  )
}

export function Browser({ title, dir, rows, sel }) {
  const start = Math.max(0, Math.min(sel - 4, rows.length - 9))
  return (
    <Overlay>
      <div className={`w-[760px] rounded-[28px] p-9 ${glass}`}>
        <h2 className="text-3xl font-semibold">{title}</h2>
        <p className="mt-1 truncate text-lg text-cyan">{dir || 'Drives'}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          {rows.slice(start, start + 9).map((r, i) => <Row key={r.label + r.kind + i} r={r} active={start + i === sel} />)}
          {rows.length === 0 && <div className="py-6 text-xl text-white/60">Nothing here.</div>}
        </div>
      </div>
    </Overlay>
  )
}

export function Confirm({ item, sel }) {
  const btn = (label, active) => (
    <motion.div animate={{ scale: active ? 1.08 : 1 }} className={`rounded-2xl px-10 py-4 text-2xl font-semibold ${active ? 'bg-white text-[#14152a] shadow-[0_0_30px_rgba(255,60,172,.55)]' : 'bg-white/10'}`}>{label}</motion.div>
  )
  return (
    <Overlay>
      <div className={`rounded-[28px] p-10 text-center ${glass}`}>
        <div className="text-4xl font-semibold">{item.name} this PC?</div>
        <div className="mb-8 mt-2 text-xl text-white/65">{item.sub}</div>
        <div className="flex justify-center gap-5">{btn('Cancel', sel === 0)}{btn(item.name, sel === 1)}</div>
      </div>
    </Overlay>
  )
}

export const Busy = ({ text }) => (
  <Overlay><div className={`rounded-3xl px-12 py-8 text-3xl ${glass}`}>{text}</div></Overlay>
)
