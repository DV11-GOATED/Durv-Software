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
})
