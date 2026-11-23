// System controls: volume, brightness, Wi-Fi, Bluetooth, controller battery.
const { spawn, execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { HELPER_PS } = require('./helper')

const isWin = process.platform === 'win32'
let dir = ''
let proc = null
let starting = null
let buf = ''
let nextId = 1
const pending = new Map()
let noBrightness = false

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const run = (file, args, opts = {}) =>
  new Promise((res) => execFile(file, args, { windowsHide: true, timeout: 15000, ...opts }, (err, stdout) => res({ err, out: String(stdout || '') })))

// ---------- persistent PowerShell helper ----------
function startHelper() {
  if (!isWin) return Promise.reject(new Error('unsupported'))
  if (starting) return starting
  starting = new Promise((resolve, reject) => {
    const file = path.join(dir, 'helper.ps1')
    fs.writeFileSync(file, HELPER_PS)
    proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true })
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line === 'READY') resolve()
        else if (line) {
          try {
            const m = JSON.parse(line)
            const p = pending.get(m.id)
            if (p) { pending.delete(m.id); m.ok ? p.res(m.data) : p.rej(new Error(m.error)) }
          } catch {}
        }
      }
    })
    proc.on('exit', () => {
      proc = null; starting = null; buf = ''
      for (const p of pending.values()) p.rej(new Error('helper exited'))
      pending.clear()
    })
    proc.on('error', reject)
    setTimeout(() => reject(new Error('helper timeout')), 30000)
  })
  starting.catch(() => { starting = null })
  return starting
}

async function call(cmd, args = {}, timeout = 15000) {
  await startHelper()
  return new Promise((res, rej) => {
    const id = nextId++
    const t = setTimeout(() => { pending.delete(id); rej(new Error('timeout')) }, timeout)
    pending.set(id, { res: (v) => { clearTimeout(t); res(v) }, rej: (e) => { clearTimeout(t); rej(e) } })
    proc.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n')
  })
}

// ---------- Wi-Fi via netsh ----------
const MAC = /[0-9a-f]{2}([:-])[0-9a-f]{2}(\1[0-9a-f]{2}){4}/i

async function wifiStatus() {
  if (!isWin) return { supported: false }
  const { err, out } = await run('netsh', ['wlan', 'show', 'interfaces'])
  if (err || !MAC.test(out)) return { supported: false }
  const ssid = (/^\s*SSID\s*:\s*(.+)$/m.exec(out) || [])[1]?.trim() || null
  const signal = ssid ? Number((/:\s*(\d{1,3})%\s*$/m.exec(out) || [])[1] || 0) : 0
  return { supported: true, connected: !!ssid, ssid, signal }
}

async function wifiProfiles() {
  const { out } = await run('netsh', ['wlan', 'show', 'profiles'])
  return [...out.matchAll(/Profile\s*:\s*(.+)$/gim)].map((m) => m[1].trim())
}

function parseNetworks(out) {
  const map = new Map()
  for (const block of out.split(/^SSID\s+\d+\s*:/m).slice(1)) {
    const ssid = block.split(/\r?\n/)[0].trim()
    if (!ssid) continue
    const auth = ((/Authentication\s*:\s*(.+)/i.exec(block) || [])[1] || '').trim()
    const signal = Math.max(0, ...[...block.matchAll(/:\s*(\d{1,3})%/g)].map((m) => Number(m[1])))
    const prev = map.get(ssid)
    if (!prev || signal > prev.signal) map.set(ssid, { ssid, auth, signal })
  }
  return [...map.values()].sort((a, b) => b.signal - a.signal)
}

