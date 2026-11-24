diff --git a/README.md b/README.md
index 9af1598..697c8d0 100644
--- a/README.md
+++ b/README.md
@@ -9,6 +9,14 @@ Needs Node.js 18+ on Windows.
     npm run dev       # fullscreen; F11 toggles windowed; Alt+F4 quits
     npm run build     # installer + portable exe land in /release
 
+## PIN lock, profile, music, launch screen
+
+- **PIN lock:** offered on first run (skippable). Later: Settings > PIN lock, or Up to the profile chip > Profile. 4 to 6 digits, asked at every start, and "Lock now" is in the Power menu. Only a salted hash is stored in `security.json`; 5 wrong tries triggers a 30 s lockout that doubles each time. **Forgot it?** Close the app and delete `%APPDATA%\ConsoleShell\security.json`. This is a UI-level lock, not Windows account security.
+- **Profile & wallpaper:** press Up on the home screen to focus your profile chip, then A. Change picture, name and a global wallpaper (stored in `profile.json`, images copied into `art\`). A per-game wallpaper from the Y menu still wins for that game.
+- **Music:** Settings > Music, or the Music row in the Quick menu. Controls whatever Windows reports as playing (Spotify, Apple Music, a browser tab...) and can start Spotify / Apple Music / YouTube Music for you. The music app keeps running when a game starts.
+- **Launch screen:** pressing A on a game shows a full-screen loading view with the tile in the centre until the game's own window appears (B cancels). It gives up after 60 s (120 s for Steam / Epic).
+- **Startup animation** now takes its colours from your theme (Appearance).
+
 ## Controls
 | Button | Does |
 |---|---|
diff --git a/lib/helper.js b/lib/helper.js
index f48dc22..fe1baad 100644
--- a/lib/helper.js
+++ b/lib/helper.js
@@ -41,6 +41,15 @@ public class Audio {
 public class XI {
   [DllImport("xinput1_4.dll", EntryPoint="XInputGetBatteryInformation")] public static extern int Bat(int user, byte devType, out BI bi);
 }
+public class FG {
+  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
+  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
+  public static int Pid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return (int)p; }
+}
+public class KB {
+  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
+  public static void Tap(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
+}
 "@
 
 $script:radioReady = $false
@@ -74,6 +83,29 @@ function Get-BtInfo($d) {
     connected = $(if ($c -and $null -ne $c.Data) { [bool]$c.Data } else { $null })
   }
 }
+# ---- media session (Spotify, Apple Music, browsers... anything that registers with Windows media controls) ----
+$script:mediaMgr = $null
+function Init-Media {
+  if ($script:mediaMgr) { return }
+  Add-Type -AssemblyName System.Runtime.WindowsRuntime
+  if (-not $script:asTask) {
+    $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
+  }
+  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
+  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
+  $script:mediaMgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
+}
+function Get-MediaSession {
+  Init-Media
+  foreach ($x in $script:mediaMgr.GetSessions()) { if ($x.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { return $x } }
+  $script:mediaMgr.GetCurrentSession()
+}
+function Get-Media {
+  $s = Get-MediaSession
+  if (-not $s) { return @{ active = $false } }
+  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
+  @{ active = $true; app = [string]$s.SourceAppUserModelId; title = [string]$p.Title; artist = [string]$p.Artist; album = [string]$p.AlbumTitle; status = $s.GetPlaybackInfo().PlaybackStatus.ToString() }
+}
 function Audio-State { @{ volume = [int][math]::Round([Audio]::Get() * 100); muted = [Audio]::GetMute() } }
 
 [Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
@@ -140,6 +172,38 @@ while (($line = [Console]::In.ReadLine()) -ne $null) {
         }
         $res
       }
+      'media.get' { Get-Media }
+      'media.cmd' {
+        $s = Get-MediaSession
+        if ($s) {
+          $op = switch ($req.action) {
+            'toggle' { $s.TryTogglePlayPauseAsync() }
+            'next' { $s.TrySkipNextAsync() }
+            'prev' { $s.TrySkipPreviousAsync() }
+            default { throw 'Unknown media action' }
+          }
+          [void](Await $op ([bool]))
+        } else {
+          # nothing registered yet: a media key makes Windows wake the last media app
+          $vk = switch ($req.action) { 'next' { 176 } 'prev' { 177 } default { 179 } }
+          [KB]::Tap([byte]$vk)
+        }
+        Start-Sleep -Milliseconds 350
+        Get-Media
+      }
+      'win.state' {
+        $vis = $false
+        if ($req.name) {
+          $n = [string]$req.name
+          if ($n -match '\.exe$') { $n = $n.Substring(0, $n.Length - 4) }
+          $vis = (@(Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })).Count -gt 0
+        }
+        @{ visible = $vis; fgPid = [int][FG]::Pid() }
+      }
+      'apps.find' {
+        $m = Get-StartApps | Where-Object { $_.Name -like ('*' + [string]$req.name + '*') } | Select-Object -First 1
+        if ($m) { @{ id = [string]$m.AppID; name = [string]$m.Name } } else { @{ id = $null } }
+      }
       default { throw ('Unknown command ' + $req.cmd) }
     }
     $out = @{ id = $id; ok = $true; data = $data }
diff --git a/lib/security.js b/lib/security.js
new file mode 100644
index 0000000..b06d27c
--- /dev/null
+++ b/lib/security.js
@@ -0,0 +1,77 @@
+// PIN lock. The PIN is never stored: only a salted scrypt hash goes to %APPDATA%\ConsoleShell\security.json.
+// Wrong-guess throttling lives here (main process), so the UI can't be used to skip it.
+const crypto = require('crypto')
+const fs = require('fs')
+const path = require('path')
+
+const PIN_RE = /^\d{4,6}$/
+const MAX_TRIES = 5            // wrong guesses before a lockout
+const BASE_LOCK_MS = 30_000    // first lockout; doubles each time, capped at 5 min
+
+let file = ''
+let unlocked = false           // true once the right PIN was entered this session (or no PIN is set)
+let fails = 0, lockouts = 0, lockedUntil = 0
+
+const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} } }
+const write = (v) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(v, null, 2)) }
+const derive = (pin, salt) => crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 })
+
+function matches(pin) {
+  const s = read()
+  if (!s.pin || typeof pin !== 'string' || !PIN_RE.test(pin)) return false
+  const want = Buffer.from(s.pin.hash, 'hex')
+  const got = derive(pin, Buffer.from(s.pin.salt, 'hex'))
+  return want.length === got.length && crypto.timingSafeEqual(want, got)
+}
+
+const lockedFor = () => Math.max(0, lockedUntil - Date.now())
+
+const api = {
+  init(dir) { file = path.join(dir, 'security.json'); unlocked = !read().pin },
+
+  // Safe to show in the UI. pinLen lets the lock screen auto-submit once enough digits are typed.
+  status() {
+    const s = read()
+    return { pinSet: !!s.pin, pinLen: s.pin ? s.pin.len : 0, prompted: !!s.prompted || !!s.pin, lockedFor: lockedFor() }
+  },
+  isUnlocked: () => unlocked || !read().pin,
+
+  verify(pin) {
+    if (lockedFor() > 0) return { ok: false, lockedFor: lockedFor(), left: 0 }
+    if (matches(pin)) { fails = 0; lockouts = 0; unlocked = true; return { ok: true } }
+    fails += 1
+    if (fails >= MAX_TRIES) {
+      fails = 0
+      lockedUntil = Date.now() + Math.min(BASE_LOCK_MS * 2 ** lockouts, 300_000)
+      lockouts += 1
+      return { ok: false, lockedFor: lockedFor(), left: 0 }
+    }
+    return { ok: false, left: MAX_TRIES - fails, lockedFor: 0 }
+  },
+
+  // Setting or changing. If a PIN already exists the current one must be supplied.
+  set(pin, current) {
+    if (!PIN_RE.test(String(pin))) return { ok: false, error: 'Use 4 to 6 digits' }
+    const s = read()
+    if (s.pin && !matches(current)) return { ok: false, error: 'Current PIN is wrong' }
+    const salt = crypto.randomBytes(16)
+    write({ ...s, prompted: true, pin: { salt: salt.toString('hex'), hash: derive(pin, salt).toString('hex'), len: String(pin).length } })
+    unlocked = true; fails = 0; lockouts = 0
+    return { ok: true }
+  },
+
+  clear(current) {
+    const s = read()
+    if (!s.pin) return { ok: true }
+    if (!matches(current)) return { ok: false, error: 'PIN is wrong' }
+    delete s.pin
+    write({ ...s, prompted: true })
+    unlocked = true
+    return { ok: true }
+  },
+
+  skipPrompt() { write({ ...read(), prompted: true }); return { ok: true } },
+  lock() { if (read().pin) unlocked = false; return { ok: true } },
+}
+
+module.exports = api
diff --git a/lib/sys.js b/lib/sys.js
index 99020af..19596f9 100644
--- a/lib/sys.js
+++ b/lib/sys.js
@@ -170,6 +170,11 @@ module.exports = {
   setRadio: (kind, on) => call('radio.set', { kind: kind === 'wifi' ? 'wifi' : 'bluetooth', on: !!on }, 20000),
   btBattery: () => call('bt.battery', {}, 25000).catch(() => ({ devices: [] })),
   btDevices: () => call('bt.devices', {}, 20000).catch(() => ({ devices: [] })),
+  // media session (now playing + transport), window detection for the launch screen, Start-menu lookup
+  media: () => call('media.get', {}, 8000),
+  mediaCmd: (action) => call('media.cmd', { action: ['toggle', 'next', 'prev'].includes(action) ? action : 'toggle' }, 10000),
+  windowState: (name, timeout = 4000) => call('win.state', { name: typeof name === 'string' && /^[\w.\- ]+$/.test(name) ? name : null }, timeout),
+  findApp: (name) => call('apps.find', { name }, 15000),
   wifiScan,
   wifiConnect,
   _parseNetworks: parseNetworks, _profileXml: profileXml,
diff --git a/main.js b/main.js
index 5fc5f7f..83a391d 100644
--- a/main.js
+++ b/main.js
@@ -1,4 +1,4 @@
-const { app, BrowserWindow, ipcMain, shell, protocol, net } = require('electron')
+const { app, BrowserWindow, ipcMain, shell, protocol, net, nativeImage } = require('electron')
 const { exec, execFile, spawn } = require('child_process')
 const path = require('path')
 const fs = require('fs')
@@ -6,6 +6,7 @@ const fsp = fs.promises
 const crypto = require('crypto')
 const { pathToFileURL } = require('url')
 const sys = require('./lib/sys')
+const security = require('./lib/security')
 const { steamGames } = require('./lib/steam')
 
 // Same data folder in dev and packaged builds: %APPDATA%\ConsoleShell
@@ -33,6 +34,7 @@ const P = {
   apps: () => path.join(dataDir(), 'apps.json'),
   theme: () => path.join(dataDir(), 'theme.json'),
   stats: () => path.join(dataDir(), 'stats.json'),
+  profile: () => path.join(dataDir(), 'profile.json'),
   art: () => path.join(dataDir(), 'art'),
 }
 const J = {
@@ -51,6 +53,8 @@ const DEFAULT_CONFIG = {
   ignore: ['unins', 'setup', 'redist', 'vcredist', 'vc_redist', 'dxsetup', 'crash', 'dotnet', 'installer', 'updater', 'helper', 'easyanticheat', 'battleye'],
 }
 const DEFAULT_THEME = { preset: 'nebula', primary: '#8b5cff', secondary: '#ff4fb8', hints: 'auto', sounds: true }
+const DEFAULT_PROFILE = { name: 'Player 1', avatar: null, wallpaper: null }
+const loadProfile = () => ({ ...DEFAULT_PROFILE, ...J.read(P.profile(), {}) })
 const loadCfg = () => ({ ...DEFAULT_CONFIG, ...J.read(P.cfg(), {}) })
 const loadTheme = () => ({ ...DEFAULT_THEME, ...J.read(P.theme(), {}) })
 const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i
@@ -152,6 +156,7 @@ const PS_ICON = [
 ].join('\r\n')
 
 const artUrl = (v) => (v ? 'art://local/' + encodeURIComponent(v) : null)
+const profileOut = () => { const p = loadProfile(); return { name: p.name, avatar: artUrl(p.avatar), wallpaper: artUrl(p.wallpaper) } }
 
 async function iconFor(exe) {
   const name = `icon-${hid(exe)}.png`
@@ -217,7 +222,7 @@ function storage(cfg) {
 
 async function pack() {
   const config = loadCfg()
-  return { config, games: await buildLibrary(), storage: storage(config), theme: loadTheme() }
+  return { config, games: await buildLibrary(), storage: storage(config), theme: loadTheme(), profile: profileOut(), security: security.status() }
 }
 
 // ---------- window ----------
@@ -248,6 +253,15 @@ function reclaim() {
   sys.status().catch(() => {})
 }
 
+// Same as reclaim() but silent: used after we start a music app so its window doesn't keep the shell hidden.
+function bringBack() {
+  if (!win) return
+  if (win.isMinimized()) win.restore()
+  win.setAlwaysOnTop(true); win.show(); win.focus()
+  if (!isDev) win.setFullScreen(true)
+  setTimeout(() => win && win.setAlwaysOnTop(false), 600)
+}
+
 // Is a URL scheme (e.g. com.epicgames.launcher) actually registered in Windows?
 const protocolRegistered = (scheme) => new Promise((res) =>
   execFile('reg', ['query', `HKCR\\${scheme}\\shell\\open\\command`], { windowsHide: true }, (err) => res(!err)))
@@ -280,6 +294,37 @@ const stat = {
   play(id, sec) { const s = J.read(P.stats(), {}); s[id] = { ...(s[id] || {}), sec: ((s[id] || {}).sec || 0) + Math.round(sec) }; J.write(P.stats(), s) },
 }
 
+// ---------- launch screen: keep the shell up until the game's window is really there ----------
+const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
+let launchToken = null
+let lastLaunchAt = 0
+const sendGame = (state) => { if (win && !win.isDestroyed()) win.webContents.send('shell:game', { state }) }
+
+// Resolves to 'ready' | 'timeout' | 'cancelled'. Never throws.
+async function waitForGame(g, proc, token, isRunning) {
+  const t0 = Date.now()
+  const limit = g.type === 'steam' || g.type === 'epic' ? 120000 : 60000
+  const needsRunning = g.type === 'steam' && g.appid          // Steam pops its own windows first: wait until the game itself is up
+  let fgHits = 0, helperErrors = 0
+  while (!token.cancelled && Date.now() - t0 < limit) {
+    await sleep(700)
+    if (token.cancelled) break
+    let st = null
+    try { st = await sys.windowState(proc || null); helperErrors = 0 } catch { helperErrors += 1 }
+    if (!st) {                                                  // no helper (not Windows / PowerShell blocked): old behaviour, a short fixed wait
+      if (helperErrors >= 3 && Date.now() - t0 > 3500) return 'ready'
+      continue
+    }
+    const otherFg = st.fgPid > 0 && st.fgPid !== process.pid
+    let up = false
+    if (needsRunning) up = (await isRunning().catch(() => false)) && otherFg
+    else if (proc) up = !!st.visible
+    else { fgHits = otherFg ? fgHits + 1 : 0; up = fgHits >= 2 && Date.now() - t0 > 1500 }
+    if (up) { await sleep(700); return token.cancelled ? 'cancelled' : 'ready' }    // let it finish switching to fullscreen
+  }
+  return token.cancelled ? 'cancelled' : 'timeout'
+}
+
 // ---------- IPC ----------
 const POWER = {
   shutdown: 'shutdown /s /f /t 0',
@@ -377,6 +422,91 @@ ipcMain.handle('theme:set', (_e, t) => {
   return true
 })
 
+// Everything the UI needs before the first frame: theme (for the startup animation), PIN state, profile.
+ipcMain.handle('boot:get', () => {
+  const cfg = loadCfg()
+  return {
+    theme: loadTheme(),
+    config: { startupAnimation: cfg.startupAnimation, startupSound: cfg.startupSound, setupComplete: cfg.setupComplete },
+    security: security.status(),
+    profile: profileOut(),
+  }
+})
+
+// ----- PIN lock -----
+ipcMain.handle('pin:status', () => security.status())
+ipcMain.handle('pin:verify', (_e, pin) => security.verify(pin))
+ipcMain.handle('pin:set', (_e, pin, current) => ({ ...security.set(pin, current), security: security.status() }))
+ipcMain.handle('pin:clear', (_e, current) => ({ ...security.clear(current), security: security.status() }))
+ipcMain.handle('pin:skip', () => { security.skipPrompt(); return security.status() })
+ipcMain.handle('pin:lock', () => { security.lock(); return security.status() })
+
+// ----- profile: picture, name, wallpaper -----
+const dropOldArt = (name) => { if (name && !path.isAbsolute(name)) fsp.unlink(path.join(P.art(), path.basename(name))).catch(() => {}) }
+ipcMain.handle('profile:setImage', async (_e, kind, src) => {
+  if (!['avatar', 'wallpaper'].includes(kind) || typeof src !== 'string' || !IMG.test(src) || !fs.existsSync(src)) return pack()
+  const prof = loadProfile()
+  const stamp = Date.now()
+  let name = `profile-${kind}-${stamp}${path.extname(src).toLowerCase()}`
+  let done = false
+  if (kind === 'avatar') {                                      // centre-crop to a square and shrink: keeps the top bar light
+    try {
+      const img = nativeImage.createFromPath(src)
+      const { width, height } = img.getSize()
+      if (width && height) {
+        const side = Math.min(width, height)
+        const sq = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
+        name = `profile-avatar-${stamp}.png`
+        await fsp.writeFile(path.join(P.art(), name), (side > 384 ? sq.resize({ width: 384, height: 384, quality: 'best' }) : sq).toPNG())
+        done = true
+      }
+    } catch {}
+  }
+  if (!done) await fsp.copyFile(src, path.join(P.art(), name))   // formats nativeImage can't read (webp, gif) are copied as they are
+  dropOldArt(prof[kind])
+  prof[kind] = name
+  J.write(P.profile(), prof)
+  return pack()
+})
+ipcMain.handle('profile:clear', async (_e, kind) => {
+  if (!['avatar', 'wallpaper'].includes(kind)) return pack()
+  const prof = loadProfile()
+  dropOldArt(prof[kind]); prof[kind] = null
+  J.write(P.profile(), prof)
+  return pack()
+})
+ipcMain.handle('profile:setName', async (_e, name) => {
+  const clean = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16)
+  if (clean) J.write(P.profile(), { ...loadProfile(), name: clean })
+  return pack()
+})
+
+// ----- music: control whatever is playing + start a streaming app in the background -----
+const MUSIC = {
+  spotify: { name: 'Spotify', app: 'Spotify', scheme: 'spotify', web: 'https://open.spotify.com' },
+  apple: { name: 'Apple Music', app: 'Apple Music', scheme: 'music', web: 'https://music.apple.com' },
+  ytmusic: { name: 'YouTube Music', app: null, scheme: null, web: 'https://music.youtube.com' },
+}
+ipcMain.handle('media:get', () => sys.media().catch(() => ({ active: false })))
+ipcMain.handle('media:cmd', (_e, action) => sys.mediaCmd(action).catch(() => ({ active: false })))
+ipcMain.handle('music:open', async (_e, id) => {
+  const m = MUSIC[id]
+  if (!m) return { ok: false, error: 'Unknown service' }
+  const openedAt = Date.now()
+  let via = null
+  try {
+    const found = m.app ? await sys.findApp(m.app).catch(() => null) : null
+    if (found && found.id) { spawn('explorer.exe', [`shell:AppsFolder\\${found.id}`], { detached: true, stdio: 'ignore' }).unref(); via = 'app' }
+    else if (m.scheme && await protocolRegistered(m.scheme)) { shell.openExternal(`${m.scheme}:`); via = 'protocol' }
+    else { shell.openExternal(m.web); via = 'web' }
+  } catch { return { ok: false, error: `Could not open ${m.name}` } }
+  // These apps grab the screen when they start. Take it back, unless a game was launched in the meantime.
+  for (const ms of [2500, 6000]) setTimeout(() => { if (lastLaunchAt < openedAt) bringBack() }, ms)
+  return { ok: true, via, name: m.name }
+})
+
+ipcMain.handle('launch:cancel', () => { if (launchToken) launchToken.cancelled = true; return true })
+
 ipcMain.handle('sys:openConfig', () => shell.openPath(dataDir()))
 ipcMain.handle('sys:openSettings', (_e, page) => {
   const url = { bluetooth: 'ms-settings:bluetooth', wifi: 'ms-settings:network-wifi', sound: 'ms-settings:sound' }[page]
@@ -394,6 +524,7 @@ ipcMain.handle('sys:wifiScan', () => sys.wifiScan())
 ipcMain.handle('sys:wifiConnect', (_e, ssid, pw, auth) => sys.wifiConnect(ssid, pw, auth))
 
 ipcMain.handle('app:launch', async (_e, id) => {
+  if (!security.isUnlocked()) return { ok: false, error: 'Locked' }
   const g = library.find((a) => a.id === id)
   if (!g) return { ok: false, error: 'Unknown app' }
   const isExe = /\.exe$/i.test(g.target || '')
@@ -421,7 +552,15 @@ ipcMain.handle('app:launch', async (_e, id) => {
 
   stat.launch(g.id)
   if (isRunning) watch(isRunning, (seenAt) => { if (seenAt) stat.play(g.id, (Date.now() - seenAt) / 1000); reclaim() })
-  setTimeout(() => win && win.minimize(), 400)
+  // Keep the shell (and its loading screen) on screen until the game's own window shows up, then step aside.
+  if (launchToken) launchToken.cancelled = true
+  const token = (launchToken = { cancelled: false })
+  lastLaunchAt = Date.now()
+  waitForGame(g, proc, token, isRunning || (async () => false)).then((r) => {
+    if (launchToken === token) launchToken = null
+    if (r === 'ready') { sendGame('ready'); setTimeout(() => win && win.minimize(), 600) }
+    else if (r === 'timeout') sendGame('timeout')
+  })
   return { ok: true }
 })
 
@@ -440,6 +579,7 @@ else {
   app.whenReady().then(() => {
     ensureFiles()
     sys.init(dataDir())
+    security.init(dataDir())
     sys.status().catch(() => {})     // warm up the helper so the first menu open is instant
     protocol.handle('art', (req) => {
       const v = decodeURIComponent(new URL(req.url).pathname.slice(1))
diff --git a/preload.js b/preload.js
index ca43de9..0621fbd 100644
--- a/preload.js
+++ b/preload.js
@@ -14,4 +14,11 @@ contextBridge.exposeInMainWorld('shell', {
   sysRadio: call('sys:radio'), btDevices: call('sys:btDevices'), btBattery: call('sys:btBattery'), wifiScan: call('sys:wifiScan'), wifiConnect: call('sys:wifiConnect'),
   openSettings: call('sys:openSettings'),
   onReturn: (cb) => ipcRenderer.on('shell:returned', cb),
+  // first-frame info, PIN lock, profile, music, launch screen
+  boot: call('boot:get'),
+  pinVerify: call('pin:verify'), pinSet: call('pin:set'), pinClear: call('pin:clear'), pinSkip: call('pin:skip'), pinLock: call('pin:lock'),
+  setProfileImage: call('profile:setImage'), clearProfileImage: call('profile:clear'), setProfileName: call('profile:setName'),
+  media: call('media:get'), mediaCmd: call('media:cmd'), musicOpen: call('music:open'),
+  cancelLaunch: call('launch:cancel'),
+  onGame: (cb) => ipcRenderer.on('shell:game', (_e, ev) => cb(ev)),
 })
diff --git a/src/Dashboard.jsx b/src/Dashboard.jsx
index 9f80d45..7e275a3 100644
--- a/src/Dashboard.jsx
+++ b/src/Dashboard.jsx
@@ -5,8 +5,11 @@ import { useSystem } from './useSystem'
 import Splash from './Splash'
 import Appearance from './Appearance'
 import QuickMenu from './QuickMenu'
+import MusicPanel, { useMedia, SERVICES, MUSIC_ROWS } from './Music'
+import { LockScreen, PinModal, PIN_KEYS, movePinSel } from './Lock'
+import LoadingScreen from './Loading'
 import { KeyboardView, pressKey, moveKey } from './Keyboard'
-import { Tile, TopBar, Widgets, Prompts, Menu, Browser, Confirm, Busy, Toast, VolumePop, TILE, GAP } from './ui'
+import { Tile, TopBar, Widgets, Prompts, Menu, Browser, Confirm, Busy, Toast, VolumePop, Avatar, grad, TILE, GAP } from './ui'
 import { PRESETS, DEFAULT_THEME, applyTheme, shiftHue } from './theme'
 import { sfx } from './sfx'
 
@@ -16,6 +19,9 @@ const SYS = [
 ]
 const SORTS = [['recent', 'Recently played'], ['playtime', 'Most played'], ['name', 'Name']]
 const APPEARANCE_ROWS = 6
+const FRESH_PIN = { purpose: 'unlock', value: '', sel: 4, err: '', shake: 0, lockUntil: 0, busy: false }
+const newPin = (purpose, extra = {}) => ({ type: 'pin', purpose, value: '', sel: 4, err: '', shake: 0, lockUntil: 0, busy: false, ...extra })
+const DEFAULT_PROFILE = { name: 'Player 1', avatar: null, wallpaper: null }
 const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
 const padLabel = () => {
   const p = [...(navigator.getGamepads?.() || [])].find(Boolean)
@@ -29,9 +35,17 @@ const padIds = () => {
 }
 
 export default function Dashboard() {
-  const [data, setData] = useState(null)       // { config, games, storage, theme }
+  const [boot, setBoot] = useState(null)       // first-frame info: { theme, config, security, profile }
+  const [data, setData] = useState(null)       // { config, games, storage, theme, profile, security }
   const [theme, setTheme] = useState(DEFAULT_THEME)
   const [splash, setSplash] = useState(true)
+  const [skipTok, setSkipTok] = useState(0)
+  const [security, setSecurity] = useState({ pinSet: false, pinLen: 0, prompted: true })
+  const [locked, setLocked] = useState(false)
+  const [lockPin, setLockPin] = useState(FRESH_PIN)
+  const [focusTop, setFocusTop] = useState(false)   // profile chip in the top bar has focus
+  const [launching, setLaunching] = useState(null)  // { g, ready } while the loading screen is up
+  const [musicBusy, setMusicBusy] = useState(null)
   const [idx, setIdx] = useState(0)
   const [modal, setModal] = useState(null)
   const [awake, setAwake] = useState(true)     // button-hint dock visibility
@@ -42,6 +56,10 @@ export default function Dashboard() {
   const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
   const sys = useSystem()
   const st = sys.status
+  const music = useMedia()
+  const lockedRef = useRef(false)
+  lockedRef.current = locked
+  const profile = data?.profile || boot?.profile || DEFAULT_PROFILE
 
   const items = useMemo(() => [...(data?.games || []), ...SYS], [data])
   const i = Math.min(idx, items.length - 1)
@@ -73,31 +91,113 @@ export default function Dashboard() {
   const open = (m) => setModal({ ...m, prev: modal })           // open a modal; B returns to the one we came from
 
   useEffect(() => {
-    window.shell.state().then((d) => { setData(d); setTheme({ ...DEFAULT_THEME, ...d.theme }); if (d.config.startupAnimation === false) setSplash(false) })
+    // Fast path: theme + PIN state before the first frame, so the startup animation uses the right colours and the lock can't be skipped.
+    window.shell.boot().then((b) => {
+      setBoot(b)
+      setTheme({ ...DEFAULT_THEME, ...b.theme })
+      setSecurity(b.security)
+      if (b.config.startupAnimation === false) setSplash(false)
+      if (b.security.pinSet) { setLocked(true); setLockPin({ ...FRESH_PIN, lockUntil: Date.now() + (b.security.lockedFor || 0) }) }
+    }).catch(() => setBoot({ theme: DEFAULT_THEME, config: { startupAnimation: false }, security: security, profile: DEFAULT_PROFILE }))
+    window.shell.state().then((d) => { setData(d); if (!dirty.current) setTheme((t) => ({ ...DEFAULT_THEME, ...d.theme })) })
       .catch(() => notify('Could not load your library', 'error'))
-    window.shell.onReturn(() => { setModal(null); sys.refresh() })
+    window.shell.onReturn(() => { setModal((m) => (lockedRef.current ? m : null)); setLaunching(null); setFocusTop(false); sys.refresh(); music.refresh() })
+    window.shell.onGame(({ state }) => {
+      if (state === 'ready') { setLaunching((l) => (l ? { ...l, ready: true } : l)); later('ld', () => setLaunching(null), 900) }
+      else if (state === 'timeout') { setLaunching(null); notify('That is taking longer than expected. It may still be starting.', 'error') }
+    })
     poke()
   }, [])
+  useEffect(() => { if (data?.security) setSecurity(data.security) }, [data])
 
+  // First run, in order: offer a PIN (skippable), then pick the games folder.
   useEffect(() => {
-    if (data && !data.config.setupComplete && !splash && !modal) window.shell.setupDefaults().then((def) => setModal({ type: 'setup', sel: 0, def }))
-  }, [data, splash])
+    if (!data || !boot || splash || modal || locked || launching) return
+    if (!security.prompted && !security.pinSet) { setModal({ type: 'pinoffer', sel: 0 }); return }
+    if (!data.config.setupComplete) window.shell.setupDefaults().then((def) => setModal((m) => m ?? { type: 'setup', sel: 0, def }))
+  }, [data, boot, splash, modal, locked, launching, security])
 
   // ---------- actions ----------
-  const busy = async (fn, text = 'Working…') => {
+  const busy = async (fn, text = 'Working…', after = null) => {     // `after`: modal to come back to (keeps menus open)
     setModal({ type: 'busy', text })
-    try { setData(await fn()) } catch { notify('Something went wrong', 'error') } finally { setModal(null) }
+    try { setData(await fn()) } catch { notify('Something went wrong', 'error') } finally { setModal(after) }
   }
   const setFolder = (dir) => busy(() => window.shell.setFolder(dir), 'Scanning games…')
   const browse = async (base, dir) => { const r = await window.shell.fsList(dir, base.mode); setModal({ type: 'browser', ...base, ...r, sel: 0 }) }
   const openBrowser = async (mode, onPick, title) => browse({ mode, onPick, title, prev: modal }, await window.shell.fsStart(mode))
   const pickArt = (g, kind) => openBrowser('image', (f) => busy(() => window.shell.setArt(g.id, kind, f), 'Saving artwork…'), kind === 'tile' ? 'Choose a tile image' : 'Choose a wallpaper')
   const ask = (name, power, sub) => open({ type: 'confirm', sel: 0, item: { name, power, sub } })
-  const keyboard = (title, onSubmit, mask = false) => open({ type: 'keyboard', title, value: '', mask, show: false, layer: 'abc', r: 1, c: 0, onSubmit })
+  const keyboard = (title, onSubmit, mask = false, initial = '') => open({ type: 'keyboard', title, value: initial, mask, show: false, layer: 'abc', r: 1, c: 0, onSubmit })
 
+  // The loading screen goes up first; the main process tells us when the game's own window is there ('shell:game' ready).
   const launch = async (g) => {
+    if (launching) return
+    setLaunching({ g, ready: false })
     const r = await window.shell.launch(g.id).catch(() => ({ ok: false, error: 'Could not start it' }))
-    if (!r.ok) notify(r.error || 'Could not start it', 'error')
+    if (!r.ok) { setLaunching(null); notify(r.error || 'Could not start it', 'error') }
+  }
+  const cancelLaunch = () => { window.shell.cancelLaunch(); setLaunching(null) }
+
+  // ---------- PIN ----------
+  const pinState = locked ? lockPin : modal?.type === 'pin' ? modal : null
+  const setPinState = (fn) => (locked ? setLockPin(fn) : setModal(fn))
+  const pinFail = (r) => {
+    sfx.error()
+    setPinState((x) => ({ ...x, busy: false, value: '', shake: x.shake + 1,
+      err: r.lockedFor ? '' : `Wrong PIN. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left`, lockUntil: r.lockedFor ? Date.now() + r.lockedFor : 0 }))
+  }
+  const endPinFlow = (m) => setModal(m.prev && m.prev.type !== 'pinoffer' ? m.prev : null)
+  const submitPin = async (value) => {
+    const m = pinState
+    if (!m || m.busy || m.lockUntil > Date.now()) return
+    if (value.length < 4) return setPinState((x) => ({ ...x, err: 'Use 4 to 6 digits' }))
+    if (m.purpose === 'new') return setModal({ ...m, purpose: 'confirm', first: value, value: '', err: '' })
+    if (m.purpose === 'confirm') {
+      if (value !== m.first) { sfx.error(); return setModal({ ...m, purpose: 'new', first: '', value: '', err: 'PINs did not match', shake: m.shake + 1 }) }
+      setPinState((x) => ({ ...x, busy: true }))
+      const r = await window.shell.pinSet(value, m.cur)
+      if (!r.ok) return setModal({ ...m, purpose: 'new', first: '', value: '', err: r.error || 'Could not save the PIN', busy: false })
+      setSecurity(r.security); notify('PIN lock is on'); return endPinFlow(m)
+    }
+    setPinState((x) => ({ ...x, busy: true }))                       // unlock / verify current
+    const r = await window.shell.pinVerify(value)
+    if (!r.ok) return pinFail(r)
+    if (m.purpose === 'unlock') { sfx.ok(); setLocked(false); setLockPin(FRESH_PIN); return }
+    if (m.purpose === 'cur-change') return setModal({ ...newPin('new', { cur: value }), prev: m.prev })
+    const c = await window.shell.pinClear(value)                    // cur-remove
+    if (c.ok) { setSecurity(c.security); notify('PIN removed') } else notify(c.error || 'Could not remove the PIN', 'error')
+    endPinFlow(m)
+  }
+  const pinAdd = (d) => {
+    const m = pinState
+    if (!m || m.busy || m.lockUntil > Date.now() || m.value.length >= 6) return
+    const value = m.value + d
+    setPinState((x) => ({ ...x, value, err: '' }))
+    const target = m.purpose === 'confirm' ? m.first.length : ['unlock', 'cur-change', 'cur-remove'].includes(m.purpose) ? security.pinLen : 0
+    if (target && value.length === target) setTimeout(() => submitPin(value), 120)    // short beat so the last dot fills in
+  }
+  const pinDel = () => setPinState((x) => (x.busy ? x : { ...x, value: x.value.slice(0, -1), err: '' }))
+  const pinPress = () => {
+    const k = PIN_KEYS[pinState.sel]
+    if (k === 'del') pinDel(); else if (k === 'ok') submitPin(pinState.value); else pinAdd(k)
+  }
+  const lockNow = async () => {
+    await window.shell.pinLock()
+    setLockPin(FRESH_PIN); setModal(null); setFocusTop(false); setLocked(true)
+  }
+  // number keys / backspace on a real keyboard (dev) while a PIN screen is up
+  const pinKeys = useRef()
+  pinKeys.current = (e) => { if (!pinState) return; if (/^[0-9]$/.test(e.key)) pinAdd(e.key); else if (e.key === 'Backspace') pinDel() }
+  useEffect(() => { const f = (e) => pinKeys.current(e); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [])
+
+  // ---------- profile / wallpaper / music ----------
+  const pickImage = (kind, back) => openBrowser('image', (f) => busy(() => window.shell.setProfileImage(kind, f), 'Saving…', back), kind === 'avatar' ? 'Choose a profile picture' : 'Choose a wallpaper')
+  const openMusic = async (id) => {
+    setMusicBusy(id)
+    const r = await window.shell.musicOpen(id).catch(() => ({ ok: false, error: 'Could not open it' }))
+    setMusicBusy(null)
+    notify(r.ok ? (r.via === 'web' ? `${r.name} opened in your browser` : `Opening ${r.name}…`) : r.error, r.ok ? 'info' : 'error')
+    setTimeout(music.refresh, 4000); setTimeout(music.refresh, 9000)
   }
   const search = () => keyboard('Search your library', (q) => {
     setModal(null)
@@ -141,6 +241,28 @@ export default function Dashboard() {
   // ---------- menus ----------
   const rowsFor = (m) => {
     switch (m.type) {
+      case 'pinoffer': return [
+        { label: 'Set a PIN', sub: '4 to 6 digits, asked each time ConsoleShell starts', run: () => open(newPin('new')) },
+        { label: 'Skip for now', sub: 'You can set one later in Settings', run: () => { window.shell.pinSkip().then(setSecurity); setModal(null) } },
+      ]
+      case 'pinmenu': return security.pinSet ? [
+        { label: 'Change PIN', run: () => open(newPin('cur-change')) },
+        { label: 'Remove PIN', run: () => open(newPin('cur-remove')) },
+        { label: 'Lock now', sub: 'Ask for the PIN again', run: lockNow },
+        { label: 'Back', run: () => setModal(m.prev ?? null) },
+      ] : [
+        { label: 'Set a PIN', sub: '4 to 6 digits', run: () => open(newPin('new')) },
+        { label: 'Back', run: () => setModal(m.prev ?? null) },
+      ]
+      case 'profile': return [
+        { label: 'Change profile picture', sub: profile.avatar ? 'Replace your current picture' : 'Pick an image from this PC', run: () => pickImage('avatar', m) },
+        ...(profile.avatar ? [{ label: 'Remove profile picture', run: () => busy(() => window.shell.clearProfileImage('avatar'), 'Updating…', m) }] : []),
+        { label: `Name: ${profile.name}`, sub: 'Shown in the top bar', run: () => keyboard('Your name', (v) => (v.trim() ? busy(() => window.shell.setProfileName(v), 'Saving…', m) : setModal(m)), false, profile.name) },
+        { label: 'Set wallpaper', sub: profile.wallpaper ? 'Replace the current background' : 'Pick a background image', run: () => pickImage('wallpaper', m) },
+        ...(profile.wallpaper ? [{ label: 'Remove wallpaper', run: () => busy(() => window.shell.clearProfileImage('wallpaper'), 'Updating…', m) }] : []),
+        { label: `PIN lock: ${security.pinSet ? 'On' : 'Off'}`, sub: security.pinSet ? 'Change, remove or lock now' : 'Protect ConsoleShell with a PIN', run: () => open({ type: 'pinmenu', sel: 0 }) },
+        { label: 'Close', run: () => setModal(m.prev ?? null) },
+      ]
       case 'setup': return [
         ...(m.def ? [{ label: `Use ${m.def}`, sub: 'Found on this PC', run: () => setFolder(m.def) }] : []),
         { label: 'Browse folders…', run: () => openBrowser('folder', setFolder, 'Choose your games folder') },
@@ -151,6 +273,9 @@ export default function Dashboard() {
         const next = SORTS[(SORTS.findIndex((s) => s[0] === sort) + 1) % SORTS.length]
         return [
           { label: 'Appearance', sub: 'Colours, presets, sounds, button hints', run: () => open({ type: 'appearance', sel: 0 }) },
+          { label: 'Profile & wallpaper', sub: 'Picture, name, background image', run: () => open({ type: 'profile', sel: 0 }) },
+          { label: 'Music', sub: 'Spotify, Apple Music and more, in the background', run: () => open({ type: 'music', sel: 0, tsel: 1 }) },
+          { label: `PIN lock: ${security.pinSet ? 'On' : 'Off'}`, sub: security.pinSet ? 'Change, remove or lock now' : 'Ask for a PIN when ConsoleShell starts', run: () => open({ type: 'pinmenu', sel: 0 }) },
           { label: 'Search library', sub: 'Find a game with the on-screen keyboard', run: search },
           { label: `Sort: ${SORTS.find((s) => s[0] === sort)[1]}`, sub: `Select to switch to ${next[1]}`, run: () => busy(() => window.shell.setCfg({ sort: next[0] })) },
           { label: `Steam games: ${data?.config.importSteam ? 'Shown' : 'Hidden'}`, sub: 'Import installed Steam games', run: () => busy(() => window.shell.setCfg({ importSteam: !data?.config.importSteam }), 'Updating…') },
@@ -161,6 +286,7 @@ export default function Dashboard() {
         ]
       }
       case 'power': return [
+        ...(security.pinSet ? [{ label: 'Lock', sub: 'Ask for the PIN again', run: lockNow }] : []),
         { label: 'Sleep', run: () => { window.shell.power('sleep'); setModal(null) } },
         { label: 'Restart', run: () => ask('Restart', 'restart', 'Closes everything and reboots. Unsaved work is lost.') },
         { label: 'Shut down', run: () => ask('Shut down', 'shutdown', 'Force-closes apps and powers off. Unsaved work is lost.') },
@@ -220,16 +346,18 @@ export default function Dashboard() {
   }
 
   // Quick menu
-  const quickIds = ['volume', 'wifi', 'bluetooth', ...(st.brightness?.supported ? ['brightness'] : []), 'shortcuts']
+  const quickIds = ['volume', 'music', 'wifi', 'bluetooth', ...(st.brightness?.supported ? ['brightness'] : []), 'shortcuts']
   const quickAdjust = (dir) => {
     const id = quickIds[modal.sel], d = dir === 'right' ? 1 : -1
     if (id === 'volume') { if (st.volume !== null) sys.setVolume(st.volume + d * 5); else sys.volKey(d > 0 ? 'up' : 'down', 2) }
     if (id === 'brightness') sys.setBrightness(st.brightness.value + d * 5)
+    if (id === 'music' && music.media.active) music.command(d > 0 ? 'next' : 'prev')
     if (id === 'shortcuts') setModal((m) => ({ ...m, sc: clamp((m.sc ?? 0) + d, 0, 2) }))
   }
   const quickConfirm = () => {
     const id = quickIds[modal.sel]
     if (id === 'volume') { if (st.volume !== null) sys.toggleMute(); else sys.volKey('mute') }
+    if (id === 'music') { if (music.media.active) music.command('toggle'); else open({ type: 'music', sel: 1, tsel: 1 }) }
     if (id === 'wifi') openWifi()
     if (id === 'bluetooth') openBt()
     if (id === 'shortcuts') {
@@ -249,15 +377,25 @@ export default function Dashboard() {
   const { connected } = useGamepadNav({
     onMove: (dir) => {
       poke()
-      if (splash || modal?.type === 'busy') return
+      if (splash || modal?.type === 'busy' || launching) return
+      if (pinState) { sfx.move(); return setPinState((x) => ({ ...x, sel: movePinSel(x.sel, dir) })) }
       sfx.move()
-      if (!modal) return setIdx((x) => clamp(x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), 0, items.length - 1))
+      if (!modal) {
+        if (focusTop) { if (dir === 'down') setFocusTop(false); return }       // profile chip: Down returns to the tiles
+        if (dir === 'up') return setFocusTop(true)
+        return setIdx((x) => clamp(x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), 0, items.length - 1))
+      }
       if (modal.type === 'confirm') return setModal((m) => ({ ...m, sel: dir === 'left' ? 0 : dir === 'right' ? 1 : m.sel }))
       if (modal.type === 'keyboard') return setModal((m) => moveKey(m, dir))
       if (modal.type === 'appearance') {
         if (dir === 'up' || dir === 'down') return setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, APPEARANCE_ROWS - 1) }))
         return adjust(modal.sel, dir)
       }
+      if (modal.type === 'music') {
+        if (dir === 'up' || dir === 'down') return setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, MUSIC_ROWS - 1) }))
+        if (modal.sel === 0) setModal((m) => ({ ...m, tsel: clamp(m.tsel + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0), 0, 2) }))
+        return
+      }
       if (modal.type === 'quick') {
         if (dir === 'up' || dir === 'down') return setModal((m) => ({ ...m, sel: clamp(m.sel + (dir === 'down' ? 1 : -1), 0, quickIds.length - 1) }))
         return quickAdjust(dir)
@@ -266,13 +404,19 @@ export default function Dashboard() {
     },
     onConfirm: () => {
       poke()
-      if (splash) return setSplash(false)
+      if (splash) return setSkipTok((t) => t + 1)
+      if (launching) return
+      if (pinState) { sfx.ok(); return pinPress() }
       sfx.ok()
-      if (!modal) return activate(item)
+      if (!modal) return focusTop ? setModal({ type: 'profile', sel: 0 }) : activate(item)
       switch (modal.type) {
         case 'busy': return
         case 'confirm': if (modal.sel === 1) window.shell.power(modal.item.power); return setModal(modal.sel === 1 ? null : modal.prev ?? null)
         case 'appearance': return modal.sel === 5 ? setModal(modal.prev ?? null) : adjust(modal.sel, 'right')
+        case 'music':
+          if (modal.sel === 0) return music.command(['prev', 'toggle', 'next'][modal.tsel])
+          if (modal.sel === MUSIC_ROWS - 1) return setModal(modal.prev ?? null)
+          return openMusic(SERVICES[modal.sel - 1].id)
         case 'quick': return quickConfirm()
         case 'keyboard': { const r = pressKey(modal); return r.submit ? submitKeyboard() : setModal(r.m) }
         default: rows[Math.min(modal.sel, rows.length - 1)]?.run?.()
@@ -280,61 +424,80 @@ export default function Dashboard() {
     },
     onBack: () => {
       poke()
-      if (splash) return setSplash(false)
-      if (!modal || modal.type === 'busy' || modal.type === 'setup') return
+      if (splash) return setSkipTok((t) => t + 1)
+      if (launching) return cancelLaunch()
+      if (pinState) { sfx.back(); if (locked) return pinDel(); if (!pinState.value) return setModal(modal.prev ?? null); return pinDel() }
+      if (!modal) return focusTop ? setFocusTop(false) : undefined
+      if (modal.type === 'busy' || modal.type === 'setup' || modal.type === 'pinoffer') return
       sfx.back()
       setModal(modal.prev ?? null)
     },
     onX: () => {
       poke()
-      if (splash) return
+      if (splash || launching) return
+      if (pinState) return pinDel()
       if (modal?.type === 'keyboard') return setModal((m) => ({ ...m, value: m.value.slice(0, -1) }))
       if (!modal) open({ type: 'appearance', sel: 0 })
     },
     onY: () => {
       poke()
-      if (splash) return
+      if (splash || locked || launching) return
       if (modal?.type === 'keyboard') return setModal((m) => ({ ...m, value: m.value + ' ' }))
-      if (!modal && isGame) open({ type: 'art', sel: 0, game: item })
+      if (!modal && isGame && !focusTop) open({ type: 'art', sel: 0, game: item })
     },
     onStart: () => {
       poke()
-      if (splash) return
+      if (splash || launching) return
+      if (pinState) return submitPin(pinState.value)
       if (modal?.type === 'keyboard') return submitKeyboard()
       if (!modal) open({ type: 'settings', sel: 0 })
     },
     onQuick: () => {
       poke()
-      if (splash || modal?.type === 'busy') return
+      if (splash || locked || launching || modal?.type === 'busy' || modal?.type === 'pin') return
       sfx.ok()
       if (modal?.type === 'quick') return setModal(null)
-      sys.refresh(); sys.refreshPad()
+      sys.refresh(); sys.refreshPad(); music.refresh()
       setModal({ type: 'quick', sel: 0, sc: 0, prev: null })
     },
     onBumper: (d) => {
       poke()
-      if (splash || modal) return
+      if (splash || locked || launching || modal) return
       if (st.volume === null) return sys.volKey(d > 0 ? 'up' : 'down', 2)     // can't read the level: use the media keys
       sys.setVolume(st.volume + d * 5); sfx.move(); flashVol()
     },
   })
 
+  const pinProps = (m) => {
+    const pu = m.purpose
+    const title = { unlock: 'Enter your PIN', new: 'Set a PIN', confirm: 'Confirm your PIN', 'cur-change': 'Enter current PIN', 'cur-remove': 'Enter current PIN' }[pu]
+    const sub = { unlock: '', new: 'Choose 4 to 6 digits, then press ✓', confirm: 'Enter it once more', 'cur-change': 'Then you can choose a new one', 'cur-remove': 'To turn the PIN lock off' }[pu]
+    const dots = pu === 'new' ? 4 : pu === 'confirm' ? m.first.length : security.pinLen || 4
+    return { title, sub, value: m.value, dots, sel: m.sel, error: m.err, lockUntil: m.lockUntil, shake: m.shake,
+      hint: pu === 'unlock' ? undefined : 'D-pad choose  ·  A press  ·  B back  ·  Menu confirm' }
+  }
+
   const folder = data?.config.gamesFolders[0]
   const modalEl = !modal ? null
-    : modal.type === 'quick' ? <QuickMenu key="q" status={st} rows={quickIds} sel={modal.sel} sc={modal.sc ?? 0} padName={padLabel()} padIds={padIds()} pad={sys.pad} />
+    : modal.type === 'quick' ? <QuickMenu key="q" media={music.media} status={st} rows={quickIds} sel={modal.sel} sc={modal.sc ?? 0} padName={padLabel()} padIds={padIds()} pad={sys.pad} />
     : modal.type === 'appearance' ? <Appearance key="ap" theme={theme} sel={modal.sel} />
+    : modal.type === 'music' ? <MusicPanel key="mu" media={music.media} sel={modal.sel} tsel={modal.tsel} busyId={musicBusy} />
+    : modal.type === 'pin' ? <PinModal key="pin" {...pinProps(modal)} />
     : modal.type === 'keyboard' ? <KeyboardView key="kb" m={modal} />
     : modal.type === 'confirm' ? <Confirm key="c" item={modal.item} sel={modal.sel} />
     : modal.type === 'busy' ? <Busy key="b" text={modal.text} />
     : modal.type === 'browser' ? <Browser key="br" title={modal.title} dir={modal.dir} rows={rows} sel={modal.sel} />
     : <Menu key={modal.type} rows={rows} sel={modal.sel}
-        title={{ setup: 'Welcome', settings: 'Settings', power: 'Power', art: modal.game?.name, wifi: 'Wi-Fi', bt: 'Bluetooth' }[modal.type]}
-        sub={{ setup: 'Pick the folder that holds your games. ConsoleShell scans it for .exe files and remembers your choice.', art: `ID for overrides.json: ${modal.game?.id}` }[modal.type]} />
+        header={modal.type === 'profile' ? <div className="mb-5"><div className="inline-block rounded-full p-[3px]" style={{ background: grad(135) }}><Avatar profile={profile} size={84} /></div></div> : null}
+        title={{ setup: 'Welcome', settings: 'Settings', power: 'Power', art: modal.game?.name, wifi: 'Wi-Fi', bt: 'Bluetooth', profile: 'Profile', pinmenu: 'PIN lock', pinoffer: 'Protect with a PIN?' }[modal.type]}
+        sub={{ setup: 'Pick the folder that holds your games. ConsoleShell scans it for .exe files and remembers your choice.', pinoffer: 'Keep others out of your library. It only takes a moment, and you can skip it.', art: `ID for overrides.json: ${modal.game?.id}` }[modal.type]} />
 
   return (
     <div className="h-full w-full overflow-hidden bg-charcoal">
     <div className="relative overflow-hidden text-white" style={{ width: vp.w / scale, height: vp.h / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
       {/* ambient theme glow (plain gradients: no blur filters, cheap on 4K) + fine vertical grain */}
+      {/* your own wallpaper sits at the very back, dimmed so tiles stay readable */}
+      {profile.wallpaper && <><div className="absolute inset-0" style={{ background: `url("${profile.wallpaper}") center/cover` }} /><div className="absolute inset-0 bg-charcoal/50" /></>}
       <div className="absolute inset-0" style={{ background: 'radial-gradient(55% 62% at 90% -5%, rgb(var(--p) / .40), transparent 70%), radial-gradient(50% 58% at -3% 105%, rgb(var(--s) / .30), transparent 70%)' }} />
       <div className="absolute inset-0 opacity-[0.045]" style={{ background: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 72px)' }} />
 
@@ -348,7 +511,7 @@ export default function Dashboard() {
       </AnimatePresence>
       <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/30 to-charcoal/60" />
 
-      <TopBar status={st} padConnected={connected} pad={sys.pad} />
+      <TopBar status={st} padConnected={connected} pad={sys.pad} profile={profile} topFocused={focusTop && !modal && !launching} media={music.media} pinSet={security.pinSet} />
 
       <motion.div className="absolute flex items-start" style={{ top: 190, gap: GAP, willChange: 'transform' }}
         animate={{ x: 110 - i * (TILE + GAP) }} transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
@@ -356,12 +519,16 @@ export default function Dashboard() {
       </motion.div>
 
       <Widgets games={data?.games.filter((g) => g.id !== 'steam').length ?? 0} folder={folder} storage={data?.storage} connected={connected} />
-      <Prompts mode={splash ? null : modal ? (modal.type === 'keyboard' ? 'keyboard' : 'modal') : 'home'} canArt={isGame} show={awake || theme.hints === 'always'} />
+      <Prompts mode={splash || locked || launching ? null : modal ? (modal.type === 'keyboard' ? 'keyboard' : 'modal') : 'home'} canArt={isGame} show={awake || theme.hints === 'always'} />
       <VolumePop show={volShow} volume={st.volume} muted={st.muted} />
       <Toast t={toast} />
 
       <AnimatePresence mode="wait">{modalEl}</AnimatePresence>
-      <AnimatePresence>{splash && <Splash sound={data?.config.startupSound !== false} onDone={() => setSplash(false)} />}</AnimatePresence>
+      <AnimatePresence>{launching && <LoadingScreen key="ld" g={launching.g} ready={launching.ready} wallpaper={profile.wallpaper} />}</AnimatePresence>
+      {locked && <LockScreen profile={profile} {...pinProps(lockPin)} />}
+      {/* nothing from the library shows before the theme has loaded; the Splash starts as soon as it has */}
+      {!boot && <div className="absolute inset-0 z-[80] bg-charcoal" />}
+      {splash && boot && <Splash theme={boot.theme} sound={boot.config.startupSound !== false} skipToken={skipTok} onDone={() => setSplash(false)} />}
     </div>
     </div>
   )
diff --git a/src/Loading.jsx b/src/Loading.jsx
new file mode 100644
index 0000000..688e4aa
--- /dev/null
+++ b/src/Loading.jsx
@@ -0,0 +1,58 @@
+import { useEffect, useState } from 'react'
+import { motion } from 'framer-motion'
+import { TileFace, a, grad } from './ui'
+
+const SIZE = 320
+
+// Full-screen "starting your game" view. It stays up until the main process sees the game's own window
+// (state 'ready'), so there's never a gap showing the home screen between pressing A and the game appearing.
+export default function LoadingScreen({ g, ready, wallpaper }) {
+  const [secs, setSecs] = useState(0)
+  useEffect(() => {
+    const t = setInterval(() => setSecs((s) => s + 1), 1000)
+    return () => clearInterval(t)
+  }, [])
+
+  const status = ready ? 'Ready' : secs < 8 ? 'Starting…' : secs < 25 ? 'Still loading. Some games take a while.' : 'Waiting for the game window…'
+  const bg = g.wallpaper || wallpaper
+  const glow = g.accent ? `0 30px 100px ${g.accent}99` : `0 30px 100px ${a('p', 0.6)}, 0 0 180px ${a('s', 0.3)}`
+
+  return (
+    <motion.div className="absolute inset-0 z-[60] overflow-hidden bg-charcoal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
+      {bg && <div className="absolute inset-0 opacity-30" style={{ background: `url("${bg}") center/cover` }} />}
+      <div className="absolute inset-0" style={{ background: g.accent
+        ? `radial-gradient(60% 60% at 50% 42%, ${g.accent}44, transparent 70%)`
+        : 'radial-gradient(60% 60% at 50% 42%, rgb(var(--p) / .38), transparent 70%), radial-gradient(45% 50% at 85% 100%, rgb(var(--s) / .28), transparent 70%)' }} />
+      <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-transparent to-charcoal/50" />
+
+      <div className="absolute inset-0 flex flex-col items-center justify-center">
+        {/* the tile zooms in from roughly where it sat in the row, then breathes while we wait */}
+        <motion.div initial={{ scale: 0.55, opacity: 0.4, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 22 }}>
+          <motion.div animate={{ scale: ready ? 1.04 : [1, 1.025, 1] }} transition={ready ? { duration: 0.4 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
+            className="relative" style={{ width: SIZE, height: SIZE, borderRadius: 40, boxShadow: `0 0 0 3px rgba(255,255,255,.95), ${glow}` }}>
+            <TileFace g={g} size={SIZE} radius={40} />
+          </motion.div>
+        </motion.div>
+
+        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-12 text-center">
+          <div className="text-[44px] font-semibold leading-none tracking-tight">{g.name}</div>
+          <div className="mt-3 h-8 text-2xl text-white/60">{status}</div>
+        </motion.div>
+
+        <div className="relative mt-8 h-[6px] w-[380px] overflow-hidden rounded-full bg-white/15">
+          {ready
+            ? <motion.div initial={{ width: '30%' }} animate={{ width: '100%' }} transition={{ duration: 0.4 }} className="h-full rounded-full" style={{ background: grad(90) }} />
+            : <motion.div animate={{ x: ['-100%', '280%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }} className="absolute inset-y-0 w-1/3 rounded-full" style={{ background: grad(90) }} />}
+        </div>
+      </div>
+
+      {!ready && (
+        <div className="absolute inset-x-0 bottom-10 flex justify-center">
+          <span className="flex items-center gap-2 text-[15px] text-white/55">
+            <b className="grid h-6 min-w-6 place-items-center rounded-full border border-white/30 bg-white/10 px-1.5 text-[11px] font-semibold">B</b>Cancel
+          </span>
+        </div>
+      )}
+    </motion.div>
+  )
+}
diff --git a/src/Lock.jsx b/src/Lock.jsx
new file mode 100644
index 0000000..bda924f
--- /dev/null
+++ b/src/Lock.jsx
@@ -0,0 +1,87 @@
+import { useEffect, useState } from 'react'
+import { motion } from 'framer-motion'
+import { Overlay, Avatar, glass, grad, a } from './ui'
+
+// 3 x 4 keypad. The Dashboard drives it from the d-pad (movePinSel) and A (key at `sel`).
+export const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']
+
+export function movePinSel(sel, dir) {
+  let r = Math.floor(sel / 3), c = sel % 3
+  if (dir === 'up') r = Math.max(0, r - 1)
+  if (dir === 'down') r = Math.min(3, r + 1)
+  if (dir === 'left') c = Math.max(0, c - 1)
+  if (dir === 'right') c = Math.min(2, c + 1)
+  return r * 3 + c
+}
+
+const label = (k) => (k === 'del' ? '⌫' : k === 'ok' ? '✓' : k)
+
+export function PinPad({ title, sub, value, dots = 4, sel, error, lockUntil = 0, shake = 0, hint, header }) {
+  const [now, setNow] = useState(Date.now())
+  const wait = Math.max(0, Math.ceil((lockUntil - now) / 1000))
+  useEffect(() => {
+    if (lockUntil <= Date.now()) return
+    const t = setInterval(() => setNow(Date.now()), 250)
+    return () => clearInterval(t)
+  }, [lockUntil])
+
+  const n = Math.max(dots, value.length)
+  return (
+    <div className="flex w-[440px] flex-col items-center">
+      {header}
+      <h2 className="text-4xl font-semibold">{title}</h2>
+      <p className="mt-2 h-7 text-xl" style={{ color: error || wait ? 'rgb(255 120 140)' : 'rgba(255,255,255,.6)' }}>
+        {wait ? `Too many attempts. Try again in ${wait}s` : error || sub}
+      </p>
+
+      <motion.div key={shake} animate={{ x: shake ? [0, -16, 16, -11, 11, -5, 5, 0] : 0 }} transition={{ duration: 0.38 }} className="my-8 flex gap-4">
+        {Array.from({ length: n }, (_, i) => (
+          <motion.i key={i} animate={{ scale: i < value.length ? 1.12 : 1 }} className="block h-5 w-5 rounded-full"
+            style={i < value.length ? { background: grad(100), boxShadow: `0 0 16px ${a('p', 0.7)}` } : { background: 'rgba(255,255,255,.16)' }} />
+        ))}
+      </motion.div>
+
+      <div className="grid grid-cols-3 gap-3" style={{ opacity: wait ? 0.35 : 1 }}>
+        {PIN_KEYS.map((k, i) => {
+          const active = sel === i
+          return (
+            <motion.div key={k} animate={{ scale: active ? 1.08 : 1 }}
+              className="grid h-[84px] w-[124px] place-items-center rounded-2xl text-[34px] font-medium"
+              style={active ? { background: grad(100), boxShadow: `0 10px 30px ${a('p', 0.5)}` } : { background: 'rgba(255,255,255,.08)', color: k === 'ok' || k === 'del' ? 'rgba(255,255,255,.7)' : undefined }}>
+              {label(k)}
+            </motion.div>
+          )
+        })}
+      </div>
+      <div className="mt-6 text-center text-base text-white/40">{hint || 'D-pad choose  ·  A press  ·  B delete'}</div>
+    </div>
+  )
+}
+
+// Full-screen lock shown at start-up when a PIN is set. Opaque on purpose: nothing from the library shows through.
+export function LockScreen({ profile, ...pad }) {
+  return (
+    <div className="absolute inset-0 z-[70] grid place-items-center bg-charcoal">
+      <div className="absolute inset-0" style={{ background: 'radial-gradient(55% 62% at 90% -5%, rgb(var(--p) / .40), transparent 70%), radial-gradient(50% 58% at -3% 105%, rgb(var(--s) / .30), transparent 70%)' }} />
+      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative">
+        <PinPad {...pad}
+          header={(
+            <div className="mb-5 flex flex-col items-center gap-3">
+              <div className="rounded-full p-[3px]" style={{ background: grad(135) }}><Avatar profile={profile} size={92} /></div>
+              <div className="text-2xl text-white/80">{profile?.name || 'Player 1'}</div>
+            </div>
+          )}
+          hint={pad.hint || 'D-pad choose  ·  A press  ·  B delete'} />
+      </motion.div>
+    </div>
+  )
+}
+
+// PIN entry inside the normal modal frame (set / confirm / change / remove).
+export function PinModal(props) {
+  return (
+    <Overlay>
+      <div className={`rounded-[32px] px-10 py-9 ${glass}`}><PinPad {...props} /></div>
+    </Overlay>
+  )
+}
diff --git a/src/Music.jsx b/src/Music.jsx
new file mode 100644
index 0000000..a79d046
--- /dev/null
+++ b/src/Music.jsx
@@ -0,0 +1,100 @@
+import { useCallback, useEffect, useRef, useState } from 'react'
+import { motion } from 'framer-motion'
+import { solid, grad, a } from './ui'
+import { MusicIcon, PlayIcon, PauseIcon, PrevIcon, NextIcon } from './icons'
+
+export const SERVICES = [
+  { id: 'spotify', name: 'Spotify', sub: 'Starts the Spotify app in the background' },
+  { id: 'apple', name: 'Apple Music', sub: 'Starts the Apple Music app in the background' },
+  { id: 'ytmusic', name: 'YouTube Music', sub: 'Opens in your browser, keeps playing behind the shell' },
+]
+export const MUSIC_ROWS = 2 + SERVICES.length      // now playing, each service, Done
+
+const EMPTY = { active: false }
+
+// What's playing right now. Reads Windows' media session, so it works with Spotify, Apple Music, a browser tab, anything
+// that shows up in the Windows volume flyout. Music keeps playing while a game runs because the app itself is separate.
+export function useMedia() {
+  const [media, setMedia] = useState(EMPTY)
+  const dead = useRef(0)
+  const refresh = useCallback(async () => {
+    try { setMedia(await window.shell.media()); dead.current = 0 } catch { dead.current += 1 }
+  }, [])
+  useEffect(() => {
+    refresh()
+    const t = setInterval(() => { if (document.visibilityState !== 'hidden' && dead.current < 5) refresh() }, 5000)
+    return () => clearInterval(t)
+  }, [refresh])
+  const command = useCallback(async (action) => {
+    setMedia((m) => (action === 'toggle' && m.active ? { ...m, status: m.status === 'Playing' ? 'Paused' : 'Playing' } : m))   // instant feedback
+    try { setMedia(await window.shell.mediaCmd(action)) } catch {}
+    setTimeout(refresh, 900)
+  }, [refresh])
+  return { media, refresh, command }
+}
+
+const Section = ({ active, title, hint, children }) => (
+  <motion.div animate={{ opacity: active ? 1 : 0.7 }} className="rounded-2xl p-5"
+    style={active ? { background: 'rgba(255,255,255,.1)', boxShadow: `inset 0 0 0 2px rgba(255,255,255,.7), 0 0 40px ${a('p', 0.3)}` } : { background: 'rgba(255,255,255,.04)' }}>
+    <div className="mb-3 flex items-center justify-between text-[13px] font-medium uppercase tracking-[0.2em] text-white/55">
+      <span>{title}</span>{active && hint && <span className="normal-case tracking-normal text-white/50">{hint}</span>}
+    </div>
+    {children}
+  </motion.div>
+)
+
+export default function MusicPanel({ media, sel, tsel, busyId }) {
+  const playing = media.active && media.status === 'Playing'
+  const Icons = [PrevIcon, playing ? PauseIcon : PlayIcon, NextIcon]
+  return (
+    <motion.div initial={{ x: 560, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 560, opacity: 0 }}
+      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
+      className={`absolute bottom-8 right-8 top-8 z-30 flex w-[520px] flex-col gap-3.5 rounded-[32px] p-8 ${solid}`}>
+      <div>
+        <h2 className="text-4xl font-semibold">Music</h2>
+        <p className="mt-1 text-lg text-white/50">Plays in the background, even while you game.</p>
+      </div>
+
+      <Section active={sel === 0} title="Now playing" hint="◀ ▶ choose  ·  A press">
+        <div className="flex items-center gap-5">
+          <div className="grid h-[84px] w-[84px] flex-none place-items-center rounded-2xl text-white/90" style={{ background: grad(135), boxShadow: `0 10px 30px ${a('p', 0.4)}` }}>
+            <MusicIcon size={38} />
+          </div>
+          <div className="min-w-0 flex-1">
+            <div className="truncate text-2xl font-medium">{media.active ? media.title || 'Unknown track' : 'Nothing playing'}</div>
+            <div className="truncate text-lg text-white/55">{media.active ? media.artist || media.album || (playing ? 'Playing' : 'Paused') : 'Start a service below'}</div>
+          </div>
+        </div>
+        <div className="mt-5 flex gap-3">
+          {Icons.map((Icon, i) => (
+            <motion.div key={i} animate={{ scale: sel === 0 && tsel === i ? 1.06 : 1 }} className="grid h-16 flex-1 place-items-center rounded-xl"
+              style={sel === 0 && tsel === i ? { background: grad(100), boxShadow: `0 8px 24px ${a('p', 0.4)}` } : { background: 'rgba(255,255,255,.07)' }}>
+              <Icon size={28} />
+            </motion.div>
+          ))}
+        </div>
+      </Section>
+
+      <Section active={sel >= 1 && sel <= SERVICES.length} title="Start a service" hint="A  open">
+        <div className="flex flex-col gap-2.5">
+          {SERVICES.map((s, i) => {
+            const on = sel === i + 1
+            return (
+              <motion.div key={s.id} animate={{ scale: on ? 1.02 : 1 }} className="rounded-xl px-5 py-2.5"
+                style={on ? { background: grad(100), boxShadow: `0 8px 24px ${a('p', 0.4)}` } : { background: 'rgba(255,255,255,.07)' }}>
+                <div className="text-xl font-medium">{busyId === s.id ? 'Opening…' : s.name}</div>
+                <div className={`truncate text-sm ${on ? 'text-white/80' : 'text-white/45'}`}>{s.sub}</div>
+              </motion.div>
+            )
+          })}
+        </div>
+      </Section>
+
+      <div className="mt-auto">
+        <motion.div animate={{ scale: sel === MUSIC_ROWS - 1 ? 1.03 : 1 }} className="rounded-2xl py-4 text-center text-2xl font-semibold"
+          style={sel === MUSIC_ROWS - 1 ? { background: grad(100), boxShadow: `0 10px 34px ${a('p', 0.5)}` } : { background: 'rgba(255,255,255,.08)' }}>Done</motion.div>
+        <div className="mt-4 text-center text-base text-white/40">Up / Down choose  ·  Left / Right adjust  ·  B close</div>
+      </div>
+    </motion.div>
+  )
+}
diff --git a/src/QuickMenu.jsx b/src/QuickMenu.jsx
index af0f2fd..5964190 100644
--- a/src/QuickMenu.jsx
+++ b/src/QuickMenu.jsx
@@ -1,6 +1,6 @@
 import { motion } from 'framer-motion'
 import { solid, grad, a } from './ui'
-import { WifiIcon, BtIcon, VolIcon, PadIcon, SunIcon } from './icons'
+import { WifiIcon, BtIcon, VolIcon, PadIcon, SunIcon, MusicIcon } from './icons'
 
 const Section = ({ active, title, hint, children }) => (
   <motion.div animate={{ opacity: active ? 1 : 0.7 }} className="rounded-2xl p-4"
@@ -28,7 +28,7 @@ function batteryInfo(c, pad) {
   return { text: LEVELS[c.level] || 'Wireless', seg: c.level + 1 }
 }
 
-export default function QuickMenu({ status, rows, sel, sc, padName, padIds, pad }) {
+export default function QuickMenu({ status, rows, sel, sc, padName, padIds, pad, media }) {
   const act = rows[sel]
   const vol = status.volume
   const w = status.wifi || {}
@@ -41,7 +41,7 @@ export default function QuickMenu({ status, rows, sel, sc, padName, padIds, pad
   return (
     <motion.div initial={{ x: 560, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 560, opacity: 0 }}
       transition={{ type: 'spring', stiffness: 300, damping: 34 }}
-      className={`absolute bottom-8 right-8 top-8 z-30 flex w-[520px] flex-col gap-3 overflow-hidden rounded-[32px] p-7 ${solid}`}>
+      className={`absolute bottom-8 right-8 top-8 z-30 flex w-[520px] flex-col gap-2.5 overflow-hidden rounded-[32px] p-7 ${solid}`}>
       <div>
         <h2 className="text-4xl font-semibold">Quick menu</h2>
         <p className="mt-1 text-lg text-white/50">Sound, connections and shortcuts.</p>
@@ -65,6 +65,16 @@ export default function QuickMenu({ status, rows, sel, sc, padName, padIds, pad
         )}
       </Section>
 
+      <Section active={act === 'music'} title="Music" hint={media?.active ? '◀ ▶ skip  ·  A play/pause' : 'A  open music'}>
+        <div className="flex items-center gap-4">
+          <MusicIcon size={28} />
+          <div className="min-w-0 flex-1">
+            <div className="truncate text-xl">{media?.active ? media.title || 'Unknown track' : 'Nothing playing'}</div>
+            <div className="truncate text-sm text-white/45">{media?.active ? `${media.artist || ''}${media.artist ? '  ·  ' : ''}${media.status === 'Playing' ? 'Playing' : 'Paused'}` : 'Open Spotify or Apple Music'}</div>
+          </div>
+        </div>
+      </Section>
+
       <Section active={act === 'wifi'} title="Wi-Fi" hint="A  networks">
         <div className="flex items-center gap-4 text-xl"><WifiIcon size={28} level={Math.ceil((w.signal || 0) / 34)} off={w.radio === 'Off' || !w.supported} /><span className="truncate">{wifiText}</span></div>
       </Section>
diff --git a/src/Splash.jsx b/src/Splash.jsx
index 2504c84..90c983d 100644
--- a/src/Splash.jsx
+++ b/src/Splash.jsx
@@ -1,4 +1,5 @@
 import React, { useEffect, useRef, useState } from "react";
+import { splashPalette, DEFAULT_THEME } from "./theme";
 
 /* ───────────── helpers ───────────── */
 const DURATION = 6;
@@ -14,8 +15,7 @@ const rng = (seed) => () => {
   return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
 
-const PINK = "240,110,210", VIOLET = "139,92,246", PERI = "104,138,255", LAV = "233,228,255";
-const PALETTE = [PINK, PERI, VIOLET, LAV];
+// Colours are no longer hard-coded: splashPalette(theme) in theme.js derives them from the OS theme the user picked.
 
 function makeSprite(rgb, hard) {
   const c = document.createElement("canvas");
@@ -177,14 +177,24 @@ const glow = (g2, x, y, rad, stops) => {
   g2.fillStyle = g; g2.fillRect(x - rad, y - rad, rad * 2, rad * 2);
 };
 
-export default function StartupAnimation({ onComplete, children }) {
+export default function StartupAnimation({ onComplete, onDone, theme, sound = true, skipToken = 0, children }) {
   const [done, setDone] = useState(false);
+  // palette is fixed for this run: the theme can't change while the 6 s intro is playing
+  const palRef = useRef(null);
+  if (!palRef.current) palRef.current = splashPalette(theme || DEFAULT_THEME);
+  const soundRef = useRef(sound);
+  soundRef.current = sound;
   const layerRef = useRef(null), canvasRef = useRef(null), hintRef = useRef(null);
-  const cbRef = useRef(onComplete);
-  cbRef.current = onComplete;
+  const cbRef = useRef(onDone || onComplete);
+  cbRef.current = onDone || onComplete;
+
+  // lets the host (gamepad A / B) skip the intro through the same path as a key press
+  useEffect(() => { if (skipToken) window.dispatchEvent(new Event("splash:skip")); }, [skipToken]);
 
   useEffect(() => {
     const layer = layerRef.current, canvas = canvasRef.current, hint = hintRef.current;
+    const { PINK, VIOLET, PERI, LAV, FLARE, SHEEN, NAVY, DEEP } = palRef.current;
+    const PALETTE = [PINK, PERI, VIOLET, LAV];
     const c = canvas.getContext("2d", { alpha: false });
     // half-cost tricks: soft lighting lives on a quarter-res buffer, the title on its own small canvas
     const bg = document.createElement("canvas"), bc = bg.getContext("2d");
@@ -210,7 +220,7 @@ export default function StartupAnimation({ onComplete, children }) {
     const elapsed = () => (start == null ? 0 : Math.max(0, (performance.now() - start) / 1000));
 
     /* audio */
-    const audio = createAudio(() => false);
+    const audio = createAudio(() => soundRef.current === false);
     const tryStart = () => {
       if (!audio || scheduled || stopped || audio.ctx.state !== "running") return;
       scheduled = true; audio.schedule(elapsed());
@@ -256,6 +266,8 @@ export default function StartupAnimation({ onComplete, children }) {
     };
     window.addEventListener("keydown", onInput);
     window.addEventListener("pointerdown", onInput);
+    const onSkipEvt = () => { resume(); if (elapsed() > 1.0) skip(); };
+    window.addEventListener("splash:skip", onSkipEvt);
 
     const finish = () => {
       if (finished) return; finished = true;
@@ -277,7 +289,7 @@ export default function StartupAnimation({ onComplete, children }) {
       const p = lerp(-0.3, 1.3, easeInOutCubic((t - 4.0) / 1.0)), bx = x0 + sz * p;
       if (p > -0.29 && p < 1.29) {
         const g = tc.createLinearGradient(bx - sz * 0.25, y0, bx + sz * 0.25, y0 + sz);
-        g.addColorStop(0, `rgba(${PINK},0)`); g.addColorStop(0.5, "rgba(255,240,252,.95)"); g.addColorStop(1, `rgba(${PERI},0)`);
+        g.addColorStop(0, `rgba(${PINK},0)`); g.addColorStop(0.5, `rgba(${SHEEN},.95)`); g.addColorStop(1, `rgba(${PERI},0)`);
         tc.globalCompositeOperation = "source-atop"; tc.fillStyle = g; tc.fillRect(0, 0, tcw, tch);
       }
       const op = smooth(3.7, 4.5, t) * (t > 4.8 ? 0.93 + 0.07 * Math.sin((t - 4.8) * 2.6) : 1);
@@ -299,8 +311,8 @@ export default function StartupAnimation({ onComplete, children }) {
 
       /* soft lighting on the quarter-res buffer */
       bc.globalCompositeOperation = "source-over";
-      bc.fillStyle = "#05061c"; bc.fillRect(0, 0, W, H);
-      if (nv > 0.001) glow(bc, cx, cy, Math.max(W, H) * 0.75, [[0, `rgba(18,24,118,${nv})`], [1, "rgba(5,6,28,0)"]]);
+      bc.fillStyle = `rgb(${DEEP})`; bc.fillRect(0, 0, W, H);
+      if (nv > 0.001) glow(bc, cx, cy, Math.max(W, H) * 0.75, [[0, `rgba(${NAVY},${nv})`], [1, `rgba(${DEEP},0)`]]);
       bc.globalCompositeOperation = "lighter";
       if (amb > 0.001) glow(bc, cx, cy, minD * 0.38, [[0, `rgba(${LAV},${0.12 * amb})`], [0.35, `rgba(${VIOLET},${0.1 * amb})`], [1, `rgba(${VIOLET},0)`]]);
       if (mid > 0.001) {
@@ -316,7 +328,7 @@ export default function StartupAnimation({ onComplete, children }) {
         }
         bc.restore();
       }
-      if (F > 0.002) glow(bc, cx, cy, minD * (0.22 + 0.22 * P), [[0, `rgba(255,236,252,${0.85 * Math.min(F, 1)})`], [0.25, `rgba(${PINK},${0.32 * F})`], [0.6, `rgba(${VIOLET},${0.14 * F})`], [1, `rgba(${VIOLET},0)`]]);
+      if (F > 0.002) glow(bc, cx, cy, minD * (0.22 + 0.22 * P), [[0, `rgba(${FLARE},${0.85 * Math.min(F, 1)})`], [0.25, `rgba(${PINK},${0.32 * F})`], [0.6, `rgba(${VIOLET},${0.14 * F})`], [1, `rgba(${VIOLET},0)`]]);
       if (tg > 0.001) glow(bc, cx, cy, minD * 0.3, [[0, `rgba(${PINK},${0.09 * tg})`], [0.5, `rgba(${PERI},${0.07 * tg})`], [1, `rgba(${PERI},0)`]]);
 
       c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
@@ -430,6 +442,7 @@ export default function StartupAnimation({ onComplete, children }) {
       window.removeEventListener("resize", resize);
       window.removeEventListener("keydown", onInput);
       window.removeEventListener("pointerdown", onInput);
+      window.removeEventListener("splash:skip", onSkipEvt);
       if (audio) { audio.ctx.removeEventListener("statechange", tryStart); audio.close(); }
     };
   }, []);
@@ -441,10 +454,10 @@ export default function StartupAnimation({ onComplete, children }) {
 
       {!done && (
         <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden", fontFamily: FONT }}>
-          <div ref={layerRef} style={{ position: "absolute", inset: 0, background: "#05061c", willChange: "opacity, transform" }}>
+          <div ref={layerRef} style={{ position: "absolute", inset: 0, background: palRef.current.DEEP_HEX, willChange: "opacity, transform" }}>
             <h1 style={srOnly}>{TITLE}</h1>
             <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, display: "block" }} />
-            <div ref={hintRef} style={{ position: "absolute", left: 0, right: 0, bottom: 28, textAlign: "center", fontSize: 12, letterSpacing: "0.06em", color: "rgba(233,228,255,.5)", opacity: 0, pointerEvents: "none" }}>
+            <div ref={hintRef} style={{ position: "absolute", left: 0, right: 0, bottom: 28, textAlign: "center", fontSize: 12, letterSpacing: "0.06em", color: `rgba(${palRef.current.LAV},.5)`, opacity: 0, pointerEvents: "none" }}>
               Press any key or click to skip
             </div>
           </div>
diff --git a/src/icons.jsx b/src/icons.jsx
index d6f9e11..1200c89 100644
--- a/src/icons.jsx
+++ b/src/icons.jsx
@@ -44,3 +44,14 @@ export const SunIcon = ({ size = 24 }) => (
 export const StarIcon = ({ size = 18 }) => (
   <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8z" /></svg>
 )
+
+export const MusicIcon = ({ size = 24 }) => (
+  <svg {...base} width={size} height={size}><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>
+)
+export const LockIcon = ({ size = 24 }) => (
+  <svg {...base} width={size} height={size}><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
+)
+export const PlayIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
+export const PauseIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></svg>
+export const PrevIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><rect x="5" y="5" width="2.6" height="14" rx="1" /><path d="M19 5.5v13L9 12z" /></svg>
+export const NextIcon = ({ size = 24 }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><rect x="16.4" y="5" width="2.6" height="14" rx="1" /><path d="M5 5.5v13L15 12z" /></svg>
diff --git a/src/theme.js b/src/theme.js
index 53d4254..96c29f0 100644
--- a/src/theme.js
+++ b/src/theme.js
@@ -32,3 +32,34 @@ export function applyTheme(t) {
   st.setProperty('--p', hexToRgb(t.primary).join(' '))
   st.setProperty('--s', hexToRgb(t.secondary).join(' '))
 }
+
+/* ---------- startup animation palette ----------
+   The splash used to hard-code pink / violet / periwinkle. These are now derived from the user's two theme colours:
+     secondary -> the "hot" accent (was pink)      primary -> the main glow (was violet)
+     third     -> a cooler neighbour of primary    (was periwinkle)
+   With the default Nebula theme the result is within a few RGB points of the original animation. */
+const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
+const WHITE = [255, 255, 255]
+// Very dark themes would make the glows invisible on the dark background, so keep the splash colours reasonably bright.
+const lift = (hex) => {
+  const [h, s, l] = hexToHsl(hex)
+  return hexToRgb(hslToHex(h, s < 0.05 ? s : Math.max(s, 0.5), Math.max(l, 0.55)))
+}
+export function splashPalette(t) {
+  const theme = t || DEFAULT_THEME
+  const P = lift(theme.primary), S = lift(theme.secondary)
+  const [hp, sp, lp] = hexToHsl(theme.primary), [hs] = hexToHsl(theme.secondary)
+  const d = ((hs - hp + 540) % 360) - 180                       // signed hue distance primary -> secondary
+  const grey = sp < 0.08                                          // hue means nothing for a grey primary: don't invent colour
+  const third = hexToRgb(hslToHex((hp + (d >= 0 ? -32 : 32) + 360) % 360, grey ? sp : Math.max(sp, 0.7), Math.min(0.72, Math.max(lp, 0.6))))
+  const str = (c) => c.join(',')
+  const deep = hslToHex(hp, grey ? 0.08 : 0.7, 0.065)                         // the old #05061c, tinted by the theme
+  const navy = hexToRgb(hslToHex(hp, grey ? 0.08 : 0.72, 0.26))                // the old rgba(18,24,118) vignette
+  return {
+    PINK: str(S), VIOLET: str(P), PERI: str(third),
+    LAV: str(mixRgb(P, WHITE, 0.82)),                           // pale tint for ribbons / flare streak
+    FLARE: str(mixRgb(S, WHITE, 0.88)),                         // white-hot centre of the reveal flash
+    SHEEN: str(mixRgb(S, WHITE, 0.92)),                         // glass sweep across the logo
+    NAVY: str(navy), DEEP: str(hexToRgb(deep)), DEEP_HEX: deep,
+  }
+}
diff --git a/src/ui.jsx b/src/ui.jsx
index b8de283..f5d0017 100644
--- a/src/ui.jsx
+++ b/src/ui.jsx
@@ -1,6 +1,6 @@
 import { useEffect, useState } from 'react'
 import { AnimatePresence, motion } from 'framer-motion'
-import { WifiIcon, BtIcon, VolIcon, PadIcon, StarIcon } from './icons'
+import { WifiIcon, BtIcon, VolIcon, PadIcon, StarIcon, MusicIcon, LockIcon } from './icons'
 
 export const TILE = 172, TILE_FOCUS = 288, GAP = 24
 const SPRING = { type: 'spring', stiffness: 340, damping: 32 }
@@ -28,26 +28,34 @@ const Svg = ({ children }) => (
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="absolute left-1/2 top-1/2 h-[36%] w-[36%] -translate-x-1/2 -translate-y-1/2 text-white/85">{children}</svg>
 )
 
-export function Tile({ g, focused }) {
-  const size = focused ? TILE_FOCUS : TILE
+// The tile artwork on its own (used by the row and by the launch screen).
+export function TileFace({ g, size, radius = 28 }) {
   const sys = g.kind === 'settings' || g.kind === 'power'
   const ang = angleOf(g.id)
   const bg = g.tile ? `url("${g.tile}") center/cover`
     : sys ? 'linear-gradient(150deg,#2b2c3a,#14151d)'
     : g.accent ? `linear-gradient(${ang}deg, ${g.accent}e6, ${g.accent}40 58%, #0d0e18)`
     : `linear-gradient(${ang}deg, ${a('p', 0.92)} 0%, ${a('s', 0.55)} 58%, #0d0e18 100%)`
+  return (
+    <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius, background: bg, boxShadow: '0 10px 24px rgba(0,0,0,.45)' }}>
+      {g.kind === 'settings' && <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>}
+      {g.kind === 'power' && <Svg><path d="M12 3v9" /><path d="M6.4 6.4a8 8 0 1 0 11.2 0" /></Svg>}
+      {!sys && !g.tile && (g.icon ? (<>
+        <img src={g.icon} alt="" className="absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,.55)]" />
+      </>) : <span className="absolute inset-0 grid place-items-center font-semibold text-white/85" style={{ fontSize: size * 0.4 }}>{g.name[0]}</span>)}
+      {g.fav && <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white"><StarIcon size={16} /></div>}
+      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.22] via-transparent to-black/30 ring-1 ring-inset ring-white/20" style={{ borderRadius: radius }} />
+    </div>
+  )
+}
+
+export function Tile({ g, focused }) {
+  const size = focused ? TILE_FOCUS : TILE
+  const sys = g.kind === 'settings' || g.kind === 'power'
   const glow = g.accent ? `0 20px 60px ${g.accent}88` : `0 20px 64px ${a('p', 0.55)}, 0 0 110px ${a('s', 0.28)}`
   return (
     <motion.div animate={{ width: size, height: size }} transition={SPRING} className="relative flex-none">
-      <div className="absolute inset-0 overflow-hidden rounded-[28px]" style={{ background: bg, boxShadow: '0 10px 24px rgba(0,0,0,.45)' }}>
-        {g.kind === 'settings' && <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>}
-        {g.kind === 'power' && <Svg><path d="M12 3v9" /><path d="M6.4 6.4a8 8 0 1 0 11.2 0" /></Svg>}
-        {!sys && !g.tile && (g.icon ? (<>
-          <img src={g.icon} alt="" className="absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,.55)]" />
-        </>) : <span className="absolute inset-0 grid place-items-center font-semibold text-white/85" style={{ fontSize: size * 0.4 }}>{g.name[0]}</span>)}
-        {g.fav && <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white"><StarIcon size={16} /></div>}
-        <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-b from-white/[0.22] via-transparent to-black/30 ring-1 ring-inset ring-white/20" />
-      </div>
+      <TileFace g={g} size={size} />
       <motion.div initial={false} animate={{ opacity: focused ? 1 : 0 }} transition={{ duration: 0.2 }} className="pointer-events-none absolute inset-0 rounded-[28px]"
         style={{ boxShadow: `0 0 0 3px rgba(255,255,255,.96), ${glow}` }} />
       <motion.div animate={{ opacity: focused ? 1 : 0, y: focused ? 0 : -6 }} className="pointer-events-none absolute left-1 top-full mt-5 whitespace-nowrap">
@@ -61,6 +69,16 @@ export function Tile({ g, focused }) {
   )
 }
 
+// Profile picture, or the first letters of the name when there isn't one.
+export function Avatar({ profile, size = 44 }) {
+  const initials = (profile?.name || 'P1').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
+  return (
+    <div className="grid flex-none place-items-center overflow-hidden rounded-full bg-charcoal font-semibold" style={{ width: size, height: size, fontSize: size * 0.36 }}>
+      {profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full object-cover" draggable={false} /> : initials}
+    </div>
+  )
+}
+
 const Battery = ({ pct }) => (
   <span className="flex items-center gap-2">
     <span className="relative h-[14px] w-[26px] rounded-[4px] border border-white/60 p-[1.5px]">
@@ -70,7 +88,7 @@ const Battery = ({ pct }) => (
   </span>
 )
 
-export function TopBar({ status, padConnected, pad }) {
+export function TopBar({ status, padConnected, pad, profile, topFocused, media, pinSet }) {
   const [now, setNow] = useState(new Date())
   const [bat, setBat] = useState(null)
   const [online, setOnline] = useState(navigator.onLine)
@@ -93,8 +111,17 @@ export function TopBar({ status, padConnected, pad }) {
           <div className="mt-1.5 text-base text-white/50">{now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>
         </div>
       </div>
+      {media?.active && media.status === 'Playing' && media.title && (
+        <div className="mx-8 flex min-w-0 flex-1 items-center justify-center">
+          <div className={`flex max-w-[460px] items-center gap-3 rounded-full px-5 py-2.5 text-lg ${glass}`}>
+            <span className="flex-none" style={{ color: `rgb(var(--s))` }}><MusicIcon size={22} /></span>
+            <span className="truncate">{media.title}{media.artist ? <span className="text-white/55">  ·  {media.artist}</span> : null}</span>
+          </div>
+        </div>
+      )}
       <div className={`flex items-center gap-5 rounded-full py-2 pl-7 pr-2 text-xl ${glass}`}>
         <span className="flex items-center gap-2.5"><i className="h-2.5 w-2.5 rounded-full" style={online ? { background: a('s'), boxShadow: `0 0 12px ${a('s')}` } : { background: 'rgba(255,255,255,.3)' }} />{online ? 'Online' : 'Offline'}</span>
+        {pinSet && <LockIcon size={22} />}
         <span className="h-6 w-px bg-white/15" />
         {w.supported && <WifiIcon size={24} level={Math.ceil((w.signal || 0) / 34)} off={w.radio === 'Off'} />}
         {bt.supported && <BtIcon size={24} off={bt.radio !== 'On'} />}
@@ -107,9 +134,13 @@ export function TopBar({ status, padConnected, pad }) {
         {bat !== null && <Battery pct={bat} />}
         <span className="h-6 w-px bg-white/15" />
         <span className="font-medium tabular-nums">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
-        <div className="rounded-full p-[2.5px]" style={{ background: grad(135) }}>
-          <div className="grid h-11 w-11 place-items-center rounded-full bg-charcoal text-base font-semibold">P1</div>
-        </div>
+        <motion.div animate={{ scale: topFocused ? 1.06 : 1 }} className="flex items-center gap-3 rounded-full py-[2.5px] pl-4 pr-[2.5px]"
+          style={topFocused ? { background: grad(100, 0.95), boxShadow: `0 0 0 2px rgba(255,255,255,.9), 0 8px 30px ${a('p', 0.55)}` } : undefined}>
+          <span className="max-w-[160px] truncate text-lg font-medium">{profile?.name || 'Player 1'}</span>
+          <span className="rounded-full p-[2.5px]" style={{ background: topFocused ? 'rgba(255,255,255,.9)' : grad(135) }}>
+            <Avatar profile={profile} size={44} />
+          </span>
+        </motion.div>
       </div>
     </div>
   )
@@ -168,6 +199,7 @@ export function Prompts({ mode, canArt, show }) {
       <div className={`flex gap-5 whitespace-nowrap rounded-full px-5 py-2 ${glass}`}>
         <Key k="A" text={kb ? 'Type' : 'Select'} /><Key k="B" text={kb ? 'Cancel' : 'Back'} />
         {mode === 'home' && canArt && <Key k="Y" text="Artwork" />}
+        {mode === 'home' && <Key k="↑" text="Profile" />}
         {mode === 'home' && <Key k="X" text="Appearance" />}
         {mode === 'home' && <Key k="≡" text="Settings" />}
         {mode === 'home' && <Key k="View" text="Quick menu" />}
@@ -191,12 +223,13 @@ const Row = ({ r, active }) => (
   </motion.div>
 )
 
-export function Menu({ title, sub, rows, sel }) {
+export function Menu({ title, sub, rows, sel, header }) {
   const s = Math.min(sel, rows.length - 1)
   const start = Math.max(0, Math.min(s - 3, rows.length - 7))
   return (
     <Overlay>
       <div className={`w-[620px] rounded-[32px] p-8 ${glass}`}>
+        {header}
         <h2 className="text-4xl font-semibold">{title}</h2>
         {sub && <p className="mt-2 text-xl text-white/60">{sub}</p>}
         <div className="mt-6 flex flex-col gap-3">{rows.slice(start, start + 7).map((r, i) => <Row key={r.label + (start + i)} r={r} active={start + i === s} />)}</div>
