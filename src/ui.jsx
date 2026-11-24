import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiIcon, BtIcon, VolIcon, PadIcon, StarIcon, MusicIcon, LockIcon } from './icons'

export const TILE = 172, TILE_FOCUS = 288, GAP = 24
const SPRING = { type: 'spring', stiffness: 340, damping: 32 }

// Theme colours: a('p', .5) -> rgb(var(--p) / .5)
export const a = (v, o = 1) => `rgb(var(--${v}) / ${o})`
export const grad = (deg = 100, o = 1) => `linear-gradient(${deg}deg, ${a('p', o)}, ${a('s', o)})`
// No backdrop-filter anywhere: it is what made the UI lag on 4K TVs. Solid translucent fills look the same on this dark background.
export const solid = 'bg-[#0e0e19] border border-white/[0.12] shadow-[0_30px_80px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.12)]'
export const glass = 'bg-[#181826]/90 border border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.14)]'
const label = 'text-[13px] font-medium uppercase tracking-[0.2em] text-white/45'
const angleOf = (id) => { const n = parseInt((id || '').slice(0, 2), 16); return Number.isNaN(n) ? 145 : 115 + (n % 80) }

const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`
}
const hrs = (s) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${(s / 3600).toFixed(1)} h`)
const subFor = (g) => g.kind || g.sub ? g.sub : g.sec ? `${hrs(g.sec)} played${g.last ? `  ·  ${ago(g.last)}` : ''}` : g.last ? `Played ${ago(g.last)}` : 'Not played yet'

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="absolute left-1/2 top-1/2 h-[36%] w-[36%] -translate-x-1/2 -translate-y-1/2 text-white/85">{children}</svg>
)

// The tile artwork on its own (used by the row and by the launch screen).
export function TileFace({ g, size, radius = 28 }) {
  const sys = g.kind === 'settings' || g.kind === 'power'
  const ang = angleOf(g.id)
  const bg = g.tile ? `url("${g.tile}") center/cover`
    : sys ? 'linear-gradient(150deg,#2b2c3a,#14151d)'
    : g.accent ? `linear-gradient(${ang}deg, ${g.accent}e6, ${g.accent}40 58%, #0d0e18)`
    : `linear-gradient(${ang}deg, ${a('p', 0.92)} 0%, ${a('s', 0.55)} 58%, #0d0e18 100%)`
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius, background: bg, boxShadow: '0 10px 24px rgba(0,0,0,.45)' }}>
      {g.kind === 'settings' && <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>}
      {g.kind === 'power' && <Svg><path d="M12 3v9" /><path d="M6.4 6.4a8 8 0 1 0 11.2 0" /></Svg>}
      {!sys && !g.tile && (g.icon ? (<>
        <img src={g.icon} alt="" className="absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,.55)]" />
      </>) : <span className="absolute inset-0 grid place-items-center font-semibold text-white/85" style={{ fontSize: size * 0.4 }}>{g.name[0]}</span>)}
      {g.fav && <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white"><StarIcon size={16} /></div>}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.22] via-transparent to-black/30 ring-1 ring-inset ring-white/20" style={{ borderRadius: radius }} />
    </div>
  )
}

