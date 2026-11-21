import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGamepadNav } from './useGamepadNav'
import Splash from './Splash'
import { Tile, TopBar, Widgets, Prompts, Menu, Browser, Confirm, Busy, TILE, GAP } from './ui'

const SYS = [
  { id: '__settings', kind: 'settings', name: 'Settings', sub: 'Library, folders and files' },
  { id: '__power', kind: 'power', name: 'Power', sub: 'Sleep, restart, shut down' },
]
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default function Dashboard() {
  const [data, setData] = useState(null)       // { config, games, storage }
  const [splash, setSplash] = useState(true)
  const [idx, setIdx] = useState(0)
  const [modal, setModal] = useState(null)

  const items = useMemo(() => [...(data?.games || []), ...SYS], [data])
  const i = Math.min(idx, items.length - 1)
  const item = items[i]
  const isGame = !item.kind

  useEffect(() => {
    window.shell.state().then((d) => { setData(d); if (d.config.startupAnimation === false) setSplash(false) })
    window.shell.onReturn(() => setModal(null))
  }, [])

  // First run only: setupComplete in config.json is false until a folder is chosen (or skipped).
  useEffect(() => {
    if (data && !data.config.setupComplete && !splash && !modal) window.shell.setupDefaults().then((def) => setModal({ type: 'setup', sel: 0, def }))
  }, [data, splash])

  const busy = async (fn, text = 'Working…') => { setModal({ type: 'busy', text }); try { setData(await fn()) } finally { setModal(null) } }
  const setFolder = (dir) => busy(() => window.shell.setFolder(dir), 'Scanning games…')
  const browse = async (base, dir) => { const r = await window.shell.fsList(dir, base.mode); setModal({ type: 'browser', ...base, ...r, sel: 0 }) }
  const openBrowser = async (mode, onPick, title) => browse({ mode, onPick, title, prev: modal }, await window.shell.fsStart(mode))
  const pickArt = (g, kind) => openBrowser('image', (f) => busy(() => window.shell.setArt(g.id, kind, f), 'Saving artwork…'), kind === 'tile' ? 'Choose a tile image' : 'Choose a wallpaper')
  const ask = (name, power, sub) => setModal({ type: 'confirm', sel: 0, item: { name, power, sub } })

  const rowsFor = (m) => {
    switch (m.type) {
      case 'setup': return [
        ...(m.def ? [{ label: `Use ${m.def}`, sub: 'Found on this PC', run: () => setFolder(m.def) }] : []),
        { label: 'Browse folders…', run: () => openBrowser('folder', setFolder, 'Choose your games folder') },
        { label: 'Skip for now', sub: 'Set it later in Settings', run: () => setFolder(null) },
      ]
      case 'settings': return [
        { label: 'Change games folder', sub: data?.config.gamesFolders.join(', ') || 'Not set', run: () => openBrowser('folder', setFolder, 'Choose your games folder') },
        { label: 'Rescan library', run: () => busy(window.shell.rescan, 'Scanning games…') },
        { label: 'Open config folder', sub: 'config.json, overrides.json, apps.json', run: () => { window.shell.openConfig(); setModal(null) } },
        { label: 'Close', run: () => setModal(null) },
      ]
      case 'power': return [
        { label: 'Sleep', run: () => { window.shell.power('sleep'); setModal(null) } },
        { label: 'Restart', run: () => ask('Restart', 'restart', 'Closes everything and reboots. Unsaved work is lost.') },
        { label: 'Shut down', run: () => ask('Shut down', 'shutdown', 'Force-closes apps and powers off. Unsaved work is lost.') },
        { label: 'Desktop', sub: 'Exit to Windows', run: () => { window.shell.power('desktop'); setModal(null) } },
        { label: 'Cancel', run: () => setModal(null) },
      ]
      case 'art': return [
        { label: 'Set tile image', run: () => pickArt(m.game, 'tile') },
        { label: 'Set wallpaper', run: () => pickArt(m.game, 'wallpaper') },
        { label: 'Reset artwork', run: () => busy(() => window.shell.resetArt(m.game.id)) },
        { label: 'Hide from library', sub: 'Undo in overrides.json', run: () => busy(() => window.shell.hide(m.game.id)) },
        { label: 'Close', run: () => setModal(null) },
      ]
      case 'browser': return [
        ...(m.mode === 'folder' && m.dir ? [{ kind: 'pick', label: 'Use this folder', sub: m.dir, run: () => m.onPick(m.dir) }] : []),
        ...(m.dir ? [{ kind: 'up', label: '‹  Up one level', run: () => browse(m, m.parent) }] : []),
        ...m.entries.map((e) => ({ kind: e.dir ? 'dir' : 'file', label: (e.dir ? '▸  ' : '') + e.name, run: () => (e.dir ? browse(m, e.path) : m.onPick(e.path)) })),
      ]
      default: return []
    }
  }
  const rows = modal ? rowsFor(modal) : []

  const activate = (g) => {
    if (g.kind === 'settings') setModal({ type: 'settings', sel: 0 })
    else if (g.kind === 'power') setModal({ type: 'power', sel: 0 })
    else window.shell.launch(g.id)
  }

  const { connected } = useGamepadNav({
    onMove: (dir) => {
      if (splash || modal?.type === 'busy') return
      if (!modal) return setIdx((x) => clamp(x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), 0, items.length - 1))
      if (modal.type === 'confirm') return setModal((m) => ({ ...m, sel: dir === 'left' ? 0 : dir === 'right' ? 1 : m.sel }))
      if (dir === 'up' || dir === 'down') setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, rows.length - 1) }))
    },
    onConfirm: () => {
      if (splash) return setSplash(false)
      if (!modal) return activate(item)
      if (modal.type === 'busy') return
      if (modal.type === 'confirm') { if (modal.sel === 1) window.shell.power(modal.item.power); return setModal(null) }
      rows[modal.sel]?.run()
    },
    onBack: () => {
      if (splash) return setSplash(false)
      if (!modal || modal.type === 'busy' || modal.type === 'setup') return
      setModal(modal.type === 'browser' ? modal.prev : null)
    },
    onY: () => { if (!splash && !modal && isGame) setModal({ type: 'art', sel: 0, game: item }) },
    onStart: () => { if (!splash && !modal) setModal({ type: 'settings', sel: 0 }) },
  })

  const folder = data?.config.gamesFolders[0]
  const modalEl = !modal ? null : modal.type === 'confirm' ? <Confirm key="c" item={modal.item} sel={modal.sel} />
    : modal.type === 'busy' ? <Busy key="b" text={modal.text} />
    : modal.type === 'browser' ? <Browser key="br" title={modal.title} dir={modal.dir} rows={rows} sel={modal.sel} />
    : <Menu key={modal.type} rows={rows} sel={modal.sel}
        title={{ setup: 'Welcome', settings: 'Settings', power: 'Power', art: modal.game?.name }[modal.type]}
        sub={{ setup: 'Pick the folder that holds your games. ConsoleShell scans it for .exe files and remembers your choice.', art: `ID for overrides.json: ${modal.game?.id}` }[modal.type]} />

  return (
    <div className="relative h-full w-full overflow-hidden bg-charcoal text-white">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1b21] to-[#0d0e12]" />
      <AnimatePresence>
        <motion.div key={item.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}
          style={{ background: item.wallpaper ? `url("${item.wallpaper}") center/cover` : `radial-gradient(80% 70% at 78% 12%, ${item.accent || '#2b2d38'}55, transparent 70%)` }} />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/20 to-charcoal/50" />

      <TopBar />

      <motion.div className="absolute flex items-start" style={{ top: 170, gap: GAP }}
        animate={{ x: 230 - i * (TILE + GAP) }} transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
        {items.map((g, n) => <Tile key={g.id} g={g} focused={n === i} />)}
      </motion.div>

      <Widgets games={data?.games.filter((g) => g.type === 'exe').length ?? 0} folder={folder} storage={data?.storage} connected={connected} />
      <Prompts mode={splash ? null : modal ? 'modal' : 'home'} canArt={isGame} />

      <AnimatePresence mode="wait">{modalEl}</AnimatePresence>
      <AnimatePresence>{splash && <Splash sound={data?.config.startupSound !== false} onDone={() => setSplash(false)} />}</AnimatePresence>
    </div>
  )
}
