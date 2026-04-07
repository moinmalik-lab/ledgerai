const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');

// Load .env from user data directory (persists across app updates)
const userDataEnv = path.join(app.getPath('userData'), '.env');
if (fs.existsSync(userDataEnv)) {
  require('dotenv').config({ path: userDataEnv });
} else {
  // Fall back to .env next to the executable
  require('dotenv').config();
}

const PORT = 3737;
let win, serverProc;

function waitForServer(resolve, tries = 0) {
  if (tries > 50) { resolve(false); return; }
  http.get(`http://localhost:${PORT}/api/health`, r => {
    if (r.statusCode === 200) resolve(true);
    else setTimeout(() => waitForServer(resolve, tries + 1), 200);
  }).on('error', () => setTimeout(() => waitForServer(resolve, tries + 1), 200));
}

function startServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server.js')
    : path.join(__dirname, 'server.js');

  const dbPath = path.join(app.getPath('userData'), 'ledgerai.db');

  serverProc = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: dbPath,
    },
    stdio: 'inherit',
  });

  serverProc.on('error', err => console.error('Server error:', err));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'LedgerAI',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(`http://localhost:${PORT}`);

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  startServer();

  const ready = await new Promise(resolve => waitForServer(resolve));
  if (!ready) {
    dialog.showErrorBox('LedgerAI', 'Server failed to start. Check that port 3737 is not in use.');
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProc) serverProc.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverProc) serverProc.kill();
});
