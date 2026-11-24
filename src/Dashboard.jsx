import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGamepadNav } from './useGamepadNav'
import { useSystem } from './useSystem'
import Splash from './Splash'
import Appearance from './Appearance'
import QuickMenu from './QuickMenu'
import MusicPanel, { useMedia, SERVICES, MUSIC_ROWS } from './Music'
import { LockScreen, PinModal, PIN_KEYS, movePinSel } from './Lock'
import LoadingScreen from './Loading'
import { KeyboardView, pressKey, moveKey } from './Keyboard'
import { Tile, TopBar, Widgets, Prompts, Menu, Browser, Confirm, Busy, Toast, VolumePop, Avatar, grad, TILE, GAP } from './ui'
import { PRESETS, DEFAULT_THEME, applyTheme, shiftHue } from './theme'
import { sfx } from './sfx'

const SYS = [
  { id: '__settings', kind: 'settings', name: 'Settings', sub: 'Library, folders and files' },
  { id: '__power', kind: 'power', name: 'Power', sub: 'Sleep, restart, shut down' },
]
const SORTS = [['recent', 'Recently played'], ['playtime', 'Most played'], ['name', 'Name']]
const APPEARANCE_ROWS = 6
const FRESH_PIN = { purpose: 'unlock', value: '', sel: 4, err: '', shake: 0, lockUntil: 0, busy: false }
const newPin = (purpose, extra = {}) => ({ type: 'pin', purpose, value: '', sel: 4, err: '', shake: 0, lockUntil: 0, busy: false, ...extra })
const DEFAULT_PROFILE = { name: 'Player 1', avatar: null, wallpaper: null }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const padLabel = () => {
  const p = [...(navigator.getGamepads?.() || [])].find(Boolean)
  return p ? p.id.replace(/\s*\(.*\)\s*$/, '').trim() : ''
}

const padIds = () => {
  const p = [...(navigator.getGamepads?.() || [])].find(Boolean)
  const m = p && /Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i.exec(p.id)
  return m ? `${m[1]}:${m[2]}` : ''
}

