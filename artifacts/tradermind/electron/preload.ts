import { contextBridge, ipcRenderer } from 'electron';

// اگر در آینده نیاز به API های Node.js داشتید اینجا expose کنید
// فعلاً خالی است چون برنامه فقط از IndexedDB استفاده می‌کند
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.env.npm_package_version ?? '1.0.0',
  isElectron: true,
  onCloseRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('close-requested', listener);
    return () => ipcRenderer.removeListener('close-requested', listener);
  },
  confirmClose: () => ipcRenderer.send('close-confirmed'),
  cancelClose: () => ipcRenderer.send('close-cancelled'),
  scheduleReminder: (reminder: { id: string; title: string; body: string; scheduledAt: number }) =>
    ipcRenderer.invoke('schedule-reminder', reminder),
  cancelReminder: (id: string) => ipcRenderer.invoke('cancel-reminder', id),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
});
