// NSR Dashboard — الجسر بين الواجهة والعملية الرئيسية
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  login: (settings) => ipcRenderer.invoke('auth:login', settings),
  getSession: () => ipcRenderer.invoke('auth:session'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  bridgeConnect: (key) => ipcRenderer.invoke('bridge:connect', key),
  bridgeCommand: (data) => ipcRenderer.invoke('bridge:command', data),
  bridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  onBridgeStatus: (cb) => ipcRenderer.on('bridge:status', (e, s) => cb(s)),
  onBridgeEvent: (cb) => ipcRenderer.on('bridge:event', (e, m) => cb(m)),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (e, s) => cb(s)),
  winMinimize: () => ipcRenderer.invoke('window:minimize'),
  winToggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  winClose: () => ipcRenderer.invoke('window:close'),
  onWinMaximized: (cb) => ipcRenderer.on('window:maximized', (e, m) => cb(m)),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  getVersion: () => ipcRenderer.invoke('app:version'),
  startUpdate: () => ipcRenderer.invoke('update:start'),
});