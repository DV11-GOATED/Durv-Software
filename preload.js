const { contextBridge, ipcRenderer } = require('electron')
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a)
contextBridge.exposeInMainWorld('shell', {
  // library & config
  state: call('lib:state'), rescan: call('lib:rescan'), setCfg: call('cfg:patch'),
  setupDefaults: call('setup:defaults'), setFolder: call('cfg:setFolder'),
  fsStart: call('fs:start'), fsList: call('fs:list'),
  setArt: call('art:set'), resetArt: call('art:reset'), hide: call('game:hide'), favorite: call('game:favorite'),
  setTheme: call('theme:set'), openConfig: call('sys:openConfig'),
  // launching & power
  launch: call('app:launch'), power: call('system:power'),     // 'shutdown' | 'restart' | 'sleep' | 'desktop' | 'quit'
  // system controls
  sysStatus: call('sys:status'), sysVolume: call('sys:volume'), sysMute: call('sys:mute'), sysVolKey: call('sys:volKey'), sysBrightness: call('sys:brightness'),
  sysRadio: call('sys:radio'), btDevices: call('sys:btDevices'), btBattery: call('sys:btBattery'), wifiScan: call('sys:wifiScan'), wifiConnect: call('sys:wifiConnect'),
  openSettings: call('sys:openSettings'),
  onReturn: (cb) => ipcRenderer.on('shell:returned', cb),
  // first-frame info, PIN lock, profile, music, launch screen
  boot: call('boot:get'),
  pinVerify: call('pin:verify'), pinSet: call('pin:set'), pinClear: call('pin:clear'), pinSkip: call('pin:skip'), pinLock: call('pin:lock'),
  setProfileImage: call('profile:setImage'), clearProfileImage: call('profile:clear'), setProfileName: call('profile:setName'),
  media: call('media:get'), mediaCmd: call('media:cmd'), musicOpen: call('music:open'), musicClose: call('music:close'),
  cancelLaunch: call('launch:cancel'),
  onGame: (cb) => ipcRenderer.on('shell:game', (_e, ev) => cb(ev)),
  // in-game overlay, Controller Mouse, typing into other apps
  overlayToggle: call('overlay:toggle'), overlayHide: call('overlay:hide'), overlayKeyboard: call('overlay:keyboard'),
  overlaySwitcher: call('overlay:switcher'), overlayHome: call('overlay:home'),
  mouseGet: call('mouse:get'), mouseToggle: call('mouse:toggle'),
  kbType: call('kb:type'), kbKey: call('kb:key'),
  onOverlayShow: (cb) => ipcRenderer.on('overlay:show', (_e, d) => cb(d)),
  onNav: (cb) => ipcRenderer.on('overlay:nav', (_e, n) => cb(n)),
  onMouse: (cb) => ipcRenderer.on('mouse:state', (_e, on) => cb(on)),
  onHud: (cb) => ipcRenderer.on('hud', (_e, text) => cb(text)),
})
