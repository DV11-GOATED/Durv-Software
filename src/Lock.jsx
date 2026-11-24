import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Overlay, Avatar, glass, grad, a } from './ui'

// 3 x 4 keypad. The Dashboard drives it from the d-pad (movePinSel) and A (key at `sel`).
export const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']

export function movePinSel(sel, dir) {
  let r = Math.floor(sel / 3), c = sel % 3
  if (dir === 'up') r = Math.max(0, r - 1)
  if (dir === 'down') r = Math.min(3, r + 1)
  if (dir === 'left') c = Math.max(0, c - 1)
  if (dir === 'right') c = Math.min(2, c + 1)
  return r * 3 + c
}

const label = (k) => (k === 'del' ? '⌫' : k === 'ok' ? '✓' : k)

export function PinPad({ title, sub, value, dots = 4, sel, error, lockUntil = 0, shake = 0, hint, header }) {
  const [now, setNow] = useState(Date.now())
  const wait = Math.max(0, Math.ceil((lockUntil - now) / 1000))
  useEffect(() => {
    if (lockUntil <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [lockUntil])

  const n = Math.max(dots, value.length)
  return (
    <div className="flex w-[440px] flex-col items-center">
      {header}
      <h2 className="text-4xl font-semibold">{title}</h2>
      <p className="mt-2 h-7 text-xl" style={{ color: error || wait ? 'rgb(255 120 140)' : 'rgba(255,255,255,.6)' }}>
        {wait ? `Too many attempts. Try again in ${wait}s` : error || sub}
      </p>

      <motion.div key={shake} animate={{ x: shake ? [0, -16, 16, -11, 11, -5, 5, 0] : 0 }} transition={{ duration: 0.38 }} className="my-8 flex gap-4">
        {Array.from({ length: n }, (_, i) => (
          <motion.i key={i} animate={{ scale: i < value.length ? 1.12 : 1 }} className="block h-5 w-5 rounded-full"
            style={i < value.length ? { background: grad(100), boxShadow: `0 0 16px ${a('p', 0.7)}` } : { background: 'rgba(255,255,255,.16)' }} />
        ))}
      </motion.div>

      <div className="grid grid-cols-3 gap-3" style={{ opacity: wait ? 0.35 : 1 }}>
        {PIN_KEYS.map((k, i) => {
          const active = sel === i
          return (
            <motion.div key={k} animate={{ scale: active ? 1.08 : 1 }}
              className="grid h-[84px] w-[124px] place-items-center rounded-2xl text-[34px] font-medium"
              style={active ? { background: grad(100), boxShadow: `0 10px 30px ${a('p', 0.5)}` } : { background: 'rgba(255,255,255,.08)', color: k === 'ok' || k === 'del' ? 'rgba(255,255,255,.7)' : undefined }}>
              {label(k)}
            </motion.div>
          )
        })}
      </div>
      <div className="mt-6 text-center text-base text-white/40">{hint || 'D-pad choose  ·  A press  ·  B delete'}</div>
    </div>
  )
}

// Full-screen lock shown at start-up when a PIN is set. Opaque on purpose: nothing from the library shows through.
export function LockScreen({ profile, ...pad }) {
  return (
    <div className="absolute inset-0 z-[70] grid place-items-center bg-charcoal">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(55% 62% at 90% -5%, rgb(var(--p) / .40), transparent 70%), radial-gradient(50% 58% at -3% 105%, rgb(var(--s) / .30), transparent 70%)' }} />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <PinPad {...pad}
          header={(
            <div className="mb-5 flex flex-col items-center gap-3">
              <div className="rounded-full p-[3px]" style={{ background: grad(135) }}><Avatar profile={profile} size={92} /></div>
              <div className="text-2xl text-white/80">{profile?.name || 'Player 1'}</div>
            </div>
          )}
          hint={pad.hint || 'D-pad choose  ·  A press  ·  B delete'} />
      </motion.div>
    </div>
  )
}

// PIN entry inside the normal modal frame (set / confirm / change / remove).
export function PinModal(props) {
  return (
    <Overlay>
      <div className={`rounded-[32px] px-10 py-9 ${glass}`}><PinPad {...props} /></div>
    </Overlay>
  )
}