export function Tile({ g, focused }) {
  const size = focused ? TILE_FOCUS : TILE
  const sys = g.kind === 'settings' || g.kind === 'power'
  const glow = g.accent ? `0 20px 60px ${g.accent}88` : `0 20px 64px ${a('p', 0.55)}, 0 0 110px ${a('s', 0.28)}`
  return (
    <motion.div animate={{ width: size, height: size }} transition={SPRING} className="relative flex-none">
      <TileFace g={g} size={size} />
      <motion.div initial={false} animate={{ opacity: focused ? 1 : 0 }} transition={{ duration: 0.2 }} className="pointer-events-none absolute inset-0 rounded-[28px]"
        style={{ boxShadow: `0 0 0 3px rgba(255,255,255,.96), ${glow}` }} />
      <motion.div animate={{ opacity: focused ? 1 : 0, y: focused ? 0 : -6 }} className="pointer-events-none absolute left-1 top-full mt-5 whitespace-nowrap">
        <div className="text-[34px] font-semibold leading-none tracking-tight">{g.name}</div>
        <div className="mt-1.5 text-lg text-white/55">{subFor(g)}</div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2 text-lg font-medium" style={{ background: grad(100), boxShadow: `0 8px 26px ${a('p', 0.45)}` }}>
          <b className="grid h-6 w-6 place-items-center rounded-full bg-white/25 text-sm">A</b>{sys ? 'Open' : 'Play'}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Profile picture, or the first letters of the name when there isn't one.
export function Avatar({ profile, size = 44 }) {
  const initials = (profile?.name || 'P1').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="grid flex-none place-items-center overflow-hidden rounded-full bg-charcoal font-semibold" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" draggable={false} /> : initials}
    </div>
  )
}

const Battery = ({ pct }) => (
  <span className="flex items-center gap-2">
    <span className="relative h-[14px] w-[26px] rounded-[4px] border border-white/60 p-[1.5px]">
      <i className="block h-full rounded-[2px]" style={{ width: `${pct}%`, background: grad(90) }} />
      <i className="absolute -right-[4px] top-1/2 h-[6px] w-[2px] -translate-y-1/2 rounded-r bg-white/60" />
    </span>{pct}%
  </span>
)

export function TopBar({ status, padConnected, pad, profile, topFocused, media, pinSet }) {
  const [now, setNow] = useState(new Date())
  const [bat, setBat] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    navigator.getBattery?.().then((b) => { const u = () => setBat(Math.round(b.level * 100)); u(); b.addEventListener('levelchange', u) })
    return () => { clearInterval(t); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const w = status.wifi || {}
  const bt = status.bluetooth || {}
  const cb = status.controller
  return (
    <div className="absolute left-[110px] right-[90px] top-9 z-20 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl" style={{ background: grad(135), boxShadow: `0 8px 30px ${a('p', 0.55)}` }} />
        <div>
          <div className="text-[28px] font-semibold leading-none">Library</div>
          <div className="mt-1.5 text-base text-white/50">{now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>
        </div>
      </div>
      {media?.active && media.status === 'Playing' && media.title && (
        <div className="mx-8 flex min-w-0 flex-1 items-center justify-center">
          <div className={`flex max-w-[460px] items-center gap-3 rounded-full px-5 py-2.5 text-lg ${glass}`}>
            <span className="flex-none" style={{ color: `rgb(var(--s))` }}><MusicIcon size={22} /></span>
            <span className="truncate">{media.title}{media.artist ? <span className="text-white/55">  ·  {media.artist}</span> : null}</span>
          </div>
        </div>
      )}
      <div className={`flex items-center gap-5 rounded-full py-2 pl-7 pr-2 text-xl ${glass}`}>
        <span className="flex items-center gap-2.5"><i className="h-2.5 w-2.5 rounded-full" style={online ? { background: a('s'), boxShadow: `0 0 12px ${a('s')}` } : { background: 'rgba(255,255,255,.3)' }} />{online ? 'Online' : 'Offline'}</span>
        {pinSet && <LockIcon size={22} />}
        <span className="h-6 w-px bg-white/15" />
        {w.supported && <WifiIcon size={24} level={Math.ceil((w.signal || 0) / 34)} off={w.radio === 'Off'} />}
        {bt.supported && <BtIcon size={24} off={bt.radio !== 'On'} />}
        {status.volume !== null && <span className="flex items-center gap-1.5"><VolIcon size={24} level={status.volume} muted={status.muted} /><span className="text-lg tabular-nums text-white/75">{status.muted ? 'Mute' : status.volume}</span></span>}
        <span className="flex items-center gap-1.5" style={{ opacity: padConnected || pad ? 1 : 0.35 }}>
          <PadIcon size={24} />
          {pad ? <span className="text-lg text-white/75">{pad.battery}%</span>
            : cb && cb.type > 1 && cb.type !== 255 && cb.level !== undefined && <span className="text-lg text-white/75">{['0%', '25%', '60%', '100%'][cb.level]}</span>}
        </span>
        {bat !== null && <Battery pct={bat} />}
        <span className="h-6 w-px bg-white/15" />
        <span className="font-medium tabular-nums">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <motion.div animate={{ scale: topFocused ? 1.06 : 1 }} className="flex items-center gap-3 rounded-full py-[2.5px] pl-4 pr-[2.5px]"
          style={topFocused ? { background: grad(100, 0.95), boxShadow: `0 0 0 2px rgba(255,255,255,.9), 0 8px 30px ${a('p', 0.55)}` } : undefined}>
          <span className="max-w-[160px] truncate text-lg font-medium">{profile?.name || 'Player 1'}</span>
          <span className="rounded-full p-[2.5px]" style={{ background: topFocused ? 'rgba(255,255,255,.9)' : grad(135) }}>
            <Avatar profile={profile} size={44} />
          </span>
        </motion.div>
      </div>
    </div>
  )
}

const gb = (n) => (n / 1024 ** 3).toFixed(n > 1024 ** 4 ? 0 : 1)
const numeral = { background: grad(100), WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }

export function Widgets({ games, folder, storage, connected }) {
  const used = storage ? Math.round((1 - storage.free / storage.total) * 100) : 0
  const C = 2 * Math.PI * 42
  return (
    <div className="absolute bottom-[112px] left-[110px] right-[90px] grid grid-cols-[1fr_1.4fr_1fr] gap-6">
      <div className={`h-[172px] rounded-[28px] p-7 ${glass}`}>
        <div className={label}>Library</div>
        <div className="mt-2 text-[68px] font-bold leading-none" style={numeral}>{games}</div>
        <div className="mt-3 truncate text-base text-white/45">{folder || 'Press ≡ to set a games folder'}</div>
      </div>
      <div className={`flex h-[172px] items-center gap-8 rounded-[28px] p-7 ${glass}`}>
        <svg width="112" height="112" viewBox="0 0 100 100" className="flex-none -rotate-90">
          <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'rgb(var(--p))' }} /><stop offset="1" style={{ stopColor: 'rgb(var(--s))' }} /></linearGradient></defs>
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="9" />
          {storage && <circle cx="50" cy="50" r="42" fill="none" stroke="url(#gg)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - used / 100)} />}
        </svg>
        <div>
          <div className={label}>Storage {storage ? storage.root : ''}</div>
          {storage ? (<>
            <div className="mt-2 text-[44px] font-bold leading-none" style={numeral}>{used}%</div>
            <div className="mt-2 text-base text-white/55">{gb(storage.free)} GB free of {gb(storage.total)}</div>
          </>) : <div className="mt-2 text-lg text-white/45">No folder set</div>}
        </div>
      </div>
      <div className={`flex h-[172px] flex-col justify-between rounded-[28px] p-7 ${glass}`}>
        <div className={label}>Controller</div>
        <div className="flex items-end gap-1.5">
          {[16, 26, 36, 46].map((h, i) => <i key={i} className="w-2.5 rounded-full" style={{ height: h, background: connected ? grad(0) : 'rgba(255,255,255,.14)' }} />)}
        </div>
        <div className="text-xl">{connected ? 'Connected' : 'Press any button'}</div>
      </div>
    </div>
  )
}

const Key = ({ k, text }) => (
  <span className="flex items-center gap-2">
    <b className="grid h-6 min-w-6 place-items-center rounded-full border border-white/30 bg-white/10 px-1.5 text-[11px] font-semibold">{k}</b>
    <span className="text-[14px] text-white/70">{text}</span>
  </span>
)
// Compact hint bar, bottom-left; fades out when idle (PS5 style) unless "Always show" is on.
export function Prompts({ mode, canArt, show }) {
  if (!mode) return null
  const kb = mode === 'keyboard'
  return (
    <motion.div animate={{ opacity: show ? 1 : 0, y: show ? 0 : 10 }} transition={{ duration: 0.3 }} className="pointer-events-none absolute bottom-6 left-[110px] z-20">
      <div className={`flex gap-5 whitespace-nowrap rounded-full px-5 py-2 ${glass}`}>
        <Key k="A" text={kb ? 'Type' : 'Select'} /><Key k="B" text={kb ? 'Cancel' : 'Back'} />
        {mode === 'home' && canArt && <Key k="Y" text="Artwork" />}
        {mode === 'home' && <Key k="↑" text="Profile" />}
        {mode === 'home' && <Key k="X" text="Appearance" />}
        {mode === 'home' && <Key k="≡" text="Settings" />}
        {mode === 'home' && <Key k="View" text="Quick menu" />}
        {mode === 'home' && <Key k="LB RB" text="Volume" />}
      </div>
    </motion.div>
  )
}

export const Overlay = ({ children }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/60">
    <motion.div initial={{ scale: 0.94, y: 14 }} animate={{ scale: 1, y: 0 }} transition={SPRING}>{children}</motion.div>
  </motion.div>
)

const Row = ({ r, active }) => (
  <motion.div animate={{ scale: active ? 1.025 : 1 }} className="rounded-2xl px-6 py-3"
    style={active ? { background: grad(100, 0.95), boxShadow: `0 10px 34px ${a('p', 0.45)}` } : { background: 'rgba(255,255,255,.07)' }}>
    <div className="truncate text-[22px] font-medium">{r.label}</div>
    {r.sub && <div className={`truncate text-base ${active ? 'text-white/80' : 'text-white/50'}`}>{r.sub}</div>}
  </motion.div>
)

export function Menu({ title, sub, rows, sel, header }) {
  const s = Math.min(sel, rows.length - 1)
  const start = Math.max(0, Math.min(s - 3, rows.length - 7))
  return (
    <Overlay>
      <div className={`w-[620px] rounded-[32px] p-8 ${glass}`}>
        {header}
        <h2 className="text-4xl font-semibold">{title}</h2>
        {sub && <p className="mt-2 text-xl text-white/60">{sub}</p>}
        <div className="mt-6 flex flex-col gap-3">{rows.slice(start, start + 7).map((r, i) => <Row key={r.label + (start + i)} r={r} active={start + i === s} />)}</div>
      </div>
    </Overlay>
  )
}

export function Browser({ title, dir, rows, sel }) {
  const start = Math.max(0, Math.min(sel - 4, rows.length - 9))
  return (
    <Overlay>
      <div className={`w-[760px] rounded-[32px] p-9 ${glass}`}>
        <h2 className="text-3xl font-semibold">{title}</h2>
        <p className="mt-1 truncate text-lg" style={{ color: a('s') }}>{dir || 'Drives'}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          {rows.slice(start, start + 9).map((r, i) => <Row key={r.label + r.kind + i} r={r} active={start + i === sel} />)}
          {rows.length === 0 && <div className="py-6 text-xl text-white/55">Nothing here.</div>}
        </div>
      </div>
    </Overlay>
  )
}

export function Confirm({ item, sel }) {
  const btn = (text, active) => (
    <motion.div animate={{ scale: active ? 1.08 : 1 }} className="rounded-2xl px-10 py-4 text-2xl font-semibold"
      style={active ? { background: grad(100), boxShadow: `0 10px 34px ${a('s', 0.5)}` } : { background: 'rgba(255,255,255,.08)' }}>{text}</motion.div>
  )
  return (
    <Overlay>
      <div className={`rounded-[32px] p-10 text-center ${glass}`}>
        <div className="text-4xl font-semibold">{item.name} this PC?</div>
        <div className="mb-8 mt-2 text-xl text-white/60">{item.sub}</div>
        <div className="flex justify-center gap-5">{btn('Cancel', sel === 0)}{btn(item.name, sel === 1)}</div>
      </div>
    </Overlay>
  )
}

export const Busy = ({ text }) => <Overlay><div className={`rounded-3xl px-12 py-8 text-3xl ${glass}`}>{text}</div></Overlay>

export const Toast = ({ t }) => (
  <div className="pointer-events-none absolute inset-x-0 top-28 z-40 flex justify-center">
    <AnimatePresence>
      {t && (
        <motion.div key={t.text} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          className={`whitespace-nowrap rounded-full px-8 py-4 text-xl ${glass}`}
          style={t.tone === 'error' ? { boxShadow: '0 0 0 2px rgba(255,90,110,.8), 0 20px 50px rgba(0,0,0,.5)' } : undefined}>
          {t.text}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
)

export const VolumePop = ({ show, volume, muted }) => (
  <div className="pointer-events-none absolute inset-x-0 bottom-28 z-40 flex justify-center">
    <AnimatePresence>
      {show && volume !== null && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          className={`flex w-[420px] items-center gap-5 rounded-full px-7 py-4 ${glass}`}>
          <VolIcon size={28} level={volume} muted={muted} />
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${volume}%`, background: muted ? 'rgba(255,255,255,.35)' : grad(90) }} /></div>
          <span className="w-12 text-right text-xl tabular-nums">{muted ? 'Mute' : volume}</span>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
)
