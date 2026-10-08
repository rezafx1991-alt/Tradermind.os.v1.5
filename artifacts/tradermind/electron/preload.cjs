// Preload script — runs in renderer context with Node.js access
// Renderer-facing APIs are intentionally narrow; Node/Electron objects never
// cross the context-isolation boundary.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
});
