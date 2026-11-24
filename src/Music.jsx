import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { solid, grad, a } from './ui'
import { MusicIcon, PlayIcon, PauseIcon, PrevIcon, NextIcon } from './icons'

export const SERVICES = [
  { id: 'spotify', name: 'Spotify', sub: 'Starts the Spotify app in the background' },
  { id: 'apple', name: 'Apple Music', sub: 'Starts the Apple Music app in the background' },
  { id: 'ytmusic', name: 'YouTube Music', sub: 'Opens in your browser, keeps playing behind the shell' },
]
export const MUSIC_ROWS = 2 + SERVICES.length      // now playing, each service, Done

const EMPTY = { active: false }

// What's playing right now. Reads Windows' media session, so it works with Spotify, Apple Music, a browser tab, anything
// that shows up in the Windows volume flyout. Music keeps playing while a game runs because the app itself is separate.
export function useMedia() {
  const [media, setMedia] = useState(EMPTY)
  const dead = useRef(0)
  const refresh = useCallback(async () => {
    try { setMedia(await window.shell.media()); dead.current = 0 } catch { dead.current += 1 }
  }, [])
  useEffect(() => {
    refresh()
    const t = setInterval(() => { if (document.visibilityState !== 'hidden' && dead.current < 5) refresh() }, 5000)
    return () => clearInterval(t)
  }, [refresh])
  const command = useCallback(async (action) => {
    setMedia((m) => (action === 'toggle' && m.active ? { ...m, status: m.status === 'Playing' ? 'Paused' : 'Playing' } : m))   // instant feedback
    try { setMedia(await window.shell.mediaCmd(action)) } catch {}
    setTimeout(refresh, 900)
  }, [refresh])
  return { media, refresh, command }
}

const Section = ({ active, title, hint, children }) => (
  <motion.div animate={{ opacity: active ? 1 : 0.7 }} className="rounded-2xl p-5"
    style={active ? { background: 'rgba(255,255,255,.1)', boxShadow: `inset 0 0 0 2px rgba(255,255,255,.7), 0 0 40px ${a('p', 0.3)}` } : { background: 'rgba(255,255,255,.04)' }}>
    <div className="mb-3 flex items-center justify-between text-[13px] font-medium uppercase tracking-[0.2em] text-white/55">
      <span>{title}</span>{active && hint && <span className="normal-case tracking-normal text-white/50">{hint}</span>}
    </div>
    {children}
  </motion.div>
)

export default function MusicPanel({ media, sel, tsel, busyId }) {
  const playing = media.active && media.status === 'Playing'
  const Icons = [PrevIcon, playing ? PauseIcon : PlayIcon, NextIcon]
  return (
    <motion.div initial={{ x: 560, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 560, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      className={`absolute bottom-8 right-8 top-8 z-30 flex w-[520px] flex-col gap-3.5 rounded-[32px] p-8 ${solid}`}>
      <div>
        <h2 className="text-4xl font-semibold">Music</h2>
        <p className="mt-1 text-lg text-white/50">Plays in the background, even while you game.</p>
      </div>

      <Section active={sel === 0} title="Now playing" hint="◀ ▶ choose  ·  A press">
        <div className="flex items-center gap-5">
          <div className="grid h-[84px] w-[84px] flex-none place-items-center rounded-2xl text-white/90" style={{ background: grad(135), boxShadow: `0 10px 30px ${a('p', 0.4)}` }}>
            <MusicIcon size={38} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-2xl font-medium">{media.active ? media.title || 'Unknown track' : 'Nothing playing'}</div>
            <div className="truncate text-lg text-white/55">{media.active ? media.artist || media.album || (playing ? 'Playing' : 'Paused') : 'Start a service below'}</div>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          {Icons.map((Icon, i) => (
            <motion.div key={i} animate={{ scale: sel === 0 && tsel === i ? 1.06 : 1 }} className="grid h-16 flex-1 place-items-center rounded-xl"
              style={sel === 0 && tsel === i ? { background: grad(100), boxShadow: `0 8px 24px ${a('p', 0.4)}` } : { background: 'rgba(255,255,255,.07)' }}>
              <Icon size={28} />
            </motion.div>
          ))}
        </div>
      </Section>

      <Section active={sel >= 1 && sel <= SERVICES.length} title="Start a service" hint="A  open">
        <div className="flex flex-col gap-2.5">
          {SERVICES.map((s, i) => {
            const on = sel === i + 1
            return (
              <motion.div key={s.id} animate={{ scale: on ? 1.02 : 1 }} className="rounded-xl px-5 py-2.5"
                style={on ? { background: grad(100), boxShadow: `0 8px 24px ${a('p', 0.4)}` } : { background: 'rgba(255,255,255,.07)' }}>
                <div className="text-xl font-medium">{busyId === s.id ? 'Opening…' : s.name}</div>
                <div className={`truncate text-sm ${on ? 'text-white/80' : 'text-white/45'}`}>{s.sub}</div>
              </motion.div>
            )
          })}
        </div>
      </Section>

      <div className="mt-auto">
        <motion.div animate={{ scale: sel === MUSIC_ROWS - 1 ? 1.03 : 1 }} className="rounded-2xl py-4 text-center text-2xl font-semibold"
          style={sel === MUSIC_ROWS - 1 ? { background: grad(100), boxShadow: `0 10px 34px ${a('p', 0.5)}` } : { background: 'rgba(255,255,255,.08)' }}>Done</motion.div>
        <div className="mt-4 text-center text-base text-white/40">Up / Down choose  ·  Left / Right adjust  ·  B close</div>
      </div>
    </motion.div>
  )
}
