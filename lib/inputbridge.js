// Node side of the global input bridge. ONE long-running PowerShell process (lib/bridge.cs, compiled once at start) reads
// XInput in the background, so combos work while a game has focus and nothing is ever spawned per poll.
// Events come back as lines on stdout; commands go in as lines on stdin. See the header of bridge.cs for the protocol.
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// Also runnable by hand for diagnosis (see bridge.log): every setting falls back to a default when its variable is missing.
const PS1 = `$ErrorActionPreference = 'Stop'
$src = $env:CS_BRIDGE_SRC
if (-not $src) { $src = Join-Path $PSScriptRoot 'bridge.cs' }
Add-Type -TypeDefinition ([IO.File]::ReadAllText($src))
function Num($v, $d) { if ($v -match '^\\d+$') { [int]$v } else { $d } }
[Bridge]::Run((Num $env:CS_APP_PID 0), (Num $env:CS_RETURN_HOLD_MS 700), (Num $env:CS_COMBO_HOLD_MS 300), (Num $env:CS_SWITCH_HOLD_MS 500), [string]$env:CS_DEBUG)
`

let proc = null
let stopped = true
let ready = false
let fails = 0
let timer = null
let onEvent = () => {}
// What the process must be told again if it ever restarts.
const state = { mode: 'idle', shell: '' }
let pendingFocus = ''
let logFile = ''
const log = (m) => { if (!logFile) return; try { fs.appendFileSync(logFile, `[${new Date().toTimeString().slice(0, 8)}] ${m}\n`) } catch {} }

function send(line) {
  if (!proc || !ready) return false
  try { proc.stdin.write(line + '\n'); return true } catch { return false }
}

function start(dir, opts, handler) {
  if (process.platform !== 'win32' || proc) return
  stopped = false
  onEvent = handler || onEvent
  logFile = path.join(dir, 'bridge.log')           // everything the helper says or complains about ends up here
  try { fs.writeFileSync(logFile, '') } catch {}
  log('starting the input bridge')
  const src = path.join(dir, 'bridge.cs')
  const ps1 = path.join(dir, 'bridge.ps1')
  fs.writeFileSync(src, fs.readFileSync(path.join(__dirname, 'bridge.cs')))      // Add-Type needs a real file path (not inside the asar)
  fs.writeFileSync(ps1, PS1)
  const env = {
    ...process.env,
    CS_BRIDGE_SRC: src,
    CS_APP_PID: String(opts.pid || process.pid),
    CS_RETURN_HOLD_MS: String(opts.returnHoldMs || 700),
    CS_SWITCH_HOLD_MS: String(opts.switcherHoldMs || 500),
    CS_DEBUG: opts.debug ? '1' : '',
    CS_COMBO_HOLD_MS: String(opts.comboHoldMs || 300),
  }
  const run = () => {
    if (stopped) return
    let buf = ''
    ready = false
    proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] })
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (d) => log('ERROR: ' + String(d).trim()))      // compile errors, antivirus blocks, ...
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        if (!line.startsWith('NAV ')) log(line)
        if (line === 'READY') {
          ready = true; fails = 0
          send('MODE ' + state.mode)
          if (state.shell) send('SHELL ' + state.shell)
          if (pendingFocus) { send('FOCUS ' + pendingFocus); pendingFocus = '' }
        } else {
          try { onEvent(line) } catch (e) { console.error('[bridge]', e) }
        }
      }
    })
    proc.stdin.on('error', () => {})
    proc.on('error', (e) => log('could not start powershell.exe: ' + e.message))
    proc.on('exit', (code) => {
      const wasReady = ready
      proc = null; ready = false
      log('helper exited (code ' + code + ')' + (wasReady ? '' : ' before it was ready'))
      if (!wasReady) fails += 1
      if (!stopped && fails < 5) timer = setTimeout(run, 3000)      // restart if it died; give up if it never gets going
      else if (!stopped) { log('giving up: the helper never started'); try { onEvent('BRIDGE_FAILED') } catch {} }
    })
  }
  run()
}

function stop() {
  stopped = true
  clearTimeout(timer)
  const p = proc
  if (!p) return
  try { p.stdin.write('QUIT\n') } catch {}
  setTimeout(() => { try { p.kill() } catch {} }, 300)
  proc = null; ready = false
}

module.exports = {
  start, stop,
  // idle: combos only | mouse: virtual mouse | nav: forward d-pad / buttons to the overlay (mouse is paused)
  setMode(m) { state.mode = m; send('MODE ' + m) },
  setShell(hwnd) { state.shell = String(hwnd || ''); if (state.shell) send('SHELL ' + state.shell) },
  focus(hwnd) { if (!hwnd) return; if (!send('FOCUS ' + hwnd)) pendingFocus = String(hwnd) },
  saveForeground() { send('SAVEFG') },
  restoreForeground() { send('RESTOREFG') },
  type(text) { if (text) send('TYPE ' + Buffer.from(String(text), 'utf8').toString('base64')) },
  key(name) { send('KEY ' + name) },
  switcher() { send('SWITCH') },
  isReady: () => ready,
}
