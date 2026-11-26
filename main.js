const { app, BrowserWindow, ipcMain, shell, protocol, net, nativeImage, screen } = require('electron')
const { exec, execFile, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const crypto = require('crypto')
const { pathToFileURL } = require('url')
const sys = require('./lib/sys')
const security = require('./lib/security')
const { steamGames } = require('./lib/steam')
const bridge = require('./lib/inputbridge')

// Same data folder in dev and packaged builds: %APPDATA%\Durv Software
app.setName('Durv Software')
app.setPath('userData', path.join(app.getPath('appData'), 'Durv Software'))
protocol.registerSchemesAsPrivileged([{ scheme: 'art', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

// Smoother rendering on big / 4K screens
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

const isDev = !!process.env.ELECTRON_DEV
let win
let scanned = []          // exe games found on disk
let steamLib = []         // installed Steam games
let library = []          // what the UI shows
let didScan = false

// ---------- files ----------
const dataDir = () => app.getPath('userData')
const P = {
  cfg: () => path.join(dataDir(), 'config.json'),
  ov: () => path.join(dataDir(), 'overrides.json'),
  apps: () => path.join(dataDir(), 'apps.json'),
  theme: () => path.join(dataDir(), 'theme.json'),
  stats: () => path.join(dataDir(), 'stats.json'),
  profile: () => path.join(dataDir(), 'profile.json'),
  art: () => path.join(dataDir(), 'art'),
}
const J = {
  read: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } },
  write: (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)) },
}
const DEFAULT_CONFIG = {
  setupComplete: false,
  gamesFolders: [],
  scanDepth: 4,
  showSteam: true,
  importSteam: true,
  sort: 'recent',               // recent | playtime | name
  startupAnimation: true,
  startupSound: true,
  inputBridge: true,              // background controller reader: LT+RT switcher, hold RT = home, Select+Start menu, Controller Mouse
  returnHoldMs: 700,              // hold RT this long to jump back to Durv Software
  overlayHoldMs: 300,             // hold Select + Start this long to open the in-game menu
  minimizeOnLaunch: false,        // true = minimize the shell when a game's window appears (default: leave it fullscreen behind the game)
  closeExplorerWithMusic: true,   // "Close music" also closes Explorer, but only if Durv Software started it
  ignore: ['unins', 'setup', 'redist', 'vcredist', 'vc_redist', 'dxsetup', 'crash', 'dotnet', 'installer', 'updater', 'helper', 'easyanticheat', 'battleye'],
}
const DEFAULT_THEME = { preset: 'nebula', primary: '#8b5cff', secondary: '#ff4fb8', hints: 'auto', sounds: true }
const DEFAULT_PROFILE = { name: 'Player 1', avatar: null, wallpaper: null }
const loadProfile = () => ({ ...DEFAULT_PROFILE, ...J.read(P.profile(), {}) })
const loadCfg = () => ({ ...DEFAULT_CONFIG, ...J.read(P.cfg(), {}) })
const loadTheme = () => ({ ...DEFAULT_THEME, ...J.read(P.theme(), {}) })
const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i
const hid = (s) => crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 10)
const normPath = (p) => path.normalize(p).replace(/[\\/]+$/, '').toLowerCase()

function ensureFiles() {
  fs.mkdirSync(P.art(), { recursive: true })
  fs.writeFileSync(path.join(dataDir(), 'extract-icon.ps1'), PS_ICON)
  if (!fs.existsSync(P.cfg())) J.write(P.cfg(), DEFAULT_CONFIG)
  if (!fs.existsSync(P.theme())) J.write(P.theme(), DEFAULT_THEME)
  if (!fs.existsSync(P.ov())) J.write(P.ov(), {})
  if (!fs.existsSync(P.apps())) J.write(P.apps(), [])
}

// ---------- scanning ----------
const ignored = (name, cfg) => cfg.ignore.some((w) => name.toLowerCase().includes(w.toLowerCase()))

async function collectExes(dir, depth, cfg, out) {
  let ents
  try { ents = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (depth > 0 && !e.name.startsWith('.') && !e.name.startsWith('$')) await collectExes(p, depth - 1, cfg, out)
    } else if (/\.exe$/i.test(e.name) && !ignored(e.name, cfg)) {
      try { out.push({ p, size: (await fsp.stat(p)).size }) } catch {}
    }
  }
}
const largest = (list) => list.sort((a, b) => b.size - a.size)[0]?.p

// Epic Games Launcher records every install here; Epic games must be launched through it.
function epicInstalls() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.item')).map((f) => J.read(path.join(dir, f), null))
      .filter((x) => x && x.InstallLocation && x.AppName && x.CatalogItemId && x.CatalogNamespace)
  } catch { return [] }
}

