# Durv Software v1.0.0

A PlayStation-inspired, controller-first desktop shell and game launcher for Windows. Built to turn any Windows PC or laptop into a fast, console-style interface with zero login friction, custom themes, background music integration, and seamless fullscreen game launches.

---

## Downloads

Grab the latest release from the **[Releases](https://github.com/DV11-GOATED/Durv-Software/releases/latest)** page:

- **`Durv Software Setup 1.0.0.exe`** — Standard Windows installer (**recommended** for fastest startup, Start Menu shortcuts, and direct Windows shell boot).
- **`Durv Software 1.0.0.exe`** — Standalone portable executable (runs immediately with no installation required).

> **Windows SmartScreen Note:** Because this is an independent open-source release without a commercial code-signing certificate, Windows SmartScreen may display *"Windows protected your PC"* on first launch. Click **More info** → **Run anyway** to proceed.

---

## Key Features

- **Unified Game Library:** Automatically scans and imports installed games from **Steam**, **Epic Games**, **EA App**, **GOG**, **UWP / Xbox**, and custom local folders.
- **Controller-First UI:** PlayStation-style horizontal game library, full Xbox & PlayStation gamepad support, custom wallpapers, user avatars, and smooth fullscreen launch transitions.
- **Quick Menu & Background Music:** Built-in **Spotify** and **Apple Music** playback controls alongside system volume, Wi-Fi, and Bluetooth settings without leaving the launcher.
- **Fast Boot & Shell Mode:** Launch as a normal desktop app or configure as your default Windows user shell (`Winlogon\Shell`) so your PC boots straight into Durv Software.

---

## Controls

| Action | Controller (Xbox / PlayStation) | Keyboard |
| :--- | :--- | :--- |
| **Navigate Tiles & Menus** | D-Pad / Left Stick | Arrow Keys |
| **Launch Game / Confirm** | `A` / `Cross (✕)` | `Enter` |
| **Back / Cancel** | `B` / `Circle (○)` | `Esc` / `Backspace` |
| **Appearance & Themes** | `X` / `Square (□)` | `X` |
| **Game Artwork & Options** | `Y` / `Triangle (△)` | `Y` |
| **Settings** | `Start` / `Options` | `Tab` |
| **Quick Menu (Audio / Music / Net)** | `Select` / `Share` | `Q` |
| **Volume Up / Down** | `RB` / `LB` (`R1` / `L1`) | `+` / `-` |

---

## Installation & Quick Start

### Option A: Standard App Mode (Recommended First)
1. Download and run **`Durv Software Setup 1.0.0.exe`**.
2. Once installed, Durv Software launches automatically and creates a Desktop and Start Menu shortcut.
3. Add your games, customize your wallpaper and avatar, and test controller navigation.

### Option B: Direct Console Boot Mode (Windows Shell Replacement)
If you want Windows to boot straight into **Durv Software** instead of the standard desktop:

1. Open File Explorer, press **`Win + R`**, type `%LOCALAPPDATA%\Programs`, and press **`Enter`**.
2. Open the **Durv Software** folder, right-click **`Durv Software.exe`**, and select **Copy as path**.
3. Press **`Win + R`**, type `regedit`, and press **`Enter`**.
4. Navigate to:
   ```text
   HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Winlogon
   ```
5. Right-click an empty space on the right pane → **New** → **String Value**, and name it **`Shell`**.
6. Double-click **`Shell`**, paste the copied executable path (keeping the surrounding double quotes, e.g., `"C:\Users\<YourUsername>\AppData\Local\Programs\Durv Software\Durv Software.exe"`), and click **OK**.
7. Restart your PC to boot directly into Durv Software.

> **Tip:** Only edit `HKEY_CURRENT_USER` (not `HKEY_LOCAL_MACHINE`). If you ever need your standard Windows desktop while in Shell Mode, press **`Ctrl + Shift + Esc`** to open Task Manager → **File** → **Run new task** → type `explorer.exe` → **Enter**.

---

## Updating Cleanly

To avoid duplicate entries in Windows **Installed apps** when upgrading to a newer version:

1. Press **`Ctrl + Shift + Esc`** to open Task Manager.
2. If **Durv Software** is currently running, select it and click **End task**.
3. Run the new **`Durv Software Setup`** installer—it will update your existing installation in-place while preserving your saved settings, wallpapers, and Registry `Shell` path.

---

## Uninstalling Safely

> ⚠️ **Important (If Using Direct Console Boot Mode):** Remove the Registry `Shell` entry **before** uninstalling Durv Software. If `Winlogon\Shell` still points to a deleted `.exe`, Windows will hang on a grey/black screen for several seconds at startup before falling back to the desktop.

1. **Revert Windows Shell (if configured):**
   - Press **`Win + R`**, type `regedit`, and go to `HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\Winlogon`.
   - Right-click **`Shell`** and select **Delete** (confirm **Yes**).
2. **Close any running instance:**
   - Open Task Manager (**`Ctrl + Shift + Esc`**) and end any active **Durv Software** task.
3. **Uninstall the application:**
   - Press **`Win + I`** → **Apps** → **Installed apps** → search for **Durv Software** → click **`...`** → **Uninstall**. *(If you used the portable `.exe`, simply delete that file.)*
4. **Remove user data (optional):**
   - Press **`Win + R`**, type `%APPDATA%`, and delete the **`Durv Software`** folder if you want to wipe saved preferences and cached artwork.

---

## Building from Source

```bash
git clone https://github.com/DV11-GOATED/Durv-Software.git
cd Durv-Software
npm install
npm run build
```

Compiled Windows installer and portable executables will be generated inside the `release/` directory.
