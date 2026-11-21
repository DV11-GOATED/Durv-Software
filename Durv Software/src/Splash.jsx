import { useEffect } from 'react'
import { motion } from 'framer-motion'

const ORBS = [['#8b5cff', -1, -1], ['#22e6ff', 1, -1], ['#ff3cac', 1, 1], ['#ffc93c', -1, 1]]

// Original startup sequence: four light orbs spiral in, merge, bloom into a ring, then the name settles.
function chime() {
  try {
    const ctx = new AudioContext()
    ;[261.6, 392, 523.3, 659.3].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      const t = ctx.currentTime + 1.5 + i * 0.07
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.07, t + 0.15)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 2.3)
    })
  } catch {}
}

export default function Splash({ onDone, sound }) {
  useEffect(() => {
    if (sound) chime()
    const t = setTimeout(onDone, 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#0b0c0f]" exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      {ORBS.map(([c, sx, sy], i) => (
        <motion.div key={c} className="absolute rounded-full"
          style={{ width: 26, height: 26, background: c, boxShadow: `0 0 40px 12px ${c}88` }}
          initial={{ x: sx * 460, y: sy * 280, opacity: 0, scale: 0.4 }}
          animate={{ x: [sx * 460, sx * 140, 0], y: [sy * 280, sy * -70, 0], opacity: [0, 1, 1], scale: [0.4, 1, 1.5] }}
          transition={{ duration: 1.6, delay: i * 0.12, ease: 'easeInOut' }} />
      ))}
      <motion.div className="absolute rounded-full border-2 border-white"
        style={{ width: 120, height: 120, boxShadow: '0 0 60px rgba(255,255,255,.5)' }}
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 7], opacity: [0, 1, 0] }}
        transition={{ delay: 1.7, duration: 1.2, ease: 'easeOut' }} />
      <motion.h1 className="text-5xl font-light text-white"
        initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.22em' }}
        transition={{ delay: 2, duration: 1.1 }}>
        ConsoleShell
      </motion.h1>
    </motion.div>
  )
}