async function scan(cfg) {
  const epics = epicInstalls()
  const found = []
  for (const root of cfg.gamesFolders) {
    let ents
    try { ents = await fsp.readdir(root, { withFileTypes: true }) } catch { continue }
    for (const e of ents) {
      const p = path.join(root, e.name)
      if (e.isDirectory()) {
        const out = []
        await collectExes(p, cfg.scanDepth, cfg, out)
        const epic = epics.find((x) => normPath(x.InstallLocation) === normPath(p))
        if (!out.length && !epic) continue
        const g = { id: hid(p), name: e.name.replace(/_+/g, ' '), type: 'exe', folder: p, target: largest(out) || (epic?.LaunchExecutable ? path.join(epic.InstallLocation, epic.LaunchExecutable) : '') }
        if (epic) {
          g.type = 'epic'
          g.name = epic.DisplayName || g.name
          g.launch = `com.epicgames.launcher://apps/${epic.CatalogNamespace}%3A${epic.CatalogItemId}%3A${epic.AppName}?action=launch&silent=true`
        }
        found.push(g)
      } else if (/\.exe$/i.test(e.name) && !ignored(e.name, cfg)) {
        found.push({ id: hid(p), name: path.parse(e.name).name, type: 'exe', target: p })
      }
    }
  }
  scanned = found

  steamLib = []
  if (cfg.importSteam) {
    steamLib = await steamGames().catch(() => [])
    for (const g of steamLib) {              // find an exe in the install folder just to read its icon
      const out = []
      await collectExes(g.folder, cfg.scanDepth, cfg, out)
      g.iconTarget = largest(out)
    }
    const steamDirs = new Set(steamLib.map((g) => normPath(g.folder)))
    scanned = scanned.filter((g) => !g.folder || !steamDirs.has(normPath(g.folder)))   // don't list a Steam game twice
  }
}

// Full-resolution (256px) icon pulled out of the exe by a small PowerShell helper, cached in art\
const PS_ICON = [
  'param($Exe,$Out)',
  'Add-Type -AssemblyName System.Drawing',
  'Add-Type -TypeDefinition @"',
  'using System; using System.Runtime.InteropServices;',
  'public static class IconX {',
  '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint PrivateExtractIcons(string f, int i, int cx, int cy, IntPtr[] h, int[] ids, uint n, uint fl);',
  '  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);',
  '}',
  '"@',
  '$h = New-Object IntPtr[] 1; $ids = New-Object int[] 1',
  '$n = [IconX]::PrivateExtractIcons($Exe,0,256,256,$h,$ids,1,0)',
  'if ($n -lt 1 -or $h[0] -eq [IntPtr]::Zero) { exit 1 }',
  '$bmp = [System.Drawing.Icon]::FromHandle($h[0]).ToBitmap()',
  '$bmp.Save($Out,[System.Drawing.Imaging.ImageFormat]::Png)',
  '[IconX]::DestroyIcon($h[0]) | Out-Null',
].join('\r\n')

const artUrl = (v) => (v ? 'art://local/' + encodeURIComponent(v) : null)
const profileOut = () => { const p = loadProfile(); return { name: p.name, avatar: artUrl(p.avatar), wallpaper: artUrl(p.wallpaper) } }

async function iconFor(exe) {
  const name = `icon-${hid(exe)}.png`
  const file = path.join(P.art(), name)
  const ok = () => fs.existsSync(file) && fs.statSync(file).size > 0
  if (!ok()) {
    await new Promise((res) => execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dataDir(), 'extract-icon.ps1'), '-Exe', exe, '-Out', file],
      { windowsHide: true, timeout: 20000 }, () => res()))
  }
  if (ok()) return artUrl(name)
  try { return (await app.getFileIcon(exe, { size: 'large' })).toDataURL() } catch { return null }  // 32px fallback
}

// ---------- library ----------
const STEAM = { id: 'steam', name: 'Steam', sub: 'Big Picture', type: 'steam', target: 'steam://open/bigpicture' }

const sorter = (mode) =>
  mode === 'name' ? (a, b) => a.name.localeCompare(b.name)
  : mode === 'playtime' ? (a, b) => b.sec - a.sec || a.name.localeCompare(b.name)
  : (a, b) => b.last - a.last || a.name.localeCompare(b.name)

async function buildLibrary() {
  const cfg = loadCfg()
  const ov = J.read(P.ov(), {})
  const st = J.read(P.stats(), {})
  const manual = (J.read(P.apps(), []) || []).map((a) => ({ ...a, id: a.id || hid(a.target || a.name || 'x') }))
  const base = [...(cfg.showSteam ? [STEAM] : []), ...steamLib, ...scanned, ...manual]
  const seen = new Set()
  const out = []
  for (const g of base) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    const o = ov[g.id] || {}
    if (o.hidden) continue
    out.push({
      ...g,
      name: o.name || g.name,
      target: o.target || g.target,
      processName: o.processName || g.processName,
      tile: artUrl(o.tile),
      wallpaper: artUrl(o.wallpaper),
      accent: o.accent || g.accent || null,        // null = follow the theme colours
      fav: !!o.favorite,
      last: st[g.id]?.last || 0,
      sec: st[g.id]?.sec || 0,
    })
  }
  const cmp = sorter(cfg.sort)
  out.sort((a, b) => (a.id === 'steam' ? 0 : 1) - (b.id === 'steam' ? 0 : 1) || Number(b.fav) - Number(a.fav) || cmp(a, b))

  const queue = out.filter((g) => !g.tile && /\.exe$/i.test(g.iconTarget || g.target || ''))
  await Promise.all([1, 2, 3].map(async () => { for (let g; (g = queue.shift()); ) g.icon = await iconFor(g.iconTarget || g.target) }))
  library = out
  return out
}

