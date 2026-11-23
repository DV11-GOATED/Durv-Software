import { useEffect, useRef, useState } from 'react'

const DEADZONE = 0.55, FIRST_DELAY = 380, REPEAT = 130
const DIRS = ['up', 'down', 'left', 'right']
const REPEATING = [...DIRS, 'lb', 'rb']
const HANDLER = { confirm: 'onConfirm', back: 'onBack', y: 'onY', x: 'onX', start: 'onStart', quick: 'onQuick' }
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', Escape: 'back', y: 'y', x: 'x', m: 'start', q: 'quick', '[': 'lb', ']': 'rb' }

/**
 * Standard mapping (Xbox / DualShock / DualSense):
 * D-pad 12-15, left stick axes 0/1, A/Cross 0, B/Circle 1, X/Square 2, Y/Triangle 3,
 * LB/RB 4/5, View/Select 8, Menu/Start 9, Guide/PS 16.
 * Handlers: onMove(dir) onConfirm onBack onX onY onStart onQuick onBumper(-1|1)
 * Keyboard for dev: arrows, Enter, Esc, X, Y, M (menu), Q (quick), [ ] (bumpers).
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
      else if (name === 'lb') h.onBumper?.(-1)
      else if (name === 'rb') h.onBumper?.(1)
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
        if (b(2)) down.add('x')
        if (b(3)) down.add('y')
        if (b(4)) down.add('lb')
        if (b(5)) down.add('rb')
        if (b(8) || b(16)) down.add('quick')
        if (b(9)) down.add('start')
      }
      for (const name of [...REPEATING, ...Object.keys(HANDLER)]) {
        const h = held[name]
        if (down.has(name)) {
          if (!h) { held[name] = { start: now, last: now }; emit(name) }
          else if (REPEATING.includes(name) && now - h.start > FIRST_DELAY && now - h.last > REPEAT) { h.last = now; emit(name) }
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
