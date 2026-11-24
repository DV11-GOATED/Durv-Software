// PowerShell helper that stays running so volume / radios / battery calls are instant.
// Written to %APPDATA%\ConsoleShell\helper.ps1 at startup. Keep this file ASCII-only.
exports.HELPER_PS = String.raw`$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    int hr = 0;
    foreach (int role in new int[] { 1, 0, 2 }) { hr = en.GetDefaultAudioEndpoint(0, role, out dev); if (hr == 0 && dev != null) break; }
    Marshal.ThrowExceptionForHR(hr);
    IAudioEndpointVolume epv = null;
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out epv));
    return epv;
  }
  public static float Get() { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void Set(float v) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(v, Guid.Empty)); }
  public static bool GetMute() { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
  public static void SetMute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
}
[StructLayout(LayoutKind.Sequential)] public struct BI { public byte Type; public byte Level; }
public class XI {
  [DllImport("xinput1_4.dll", EntryPoint="XInputGetBatteryInformation")] public static extern int Bat(int user, byte devType, out BI bi);
}
public class FG {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static int Pid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return (int)p; }
}
public class KB {
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Tap(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
"@

$script:radioReady = $false
$script:asTask = $null
function Await($op, $type) {
  $t = $script:asTask.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$t.Wait(-1)
  $t.Result
}
function Init-Radio {
  if ($script:radioReady) { return }
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
  [void][Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime]
  [void][Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime]
  [void][Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime]
  [void](Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]))
  $script:radioReady = $true
}
function Get-Radios {
  Init-Radio
  Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
}
# Windows keeps a paired device's battery % and connected flag as device properties (the same ones Settings > Bluetooth & devices shows).
function Get-BtInfo($d) {
  $b = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2' -ErrorAction SilentlyContinue
  $c = Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName '{83DA6326-97A6-4088-9453-A1923F573B29} 15' -ErrorAction SilentlyContinue
  @{
    name = $d.FriendlyName
    battery = $(if ($b -and $null -ne $b.Data -and $b.Type -ne 'Empty') { [int]$b.Data } else { $null })
    connected = $(if ($c -and $null -ne $c.Data) { [bool]$c.Data } else { $null })
  }
}
# ---- media session (Spotify, Apple Music, browsers... anything that registers with Windows media controls) ----
$script:mediaMgr = $null
function Init-Media {
  if ($script:mediaMgr) { return }
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  if (-not $script:asTask) {
    $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' })[0]
  }
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
  $script:mediaMgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
}
function Get-MediaSession {
  Init-Media
  foreach ($x in $script:mediaMgr.GetSessions()) { if ($x.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { return $x } }
  $script:mediaMgr.GetCurrentSession()
}
function Get-Media {
  $s = Get-MediaSession
  if (-not $s) { return @{ active = $false } }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  @{ active = $true; app = [string]$s.SourceAppUserModelId; title = [string]$p.Title; artist = [string]$p.Artist; album = [string]$p.AlbumTitle; status = $s.GetPlaybackInfo().PlaybackStatus.ToString() }
}
function Audio-State { @{ volume = [int][math]::Round([Audio]::Get() * 100); muted = [Audio]::GetMute() } }

[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()

while (($line = [Console]::In.ReadLine()) -ne $null) {
  $id = 0
  try {
    $req = $line | ConvertFrom-Json
    $id = $req.id
    $data = switch ($req.cmd) {
      'audio.get' { Audio-State }
      'audio.set' {
        $v = [math]::Max(0, [math]::Min(100, [double]$req.value))
        [Audio]::Set([single]($v / 100))
        if ($v -gt 0 -and [Audio]::GetMute()) { [Audio]::SetMute($false) }
        Audio-State
      }
      'audio.key' {
        $code = if ($req.key -eq 'up') { 175 } elseif ($req.key -eq 'down') { 174 } else { 173 }
        $times = if ($req.times) { [math]::Min(10, [int]$req.times) } else { 1 }
        $sh = New-Object -ComObject WScript.Shell
        for ($n = 0; $n -lt $times; $n++) { $sh.SendKeys([string][char]$code) }
        @{ ok = $true }
      }
      'audio.mute' { [Audio]::SetMute([bool]$req.value); Audio-State }
      'brightness.get' {
        $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1
        if (-not $b) { throw 'no brightness' }
        @{ value = [int]$b.CurrentBrightness }
      }
      'brightness.set' {
        $v = [byte][math]::Max(0, [math]::Min(100, [double]$req.value))
        Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = $v } | Out-Null
        @{ value = [int]$v }
      }
      'radio.get' {
        $rs = Get-Radios
        $w = $rs | Where-Object { $_.Kind -eq 'WiFi' } | Select-Object -First 1
        $b = $rs | Where-Object { $_.Kind -eq 'Bluetooth' } | Select-Object -First 1
        @{ wifi = $(if ($w) { $w.State.ToString() } else { $null }); bluetooth = $(if ($b) { $b.State.ToString() } else { $null }) }
      }
      'radio.set' {
        $rs = Get-Radios
        $kind = if ($req.kind -eq 'wifi') { 'WiFi' } else { 'Bluetooth' }
        $rad = $rs | Where-Object { $_.Kind -eq $kind } | Select-Object -First 1
        if (-not $rad) { throw 'No such radio' }
        $st = if ($req.on) { [Windows.Devices.Radios.RadioState]::On } else { [Windows.Devices.Radios.RadioState]::Off }
        [void](Await ($rad.SetStateAsync($st)) ([Windows.Devices.Radios.RadioAccessStatus]))
        @{ state = $(if ($req.on) { 'On' } else { 'Off' }) }
      }
      'bt.devices' {
        $devs = @(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^BTHENUM\\DEV_|^BTHLE\\DEV_' } | ForEach-Object { Get-BtInfo $_ })
        @{ devices = $devs }
      }
      'bt.battery' {
        $devs = @(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^BTHENUM\\DEV_|^BTHLE\\DEV_' -and $_.FriendlyName -match 'controller|gamepad|xbox|dual ?sense|dual ?shock|joy-?con|8bitdo|stadia|gamesir|backbone|pad' } | ForEach-Object { Get-BtInfo $_ })
        @{ devices = $devs }
      }
      'battery' {
        $res = @{ type = 0 }
        foreach ($u in 0..3) {
          $bi = New-Object BI
          if ([XI]::Bat($u, [byte]0, [ref]$bi) -eq 0 -and $bi.Type -ne 0) { $res = @{ type = [int]$bi.Type; level = [int]$bi.Level; user = $u }; break }
        }
        $res
      }
      'media.get' { Get-Media }
      'media.cmd' {
        $s = Get-MediaSession
        if ($s) {
          $op = switch ($req.action) {
            'toggle' { $s.TryTogglePlayPauseAsync() }
            'next' { $s.TrySkipNextAsync() }
            'prev' { $s.TrySkipPreviousAsync() }
            default { throw 'Unknown media action' }
          }
          [void](Await $op ([bool]))
        } else {
          # nothing registered yet: a media key makes Windows wake the last media app
          $vk = switch ($req.action) { 'next' { 176 } 'prev' { 177 } default { 179 } }
          [KB]::Tap([byte]$vk)
        }
        Start-Sleep -Milliseconds 350
        Get-Media
      }
      'win.state' {
        $vis = $false
        if ($req.name) {
          $n = [string]$req.name
          if ($n -match '\.exe$') { $n = $n.Substring(0, $n.Length - 4) }
          $vis = (@(Get-Process -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })).Count -gt 0
        }
        @{ visible = $vis; fgPid = [int][FG]::Pid() }
      }
      'apps.find' {
        $m = Get-StartApps | Where-Object { $_.Name -like ('*' + [string]$req.name + '*') } | Select-Object -First 1
        if ($m) { @{ id = [string]$m.AppID; name = [string]$m.Name } } else { @{ id = $null } }
      }
      default { throw ('Unknown command ' + $req.cmd) }
    }
    $out = @{ id = $id; ok = $true; data = $data }
  } catch {
    $out = @{ id = $id; ok = $false; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 6))
  [Console]::Out.Flush()
}
`