export default function Dashboard() {
  const [boot, setBoot] = useState(null)       // first-frame info: { theme, config, security, profile }
  const [data, setData] = useState(null)       // { config, games, storage, theme, profile, security }
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [splash, setSplash] = useState(true)
  const [skipTok, setSkipTok] = useState(0)
  const [security, setSecurity] = useState({ pinSet: false, pinLen: 0, prompted: true })
  const [locked, setLocked] = useState(false)
  const [lockPin, setLockPin] = useState(FRESH_PIN)
  const [focusTop, setFocusTop] = useState(false)   // profile chip in the top bar has focus
  const [launching, setLaunching] = useState(null)  // { g, ready } while the loading screen is up
  const [musicBusy, setMusicBusy] = useState(null)
  const [idx, setIdx] = useState(0)
  const [modal, setModal] = useState(null)
  const [awake, setAwake] = useState(true)     // button-hint dock visibility
  const [toast, setToast] = useState(null)
  const [volShow, setVolShow] = useState(false)
  const dirty = useRef(false)
  const timers = useRef({})
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  const sys = useSystem()
  const st = sys.status
  const music = useMedia()
  const lockedRef = useRef(false)
  lockedRef.current = locked
  const profile = data?.profile || boot?.profile || DEFAULT_PROFILE

  const items = useMemo(() => [...(data?.games || []), ...SYS], [data])
  const i = Math.min(idx, items.length - 1)
  const item = items[i]
  const isGame = !item.kind

  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const scale = Math.min(vp.h / 1080, vp.w / 1700)   // UI is designed at 1080p; this keeps it identical at any size or Windows scaling

  // ---------- theme ----------
  const edit = (t) => { dirty.current = true; setTheme(t) }
  useEffect(() => {
    applyTheme(theme)
    sfx.enabled = theme.sounds !== false
    if (!dirty.current) return
    const t = setTimeout(() => window.shell.setTheme(theme), 400)
    return () => clearTimeout(t)
  }, [theme])

  // ---------- small helpers ----------
  const later = (key, fn, ms) => { clearTimeout(timers.current[key]); timers.current[key] = setTimeout(fn, ms) }
  const poke = () => { setAwake(true); later('awake', () => setAwake(false), 4500) }
  const notify = (text, tone = 'info') => { setToast({ text, tone }); later('toast', () => setToast(null), 3200); if (tone === 'error') sfx.error() }
  const flashVol = () => { setVolShow(true); later('vol', () => setVolShow(false), 1500) }
  const open = (m) => setModal({ ...m, prev: modal })           // open a modal; B returns to the one we came from

  useEffect(() => {
    // Fast path: theme + PIN state before the first frame, so the startup animation uses the right colours and the lock can't be skipped.
    window.shell.boot().then((b) => {
      setBoot(b)
      setTheme({ ...DEFAULT_THEME, ...b.theme })
      setSecurity(b.security)
      if (b.config.startupAnimation === false) setSplash(false)
      if (b.security.pinSet) { setLocked(true); setLockPin({ ...FRESH_PIN, lockUntil: Date.now() + (b.security.lockedFor || 0) }) }
    }).catch(() => setBoot({ theme: DEFAULT_THEME, config: { startupAnimation: false }, security: security, profile: DEFAULT_PROFILE }))
    window.shell.state().then((d) => { setData(d); if (!dirty.current) setTheme((t) => ({ ...DEFAULT_THEME, ...d.theme })) })
      .catch(() => notify('Could not load your library', 'error'))
    window.shell.onReturn(() => { setModal((m) => (lockedRef.current ? m : null)); setLaunching(null); setFocusTop(false); sys.refresh(); music.refresh() })
    window.shell.onGame(({ state }) => {
      if (state === 'ready') { setLaunching((l) => (l ? { ...l, ready: true } : l)); later('ld', () => setLaunching(null), 900) }
      else if (state === 'timeout') { setLaunching(null); notify('That is taking longer than expected. It may still be starting.', 'error') }
    })
    poke()
  }, [])
  useEffect(() => { if (data?.security) setSecurity(data.security) }, [data])

  // First run, in order: offer a PIN (skippable), then pick the games folder.
  useEffect(() => {
    if (!data || !boot || splash || modal || locked || launching) return
    if (!security.prompted && !security.pinSet) { setModal({ type: 'pinoffer', sel: 0 }); return }
    if (!data.config.setupComplete) window.shell.setupDefaults().then((def) => setModal((m) => m ?? { type: 'setup', sel: 0, def }))
  }, [data, boot, splash, modal, locked, launching, security])

  // ---------- actions ----------
  const busy = async (fn, text = 'Working…', after = null) => {     // `after`: modal to come back to (keeps menus open)
    setModal({ type: 'busy', text })
    try { setData(await fn()) } catch { notify('Something went wrong', 'error') } finally { setModal(after) }
  }
  const setFolder = (dir) => busy(() => window.shell.setFolder(dir), 'Scanning games…')
  const browse = async (base, dir) => { const r = await window.shell.fsList(dir, base.mode); setModal({ type: 'browser', ...base, ...r, sel: 0 }) }
  const openBrowser = async (mode, onPick, title) => browse({ mode, onPick, title, prev: modal }, await window.shell.fsStart(mode))
  const pickArt = (g, kind) => openBrowser('image', (f) => busy(() => window.shell.setArt(g.id, kind, f), 'Saving artwork…'), kind === 'tile' ? 'Choose a tile image' : 'Choose a wallpaper')
  const ask = (name, power, sub) => open({ type: 'confirm', sel: 0, item: { name, power, sub } })
  const keyboard = (title, onSubmit, mask = false, initial = '') => open({ type: 'keyboard', title, value: initial, mask, show: false, layer: 'abc', r: 1, c: 0, onSubmit })

  // The loading screen goes up first; the main process tells us when the game's own window is there ('shell:game' ready).
  const launch = async (g) => {
    if (launching) return
    setLaunching({ g, ready: false })
    const r = await window.shell.launch(g.id).catch(() => ({ ok: false, error: 'Could not start it' }))
    if (!r.ok) { setLaunching(null); notify(r.error || 'Could not start it', 'error') }
  }
  const cancelLaunch = () => { window.shell.cancelLaunch(); setLaunching(null) }

  // ---------- PIN ----------
  const pinState = locked ? lockPin : modal?.type === 'pin' ? modal : null
  const setPinState = (fn) => (locked ? setLockPin(fn) : setModal(fn))
  const pinFail = (r) => {
    sfx.error()
    setPinState((x) => ({ ...x, busy: false, value: '', shake: x.shake + 1,
      err: r.lockedFor ? '' : `Wrong PIN. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left`, lockUntil: r.lockedFor ? Date.now() + r.lockedFor : 0 }))
  }
  const endPinFlow = (m) => setModal(m.prev && m.prev.type !== 'pinoffer' ? m.prev : null)
  const submitPin = async (value) => {
    const m = pinState
    if (!m || m.busy || m.lockUntil > Date.now()) return
    if (value.length < 4) return setPinState((x) => ({ ...x, err: 'Use 4 to 6 digits' }))
    if (m.purpose === 'new') return setModal({ ...m, purpose: 'confirm', first: value, value: '', err: '' })
    if (m.purpose === 'confirm') {
      if (value !== m.first) { sfx.error(); return setModal({ ...m, purpose: 'new', first: '', value: '', err: 'PINs did not match', shake: m.shake + 1 }) }
      setPinState((x) => ({ ...x, busy: true }))
      const r = await window.shell.pinSet(value, m.cur)
      if (!r.ok) return setModal({ ...m, purpose: 'new', first: '', value: '', err: r.error || 'Could not save the PIN', busy: false })
      setSecurity(r.security); notify('PIN lock is on'); return endPinFlow(m)
    }
    setPinState((x) => ({ ...x, busy: true }))                       // unlock / verify current
    const r = await window.shell.pinVerify(value)
    if (!r.ok) return pinFail(r)
    if (m.purpose === 'unlock') { sfx.ok(); setLocked(false); setLockPin(FRESH_PIN); return }
    if (m.purpose === 'cur-change') return setModal({ ...newPin('new', { cur: value }), prev: m.prev })
    const c = await window.shell.pinClear(value)                    // cur-remove
    if (c.ok) { setSecurity(c.security); notify('PIN removed') } else notify(c.error || 'Could not remove the PIN', 'error')
    endPinFlow(m)
  }
  const pinAdd = (d) => {
    const m = pinState
    if (!m || m.busy || m.lockUntil > Date.now() || m.value.length >= 6) return
    const value = m.value + d
    setPinState((x) => ({ ...x, value, err: '' }))
    const target = m.purpose === 'confirm' ? m.first.length : ['unlock', 'cur-change', 'cur-remove'].includes(m.purpose) ? security.pinLen : 0
    if (target && value.length === target) setTimeout(() => submitPin(value), 120)    // short beat so the last dot fills in
  }
  const pinDel = () => setPinState((x) => (x.busy ? x : { ...x, value: x.value.slice(0, -1), err: '' }))
  const pinPress = () => {
    const k = PIN_KEYS[pinState.sel]
    if (k === 'del') pinDel(); else if (k === 'ok') submitPin(pinState.value); else pinAdd(k)
  }
  const lockNow = async () => {
    await window.shell.pinLock()
    setLockPin(FRESH_PIN); setModal(null); setFocusTop(false); setLocked(true)
  }
  // number keys / backspace on a real keyboard (dev) while a PIN screen is up
  const pinKeys = useRef()
  pinKeys.current = (e) => { if (!pinState) return; if (/^[0-9]$/.test(e.key)) pinAdd(e.key); else if (e.key === 'Backspace') pinDel() }
  useEffect(() => { const f = (e) => pinKeys.current(e); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [])

  // ---------- profile / wallpaper / music ----------
  const pickImage = (kind, back) => openBrowser('image', (f) => busy(() => window.shell.setProfileImage(kind, f), 'Saving…', back), kind === 'avatar' ? 'Choose a profile picture' : 'Choose a wallpaper')
  const openMusic = async (id) => {
    setMusicBusy(id)
    const r = await window.shell.musicOpen(id).catch(() => ({ ok: false, error: 'Could not open it' }))
    setMusicBusy(null)
    notify(r.ok ? (r.via === 'web' ? `${r.name} opened in your browser` : `Opening ${r.name}…`) : r.error, r.ok ? 'info' : 'error')
    setTimeout(music.refresh, 4000); setTimeout(music.refresh, 9000)
  }
  const search = () => keyboard('Search your library', (q) => {
    setModal(null)
    const n = items.findIndex((g) => !g.kind && g.name.toLowerCase().includes(q.trim().toLowerCase()))
    if (q.trim() && n >= 0) setIdx(n); else notify('No match', 'error')
  })

  // Wi-Fi
  const loadWifi = async () => {
    try { const r = await window.shell.wifiScan(); setModal((m) => (m?.type === 'wifi' ? { ...m, loading: false, networks: r.networks } : m)) }
    catch { setModal((m) => (m?.type === 'wifi' ? { ...m, loading: false, networks: [] } : m)) }
  }
  const openWifi = () => {
    if (!st.wifi?.supported) return notify('No Wi-Fi adapter found', 'error')
    open({ type: 'wifi', sel: 0, loading: true, networks: [] }); loadWifi()
  }
  const connectWifi = async (n, pw) => {
    setModal({ type: 'busy', text: `Connecting to ${n.ssid}…` })
    const r = await window.shell.wifiConnect(n.ssid, pw || null, n.auth).catch(() => ({ ok: false, error: 'Could not connect' }))
    setModal(null); notify(r.ok ? `Connected to ${n.ssid}` : r.error, r.ok ? 'info' : 'error'); sys.refresh()
  }
  const pickNetwork = (n) => {
    if (/open/i.test(n.auth) || n.saved) return connectWifi(n, null)
    keyboard(`Password for ${n.ssid}`, (pw) => (pw ? connectWifi(n, pw) : setModal(modal)), true)
  }
  const toggleRadio = async (kind) => {
    const cur = st[kind === 'wifi' ? 'wifi' : 'bluetooth'].radio
    const on = cur !== 'On'
    await sys.setRadio(kind, on)
    notify(`${kind === 'wifi' ? 'Wi-Fi' : 'Bluetooth'} ${on ? 'on' : 'off'}`)
    if (kind === 'wifi' && on) later('wifi', () => { setModal((m) => (m?.type === 'wifi' ? { ...m, loading: true } : m)); loadWifi() }, 3500)
  }
  // Bluetooth
  const openBt = async () => {
    if (!st.bluetooth?.supported) return notify('No Bluetooth adapter found', 'error')
    open({ type: 'bt', sel: 0, devices: null })
    try { const r = await window.shell.btDevices(); setModal((m) => (m?.type === 'bt' ? { ...m, devices: r.devices } : m)) }
    catch { setModal((m) => (m?.type === 'bt' ? { ...m, devices: [] } : m)) }
  }

  // ---------- menus ----------
  const rowsFor = (m) => {
    switch (m.type) {
      case 'pinoffer': return [
        { label: 'Set a PIN', sub: '4 to 6 digits, asked each time Durv Software starts', run: () => open(newPin('new')) },
        { label: 'Skip for now', sub: 'You can set one later in Settings', run: () => { window.shell.pinSkip().then(setSecurity); setModal(null) } },
      ]
      case 'pinmenu': return security.pinSet ? [
        { label: 'Change PIN', run: () => open(newPin('cur-change')) },
        { label: 'Remove PIN', run: () => open(newPin('cur-remove')) },
        { label: 'Lock now', sub: 'Ask for the PIN again', run: lockNow },
        { label: 'Back', run: () => setModal(m.prev ?? null) },
      ] : [
        { label: 'Set a PIN', sub: '4 to 6 digits', run: () => open(newPin('new')) },
        { label: 'Back', run: () => setModal(m.prev ?? null) },
      ]
      case 'profile': return [
        { label: 'Change profile picture', sub: profile.avatar ? 'Replace your current picture' : 'Pick an image from this PC', run: () => pickImage('avatar', m) },
        ...(profile.avatar ? [{ label: 'Remove profile picture', run: () => busy(() => window.shell.clearProfileImage('avatar'), 'Updating…', m) }] : []),
        { label: `Name: ${profile.name}`, sub: 'Shown in the top bar', run: () => keyboard('Your name', (v) => (v.trim() ? busy(() => window.shell.setProfileName(v), 'Saving…', m) : setModal(m)), false, profile.name) },
        { label: 'Set wallpaper', sub: profile.wallpaper ? 'Replace the current background' : 'Pick a background image', run: () => pickImage('wallpaper', m) },
        ...(profile.wallpaper ? [{ label: 'Remove wallpaper', run: () => busy(() => window.shell.clearProfileImage('wallpaper'), 'Updating…', m) }] : []),
        { label: `PIN lock: ${security.pinSet ? 'On' : 'Off'}`, sub: security.pinSet ? 'Change, remove or lock now' : 'Protect Durv Software with a PIN', run: () => open({ type: 'pinmenu', sel: 0 }) },
        { label: 'Close', run: () => setModal(m.prev ?? null) },
      ]
      case 'setup': return [
        ...(m.def ? [{ label: `Use ${m.def}`, sub: 'Found on this PC', run: () => setFolder(m.def) }] : []),
        { label: 'Browse folders…', run: () => openBrowser('folder', setFolder, 'Choose your games folder') },
        { label: 'Skip for now', sub: 'Set it later in Settings', run: () => setFolder(null) },
      ]
      case 'settings': {
        const sort = data?.config.sort || 'recent'
        const next = SORTS[(SORTS.findIndex((s) => s[0] === sort) + 1) % SORTS.length]
        return [
          { label: 'Appearance', sub: 'Colours, presets, sounds, button hints', run: () => open({ type: 'appearance', sel: 0 }) },
          { label: 'Profile & wallpaper', sub: 'Picture, name, background image', run: () => open({ type: 'profile', sel: 0 }) },
          { label: 'Music', sub: 'Spotify, Apple Music and more, in the background', run: () => open({ type: 'music', sel: 0, tsel: 1 }) },
          { label: `PIN lock: ${security.pinSet ? 'On' : 'Off'}`, sub: security.pinSet ? 'Change, remove or lock now' : 'Ask for a PIN when Durv Software starts', run: () => open({ type: 'pinmenu', sel: 0 }) },
          { label: 'Search library', sub: 'Find a game with the on-screen keyboard', run: search },
          { label: `Sort: ${SORTS.find((s) => s[0] === sort)[1]}`, sub: `Select to switch to ${next[1]}`, run: () => busy(() => window.shell.setCfg({ sort: next[0] })) },
          { label: `Steam games: ${data?.config.importSteam ? 'Shown' : 'Hidden'}`, sub: 'Import installed Steam games', run: () => busy(() => window.shell.setCfg({ importSteam: !data?.config.importSteam }), 'Updating…') },
          { label: 'Change games folder', sub: data?.config.gamesFolders.join(', ') || 'Not set', run: () => openBrowser('folder', setFolder, 'Choose your games folder') },
          { label: 'Rescan library', run: () => busy(window.shell.rescan, 'Scanning games…') },
          { label: 'Open config folder', sub: 'config, theme, overrides, apps', run: () => { window.shell.openConfig(); setModal(null) } },
          { label: 'Close', run: () => setModal(m.prev ?? null) },
        ]
      }
      case 'power': return [
        ...(security.pinSet ? [{ label: 'Lock', sub: 'Ask for the PIN again', run: lockNow }] : []),
        { label: 'Sleep', run: () => { window.shell.power('sleep'); setModal(null) } },
        { label: 'Restart', run: () => ask('Restart', 'restart', 'Closes everything and reboots. Unsaved work is lost.') },
        { label: 'Shut down', run: () => ask('Shut down', 'shutdown', 'Force-closes apps and powers off. Unsaved work is lost.') },
        { label: 'Desktop', sub: 'Exit to Windows', run: () => { window.shell.power('desktop'); setModal(null) } },
        { label: 'Close Durv Software', sub: 'Quit this app', run: () => window.shell.power('quit') },
        { label: 'Cancel', run: () => setModal(m.prev ?? null) },
      ]
      case 'art': return [
        { label: 'Set tile image', run: () => pickArt(m.game, 'tile') },
        { label: 'Set wallpaper', run: () => pickArt(m.game, 'wallpaper') },
        { label: 'Reset artwork', run: () => busy(() => window.shell.resetArt(m.game.id)) },
        { label: m.game.fav ? 'Remove from favourites' : 'Add to favourites', sub: 'Favourites are listed first', run: () => busy(() => window.shell.favorite(m.game.id)) },
        { label: 'Hide from library', sub: 'Undo in overrides.json', run: () => busy(() => window.shell.hide(m.game.id)) },
        { label: 'Close', run: () => setModal(null) },
      ]
      case 'wifi': {
        const on = st.wifi?.radio !== 'Off'
        return [
          { label: `Wi-Fi  ·  ${on ? 'On' : 'Off'}`, sub: `Select to turn ${on ? 'off' : 'on'}`, run: () => toggleRadio('wifi') },
          ...(m.loading ? [{ label: 'Scanning…' }]
            : m.networks.length ? m.networks.map((n) => ({ label: n.ssid, sub: `${n.signal}%  ·  ${n.auth || 'Open'}${n.ssid === st.wifi?.ssid ? '  ·  Connected' : n.saved ? '  ·  Saved' : ''}`, run: () => pickNetwork(n) }))
            : [{ label: on ? 'No networks found' : 'Wi-Fi is off', sub: on ? 'If this looks wrong, enable Location in Windows privacy settings' : undefined }]),
          { label: 'Rescan', run: () => { setModal((x) => ({ ...x, loading: true })); loadWifi() } },
          { label: 'Back', run: () => setModal(m.prev ?? null) },
        ]
      }
      case 'bt': {
        const on = st.bluetooth?.radio === 'On'
        return [
          { label: `Bluetooth  ·  ${on ? 'On' : 'Off'}`, sub: `Select to turn ${on ? 'off' : 'on'}`, run: () => toggleRadio('bluetooth') },
          ...(m.devices === null ? [{ label: 'Looking for paired devices…' }] : m.devices.map((d) => ({ label: d.name, sub: `${d.connected ? 'Connected' : 'Paired'}${d.battery != null ? `  ·  ${d.battery}%` : ''}  ·  manage in Windows`, run: () => window.shell.openSettings('bluetooth') }))),
          { label: 'Pair a new device', sub: 'Opens Windows Bluetooth settings', run: () => window.shell.openSettings('bluetooth') },
          { label: 'Back', run: () => setModal(m.prev ?? null) },
        ]
      }
      case 'browser': return [
        ...(m.mode === 'folder' && m.dir ? [{ kind: 'pick', label: 'Use this folder', sub: m.dir, run: () => m.onPick(m.dir) }] : []),
        ...(m.dir ? [{ kind: 'up', label: '‹  Up one level', run: () => browse(m, m.parent) }] : []),
        ...m.entries.map((e) => ({ kind: e.dir ? 'dir' : 'file', label: (e.dir ? '▸  ' : '') + e.name, run: () => (e.dir ? browse(m, e.path) : m.onPick(e.path)) })),
      ]
      default: return []
    }
  }
  const rows = modal ? rowsFor(modal) : []

  const adjust = (sel, dir) => {
    const d = dir === 'right' ? 1 : -1
    if (sel === 0) {
      const at = Math.max(0, PRESETS.findIndex((p) => p.id === theme.preset))
      const p = PRESETS[(at + d + PRESETS.length) % PRESETS.length]
      edit({ ...theme, preset: p.id, primary: p.primary, secondary: p.secondary })
    }
    if (sel === 1) edit({ ...theme, preset: 'custom', primary: shiftHue(theme.primary, d * 8) })
    if (sel === 2) edit({ ...theme, preset: 'custom', secondary: shiftHue(theme.secondary, d * 8) })
    if (sel === 3) edit({ ...theme, hints: theme.hints === 'always' ? 'auto' : 'always' })
    if (sel === 4) edit({ ...theme, sounds: theme.sounds === false })
  }

  // Quick menu
  const quickIds = ['volume', 'music', 'wifi', 'bluetooth', ...(st.brightness?.supported ? ['brightness'] : []), 'shortcuts']
  const quickAdjust = (dir) => {
    const id = quickIds[modal.sel], d = dir === 'right' ? 1 : -1
    if (id === 'volume') { if (st.volume !== null) sys.setVolume(st.volume + d * 5); else sys.volKey(d > 0 ? 'up' : 'down', 2) }
    if (id === 'brightness') sys.setBrightness(st.brightness.value + d * 5)
    if (id === 'music' && music.media.active) music.command(d > 0 ? 'next' : 'prev')
    if (id === 'shortcuts') setModal((m) => ({ ...m, sc: clamp((m.sc ?? 0) + d, 0, 2) }))
  }
  const quickConfirm = () => {
    const id = quickIds[modal.sel]
    if (id === 'volume') { if (st.volume !== null) sys.toggleMute(); else sys.volKey('mute') }
    if (id === 'music') { if (music.media.active) music.command('toggle'); else open({ type: 'music', sel: 1, tsel: 1 }) }
    if (id === 'wifi') openWifi()
    if (id === 'bluetooth') openBt()
    if (id === 'shortcuts') {
      const sc = modal.sc ?? 0
      open(sc === 0 ? { type: 'appearance', sel: 0 } : sc === 1 ? { type: 'settings', sel: 0 } : { type: 'power', sel: 0 })
    }
  }

  const activate = (g) => {
    if (g.kind === 'settings') setModal({ type: 'settings', sel: 0 })
    else if (g.kind === 'power') setModal({ type: 'power', sel: 0 })
    else launch(g)
  }

  const submitKeyboard = () => modal.onSubmit(modal.value)

  const { connected } = useGamepadNav({
    onMove: (dir) => {
      poke()
      if (splash || modal?.type === 'busy' || launching) return
      if (pinState) { sfx.move(); return setPinState((x) => ({ ...x, sel: movePinSel(x.sel, dir) })) }
      sfx.move()
      if (!modal) {
        if (focusTop) { if (dir === 'down') setFocusTop(false); return }       // profile chip: Down returns to the tiles
        if (dir === 'up') return setFocusTop(true)
        return setIdx((x) => clamp(x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), 0, items.length - 1))
      }
      if (modal.type === 'confirm') return setModal((m) => ({ ...m, sel: dir === 'left' ? 0 : dir === 'right' ? 1 : m.sel }))
      if (modal.type === 'keyboard') return setModal((m) => moveKey(m, dir))
      if (modal.type === 'appearance') {
        if (dir === 'up' || dir === 'down') return setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, APPEARANCE_ROWS - 1) }))
        return adjust(modal.sel, dir)
      }
      if (modal.type === 'music') {
        if (dir === 'up' || dir === 'down') return setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, MUSIC_ROWS - 1) }))
        if (modal.sel === 0) setModal((m) => ({ ...m, tsel: clamp(m.tsel + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), 0, 2) }))
        return
      }
      if (modal.type === 'quick') {
        if (dir === 'up' || dir === 'down') return setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, quickIds.length - 1) }))
        return quickAdjust(dir)
      }
      if (dir === 'up' || dir === 'down') setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, rows.length - 1) }))
    },
    onConfirm: () => {
      poke()
      if (splash) return setSkipTok((t) => t + 1)
      if (launching) return
      if (pinState) { sfx.ok(); return pinPress() }
      sfx.ok()
      if (!modal) return focusTop ? setModal({ type: 'profile', sel: 0 }) : activate(item)
      switch (modal.type) {
        case 'busy': return
        case 'confirm': if (modal.sel === 1) window.shell.power(modal.item.power); return setModal(modal.sel === 1 ? null : modal.prev ?? null)
        case 'appearance': return modal.sel === 5 ? setModal(modal.prev ?? null) : adjust(modal.sel, 'right')
        case 'music':
          if (modal.sel === 0) return music.command(['prev', 'toggle', 'next'][modal.tsel])
          if (modal.sel === MUSIC_ROWS - 1) return setModal(modal.prev ?? null)
          return openMusic(SERVICES[modal.sel - 1].id)
        case 'quick': return quickConfirm()
        case 'keyboard': { const r = pressKey(modal); return r.submit ? submitKeyboard() : setModal(r.m) }
        default: rows[Math.min(modal.sel, rows.length - 1)]?.run?.()
      }
    },
    onBack: () => {
      poke()
      if (splash) return setSkipTok((t) => t + 1)
      if (launching) return cancelLaunch()
      if (pinState) { sfx.back(); if (locked) return pinDel(); if (!pinState.value) return setModal(modal.prev ?? null); return pinDel() }
      if (!modal) return focusTop ? setFocusTop(false) : undefined
      if (modal.type === 'busy' || modal.type === 'setup' || modal.type === 'pinoffer') return
      sfx.back()
      setModal(modal.prev ?? null)
    },
    onX: () => {
      poke()
      if (splash || launching) return
      if (pinState) return pinDel()
      if (modal?.type === 'keyboard') return setModal((m) => ({ ...m, value: m.value.slice(0, -1) }))
      if (!modal) open({ type: 'appearance', sel: 0 })
    },
    onY: () => {
      poke()
      if (splash || locked || launching) return
      if (modal?.type === 'keyboard') return setModal((m) => ({ ...m, value: m.value + ' ' }))
      if (!modal && isGame && !focusTop) open({ type: 'art', sel: 0, game: item })
    },
    onStart: () => {
      poke()
      if (splash || launching) return
      if (pinState) return submitPin(pinState.value)
      if (modal?.type === 'keyboard') return submitKeyboard()
      if (!modal) open({ type: 'settings', sel: 0 })
    },
    onQuick: () => {
      poke()
      if (splash || locked || launching || modal?.type === 'busy' || modal?.type === 'pin') return
      sfx.ok()
      if (modal?.type === 'quick') return setModal(null)
      sys.refresh(); sys.refreshPad(); music.refresh()
      setModal({ type: 'quick', sel: 0, sc: 0, prev: null })
    },
    onBumper: (d) => {
      poke()
      if (splash || locked || launching || modal) return
      if (st.volume === null) return sys.volKey(d > 0 ? 'up' : 'down', 2)     // can't read the level: use the media keys
      sys.setVolume(st.volume + d * 5); sfx.move(); flashVol()
    },
  })

  const pinProps = (m) => {
    const pu = m.purpose
    const title = { unlock: 'Enter your PIN', new: 'Set a PIN', confirm: 'Confirm your PIN', 'cur-change': 'Enter current PIN', 'cur-remove': 'Enter current PIN' }[pu]
    const sub = { unlock: '', new: 'Choose 4 to 6 digits, then press ✓', confirm: 'Enter it once more', 'cur-change': 'Then you can choose a new one', 'cur-remove': 'To turn the PIN lock off' }[pu]
    const dots = pu === 'new' ? 4 : pu === 'confirm' ? m.first.length : security.pinLen || 4
    return { title, sub, value: m.value, dots, sel: m.sel, error: m.err, lockUntil: m.lockUntil, shake: m.shake,
      hint: pu === 'unlock' ? undefined : 'D-pad choose  ·  A press  ·  B back  ·  Menu confirm' }
  }

  const folder = data?.config.gamesFolders[0]
  const modalEl = !modal ? null
    : modal.type === 'quick' ? <QuickMenu key="q" media={music.media} status={st} rows={quickIds} sel={modal.sel} sc={modal.sc ?? 0} padName={padLabel()} padIds={padIds()} pad={sys.pad} />
    : modal.type === 'appearance' ? <Appearance key="ap" theme={theme} sel={modal.sel} />
    : modal.type === 'music' ? <MusicPanel key="mu" media={music.media} sel={modal.sel} tsel={modal.tsel} busyId={musicBusy} />
    : modal.type === 'pin' ? <PinModal key="pin" {...pinProps(modal)} />
    : modal.type === 'keyboard' ? <KeyboardView key="kb" m={modal} />
    : modal.type === 'confirm' ? <Confirm key="c" item={modal.item} sel={modal.sel} />
    : modal.type === 'busy' ? <Busy key="b" text={modal.text} />
    : modal.type === 'browser' ? <Browser key="br" title={modal.title} dir={modal.dir} rows={rows} sel={modal.sel} />
    : <Menu key={modal.type} rows={rows} sel={modal.sel}
        header={modal.type === 'profile' ? <div className="mb-5"><div className="inline-block rounded-full p-[3px]" style={{ background: grad(135) }}><Avatar profile={profile} size={84} /></div></div> : null}
        title={{ setup: 'Welcome', settings: 'Settings', power: 'Power', art: modal.game?.name, wifi: 'Wi-Fi', bt: 'Bluetooth', profile: 'Profile', pinmenu: 'PIN lock', pinoffer: 'Protect with a PIN?' }[modal.type]}
        sub={{ setup: 'Pick the folder that holds your games. Durv Software scans it for .exe files and remembers your choice.', pinoffer: 'Keep others out of your library. It only takes a moment, and you can skip it.', art: `ID for overrides.json: ${modal.game?.id}` }[modal.type]} />

  return (
    <div className="h-full w-full overflow-hidden bg-charcoal">
    <div className="relative overflow-hidden text-white" style={{ width: vp.w / scale, height: vp.h / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
      {/* ambient theme glow (plain gradients: no blur filters, cheap on 4K) + fine vertical grain */}
      {/* your own wallpaper sits at the very back, dimmed so tiles stay readable */}
      {profile.wallpaper && <><div className="absolute inset-0" style={{ background: `url("${profile.wallpaper}") center/cover` }} /><div className="absolute inset-0 bg-charcoal/50" /></>}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(55% 62% at 90% -5%, rgb(var(--p) / .40), transparent 70%), radial-gradient(50% 58% at -3% 105%, rgb(var(--s) / .30), transparent 70%)' }} />
      <div className="absolute inset-0 opacity-[0.045]" style={{ background: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 72px)' }} />

      {/* per-game backdrop: wallpaper, else a soft tint that alternates between your two theme colours */}
      <AnimatePresence>
        <motion.div key={item.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
          {item.wallpaper
            ? <div className="absolute inset-0 opacity-60" style={{ background: `url("${item.wallpaper}") center/cover` }} />
            : <div className="absolute inset-0" style={{ background: `radial-gradient(60% 55% at 76% 28%, ${item.accent ? item.accent + '4d' : item.id.charCodeAt(item.id.length - 1) % 2 ? 'rgb(var(--s) / .30)' : 'rgb(var(--p) / .32)'}, transparent 70%)` }} />}
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/30 to-charcoal/60" />

      <TopBar status={st} padConnected={connected} pad={sys.pad} profile={profile} topFocused={focusTop && !modal && !launching} media={music.media} pinSet={security.pinSet} />

      <motion.div className="absolute flex items-start" style={{ top: 190, gap: GAP, willChange: 'transform' }}
        animate={{ x: 110 - i * (TILE + GAP) }} transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
        {items.map((g, n) => <Tile key={g.id} g={g} focused={n === i} />)}
      </motion.div>

      <Widgets games={data?.games.filter((g) => g.id !== 'steam').length ?? 0} folder={folder} storage={data?.storage} connected={connected} />
      <Prompts mode={splash || locked || launching ? null : modal ? (modal.type === 'keyboard' ? 'keyboard' : 'modal') : 'home'} canArt={isGame} show={awake || theme.hints === 'always'} />
      <VolumePop show={volShow} volume={st.volume} muted={st.muted} />
      <Toast t={toast} />

      <AnimatePresence mode="wait">{modalEl}</AnimatePresence>
      <AnimatePresence>{launching && <LoadingScreen key="ld" g={launching.g} ready={launching.ready} wallpaper={profile.wallpaper} />}</AnimatePresence>
      {locked && <LockScreen profile={profile} {...pinProps(lockPin)} />}
      {/* nothing from the library shows before the theme has loaded; the Splash starts as soon as it has */}
      {!boot && <div className="absolute inset-0 z-[80] bg-charcoal" />}
      {splash && boot && <Splash theme={boot.theme} sound={boot.config.startupSound !== false} skipToken={skipTok} onDone={() => setSplash(false)} />}
    </div>
    </div>
  )
}