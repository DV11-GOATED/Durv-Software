# Durv Software

A controller-first, console-style launcher / shell for Windows (Electron + React + Tailwind + Framer Motion).

## Run it
Needs Node.js 18+ on Windows.

    npm install
    npm run dev       # fullscreen; F11 toggles windowed; Alt+F4 quits
    npm run build     # installer + portable exe land in /release

## Controls
| Button | Does |
|---|---|
| D-pad / left stick | move |
| A / Cross | select |
| B / Circle | back |
| Y / Triangle | artwork, favourite or hide the focused game |
| X / Square | Appearance (colours, presets, sounds, hints) |
| Menu / Start | Settings |
| View / Select (or Guide / PS) | Quick menu: volume, Wi-Fi, Bluetooth, brightness, controller battery |
| LB / RB | volume down / up from the home screen |

Dev keyboard: arrows, Enter, Esc, X, Y, M (menu), Q (quick menu), [ ] (volume).
On the on-screen keyboard: A types, X deletes, Y adds a space, Menu submits, B cancels.

## What it launches
- **Folder scan:** every sub-folder of your games folder becomes a tile (largest non-ignored `.exe` inside).
- **Steam:** installed games are imported from your Steam library manifests and started via Steam.
- **Epic:** detected from the Epic launcher's records and started through it (needed for Fortnite). If the Epic launcher isn't installed it falls back to the exe.
- **EA app games:** started by their exe like any other game (the game opens the EA app itself).
- **GOG and everything else:** plain exe launch.
- **Xbox app / Game Pass:** add by hand to `apps.json` (see below).
The launcher comes back to the front when the game closes, and playtime is tracked.

## Files (all in `%APPDATA%\ConsoleShell\`)
| File | Purpose |
|---|---|
| `config.json` | games folders, scan depth, ignore words, sort, Steam import, startup animation |
| `theme.json` | colours, preset, hint mode, sounds |
| `overrides.json` | per-game name, target exe, artwork, accent, favourite, hidden |
| `apps.json` | hand-added tiles |
| `stats.json` | last played, launches, playtime (written by the app) |
| `art\` | your tile/wallpaper images (copied here) and cached exe icons |

Restart the app or use Settings > Rescan library after hand-editing.

### config.json
```json
{
  "setupComplete": true,
  "gamesFolders": ["D:\\Games"],
  "scanDepth": 4,
  "showSteam": true,
  "importSteam": true,
  "sort": "recent",
  "startupAnimation": true,
  "startupSound": true,
  "ignore": ["unins", "setup", "redist", "crash", "updater", "helper"]
}
```
`sort` is `recent`, `playtime` or `name`. Set `setupComplete` to `false` to see first-run setup again.

### theme.json
```json
{ "preset": "custom", "primary": "#8b5cff", "secondary": "#ff4fb8", "hints": "auto", "sounds": true }
```

### overrides.json (key = game id, shown in the Y menu)
```json
{
  "3f9a1c0b2e": {
    "name": "Better Title",
    "target": "D:\\Games\\Foo\\Bin\\Foo.exe",
    "processName": "Foo.exe",
    "accent": "#ff3cac",
    "tile": "3f9a1c0b2e-tile-1732190000000.png",
    "wallpaper": "D:\\Pictures\\foo-bg.jpg",
    "favorite": true,
    "hidden": false
  }
}
```
Use `target` if the wrong exe was picked, and `processName` if the exe is only a stub that starts the real game. `tile` / `wallpaper` are a file name inside `art\` or an absolute image path.

### apps.json
```json
[
  { "name": "RetroArch", "type": "exe", "target": "D:\\Emu\\retroarch.exe", "args": ["--fullscreen"], "processName": "retroarch.exe" },
  { "name": "YouTube TV", "type": "url", "target": "https://youtube.com/tv" },
  { "name": "Some Game Pass game", "type": "uwp", "target": "PackageFamilyName!AppId", "processName": "Game.exe" }
]
```
Types: `exe`, `steam`, `url`, `cmd`, `uwp`. Find a UWP id with PowerShell: `Get-StartApps`.

## Notes on the system controls
- Volume, mute and controller battery run through a small PowerShell helper that starts with the app.
- **Controller battery** is read from the same Bluetooth device properties Windows shows in Settings > Bluetooth & devices, so Bluetooth Xbox and PlayStation pads work. Wired and dongle pads fall back to XInput (Xbox pads only).
- **Brightness** only appears on laptops / monitors that support Windows brightness control.
- **Wi-Fi** lists networks with `netsh`. On Windows 11 24H2 the list can be empty unless Settings > Privacy > Location is on.
- **Bluetooth** toggles the radio and lists paired devices. Pairing opens Windows Bluetooth settings.
- The Guide / PS button is sometimes grabbed by Windows or Steam before the app sees it. View / Select always works.

## Boot straight into the dashboard
1. Auto-login: Sysinternals **Autologon**, or `netplwiz`. On Windows 11 first turn off "only allow Windows Hello sign-in" (Settings > Accounts > Sign-in options).
2. Easy mode: `Win+R` > `shell:startup` > put a shortcut to `ConsoleShell.exe` there.
3. Shell mode (no Explorer):

       reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /t REG_SZ /d "C:\Path\To\ConsoleShell.exe" /f

   Undo: `reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f`
   (From a broken state: Ctrl+Alt+Del > Task Manager > Run new task > `cmd`, or sign in with another admin account.)
   The Power menu's **Desktop** entry starts Explorer. Try step 2 first and keep a second admin account.
