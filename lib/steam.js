// Installed Steam games, read from the local library manifests (no network, no accounts).
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { execFile } = require('child_process')

const SKIP = /^(Steamworks|Steam Linux Runtime|Proton|SteamVR|Steam Controller|Steam Deck)/i

function steamPath() {
  return new Promise((res) =>
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (_e, out) => {
      const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(String(out || ''))
      res(m ? path.normalize(m[1].trim()) : null)
    }))
}

function parseManifest(text) {
  const get = (k) => (new RegExp(`"${k}"\\s+"([^"]*)"`, 'i').exec(text) || [])[1]
  const appid = get('appid'), name = get('name'), installdir = get('installdir')
  const flags = Number(get('StateFlags') || 0)
  if (!appid || !name || !installdir || !(flags & 4)) return null     // 4 = fully installed
  if (appid === '228980' || SKIP.test(name)) return null
  return { appid, name, installdir }
}

async function steamGames() {
  if (process.platform !== 'win32') return []
  const root = (await steamPath()) || 'C:\\Program Files (x86)\\Steam'
  const libs = new Set([root])
  try {
    const v = await fsp.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8')
    for (const m of v.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.normalize(m[1].replace(/\\\\/g, '\\')))
  } catch {}
  const games = []
  for (const lib of libs) {
    const apps = path.join(lib, 'steamapps')
    let files = []
    try { files = (await fsp.readdir(apps)).filter((f) => /^appmanifest_\d+\.acf$/.test(f)) } catch { continue }
    for (const f of files) {
      try {
        const g = parseManifest(await fsp.readFile(path.join(apps, f), 'utf8'))
        if (g) games.push({ id: 'steam-' + g.appid, name: g.name, type: 'steam', appid: g.appid, target: `steam://rungameid/${g.appid}`, folder: path.join(apps, 'common', g.installdir) })
      } catch {}
    }
  }
  return games
}

module.exports = { steamGames, parseManifest }
