// The in-game overlay: a separate transparent window (see createOverlay in main.js) that floats over the running game.
// It never reads the page's Gamepad API (that goes silent whenever a game has focus). All input arrives as `NAV <name>`
// lines from the input bridge, forwarded by main.js through window.shell.onNav.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import QuickMenu from './QuickMenu'
import { KeyboardView, buildRows, moveKey } from './Keyboard'
import { useSystem } from './useSystem'
import { useMedia } from './Music'
import { Toast } from './ui'
import { applyTheme, DEFAULT_THEME } from './theme'

const SHORTCUTS = ['Durv Software', 'Switch app', 'Keyboard']
const FRESH_KB = { title: 'Type into the app', value: '', mask: false, show: false, layer: 'abc', r: 1, c: 0 }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', Escape: 'back', x: 'x', y: 'y', m: 'start' }

export default function OverlayApp() {
  const [view, setView] = useState('hidden')          // hidden | quick | keyboard | hud
  const [mouse, setMouse] = useState(false)
  const [sel, setSel] = useState(0)
  const [sc, setSc] = useState(0)
  const [kb, setKb] = useState(FRESH_KB)
  const [toast, setToast] = useState(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const sys = useSystem({ poll: false })              // no background polling while you play: refreshed only when shown
  const music = useMedia({ poll: false })
  const st = sys.status
  const toastTimer = useRef()

  const notify = (text) => { setToast({ text }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 1600) }
  const rows = ['volume', 'music', 'mouse', ...(st.brightness?.supported ? ['brightness'] : []), 'shortcuts']

  const close = () => { setView('hidden'); window.shell.overlayHide() }

  const adjust = (dir) => {
    const id = rows[sel], d = dir === 'right' ? 1 : -1
    if (id === 'volume') { if (st.volume !== null) sys.setVolume(st.volume + d * 5); else sys.volKey(d > 0 ? 'up' : 'down', 2) }
    if (id === 'brightness') sys.setBrightness(st.brightness.value + d * 5)
    if (id === 'music' && music.media.active) music.command(d > 0 ? 'next' : 'prev')
    if (id === 'shortcuts') setSc((v) => clamp(v + d, 0, SHORTCUTS.length - 1))
  }
  const confirm = () => {
    const id = rows[sel]
    if (id === 'volume') { if (st.volume !== null) sys.toggleMute(); else sys.volKey('mute') }
    if (id === 'music' && music.media.active) music.command('toggle')
    if (id === 'mouse') window.shell.mouseToggle()
    if (id === 'shortcuts') {
      if (sc === 0) window.shell.overlayHome()          // back to Durv Software
      else if (sc === 1) window.shell.overlaySwitcher() // Alt+Tab style task switcher
      else window.shell.overlayKeyboard()               // on-screen keyboard for the app underneath
    }
  }

  const pressKey = () => {
    const kr = buildRows(kb)
    const row = kr[Math.min(kb.r, kr.length - 1)]
    const k = row[Math.min(kb.c, row.length - 1)]
    const tail = (v) => v.slice(-28)
    switch (k.a) {
      case 'char': window.shell.kbType(k.v); setKb((m) => ({ ...m, value: tail(m.value + k.v), layer: m.layer === 'ABC' ? 'abc' : m.layer })); break
      case 'space': window.shell.kbType(' '); setKb((m) => ({ ...m, value: tail(m.value + ' ') })); break
      case 'bksp': window.shell.kbKey('bksp'); setKb((m) => ({ ...m, value: m.value.slice(0, -1) })); break
      case 'shift': setKb((m) => ({ ...m, layer: m.layer === 'abc' ? 'ABC' : 'abc' })); break
      case 'sym': setKb((m) => ({ ...m, layer: m.layer === 'sym' ? 'abc' : 'sym' })); break
      default: close()                                   // "Done"
    }
  }

  const onNav = (name) => {
    if (view === 'keyboard') {
      if (['up', 'down', 'left', 'right'].includes(name)) return setKb((m) => moveKey(m, name))
      if (name === 'confirm') return pressKey()
      if (name === 'x') { window.shell.kbKey('bksp'); return setKb((m) => ({ ...m, value: m.value.slice(0, -1) })) }
      if (name === 'y') { window.shell.kbType(' '); return setKb((m) => ({ ...m, value: (m.value + ' ').slice(-28) })) }
      if (name === 'start') { window.shell.kbKey('enter'); return close() }      // Enter, then put the keyboard away
      if (name === 'back') return close()
      return
    }
    if (view !== 'quick') return
    if (name === 'up' || name === 'down') return setSel((v) => clamp(v + (name === 'down' ? 1 : -1), 0, rows.length - 1))
    if (name === 'left' || name === 'right') return adjust(name)
    if (name === 'confirm') return confirm()
    if (name === 'back') return close()
  }
  const navRef = useRef(onNav)
  navRef.current = onNav

  useEffect(() => {
    window.shell.boot().then((b) => applyTheme({ ...DEFAULT_THEME, ...b.theme })).catch(() => {})
    window.shell.mouseGet().then(setMouse).catch(() => {})
    window.shell.onMouse(setMouse)
    window.shell.onHud(notify)
    window.shell.onNav((n) => navRef.current(n))
    window.shell.onOverlayShow((d) => {
      setMouse(!!d.mouse)
      if (d.view === 'quick') {
        setSel(0); setSc(0); setView('quick')
        sys.refresh(); sys.refreshPad(); music.refresh()
        window.shell.boot().then((b) => applyTheme({ ...DEFAULT_THEME, ...b.theme })).catch(() => {})
      } else if (d.view === 'keyboard') { setKb(FRESH_KB); setView('keyboard') }
      else if (d.view === 'hud') { setView('hud'); if (d.text) notify(d.text) }
    })
    const onKey = (e) => { const n = KEYMAP[e.key]; if (n) { e.preventDefault(); navRef.current(n) } }     // keyboard for development
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', f)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', f) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const scale = Math.min(vp.h / 1080, vp.w / 1700)
  return (
    <div className="relative overflow-hidden text-white" style={{ width: vp.w / scale, height: vp.h / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
      {view === 'quick' && <div className="absolute inset-0 bg-black/35" />}
      <AnimatePresence>
        {view === 'quick' && (
          <QuickMenu key="q" status={st} rows={rows} sel={sel} sc={sc} media={music.media} pad={sys.pad} mouse={mouse}
            shortcuts={SHORTCUTS} footer="Up / Down choose  ·  B close" />
        )}
        {view === 'keyboard' && <KeyboardView key="kb" m={kb} dock hint="A type  ·  X delete  ·  Y space  ·  Start enter  ·  B close" />}
      </AnimatePresence>
      <Toast t={toast} />
    </div>
  )
}
