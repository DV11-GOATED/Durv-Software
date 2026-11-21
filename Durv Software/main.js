const { app, BrowserWindow, ipcMain, shell, protocol, net } = require('electron')
const { exec, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const crypto = require('crypto')
const { pathToFileURL } = require('url')

// Same data folder in dev and packaged builds: %APPDATA%\ConsoleShell
app.setName('ConsoleShell')
app.setPath('userData', path.join(app.getPath('appData'), 'ConsoleShell'))
protocol.registerSchemesAsPrivileged([{ scheme: 'art', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const isDev = !!process.env.ELECTRON_DEV
let win
let scanned = []          // exe games found on disk
let library = []          // what the UI shows (scan + manual + overrides)
let didScan = false

// ---------- files ----------
const dataDir = () => app.getPath('userData')
const P = {
  cfg: () => path.join(dataDir(), 'config.json'),
  ov: () => path.join(dataDir(), 'overrides.json'),
  apps: () => path.join(dataDir(), 'apps.json'),
  art: () => path.join(dataDir(), 'art'),
}
const J = {
  read: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } },
  write: (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)) },
}
const DEFAULT_CONFIG = {
  setupComplete: false,
  gamesFolders: [],
  scanDepth: 3,
  showSteam: true,
  startupAnimation: true,
  startupSound: true,
  ignore: ['unins', 'setup', 'redist', 'vcredist', 'vc_redist', 'dxsetup', 'crash', 'dotnet', 'installer', 'updater', 'helper', 'easyanticheat', 'battleye'],
}
const loadCfg = () => ({ ...DEFAULT_CONFIG, ...J.read(P.cfg(), {}) })
const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i
const ACCENTS = ['#8b5cff', '#22e6ff', '#ff3cac', '#ffc93c'] // violet, cyan, magenta, gold
const hid = (s) => crypto.createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 10)

function ensureFiles() {
  fs.mkdirSync(P.art(), { recursive: true })
  if (!fs.existsSync(P.cfg())) J.write(P.cfg(), DEFAULT_CONFIG)
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

// One tile per sub-folder of each games folder: the largest non-ignored .exe inside it.
async function scan(cfg) {
  const found = []
  for (const root of cfg.gamesFolders) {
    let ents
    try { ents = await fsp.readdir(root, { withFileTypes: true }) } catch { continue }
    for (const e of ents) {
      const p = path.join(root, e.name)
      if (e.isDirectory()) {
        const out = []
        await collectExes(p, cfg.scanDepth - 1, cfg, out)
        if (out.length) {
          out.sort((a, b) => b.size - a.size)
          found.push({ id: hid(p), name: e.name.replace(/_+/g, ' '), type: 'exe', target: out[0].p })
        }
      } else if (/\.exe$/i.test(e.name) && !ignored(e.name, cfg)) {
        found.push({ id: hid(p), name: path.parse(e.name).name, type: 'exe', target: p })
      }
    }
  }
  scanned = found.sort((a, b) => a.name.localeCompare(b.name))
}

// ---------- library ----------
const artUrl = (v) => (v ? 'art://local/' + encodeURIComponent(v) : null)
const STEAM = { id: 'steam', name: 'Steam', sub: 'Big Picture', type: 'steam', target: 'steam://open/bigpicture', accent: '#22e6ff' }

async function buildLibrary() {
  const cfg = loadCfg()
  const ov = J.read(P.ov(), {})
  const manual = (J.read(P.apps(), []) || []).map((a) => ({ ...a, id: a.id || hid(a.target || a.name || 'x') }))
  const base = [...(cfg.showSteam ? [STEAM] : []), ...scanned, ...manual]
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
      accent: o.accent || g.accent || ACCENTS[parseInt(g.id.slice(0, 4), 16) % 4],
    })
  }
  await Promise.all(out.map(async (g) => {
    if (g.type === 'exe' && !g.tile) {
      try { g.icon = (await app.getFileIcon(g.target, { size: 'large' })).toDataURL() } catch {}
    }
  }))
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
  return { config, games: await buildLibrary(), storage: storage(config) }
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    fullscreen: !isDev, kiosk: !isDev, width: 1280, height: 720, frame: false,
    backgroundColor: '#141519', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',   // startup chime
    },
  })
  win.once('ready-to-show', () => win.show())
  isDev ? win.loadURL('http://localhost:5173') : win.loadFile(path.join(__dirname, 'dist', 'index.html'))
}

function reclaim() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.setAlwaysOnTop(true); win.show(); win.focus()
  if (!isDev) win.setFullScreen(true)
  setTimeout(() => win && win.setAlwaysOnTop(false), 600)
  win.webContents.send('shell:returned')
}

function watchProcess(name) {
  if (!/^[\w.\- ]+$/.test(name)) return
  let seen = false, waited = 0
  const timer = setInterval(() => {
    exec(`tasklist /FI "IMAGENAME eq ${name}" /NH`, (_err, out = '') => {
      if (out.toLowerCase().includes(name.toLowerCase())) seen = true
      else if (seen || (waited += 2) > 90) { clearInterval(timer); reclaim() }
    })
  }, 2000)
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

ipcMain.handle('setup:defaults', () => {
  const def = ['D:\\Games', 'D:\\Game', 'D:\\Games Library', 'D:\\'].find((d) => fs.existsSync(d)) || null
  return def
})

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
  await fsp.copyFile(src, path.join(P.art(), name))        // copied, so moving the original is fine
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

ipcMain.handle('game:hide', async (_e, id) => {
  if (!safeId(id)) return pack()
  const ov = J.read(P.ov(), {})
  ov[id] = { ...(ov[id] || {}), hidden: true }
  J.write(P.ov(), ov)
  return pack()
})

ipcMain.handle('sys:openConfig', () => shell.openPath(dataDir()))

ipcMain.handle('app:launch', (_e, id) => {
  const g = library.find((a) => a.id === id)
  if (!g) return { ok: false }
  if (g.type === 'steam' || g.type === 'url') shell.openExternal(g.target)
  else if (g.type === 'exe') {
    const child = spawn(g.target, g.args || [], { detached: true, stdio: 'ignore', cwd: path.dirname(g.target) })
    child.on('error', reclaim)
    child.unref()
  } else if (g.type === 'cmd') exec(g.target)
  const proc = g.processName || (g.type === 'exe' ? path.basename(g.target) : null)
  if (proc) watchProcess(proc)
  setTimeout(() => win && win.minimize(), 400)
  return { ok: true }
})

ipcMain.handle('system:power', (_e, action) => {
  const cmd = POWER[action]
  if (!cmd) return { ok: false }
  exec(cmd, (err) => err && console.error('[power]', action, err.message))
  return { ok: true }
})

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', reclaim)
  app.whenReady().then(() => {
    ensureFiles()
    // art://local/<file> -> files in %APPDATA%\ConsoleShell\art (or an absolute image path)
    protocol.handle('art', (req) => {
      const v = decodeURIComponent(new URL(req.url).pathname.slice(1))
      const file = path.isAbsolute(v) ? v : path.join(P.art(), path.basename(v))
      if (!IMG.test(file)) return new Response('forbidden', { status: 403 })
      return net.fetch(pathToFileURL(file).toString())
    })
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
