import { motion } from 'framer-motion'
import { Overlay, glass, grad, a } from './ui'

const ROWS = {
  abc: ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm.-_'],
  sym: ['!@#$%^&*()', '[]{}<>\\|~`', '-_=+;:/?"\'', ',.!?*&%$#@'],
}
const ch = (s, up) => [...s].map((c) => ({ a: 'char', v: up ? c.toUpperCase() : c, l: up ? c.toUpperCase() : c }))

// Pure helpers so the Dashboard can drive the keyboard from controller input.
export function buildRows(m) {
  const layer = m.layer
  const rows = (layer === 'sym' ? ROWS.sym : ROWS.abc).map((r) => ch(r, layer === 'ABC'))
  rows.push([
    { a: 'shift', l: '⇧' },
    { a: 'sym', l: layer === 'sym' ? 'abc' : '#+=' },
    { a: 'space', l: 'space', w: 5 },
    { a: 'bksp', l: '⌫' },
    ...(m.mask ? [{ a: 'show', l: m.show ? 'Hide' : 'Show', w: 1.3 }] : []),
    { a: 'done', l: 'Done', w: 1.6 },
  ])
  return rows
}

export function moveKey(m, dir) {
  const rows = buildRows(m)
  let { r, c } = m
  if (dir === 'up') r = Math.max(0, r - 1)
  if (dir === 'down') r = Math.min(rows.length - 1, r + 1)
  if (dir === 'left') c = Math.max(0, c - 1)
  if (dir === 'right') c = Math.min(rows[r].length - 1, c + 1)
  return { ...m, r, c: Math.min(c, rows[r].length - 1) }
}

export function pressKey(m) {
  const rows = buildRows(m)
  const k = rows[Math.min(m.r, rows.length - 1)][Math.min(m.c, rows[Math.min(m.r, rows.length - 1)].length - 1)]
  switch (k.a) {
    case 'char': return { m: { ...m, value: m.value + k.v, layer: m.layer === 'ABC' ? 'abc' : m.layer } }
    case 'shift': return { m: { ...m, layer: m.layer === 'abc' ? 'ABC' : 'abc' } }
    case 'sym': return { m: { ...m, layer: m.layer === 'sym' ? 'abc' : 'sym' } }
    case 'space': return { m: { ...m, value: m.value + ' ' } }
    case 'bksp': return { m: { ...m, value: m.value.slice(0, -1) } }
    case 'show': return { m: { ...m, show: !m.show } }
    default: return { submit: true }
  }
}

export function KeyboardView({ m }) {
  const rows = buildRows(m)
  const shown = m.mask && !m.show ? '•'.repeat(m.value.length) : m.value
  return (
    <Overlay>
      <div className={`w-[980px] rounded-[32px] p-9 ${glass}`}>
        <h2 className="text-3xl font-semibold">{m.title}</h2>
        <div className="mt-5 flex h-16 items-center rounded-2xl bg-black/35 px-6 text-3xl">
          <span className="truncate">{shown}</span>
          <motion.i animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} className="ml-1 inline-block h-8 w-[3px] rounded" style={{ background: a('s') }} />
        </div>
        <div className="mt-5 flex flex-col gap-2.5">
          {rows.map((row, r) => (
            <div key={r} className="flex gap-2.5">
              {row.map((k, c) => {
                const active = m.r === r && m.c === c
                return (
                  <motion.div key={c} animate={{ scale: active ? 1.06 : 1 }} style={{ flex: k.w || 1, ...(active ? { background: grad(100), boxShadow: `0 8px 26px ${a('p', 0.5)}` } : { background: 'rgba(255,255,255,.08)' }) }}
                    className="grid h-14 place-items-center rounded-xl text-2xl font-medium">{k.l}</motion.div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-5 text-center text-base text-white/45">A type  ·  X delete  ·  Y space  ·  Menu done  ·  B cancel</div>
      </div>
    </Overlay>
  )
}
