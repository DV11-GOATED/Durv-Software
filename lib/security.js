// PIN lock. The PIN is never stored: only a salted scrypt hash goes to %APPDATA%\ConsoleShell\security.json.
// Wrong-guess throttling lives here (main process), so the UI can't be used to skip it.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const PIN_RE = /^\d{4,6}$/
const MAX_TRIES = 5            // wrong guesses before a lockout
const BASE_LOCK_MS = 30_000    // first lockout; doubles each time, capped at 5 min

let file = ''
let unlocked = false           // true once the right PIN was entered this session (or no PIN is set)
let fails = 0, lockouts = 0, lockedUntil = 0

const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} } }
const write = (v) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(v, null, 2)) }
const derive = (pin, salt) => crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 })

function matches(pin) {
  const s = read()
  if (!s.pin || typeof pin !== 'string' || !PIN_RE.test(pin)) return false
  const want = Buffer.from(s.pin.hash, 'hex')
  const got = derive(pin, Buffer.from(s.pin.salt, 'hex'))
  return want.length === got.length && crypto.timingSafeEqual(want, got)
}

const lockedFor = () => Math.max(0, lockedUntil - Date.now())

const api = {
  init(dir) { file = path.join(dir, 'security.json'); unlocked = !read().pin },

  // Safe to show in the UI. pinLen lets the lock screen auto-submit once enough digits are typed.
  status() {
    const s = read()
    return { pinSet: !!s.pin, pinLen: s.pin ? s.pin.len : 0, prompted: !!s.prompted || !!s.pin, lockedFor: lockedFor() }
  },
  isUnlocked: () => unlocked || !read().pin,

  verify(pin) {
    if (lockedFor() > 0) return { ok: false, lockedFor: lockedFor(), left: 0 }
    if (matches(pin)) { fails = 0; lockouts = 0; unlocked = true; return { ok: true } }
    fails += 1
    if (fails >= MAX_TRIES) {
      fails = 0
      lockedUntil = Date.now() + Math.min(BASE_LOCK_MS * 2 ** lockouts, 300_000)
      lockouts += 1
      return { ok: false, lockedFor: lockedFor(), left: 0 }
    }
    return { ok: false, left: MAX_TRIES - fails, lockedFor: 0 }
  },

  // Setting or changing. If a PIN already exists the current one must be supplied.
  set(pin, current) {
    if (!PIN_RE.test(String(pin))) return { ok: false, error: 'Use 4 to 6 digits' }
    const s = read()
    if (s.pin && !matches(current)) return { ok: false, error: 'Current PIN is wrong' }
    const salt = crypto.randomBytes(16)
    write({ ...s, prompted: true, pin: { salt: salt.toString('hex'), hash: derive(pin, salt).toString('hex'), len: String(pin).length } })
    unlocked = true; fails = 0; lockouts = 0
    return { ok: true }
  },

  clear(current) {
    const s = read()
    if (!s.pin) return { ok: true }
    if (!matches(current)) return { ok: false, error: 'PIN is wrong' }
    delete s.pin
    write({ ...s, prompted: true })
    unlocked = true
    return { ok: true }
  },

  skipPrompt() { write({ ...read(), prompted: true }); return { ok: true } },
  lock() { if (read().pin) unlocked = false; return { ok: true } },
}

module.exports = api