async function wifiScan() {
  if (!isWin) return { networks: [] }
  const [{ out }, profiles] = await Promise.all([run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']), wifiProfiles()])
  const networks = parseNetworks(out).slice(0, 12).map((n) => ({ ...n, saved: profiles.includes(n.ssid) }))
  return { networks }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
function profileXml(ssid, pw, auth) {
  const head = `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${esc(ssid)}</name><SSIDConfig><SSID><name>${esc(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>`
  if (!pw) return head + '<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption></security></MSM></WLANProfile>'
  const sae = /WPA3/i.test(auth) && !/WPA2/i.test(auth)
  const authEnc = sae
    ? '<authEncryption><authentication>WPA3SAE</authentication><encryption>AES</encryption><useOneX>false</useOneX><transitionMode xmlns="http://www.microsoft.com/networking/WLAN/profile/v4">true</transitionMode></authEncryption>'
    : '<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>'
  return head + authEnc + `<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${esc(pw)}</keyMaterial></sharedKey></security></MSM></WLANProfile>`
}

async function wifiConnect(ssid, password, auth = '') {
  if (!isWin) return { ok: false, error: 'Wi-Fi control is Windows only' }
  if (typeof ssid !== 'string' || !ssid || ssid.length > 32 || /["\r\n]/.test(ssid)) return { ok: false, error: 'Unsupported network name' }
  const verbatim = { windowsVerbatimArguments: true }
  const profiles = await wifiProfiles()
  const open = /open/i.test(auth) && !password
  if (password || (open && !profiles.includes(ssid))) {
    await run('netsh', ['wlan', 'delete', 'profile', `name="${ssid}"`], verbatim)
    const file = path.join(os.tmpdir(), `cs-wifi-${Date.now()}.xml`)
    fs.writeFileSync(file, profileXml(ssid, password || '', auth))
    const r = await run('netsh', ['wlan', 'add', 'profile', `filename="${file}"`, 'user=current'], verbatim)
    try { fs.unlinkSync(file) } catch {}
    if (r.err) return { ok: false, error: 'Could not save the network' }
  } else if (!profiles.includes(ssid)) return { ok: false, error: 'Password required' }
  await run('netsh', ['wlan', 'connect', `name="${ssid}"`], verbatim)
  for (let i = 0; i < 10; i++) {
    await sleep(1000)
    if ((await wifiStatus()).ssid === ssid) return { ok: true }
  }
  if (password) await run('netsh', ['wlan', 'delete', 'profile', `name="${ssid}"`], verbatim)
  return { ok: false, error: password ? 'Could not connect. Check the password.' : 'Could not connect.' }
}

// ---------- public API ----------
async function status() {
  const safe = (p, d) => p.catch(() => d)
  let audioError = null
  const [audio, radios, battery, wifi, bright] = await Promise.all([
    call('audio.get').catch((e) => { audioError = e.message; return null }),
    safe(call('radio.get'), null),
    safe(call('battery'), null),
    safe(wifiStatus(), { supported: false }),
    noBrightness ? null : call('brightness.get').catch(() => { noBrightness = true; return null }),
  ])
  return {
    volume: audio ? audio.volume : null,
    muted: !!(audio && audio.muted),
    audioError,
    wifi: { ...wifi, radio: radios ? radios.wifi : null },
    bluetooth: { supported: !!(radios && radios.bluetooth), radio: radios ? radios.bluetooth : null },
    controller: battery,
    brightness: bright ? { supported: true, value: bright.value } : { supported: false },
  }
}

const num = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
module.exports = {
  init: (d) => { dir = d },
  stop: () => { try { proc && proc.kill() } catch {} },
  status,
  setVolume: (v) => call('audio.set', { value: num(v) }),
  setMute: (m) => call('audio.mute', { value: !!m }),
  volKey: (key, times) => call('audio.key', { key: ['up', 'down', 'mute'].includes(key) ? key : 'mute', times: Number(times) || 1 }),
  setBrightness: (v) => call('brightness.set', { value: num(v) }),
  setRadio: (kind, on) => call('radio.set', { kind: kind === 'wifi' ? 'wifi' : 'bluetooth', on: !!on }, 20000),
  btBattery: () => call('bt.battery', {}, 25000).catch(() => ({ devices: [] })),
  btDevices: () => call('bt.devices', {}, 20000).catch(() => ({ devices: [] })),
  wifiScan,
  wifiConnect,
  _parseNetworks: parseNetworks, _profileXml: profileXml,
}
