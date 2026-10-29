'use strict';
/* ERP 管理系统 desktop shell (Electron).
 * The web app loads ES modules via relative URLs, which fails under file://,
 * so the shell serves the bundled web/ folder from a local HTTP origin.
 * The port is kept stable (17366, see app.json) so the app's localStorage
 * data persists across launches (same local origin every time).
 * App name, zip name and port live in app.json next to this file.
 */
const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));
const SLUG = CONFIG.zipName.replace(/-Windows-x64\.zip$/, '');
const WEB_ROOT = path.join(__dirname, 'web');
const PREFERRED_PORT = CONFIG.port;
const PORT_TRIES = 10;

// Keep this app's data in its own userData folder (named after the slug),
// separate from the browser version and from the other desktop shells.
app.setPath('userData', path.join(app.getPath('appData'), SLUG));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8'
};

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        let filePath = path.join(WEB_ROOT, decodeURIComponent(url.pathname));
        if (!filePath.startsWith(WEB_ROOT)) { res.writeHead(403); res.end(); return; }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
          });
          res.end(data);
        });
      } catch {
        res.writeHead(400); res.end();
      }
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function listenOnStablePort() {
  for (let i = 0; i < PORT_TRIES; i++) {
    try { return await startServer(PREFERRED_PORT + i); }
    catch (err) { if (err.code !== 'EADDRINUSE') throw err; }
  }
  throw new Error('No free local port for ' + CONFIG.appName + ' desktop shell');
}

let mainWindow = null;

async function createWindow() {
  const server = await listenOnStablePort();
  const port = server.address().port;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: CONFIG.appName,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith('http://127.0.0.1')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  await mainWindow.loadURL('http://127.0.0.1:' + port + '/');

  // Optional smoke hook: <SLUG>_SMOKE=/path/shot.png captures the loaded UI and quits.
  const smokeEnv = SLUG.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_SMOKE';
  if (process.env[smokeEnv]) {
    await new Promise(r => setTimeout(r, 2500));
    const image = await mainWindow.capturePage();
    fs.writeFileSync(process.env[smokeEnv], image.toPNG());
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow).catch(err => {
    console.error(err);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