function storage(cfg) {
  const f = cfg.gamesFolders[0]
  if (!f) return null
  try { const s = fs.statfsSync(f); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize, root: path.parse(f).root } } catch { return null }
}

async function pack() {
  const config = loadCfg()
  return { config, games: await buildLibrary(), storage: storage(config), theme: loadTheme(), profile: profileOut(), security: security.status() }
}

// ---------- window ----------
// One borderless fullscreen window on the primary display. Not kiosk / always-on-top, so games and other apps come in front of it.
const hwndOf = (w) => {                  // native window handle as a decimal string, for the input bridge
  try { const b = w.getNativeWindowHandle(); return String(b.length >= 8 ? b.readBigUInt64LE(0) : b.readUInt32LE(0)) } catch { return '' }
}

function focusWin() {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show(); win.moveTop(); win.focus(); win.webContents.focus()
  app.focus({ steal: true })
}
// Chromium only feeds the Gamepad API to a page whose window has OS focus, and Windows refuses focus to a background
// process. So: ask, then have the input bridge force it, and keep retrying until the page really has focus.
function grabFocus() {
  focusWin()
  let n = 0
  const t = setInterval(() => {
    if (!win || win.isDestroyed() || (win.isFocused() && win.webContents.isFocused()) || ++n > 25) return clearInterval(t)
    focusWin()
    bridge.focus(hwndOf(win))
  }, 700)
}

function createWindow() {
  const appIcon = path.join(__dirname, 'build', 'Durv Software_cover.ico')
  const b = screen.getPrimaryDisplay().bounds
  win = new BrowserWindow({
    title: 'Durv Software',
    icon: fs.existsSync(appIcon) ? appIcon : undefined,
    x: b.x, y: b.y, width: b.width, height: b.height,      // open on the primary display
    fullscreen: true, frame: false,
    backgroundColor: '#0a0a12', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',   // startup chime + UI sounds
    },
  })
  if (isDev) win.webContents.on('before-input-event', (e, input) => {      // F11 leaves / re-enters fullscreen while developing
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault() }
  })
  win.once('ready-to-show', () => { win.show(); bridge.setShell(hwndOf(win)); grabFocus() })
  // Whenever the window is activated (startup, back from a game, back from the overlay) the page must get focus too,
  // otherwise it ignores the controller until the first click.
  win.on('focus', () => { if (win && !win.isDestroyed()) win.webContents.focus() })
  win.on('restore', () => setTimeout(focusWin, 100))
  win.on('enter-full-screen', () => setTimeout(focusWin, 150))
  win.webContents.on('did-finish-load', () => { if (win && !win.isDestroyed() && win.isVisible()) win.webContents.focus() })
  isDev ? win.loadURL('http://localhost:5173') : win.loadFile(path.join(__dirname, 'dist', 'index.html'))
}

// Bring the shell back over whatever is running (game ended, hold RT, second launch of the exe).
function reclaim() {
  if (!win || win.isDestroyed()) return
  hideOverlay({ restore: false })
  if (win.isMinimized()) win.restore()
  win.setAlwaysOnTop(true); win.show(); win.focus(); win.webContents.focus()
  bridge.focus(hwndOf(win))
  if (!win.isFullScreen()) win.setFullScreen(true)
  setTimeout(() => win && !win.isDestroyed() && win.setAlwaysOnTop(false), 600)
  win.webContents.send('shell:returned')
  sys.status().catch(() => {})
}

// Same as reclaim() but silent: used after we start a music app so its window doesn't keep the shell hidden.
function bringBack() {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.setAlwaysOnTop(true); win.show(); win.focus(); win.webContents.focus()
  bridge.focus(hwndOf(win))
  setTimeout(() => win && !win.isDestroyed() && win.setAlwaysOnTop(false), 600)
}

// ---------- in-game overlay + Controller Mouse ----------
// A second, transparent, always-on-top window that holds the Quick Menu (and the on-screen keyboard) over whatever is
// running. Its input does NOT come from the page's Gamepad API (that stops when a game has focus) but from the bridge.
let overlayWin = null
let overlayView = 'hidden'          // hidden | quick | keyboard | hud
let overlayTimer = null
let mouseOn = false

