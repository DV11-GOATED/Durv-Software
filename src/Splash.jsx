import { useEffect } from 'react'
import { motion } from 'framer-motion'

const BRAND = 'Durv Software'
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1]

function chime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx()
    ;[261.6, 392, 523.3, 659.3].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + 1.15 + i * 0.07
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.07, t + 0.15)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 2.3)
    })
    setTimeout(() => ctx.close().catch(() => {}), 3800)
  } catch {}
}

export default function Splash({ onDone, sound }) {
  useEffect(() => {
    if (sound) chime()
    const t = setTimeout(() => onDone?.(), 4000)
    return () => clearTimeout(t)
  }, [onDone, sound])

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[#0b0c0f] select-none"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
    >
      {/* Subtle radial ambient glow */}
      <motion.div
        className="pointer-events-none absolute h-[420px] w-[620px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--p) / 0.16) 0%, rgb(var(--s) / 0.08) 45%, transparent 70%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.9, 0.65], scale: [0.6, 1.1, 1] }}
        transition={{ duration: 2.2, ease: EASE_OUT_EXPO }}
      />

      {/* Precision perspective micro-grid */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 46% 36% at 50% 50%, black 20%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 46% 36% at 50% 50%, black 20%, transparent 75%)',
        }}
        initial={{ opacity: 0, scale: 1.15 }}
        animate={{ opacity: [0, 1, 0.7], scale: 1 }}
        transition={{ delay: 0.35, duration: 1.4, ease: EASE_OUT_EXPO }}
      />

      {/* Center horizon laser line */}
      <motion.div
        className="pointer-events-none absolute h-[1px] w-[min(560px,86vw)]"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgb(var(--p)), rgb(var(--s)), transparent)',
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1, 0.85], opacity: [0, 1, 0] }}
        transition={{ duration: 1.25, ease: EASE_OUT_EXPO }}
      />

      {/* Rectangular shockwave on core lock-in */}
      <motion.div
        className="pointer-events-none absolute h-[148px] w-[min(480px,84vw)] rounded-xl border"
        style={{
          borderColor: 'rgb(var(--p) / 0.5)',
          boxShadow: '0 0 40px rgb(var(--p) / 0.2)',
        }}
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: [0.82, 1.08], opacity: [0, 0.8, 0] }}
        transition={{ delay: 1.1, duration: 1.1, ease: 'easeOut' }}
      />

      {/* Main Architectural Shell Container */}
      <div className="relative flex h-[148px] w-[min(480px,84vw)] flex-col items-center justify-center">
        {/* Top-Left Corner Bracket */}
        <motion.span
          className="pointer-events-none absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2"
          style={{ borderColor: 'rgb(var(--p))' }}
          initial={{ x: -36, y: -24, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.9, ease: EASE_OUT_EXPO }}
        />

        {/* Top-Right Corner Bracket */}
        <motion.span
          className="pointer-events-none absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2"
          style={{ borderColor: 'rgb(var(--s))' }}
          initial={{ x: 36, y: -24, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.9, ease: EASE_OUT_EXPO }}
        />

        {/* Bottom-Left Corner Bracket */}
        <motion.span
          className="pointer-events-none absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2"
          style={{ borderColor: 'rgb(var(--s))' }}
          initial={{ x: -36, y: 24, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.9, ease: EASE_OUT_EXPO }}
        />

        {/* Bottom-Right Corner Bracket */}
        <motion.span
          className="pointer-events-none absolute right-0 bottom-0 h-5 w-5 border-r-2 border-b-2"
          style={{ borderColor: 'rgb(var(--p))' }}
          initial={{ x: 36, y: 24, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.9, ease: EASE_OUT_EXPO }}
        />

        {/* Central Kernel Spark */}
        <motion.div
          className="pointer-events-none absolute h-2.5 w-2.5 rotate-45"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--p)), rgb(var(--s)))',
            boxShadow: '0 0 24px 6px rgb(var(--p) / 0.85)',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.4, 0],
            opacity: [0, 1, 0],
          }}
          transition={{ delay: 0.95, duration: 0.65, ease: 'easeInOut' }}
        />

        {/* Staggered Character Reveal for "Durv Software" */}
        <div className="flex items-center justify-center overflow-hidden px-4">
          <h1 className="flex items-center text-3xl font-light tracking-[0.18em] text-white sm:text-4xl">
            {BRAND.split('').map((char, i) => (
              <motion.span
                key={i}
                className={char === ' ' ? 'w-3 sm:w-4' : 'inline-block'}
                initial={{
                  opacity: 0,
                  y: 14,
                  filter: 'blur(8px)',
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  filter: 'blur(0px)',
                }}
                transition={{
                  delay: 1.25 + i * 0.045,
                  duration: 0.55,
                  ease: EASE_OUT_EXPO,
                }}
              >
                {char}
              </motion.span>
            ))}

            {/* Blinking Terminal Cursor */}
            <motion.span
              className="ml-1.5 inline-block h-6 w-[2px] sm:h-7"
              style={{ backgroundColor: 'rgb(var(--p))' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0, 1, 0, 1] }}
              transition={{
                delay: 1.85,
                duration: 1.6,
                times: [0, 0.15, 0.35, 0.55, 0.75, 1],
              }}
            />
          </h1>
        </div>

        {/* Hairline Bottom Boot Progress Bar */}
        <div className="absolute bottom-3 h-[2px] w-28 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full w-full origin-left"
            style={{
              background: 'linear-gradient(90deg, rgb(var(--p)), rgb(var(--s)))',
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.2, duration: 2.1, ease: EASE_OUT_EXPO }}
          />
        </div>
      </div>
    </motion.div>
  )
}