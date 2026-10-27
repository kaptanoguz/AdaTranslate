const { app, BrowserWindow, Menu, shell, dialog, protocol, net, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Hatalar exe'nin yanındaki ada-hata.log'a yazılır (portable), olmazsa temp'e.
const LOG = path.join(process.env.PORTABLE_EXECUTABLE_DIR || app.getPath('temp'), 'ada-hata.log');

function fatal(where, err) {
  const msg = `${where}: ${(err && err.stack) || err}`;
  try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
  try { dialog.showErrorBox('Ada Translate hatası', msg + '\n\nLog: ' + LOG); } catch (_) {}
}
process.on('uncaughtException', (e) => fatal('uncaughtException', e));
process.on('unhandledRejection', (e) => fatal('unhandledRejection', e));

// Bazı Windows GPU sürücüleri Electron'u anında öldürür; yazılım render daha güvenli.
app.disableHardwareAcceleration();

// Ağ paylaşımı (\\sunucu\pay) üzerinden çalışınca Chromium sandbox'ı renderer'ı
// başlatamaz ve cache ağ yoluna yazılamaz.
const isUNC = /^\\\\/.test(__dirname);
if (isUNC) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  try {
    const local = path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'AdaTranslate-cache');
    fs.mkdirSync(local, { recursive: true });
    app.setPath('userData', local);
  } catch (_) {}
}

function toFileURL(p) {
  if (/^\\\\/.test(p)) {
    return 'file://' + p.replace(/^\\\\/, '').split('\\').map(encodeURIComponent).join('/');
  }
  return pathToFileURL(p).href;
}

// Uygulama dosyaları app://ada/ altından sunulur. file:// yerine bu sayede
// çeviri modeli (Web Worker + WASM + fetch) çalışır; COOP/COEP başlıkları
// çok çekirdekli WASM'ı açar.
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.onnx': 'application/octet-stream'
};

function serve(req) {
  const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(__dirname, rel));
  if (!file.startsWith(__dirname)) return new Response('forbidden', { status: 403 });
  let size;
  try { size = fs.statSync(file).size; } catch (_) { return new Response('not found', { status: 404 }); }
  return net.fetch(toFileURL(file)).then((r) => new Response(r.body, {
    status: r.status,
    headers: {
      // Boyut bilinmezse çeviri kütüphanesi 400 MB'lık modeli parça parça büyüterek okur (dakikalar sürer).
      'Content-Length': String(size),
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }
  }));
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1040, height: 780, minWidth: 420, minHeight: 560,
    title: 'Ada Translate',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121518' : '#F6F5F1',
    icon: path.join(__dirname, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => win.show());
  // Emniyet: ready-to-show hiç gelmezse pencereyi yine de göster.
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 8000);
  win.webContents.on('did-fail-load', (_e, code, desc, url) => fatal('did-fail-load', `${code} ${desc} — ${url}`));
  win.webContents.on('render-process-gone', (_e, d) => fatal('renderer-gone', JSON.stringify(d)));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL('app://ada/index.html').catch((e) => fatal('loadURL', e));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    protocol.handle('app', serve);
    createWindow();
  }).catch((e) => fatal('whenReady', e));
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