const toBoth = (ch, ...args) => { for (const w of [win, overlayWin]) if (w && !w.isDestroyed()) w.webContents.send(ch, ...args) }
// nav: overlay or keyboard open (d-pad goes to them) | mouse: Controller Mouse | idle: only the global combos
const syncMode = () => bridge.setMode(overlayView === 'quick' || overlayView === 'keyboard' ? 'nav' : mouseOn ? 'mouse' : 'idle')

function createOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin
  const b = screen.getPrimaryDisplay().bounds
  overlayWin = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, focusable: true,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false,
    show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  overlayWin.setAlwaysOnTop(true, 'screen-saver')       // above borderless / windowed games without minimizing them
  overlayWin.hide()
  if (isDev) overlayWin.loadURL('http://localhost:5173/#overlay')
  else overlayWin.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: 'overlay' })
  overlayWin.on('closed', () => { overlayWin = null; overlayView = 'hidden' })
  return overlayWin
}

function showOverlay(view = 'quick') {
  const o = createOverlay()
  clearTimeout(overlayTimer)
  const interactive = view === 'quick'                  // the quick menu takes focus; the keyboard / HUD must not (typing goes to the app)
  if (overlayView === 'hidden' || overlayView === 'hud') bridge.saveForeground()   // remember the game so focus can be handed straight back
  else if (view === 'keyboard' && overlayView === 'quick') bridge.restoreForeground()
  o.setBounds(screen.getPrimaryDisplay().bounds)
  o.setAlwaysOnTop(true, 'screen-saver')
  o.setFocusable(interactive)
  o.setIgnoreMouseEvents(!interactive)
  overlayView = view
  syncMode()
  o.webContents.send('overlay:show', { view, mouse: mouseOn })
  if (interactive) { o.show(); o.moveTop(); o.focus(); o.webContents.focus(); bridge.focus(hwndOf(o)) }
  else o.showInactive()
}

function hideOverlay(opt = {}) {
  clearTimeout(overlayTimer)
  if (overlayView === 'hidden') return
  const was = overlayView
  overlayView = 'hidden'
  syncMode()
  if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.setIgnoreMouseEvents(true); overlayWin.hide() }
  if (opt.restore !== false && was !== 'hud') bridge.restoreForeground()   // hand OS focus straight back to the game
}

const toggleOverlay = () => (overlayView === 'hidden' ? showOverlay('quick') : hideOverlay())

// Brief, click-through, non-focusable indicator (e.g. "Controller Mouse: On").
function hud(text) {
  if (win && !win.isDestroyed() && win.isFocused()) return win.webContents.send('hud', text)
  if (overlayView === 'quick' || overlayView === 'keyboard') return overlayWin && overlayWin.webContents.send('hud', text)
  const o = createOverlay()
  if (overlayView === 'hidden') { o.setBounds(screen.getPrimaryDisplay().bounds); o.setAlwaysOnTop(true, 'screen-saver'); o.setFocusable(false); o.setIgnoreMouseEvents(true) }
  overlayView = 'hud'
  syncMode()
  o.webContents.send('overlay:show', { view: 'hud', text, mouse: mouseOn })
  o.showInactive()
  clearTimeout(overlayTimer)
  overlayTimer = setTimeout(() => { if (overlayView === 'hud') hideOverlay({ restore: false }) }, 1800)
}

function setMouse(on) {
  mouseOn = !!on
  syncMode()
  toBoth('mouse:state', mouseOn)
  hud(`Controller Mouse: ${mouseOn ? 'On' : 'Off'}`)
  return mouseOn
}

function onBridge(line) {
  if (line === 'RETURN') reclaim()                              // the bridge has already put the window in front
  else if (line === 'OVERLAY') toggleOverlay()
  else if (line === 'MOUSE_TOGGLE') setMouse(!mouseOn)
  else if (line === 'KEYBOARD') { if (overlayView !== 'keyboard') showOverlay('keyboard') }
  else if (line === 'SWITCH_START') hideOverlay({ restore: false })
  else if (line.startsWith('NAV ')) {
    if ((overlayView === 'quick' || overlayView === 'keyboard') && overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send('overlay:nav', line.slice(4))
  }
}

ipcMain.handle('overlay:toggle', () => { toggleOverlay(); return overlayView })
ipcMain.handle('overlay:hide', () => { hideOverlay(); return true })
ipcMain.handle('overlay:keyboard', () => { showOverlay('keyboard'); return true })
ipcMain.handle('overlay:switcher', () => { hideOverlay(); setTimeout(() => bridge.switcher(), 250); return true })
ipcMain.handle('overlay:home', () => { reclaim(); return true })
ipcMain.handle('mouse:get', () => mouseOn)
ipcMain.handle('mouse:toggle', () => setMouse(!mouseOn))
ipcMain.handle('kb:type', (_e, text) => { bridge.type(String(text).slice(0, 64)); return true })
ipcMain.handle('kb:key', (_e, k) => { if (['bksp', 'enter', 'esc', 'tab'].includes(k)) bridge.key(k); return true })

// Is a URL scheme (e.g. com.epicgames.launcher) actually registered in Windows?
const protocolRegistered = (scheme) => new Promise((res) =>
  execFile('reg', ['query', `HKCR\\${scheme}\\shell\\open\\command`], { windowsHide: true }, (err) => res(!err)))

// ---------- running-game detection ----------
const procRunning = (name) => new Promise((res) => {
  if (!/^[\w.\- ]+$/.test(name)) return res(false)
  execFile('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'], { windowsHide: true }, (_e, out = '') => res(String(out).toLowerCase().includes(name.toLowerCase())))
})
// Steam keeps the running game's id in the registry.
const steamRunning = (appid) => new Promise((res) => {
  execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'], { windowsHide: true }, (_e, out = '') => {
    const m = /0x([0-9a-f]+)/i.exec(String(out))
    res(!!m && parseInt(m[1], 16) === Number(appid))
  })
})

