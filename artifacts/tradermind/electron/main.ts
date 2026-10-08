import { app, BrowserWindow, shell, Menu, session, ipcMain, Notification, desktopCapturer } from 'electron';
import path from 'path';

const isDev = !app.isPackaged;
const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelReminder(id: string): void {
  const timer = reminderTimers.get(id);
  if (timer) clearTimeout(timer);
  reminderTimers.delete(id);
}

function scheduleReminder(reminder: { id: string; title: string; body: string; scheduledAt: number }): boolean {
  cancelReminder(reminder.id);
  const delay = reminder.scheduledAt - Date.now();
  if (delay <= 0) return false;

  const scheduleNext = () => {
    const remaining = reminder.scheduledAt - Date.now();
    if (remaining <= 0) {
      reminderTimers.delete(reminder.id);
      if (Notification.isSupported()) {
        new Notification({
          title: reminder.title,
          body: reminder.body || 'یادآور TraderMind',
          silent: false,
        }).show();
      }
      return;
    }
    reminderTimers.set(reminder.id, setTimeout(scheduleNext, Math.min(remaining, 2_147_483_647)));
  };

  scheduleNext();
  return true;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // needed for file:// IndexedDB access
    },
    icon: path.join(__dirname, '../../public/icon.png'),
    title: 'TraderMind OS',
    backgroundColor: '#0f1117',
    show: false,
  });

  let allowClose = false;
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    win.webContents.send('close-requested');
  });
  ipcMain.removeAllListeners('close-confirmed');
  ipcMain.removeAllListeners('close-cancelled');
  ipcMain.once('close-confirmed', () => {
    allowClose = true;
    win.close();
  });
  ipcMain.on('close-cancelled', () => undefined);

  // بارگذاری برنامه از dist
  // __dirname در dev = electron/dist/ و در prod = app.asar/electron/dist/
  // دو سطح بالاتر = ریشه پروژه یا ریشه asar
  const indexPath = path.join(__dirname, '../../dist/public/index.html');

  win.loadFile(indexPath).catch((err) => {
    console.error('loadFile failed:', indexPath, err);
  });

  // نمایش پنجره پس از آماده شدن (بدون flash سفید)
  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error('LOAD FAILED:', errorCode, errorDescription, validatedURL);
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log('[renderer]', level, message, `(${sourceId}:${line})`);
  });

  // باز کردن لینک‌های خارجی در مرورگر سیستم
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// منو را مخفی کن (برنامه SPA است)
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  ipcMain.handle('schedule-reminder', (_event, reminder) => scheduleReminder(reminder));
  ipcMain.handle('cancel-reminder', (_event, id: string) => {
    cancelReminder(id);
  });
  ipcMain.handle('capture-screen', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 },
      fetchWindowIcons: false,
    });
    const source = sources[0];
    if (!source || source.thumbnail.isEmpty()) return null;
    const size = source.thumbnail.getSize();
    return {
      dataUrl: source.thumbnail.toDataURL(),
      sourceName: source.name,
      width: size.width,
      height: size.height,
    };
  });
  // Web Speech در Electron برای شروع ضبط به مجوز media نیاز دارد.
  // فقط میکروفون را اجازه می‌دهیم؛ دسترسی دوربین یا مجوزهای دیگر باز نمی‌شود.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
