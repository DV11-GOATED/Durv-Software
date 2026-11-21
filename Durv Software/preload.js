const { contextBridge, ipcRenderer } = require('electron')
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a)
contextBridge.exposeInMainWorld('shell', {
  state: call('lib:state'),            // { config, games, storage }
  rescan: call('lib:rescan'),
  setupDefaults: call('setup:defaults'),
  setFolder: call('cfg:setFolder'),    // folder path, or null to skip setup
  fsStart: call('fs:start'),
  fsList: call('fs:list'),             // (dir, 'folder' | 'image')
  setArt: call('art:set'),             // (gameId, 'tile' | 'wallpaper', imagePath)
  resetArt: call('art:reset'),
  hide: call('game:hide'),
  openConfig: call('sys:openConfig'),
  launch: call('app:launch'),
  power: call('system:power'),         // 'shutdown' | 'sleep' | 'restart' | 'desktop'
  onReturn: (cb) => ipcRenderer.on('shell:returned', cb),
})
