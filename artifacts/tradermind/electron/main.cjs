const { app, BrowserWindow, Menu, shell, session, ipcMain, desktopCapturer } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "TraderMind OS",
    icon: path.join(__dirname, "../public/favicon.svg"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../dist/public/index.html")
    );
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

// Remove default menu bar in production
if (app.isPackaged) {
  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  ipcMain.handle("capture-screen", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
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
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "media");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