// Polls until the game has appeared and then disappeared; onEnd gets the time it first appeared.
function watch(isRunning, onEnd, graceSec = 90) {
  let seenAt = null, waited = 0
  const timer = setInterval(async () => {
    const r = await isRunning()
    if (r) { if (!seenAt) seenAt = Date.now() }
    else if (seenAt || (waited += 2) > graceSec) { clearInterval(timer); onEnd(seenAt) }
  }, 2000)
}

const stat = {
  launch(id) { const s = J.read(P.stats(), {}); s[id] = { ...(s[id] || {}), last: Date.now(), count: ((s[id] || {}).count || 0) + 1 }; J.write(P.stats(), s) },
  play(id, sec) { const s = J.read(P.stats(), {}); s[id] = { ...(s[id] || {}), sec: ((s[id] || {}).sec || 0) + Math.round(sec) }; J.write(P.stats(), s) },
}

// ---------- launch screen: keep the shell up until the game's window is really there ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let launchToken = null
let lastLaunchAt = 0
const sendGame = (state) => { if (win && !win.isDestroyed()) win.webContents.send('shell:game', { state }) }

// Resolves to 'ready' | 'timeout' | 'cancelled'. Never throws.
async function waitForGame(g, proc, token, isRunning) {
  const t0 = Date.now()
  const limit = g.type === 'steam' || g.type === 'epic' ? 120000 : 60000
  const needsRunning = g.type === 'steam' && g.appid          // Steam pops its own windows first: wait until the game itself is up
  let fgHits = 0, helperErrors = 0
  while (!token.cancelled && Date.now() - t0 < limit) {
    await sleep(700)
    if (token.cancelled) break
    let st = null
    try { st = await sys.windowState(proc || null); helperErrors = 0 } catch { helperErrors += 1 }
    if (!st) {                                                  // no helper (not Windows / PowerShell blocked): old behaviour, a short fixed wait
      if (helperErrors >= 3 && Date.now() - t0 > 3500) return 'ready'
      continue
    }
    const otherFg = st.fgPid > 0 && st.fgPid !== process.pid
    let up = false
    if (needsRunning) up = (await isRunning().catch(() => false)) && otherFg
    else if (proc) up = !!st.visible
    else { fgHits = otherFg ? fgHits + 1 : 0; up = fgHits >= 2 && Date.now() - t0 > 1500 }
    if (up) { await sleep(700); return token.cancelled ? 'cancelled' : 'ready' }    // let it finish switching to fullscreen
  }
  return token.cancelled ? 'cancelled' : 'timeout'
}

// ---------- IPC ----------
const POWER = {
  shutdown: 'shutdown /s /f /t 0',
  restart: 'shutdown /r /f /t 0',
  sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
  desktop: 'start "" explorer.exe',
}
const safeId = (id) => typeof id === 'string' && /^[\w-]+$/.test(id)

ipcMain.handle('lib:state', async () => {
  const cfg = loadCfg()
  if (cfg.setupComplete && !didScan) { didScan = true; await scan(cfg) }
  return pack()
})
ipcMain.handle('lib:rescan', async () => { await scan(loadCfg()); return pack() })

ipcMain.handle('cfg:patch', async (_e, patch) => {
  const cfg = loadCfg()
  if (['recent', 'playtime', 'name'].includes(patch?.sort)) cfg.sort = patch.sort
  if (typeof patch?.importSteam === 'boolean') { cfg.importSteam = patch.importSteam; J.write(P.cfg(), cfg); await scan(cfg) }
  J.write(P.cfg(), cfg)
  return pack()
})

ipcMain.handle('setup:defaults', () => ['D:\\Games', 'D:\\Game', 'D:\\Games Library', 'D:\\'].find((d) => fs.existsSync(d)) || null)

