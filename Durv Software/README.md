# ConsoleShell

    npm install
    npm run dev       # windowed; arrows / Enter / Esc / Y / M also work as controller buttons
    npm run build     # installer + portable exe in /release

## Controls
D-pad / left stick move, **A** select, **B** back, **Y** artwork for the focused game, **Menu/Start** settings.

## Where everything lives (all in `%APPDATA%\ConsoleShell\`)

| File | What it is |
|---|---|
| `config.json` | Settings. Written on first run. |
| `overrides.json` | Per-game name, artwork, hidden flag. Written by the Y menu; editable by hand. |
| `apps.json` | Extra tiles you add by hand (emulators, Steam games, etc.). |
| `art\` | Copies of the images you picked. |

Restart the app after hand-editing, or use Settings > Rescan library.

### config.json
```json
{
  "setupComplete": true,
  "gamesFolders": ["D:\\Games"],
  "scanDepth": 3,
  "showSteam": true,
  "startupAnimation": true,
  "startupSound": true,
  "ignore": ["unins", "setup", "redist", "crash", "updater", "helper"]
}
```
- `setupComplete: false` re-opens the first-run setup on next launch.
- `gamesFolders` can list several folders. Each sub-folder becomes one tile, using the largest `.exe` inside (not matching `ignore`) up to `scanDepth` levels deep. `.exe` files sitting directly in a games folder get their own tiles.

### overrides.json (key = game id)
```json
{
  "3f9a1c0b2e": {
    "name": "Better Title",
    "target": "D:\\Games\\Foo\\Bin\\Foo.exe",
    "processName": "Foo.exe",
    "accent": "#ff3cac",
    "tile": "3f9a1c0b2e-tile-1732190000000.png",
    "wallpaper": "D:\\Pictures\\foo-bg.jpg",
    "hidden": false
  }
}
```
- Use `target` when the scanner picked the wrong exe. Use `processName` when the exe is only a stub that starts the real game (this is how the launcher knows when to come back).
- `tile` / `wallpaper` are either a file name inside `art\` or an absolute image path.
- Set `"hidden": false` (or delete the entry) to bring a hidden game back.
- A game's id is shown under its name in the Y (artwork) menu.
- Steam's tile id is `steam`.

### apps.json
```json
[
  { "name": "RetroArch", "type": "exe", "target": "D:\\Emu\\retroarch.exe", "args": ["--fullscreen"], "processName": "retroarch.exe" },
  { "name": "Hades", "type": "steam", "target": "steam://run/1145360", "processName": "Hades.exe" },
  { "name": "YouTube TV", "type": "url", "target": "https://youtube.com/tv" }
]
```
`type` is `exe`, `steam`, `url` or `cmd`. `id` is optional.

## Boot straight into the dashboard
1. Auto-login: Sysinternals **Autologon** (stores the password encrypted), or `netplwiz`. On Windows 11 first turn off "only allow Windows Hello sign-in" in Settings > Accounts > Sign-in options.
2. Easy mode: `Win+R` > `shell:startup` > put a shortcut to `ConsoleShell.exe` there.
3. Shell mode (no Explorer): 

       reg add "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /t REG_SZ /d "C:\Path\To\ConsoleShell.exe" /f

   Undo: `reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f`. Try step 2 first and keep a second admin account.
