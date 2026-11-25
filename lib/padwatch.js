// Listens to the controller while ANOTHER app is in front. The page's Gamepad API only works while Durv Software has focus,
// so this reads XInput from a small PowerShell process instead (XInput keeps working in the background).
//   hold LT + RT  -> bring Durv Software back to the front
//   tap RT        -> next tab (Ctrl+Tab), but only while one of `tabApps` is in front, so games keep their trigger
// XInput sees Xbox pads and anything that presents as one (Steam Input, DS4Windows, most 8BitDo/Switch-Pro modes).
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct XGP { public ushort Buttons; public byte LT; public byte RT; public short LX; public short LY; public short RX; public short RY; }
[StructLayout(LayoutKind.Sequential)] public struct XST { public uint Packet; public XGP Pad; }
public class XP {
  [DllImport("xinput1_4.dll", EntryPoint="XInputGetState")] public static extern int Get(int user, out XST s);
}
public class WN {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static int FrontPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return (int)p; }
  public static string Front() {
    try { return Process.GetProcessById(FrontPid()).ProcessName.ToLower(); } catch { return ""; }
  }
  public static void Take(IntPtr h) {
    if (h == IntPtr.Zero) return;
    if (GetForegroundWindow() == h) return;     // already in front: skip the Alt tap, it would reach the page as a real keydown
    if (IsIconic(h)) ShowWindow(h, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(h);
  }
  public static void CtrlTab() {
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(0x09, 0, 0, UIntPtr.Zero);
    keybd_event(0x09, 0, 2, UIntPtr.Zero);
    keybd_event(0x11, 0, 2, UIntPtr.Zero);
  }
}
"@

$tabApps = @(([string]$env:CS_TAB_APPS) -split ',' | ForEach-Object { $_.Trim().ToLower().Replace('.exe', '') } | Where-Object { $_ })
$hold = 600
if ($env:CS_RETURN_HOLD_MS -match '^\d+$' -and [int]$env:CS_RETURN_HOLD_MS -ge 150) { $hold = [int]$env:CS_RETURN_HOLD_MS }
$appPid = [int]$env:CS_APP_PID
$thr = 170
$sw = [Diagnostics.Stopwatch]::StartNew()
$next = @(0, 0, 0, 0)          # empty controller slots are slow to poll, so look at them only now and then
$comboAt = -1; $comboDone = $false
$rtWas = $false; $rtAt = 0; $ltSeen = $false
$n = 0
$rl = [Console]::In.ReadLineAsync()      # commands from Durv Software (FOCUS) without blocking the poll loop

[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()

while ($true) {
  if ($rl -ne $null -and $rl.IsCompleted) {
    $line = $rl.Result
    if ($line -eq $null) { $rl = $null }
    else {
      $rl = [Console]::In.ReadLineAsync()
      if ($line.Trim() -eq 'FOCUS') { try { [WN]::Take((Get-Process -Id $appPid -ErrorAction Stop).MainWindowHandle) } catch {} }
    }
  }
  $now = $sw.ElapsedMilliseconds
  $lt = 0; $rt = 0
  for ($u = 0; $u -lt 4; $u++) {
    if ($next[$u] -gt $now) { continue }
    $s = New-Object XST
    if ([XP]::Get($u, [ref]$s) -eq 0) {
      if ($s.Pad.LT -gt $lt) { $lt = $s.Pad.LT }
      if ($s.Pad.RT -gt $rt) { $rt = $s.Pad.RT }
    } else { $next[$u] = $now + 1500 }
  }
  $ltOn = $lt -gt $thr
  $rtOn = $rt -gt $thr

  # LT + RT held together -> back to Durv Software
  if ($ltOn -and $rtOn) {
    if ($comboAt -lt 0) { $comboAt = $now }
    if (-not $comboDone -and ($now - $comboAt) -ge $hold) {
      $comboDone = $true
      if ([WN]::FrontPid() -ne $appPid) {
        try { [WN]::Take((Get-Process -Id $appPid -ErrorAction Stop).MainWindowHandle) } catch {}
        [Console]::Out.WriteLine('RETURN'); [Console]::Out.Flush()
      }
    }
  } else {
    $comboAt = -1
    if (-not $ltOn -and -not $rtOn) { $comboDone = $false }
  }

  # RT tapped on its own -> next tab (only inside the listed apps)
  if ($rtOn -and -not $rtWas) { $rtAt = $now; $ltSeen = $ltOn }
  if ($rtOn -and $ltOn) { $ltSeen = $true }
  if ($rtWas -and -not $rtOn -and -not $ltSeen -and ($now - $rtAt) -lt 500) {
    if ($tabApps -contains [WN]::Front()) { [WN]::CtrlTab() }
  }
  $rtWas = $rtOn

  $n++
  if (($n % 150) -eq 0 -and -not (Get-Process -Id $appPid -ErrorAction SilentlyContinue)) { exit }   # parent is gone
  Start-Sleep -Milliseconds 20
}
`

let proc = null
let stopped = true
let timer = null
let fails = 0
let ready = false
let focusPending = false

function start(dir, opts, onReturn) {
  if (process.platform !== 'win32' || proc) return
  stopped = false
  const file = path.join(dir, 'padwatch.ps1')
  fs.writeFileSync(file, SCRIPT)
  const env = {
    ...process.env,
    CS_TAB_APPS: (opts.tabApps || []).join(','),
    CS_RETURN_HOLD_MS: String(opts.holdMs || 600),
    CS_APP_PID: String(opts.pid || process.pid),
  }
  const run = () => {
    if (stopped) return
    let buf = ''
    ready = false
    proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: true, env, stdio: ['pipe', 'pipe', 'ignore'] })
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line === 'READY') { ready = true; fails = 0; if (focusPending) focus() }
        else if (line === 'RETURN') onReturn()
      }
    })
    proc.stdin.on('error', () => {})
    proc.on('error', () => {})
    proc.on('exit', () => {
      proc = null; ready = false
      if (!ready) fails += 1
      if (!stopped && fails < 5) timer = setTimeout(run, 4000)      // restart if it died; give up if it never starts
    })
  }
  run()
}

// Ask the watcher to drag the Durv Software window to the front. Safe to call early: it is sent as soon as the watcher is up.
function focus() {
  if (process.platform !== 'win32') return false
  if (!proc || !ready) { focusPending = true; return false }
  focusPending = false
  try { proc.stdin.write('FOCUS\n'); return true } catch { return false }
}

function stop() {
  stopped = true
  clearTimeout(timer)
  try { proc && proc.kill() } catch {}
  proc = null
}

module.exports = { start, stop, focus }