ipcMain.handle('cfg:setFolder', async (_e, folder) => {
  const cfg = loadCfg()
  if (folder && fs.existsSync(folder)) cfg.gamesFolders = [folder]
  cfg.setupComplete = true
  J.write(P.cfg(), cfg)
  didScan = true
  await scan(cfg)
  return pack()
})

ipcMain.handle('fs:start', (_e, mode) => {
  if (mode === 'image') return app.getPath('pictures')
  return ['D:\\Games', 'D:\\'].find((d) => fs.existsSync(d)) || ''
})

ipcMain.handle('fs:list', async (_e, dir, mode) => {
  if (!dir) {
    const drives = []
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { const d = `${l}:\\`; if (fs.existsSync(d)) drives.push({ name: d, path: d, dir: true }) }
    return { dir: '', parent: '', entries: drives }
  }
  let ents = []
  try { ents = await fsp.readdir(dir, { withFileTypes: true }) } catch {}
  const entries = ents
    .filter((e) => !e.name.startsWith('.') && !e.name.startsWith('$') && e.name !== 'System Volume Information' && (e.isDirectory() || (mode === 'image' && IMG.test(e.name))))
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), dir: e.isDirectory() }))
    .sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name))
    .slice(0, 500)
  const parent = path.dirname(dir)
  return { dir, parent: parent === dir ? '' : parent, entries }
})

ipcMain.handle('art:set', async (_e, id, kind, src) => {
  if (!safeId(id) || !['tile', 'wallpaper'].includes(kind) || typeof src !== 'string' || !IMG.test(src) || !fs.existsSync(src)) return pack()
  const ov = J.read(P.ov(), {})
  const o = (ov[id] = ov[id] || {})
  const name = `${id}-${kind}-${Date.now()}${path.extname(src).toLowerCase()}`
  await fsp.copyFile(src, path.join(P.art(), name))
  if (o[kind] && !path.isAbsolute(o[kind])) fsp.unlink(path.join(P.art(), path.basename(o[kind]))).catch(() => {})
  o[kind] = name
  J.write(P.ov(), ov)
  return pack()
})

ipcMain.handle('art:reset', async (_e, id) => {
  if (!safeId(id)) return pack()
  const ov = J.read(P.ov(), {})
  const o = ov[id] || {}
  for (const k of ['tile', 'wallpaper']) if (o[k] && !path.isAbsolute(o[k])) fsp.unlink(path.join(P.art(), path.basename(o[k]))).catch(() => {})
  delete o.tile; delete o.wallpaper
  ov[id] = o
  J.write(P.ov(), ov)
  return pack()
})

const patchOverride = (id, fn) => {
  if (!safeId(id)) return
  const ov = J.read(P.ov(), {})
  ov[id] = fn(ov[id] || {})
  J.write(P.ov(), ov)
}
ipcMain.handle('game:hide', async (_e, id) => { patchOverride(id, (o) => ({ ...o, hidden: true })); return pack() })
ipcMain.handle('game:favorite', async (_e, id) => { patchOverride(id, (o) => ({ ...o, favorite: !o.favorite })); return pack() })

ipcMain.handle('theme:set', (_e, t) => {
  const HEX = /^#[0-9a-f]{6}$/i
  if (!t || !HEX.test(t.primary) || !HEX.test(t.secondary)) return false
  J.write(P.theme(), { preset: String(t.preset || 'custom').slice(0, 20), primary: t.primary, secondary: t.secondary, hints: t.hints === 'always' ? 'always' : 'auto', sounds: t.sounds !== false })
  return true
})

// Everything the UI needs before the first frame: theme (for the startup animation), PIN state, profile.
ipcMain.handle('boot:get', () => {
  const cfg = loadCfg()
  return {
    theme: loadTheme(),
    config: { startupAnimation: cfg.startupAnimation, startupSound: cfg.startupSound, setupComplete: cfg.setupComplete },
    security: security.status(),
    profile: profileOut(),
  }
})

// ----- PIN lock -----
ipcMain.handle('pin:status', () => security.status())
ipcMain.handle('pin:verify', (_e, pin) => security.verify(pin))
ipcMain.handle('pin:set', (_e, pin, current) => ({ ...security.set(pin, current), security: security.status() }))
ipcMain.handle('pin:clear', (_e, current) => ({ ...security.clear(current), security: security.status() }))
ipcMain.handle('pin:skip', () => { security.skipPrompt(); return security.status() })
ipcMain.handle('pin:lock', () => { security.lock(); return security.status() })

