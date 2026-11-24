import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TileFace, a, grad } from './ui'

const SIZE = 320

// Full-screen "starting your game" view. It stays up until the main process sees the game's own window
// (state 'ready'), so there's never a gap showing the home screen between pressing A and the game appearing.
export default function LoadingScreen({ g, ready, wallpaper }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const status = ready ? 'Ready' : secs < 8 ? 'Starting…' : secs < 25 ? 'Still loading. Some games take a while.' : 'Waiting for the game window…'
  const bg = g.wallpaper || wallpaper
  const glow = g.accent ? `0 30px 100px ${g.accent}99` : `0 30px 100px ${a('p', 0.6)}, 0 0 180px ${a('s', 0.3)}`

  return (
    <motion.div className="absolute inset-0 z-[60] overflow-hidden bg-charcoal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      {bg && <div className="absolute inset-0 opacity-30" style={{ background: `url("${bg}") center/cover` }} />}
      <div className="absolute inset-0" style={{ background: g.accent
        ? `radial-gradient(60% 60% at 50% 42%, ${g.accent}44, transparent 70%)`
        : 'radial-gradient(60% 60% at 50% 42%, rgb(var(--p) / .38), transparent 70%), radial-gradient(45% 50% at 85% 100%, rgb(var(--s) / .28), transparent 70%)' }} />
      <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-transparent to-charcoal/50" />

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* the tile zooms in from roughly where it sat in the row, then breathes while we wait */}
        <motion.div initial={{ scale: 0.55, opacity: 0.4, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 22 }}>
          <motion.div animate={{ scale: ready ? 1.04 : [1, 1.025, 1] }} transition={ready ? { duration: 0.4 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="relative" style={{ width: SIZE, height: SIZE, borderRadius: 40, boxShadow: `0 0 0 3px rgba(255,255,255,.95), ${glow}` }}>
            <TileFace g={g} size={SIZE} radius={40} />
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-12 text-center">
          <div className="text-[44px] font-semibold leading-none tracking-tight">{g.name}</div>
          <div className="mt-3 h-8 text-2xl text-white/60">{status}</div>
        </motion.div>

        <div className="relative mt-8 h-[6px] w-[380px] overflow-hidden rounded-full bg-white/15">
          {ready
            ? <motion.div initial={{ width: '30%' }} animate={{ width: '100%' }} transition={{ duration: 0.4 }} className="h-full rounded-full" style={{ background: grad(90) }} />
            : <motion.div animate={{ x: ['-100%', '280%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }} className="absolute inset-y-0 w-1/3 rounded-full" style={{ background: grad(90) }} />}
        </div>
      </div>

      {!ready && (
        <div className="absolute inset-x-0 bottom-10 flex justify-center">
          <span className="flex items-center gap-2 text-[15px] text-white/55">
            <b className="grid h-6 min-w-6 place-items-center rounded-full border border-white/30 bg-white/10 px-1.5 text-[11px] font-semibold">B</b>Cancel
          </span>
        </div>
      )}
    </motion.div>
  )
}
