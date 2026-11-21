import { useEffect, useRef, useState } from 'react'

const DEADZONE = 0.55, FIRST_DELAY = 380, REPEAT = 130
const DIRS = ['up', 'down', 'left', 'right']
const HANDLER = { confirm: 'onConfirm', back: 'onBack', y: 'onY', start: 'onStart' }
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', Escape: 'back', y: 'y', m: 'start' }

/**
 * Standard mapping (Xbox / DualShock / DualSense):
 * D-pad 12-15, left stick axes 0/1, A/Cross 0 = confirm, B/Circle 1 = back, Y/Triangle 3, Start/Options 9.
 * Handlers: { onMove(dir), onConfirm, onBack, onY, onStart }. Keyboard: arrows, Enter, Esc, Y, M.
 */
export function useGamepadNav(handlers) {
  const ref = useRef(handlers)
  ref.current = handlers
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const held = {}
    let raf
    const emit = (name) => {
      const h = ref.current
      if (DIRS.includes(name)) h.onMove?.(name)
      else h[HANDLER[name]]?.()
    }
    const tick = (now) => {
      const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean)
      setConnected(pads.length > 0)
      const down = new Set()
      for (const p of pads) {
        const b = (i) => p.buttons[i]?.pressed
        const x = p.axes[0] || 0, y = p.axes[1] || 0
        if (b(12) || y < -DEADZONE) down.add('up')
        if (b(13) || y > DEADZONE) down.add('down')
        if (b(14) || x < -DEADZONE) down.add('left')
        if (b(15) || x > DEADZONE) down.add('right')
        if (b(0)) down.add('confirm')
        if (b(1)) down.add('back')
        if (b(3)) down.add('y')
        if (b(9)) down.add('start')
      }
      for (const name of [...DIRS, ...Object.keys(HANDLER)]) {
        const h = held[name]
        if (down.has(name)) {
          if (!h) { held[name] = { start: now, last: now }; emit(name) }
          else if (DIRS.includes(name) && now - h.start > FIRST_DELAY && now - h.last > REPEAT) { h.last = now; emit(name) }
        } else if (h) delete held[name]
      }
      raf = requestAnimationFrame(tick)
    }
    const onKey = (e) => { const n = KEYMAP[e.key]; if (n) { e.preventDefault(); emit(n) } }
    window.addEventListener('keydown', onKey)
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey) }
  }, [])

  return { connected }
}