// ----- profile: picture, name, wallpaper -----
const dropOldArt = (name) => { if (name && !path.isAbsolute(name)) fsp.unlink(path.join(P.art(), path.basename(name))).catch(() => {}) }
ipcMain.handle('profile:setImage', async (_e, kind, src) => {
  if (!['avatar', 'wallpaper'].includes(kind) || typeof src !== 'string' || !IMG.test(src) || !fs.existsSync(src)) return pack()
  const prof = loadProfile()
  const stamp = Date.now()
  let name = `profile-${kind}-${stamp}${path.extname(src).toLowerCase()}`
  let done = false
  if (kind === 'avatar') {                                      // centre-crop to a square and shrink: keeps the top bar light
    try {
      const img = nativeImage.createFromPath(src)
      const { width, height } = img.getSize()
      if (width && height) {
        const side = Math.min(width, height)
        const sq = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
        name = `profile-avatar-${stamp}.png`
        await fsp.writeFile(path.join(P.art(), name), (side > 384 ? sq.resize({ width: 384, height: 384, quality: 'best' }) : sq).toPNG())
        done = true
      }
    } catch {}
  }
  if (!done) await fsp.copyFile(src, path.join(P.art(), name))   // formats nativeImage can't read (webp, gif) are copied as they are
  dropOldArt(prof[kind])
  prof[kind] = name
  J.write(P.profile(), prof)
  return pack()
})
ipcMain.handle('profile:clear', async (_e, kind) => {
  if (!['avatar', 'wallpaper'].includes(kind)) return pack()
  const prof = loadProfile()
  dropOldArt(prof[kind]); prof[kind] = null
  J.write(P.profile(), prof)
  return pack()
})
ipcMain.handle('profile:setName', async (_e, name) => {
  const clean = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16)
  if (clean) J.write(P.profile(), { ...loadProfile(), name: clean })
  return pack()
})

// ----- music: control whatever is playing + start a streaming app in the background -----
const MUSIC = {
  spotify: { name: 'Spotify', app: 'Spotify', scheme: 'spotify', web: 'https://open.spotify.com' },
  apple: { name: 'Apple Music', app: 'Apple Music', scheme: 'music', web: 'https://music.apple.com' },
  ytmusic: { name: 'YouTube Music', app: null, scheme: null, web: 'https://music.youtube.com' },
}
// ----- Windows shell (Explorer) -----
// When Durv Software is the Windows shell there is no Explorer, and the Store music apps need one. Start it and wait for the
// taskbar window to exist before launching anything. We remember that we started it so "Close music" can stop it again.
let startedExplorer = false
async function ensureWindows() {
  if (process.platform !== 'win32') return
  if (!(await procRunning('explorer.exe'))) {
    spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref()
    startedExplorer = true
  }
  const t0 = Date.now()
  while (Date.now() - t0 < 25000) {
    const r = await sys.shellReady().catch(() => null)
    if (!r) { await sleep(3000); return }          // helper unavailable: fixed wait instead
    if (r.ready) { await sleep(1500); return }     // taskbar is up; give the shell a moment to settle
    await sleep(500)
  }
}

const killProc = (name) => new Promise((res) =>
  execFile('taskkill', ['/F', '/T', '/IM', name], { windowsHide: true }, (err) => res(!err)))
const MUSIC_PROCS = ['Spotify.exe', 'AppleMusic*', 'Apple Music*']

ipcMain.handle('media:get', () => sys.media().catch(() => ({ active: false })))
ipcMain.handle('media:cmd', (_e, action) => sys.mediaCmd(action).catch(() => ({ active: false })))
ipcMain.handle('music:open', async (_e, id) => {
  const m = MUSIC[id]
  if (!m) return { ok: false, error: 'Unknown service' }
  const openedAt = Date.now()
  let via = null
  try {
    if (m.app) await ensureWindows()          // Windows (Explorer) must be up before a music app is started
    const found = m.app ? await sys.findApp(m.app).catch(() => null) : null
    if (found && found.id) { spawn('explorer.exe', [`shell:AppsFolder\\${found.id}`], { detached: true, stdio: 'ignore' }).unref(); via = 'app' }
    else if (m.scheme && await protocolRegistered(m.scheme)) { shell.openExternal(`${m.scheme}:`); via = 'protocol' }
    else { shell.openExternal(m.web); via = 'web' }
  } catch { return { ok: false, error: `Could not open ${m.name}` } }
  // These apps grab the screen when they start. Take it back, unless a game was launched in the meantime.
  for (const ms of [2500, 6000]) setTimeout(() => { if (lastLaunchAt < openedAt) bringBack() }, ms)
  return { ok: true, via, name: m.name }
})

ipcMain.handle('music:close', async () => {
  let closed = false
  for (const name of MUSIC_PROCS) if (await killProc(name)) closed = true
  let explorer = false
  if (startedExplorer && loadCfg().closeExplorerWithMusic !== false) {      // never touch an Explorer that was already the user's desktop
    explorer = await killProc('explorer.exe')
    startedExplorer = false
  }
  bringBack()
  return { ok: true, closed, explorer }
})

ipcMain.handle('launch:cancel', () => { if (launchToken) launchToken.cancelled = true; return true })

ipcMain.handle('sys:openConfig', () => shell.openPath(dataDir()))
ipcMain.handle('sys:openSettings', (_e, page) => {
  const url = { bluetooth: 'ms-settings:bluetooth', wifi: 'ms-settings:network-wifi', sound: 'ms-settings:sound' }[page]
  if (url) shell.openExternal(url)
})
ipcMain.handle('sys:status', () => sys.status())
ipcMain.handle('sys:volume', (_e, v) => sys.setVolume(v))
ipcMain.handle('sys:mute', (_e, m) => sys.setMute(m))
ipcMain.handle('sys:volKey', (_e, key, times) => sys.volKey(key, times))
ipcMain.handle('sys:brightness', (_e, v) => sys.setBrightness(v))
ipcMain.handle('sys:radio', (_e, kind, on) => sys.setRadio(kind, on))
ipcMain.handle('sys:btDevices', () => sys.btDevices())
ipcMain.handle('sys:btBattery', () => sys.btBattery())
ipcMain.handle('sys:wifiScan', () => sys.wifiScan())
ipcMain.handle('sys:wifiConnect', (_e, ssid, pw, auth) => sys.wifiConnect(ssid, pw, auth))

ipcMain.handle('app:launch', async (_e, id) => {
  if (!security.isUnlocked()) return { ok: false, error: 'Locked' }
  const g = library.find((a) => a.id === id)
  if (!g) return { ok: false, error: 'Unknown app' }
  const isExe = /\.exe$/i.test(g.target || '')
  if (g.type === 'exe' && isExe && !fs.existsSync(g.target)) return { ok: false, error: `Not found: ${path.basename(g.target)}. Was it moved or uninstalled?` }

  const proc = g.processName || (isExe ? path.basename(g.target) : null)
  const spawnExe = () => {
    const child = spawn(g.target, g.args || [], { detached: true, stdio: 'ignore', cwd: path.dirname(g.target) })
    child.on('error', reclaim)
    child.unref()
  }
  let isRunning = proc ? () => procRunning(proc) : null

  if (g.type === 'steam') {
    shell.openExternal(g.target)
    if (g.appid) isRunning = () => steamRunning(g.appid)
  } else if (g.type === 'url') shell.openExternal(g.target)
  else if (g.type === 'epic') {
    if (await protocolRegistered('com.epicgames.launcher')) shell.openExternal(g.launch)   // Epic games must start through the launcher
    else if (isExe && fs.existsSync(g.target)) spawnExe()
    else return { ok: false, error: 'Epic Games Launcher is not installed' }
  } else if (g.type === 'uwp') spawn('explorer.exe', [`shell:AppsFolder\\${g.target}`], { detached: true, stdio: 'ignore' }).unref()
  else if (g.type === 'cmd') exec(g.target)
  else spawnExe()

  stat.launch(g.id)
  if (isRunning) watch(isRunning, (seenAt) => { if (seenAt) stat.play(g.id, (Date.now() - seenAt) / 1000); reclaim() })
  // Keep the shell (and its loading screen) on screen until the game's own window shows up, then step aside.
  if (launchToken) launchToken.cancelled = true
  const token = (launchToken = { cancelled: false })
  lastLaunchAt = Date.now()
  waitForGame(g, proc, token, isRunning || (async () => false)).then((r) => {
    if (launchToken === token) launchToken = null
    if (r === 'ready') { sendGame('ready'); if (loadCfg().minimizeOnLaunch) setTimeout(() => win && !win.isDestroyed() && win.minimize(), 600) }
    else if (r === 'timeout') sendGame('timeout')
  })
  return { ok: true }
})

ipcMain.handle('system:power', (_e, action) => {
  if (action === 'quit') { app.quit(); return { ok: true } }
  const cmd = POWER[action]
  if (!cmd) return { ok: false }
  exec(cmd, (err) => err && console.error('[power]', action, err.message))
  return { ok: true }
})

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', reclaim)
  app.on('before-quit', () => { bridge.stop(); sys.stop() })
  app.whenReady().then(() => {
    ensureFiles()
    sys.init(dataDir())
    security.init(dataDir())
    sys.status().catch(() => {})     // warm up the helper so the first menu open is instant
    protocol.handle('art', (req) => {
      const v = decodeURIComponent(new URL(req.url).pathname.slice(1))
      const file = path.isAbsolute(v) ? v : path.join(P.art(), path.basename(v))
      if (!IMG.test(file)) return new Response('forbidden', { status: 403 })
      return net.fetch(pathToFileURL(file).toString())
    })
    createWindow()
    createOverlay()                  // created hidden, so the first Select + Start is instant
    const cfg = loadCfg()
    if (cfg.inputBridge !== false) bridge.start(dataDir(), { pid: process.pid, returnHoldMs: cfg.returnHoldMs, comboHoldMs: cfg.overlayHoldMs }, onBridge)
  })
  app.on('window-all-closed', () => app.quit())
}
