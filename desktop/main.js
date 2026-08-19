// NSR Dashboard — العملية الرئيسية: نافذة Electron + OAuth Discord (PKCE) + جسر MQTT
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const mqtt = require('mqtt');

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const CALLBACK_PORT = 19563;
const DISCORD_API = 'https://discord.com/api/v10';

// ---------- إعدادات التطبيق المثبتة (بدون إدخال من المستخدم) ----------
const APP_CLIENT_ID = '1537394763328786572';
const BOT_CONFIG_URL = 'https://raw.githubusercontent.com/modyisherw-ui/nsr-mega-bot/main/config.json';

async function resolveAppConfig() {
  const s = loadSettings();
  const clientId = s.clientId || APP_CLIENT_ID;
  const clientSecret = s.clientSecret || '';
  let bridgeKey = s.bridgeKey || '';
  if (!bridgeKey) {
    try {
      const res = await fetch(BOT_CONFIG_URL, { headers: { 'User-Agent': 'nsr-hub' } });
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.bridgeKey) {
          bridgeKey = String(cfg.bridgeKey);
          saveSettings({ bridgeKey });
        }
      }
    } catch (_) {}
  }
  return { clientId, clientSecret, bridgeKey };
}

// ---------- تخزين الإعدادات الجلسة ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (_) { return {}; }
}
function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  return s;
}

// ---------- جلسة Discord ----------
function sessionPath() { return path.join(app.getPath('userData'), 'session.json'); }
function loadSession() {
  try { return JSON.parse(fs.readFileSync(sessionPath(), 'utf8')); } catch (_) { return null; }
}
function saveSession(s) { fs.writeFileSync(sessionPath(), JSON.stringify(s, null, 2)); }
function clearSession() { try { fs.unlinkSync(sessionPath()); } catch (_) {} }

// ---------- جسر MQTT ----------
let mqttClient = null;
let mqttKey = '';
let pendingReplies = new Map();

function connectBridge(key, win) {
  mqttKey = key || mqttKey;
  if (!mqttKey) return;
  if (mqttClient) {
    try { mqttClient.end(true); } catch (_) {}
  }
  mqttClient = mqtt.connect(BROKER_URL, {
    clientId: 'nsrdash-' + crypto.randomBytes(6).toString('hex'),
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });
  mqttClient.on('connect', () => {
    const topic = `nsrbot/${mqttKey}/state`;
    mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (!err) win.webContents.send('bridge:status', { connected: true });
    });
  });
  mqttClient.on('reconnect', () => {});
  mqttClient.on('offline', () => win.webContents.send('bridge:status', { connected: false }));
  mqttClient.on('error', () => win.webContents.send('bridge:status', { connected: false }));
  mqttClient.on('message', (topic, payload) => {
    let msg;
    try { msg = JSON.parse(payload.toString()); } catch (_) { return; }
    const reqId = msg.requestId;
    if (reqId && pendingReplies.has(reqId)) {
      pendingReplies.get(reqId)(msg);
      pendingReplies.delete(reqId);
      return;
    }
    // رسالة غير مترابطة (نبض أو حالة) — أرسلها للواجهة
    if (msg.broadcast) win.webContents.send('bridge:event', msg);
  });
}

function sendCommand(data, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttClient.connected) {
      return reject(new Error('الجسر غير متصل — تأكد من مفتاح الجسر الصحيح وافتح التطبيق مع تشغيل البوت'));
    }
    const requestId = crypto.randomBytes(8).toString('hex');
    const payload = { requestId, ...data };
    const timer = setTimeout(() => {
      pendingReplies.delete(requestId);
      reject(new Error('انتهت مهلة الانتظار — البوت لم يجب (هل الجسر مفعّل في البوت?)'));
    }, timeoutMs);
    pendingReplies.set(requestId, (msg) => { clearTimeout(timer); resolve(msg); });
    mqttClient.publish(`nsrbot/${mqttKey}/cmd`, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) { clearTimeout(timer); pendingReplies.delete(requestId); reject(new Error('فشل إرسال الأمر: ' + err.message)); }
    });
  });
}

// ---------- OAuth Discord (PKCE) ----------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function startOAuth(settings) {
  return new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = crypto.randomBytes(8).toString('hex');
    let settled = false;
    const settle = (fn, val) => { if (settled) return; settled = true; cleanup(); fn(val); };

    const server = http.createServer();
    const cleanup = () => {
      clearTimeout(server._timeout);
      try { server.close(); } catch (_) {}
    };

    server.on('error', (err) => {
      settle(reject, new Error('تعذر فتح منفذ الاستقبال 19563 — تأكد من إغلاق نافذة تسجيل دخول سابقة وأن المنفذ غير محجوب: ' + err.code));
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      const url = `${DISCORD_API}/oauth2/authorize?client_id=${settings.clientId}&response_type=code&redirect_uri=${encodeURIComponent('http://127.0.0.1:' + CALLBACK_PORT + '/callback')}&scope=identify%20guilds&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
      shell.openExternal(url).catch(() => {
        settle(reject, new Error(`تعذر فتح المتصفح. افتح هذا الرابط يدوياً:\n${url}`));
      });
    });

    server._timeout = setTimeout(() => {
      settle(reject, new Error('انتهت مهلة تسجيل الدخول — حاول مرة أخرى'));
    }, 120000);

    server.on('request', async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404); res.end('Not found'); return;
      }
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>حالة التحقق غير صحيحة — أعد المحاولة من التطبيق</h1>');
        settle(reject, new Error('حالة التحقق غير صحيحة — أعد فتح نافذة تسجيل الدخول'));
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>تم رفض الدخول: ${error || 'لا يوجد كود'}</h1>`);
        settle(reject, new Error(error === 'access_denied'
          ? 'تم إلغاء تسجيل الدخول في متصفح Discord'
          : `فشل تسجيل الدخول: ${error || 'لا يوجد كود'} — تحقق من Client ID وأضف الرابط في Redirects`));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>تم تسجيل الدخول بنجاح! يمكنك إغلاق هذه الصفحة والعودة للتطبيق.</h1>');
      cleanup();
      try {
        const params = new URLSearchParams({
          client_id: settings.clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'http://127.0.0.1:' + CALLBACK_PORT + '/callback',
          code_verifier: verifier,
        });
        if (settings.clientSecret) params.set('client_secret', settings.clientSecret);
        const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
          let msg = 'فشل استبدال كود الدخول من Discord';
          if (tokenData.error === 'invalid_client') msg = 'Discord رفض المدخلات: Client ID غير صحيح أو تحتاج Client Secret (فعّل Public Client في البوابة أو أضف السر فيه)';
          else if (tokenData.error_description) msg += ' — ' + tokenData.error_description;
          else if (tokenData.error) msg += ' — ' + tokenData.error;
          throw new Error(msg);
        }
        const meRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: 'Bearer ' + tokenData.access_token } });
        const me = await meRes.json();
        if (!me.id) throw new Error('فشل جلب بيانات الحساب من Discord');
        const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: 'Bearer ' + tokenData.access_token } });
        const guilds = await guildsRes.json();
        const session = {
          user: { id: me.id, username: me.username, avatarUrl: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : '' },
          token: tokenData.access_token,
          guilds: Array.isArray(guilds) ? guilds : [],
          expiresAt: Date.now() + (tokenData.expires_in || 604800) * 1000,
        };
        saveSession(session);
        resolve(session);
      } catch (err) {
        settle(reject, err);
      }
    });
  });
}

function getAdminGuilds(session) {
  // السيرفرات التي يملك فيها المستخدم صلاحية Administrator (0x8) أو ManageGuild (0x20)
  const ADMIN = 0x8, MANAGE = 0x20;
  return (session.guilds || []).filter(g => {
    const perms = Number(g.permissions || 0);
    return (perms & (ADMIN | MANAGE)) > 0;
  });
}

// ---------- التحديث التلقائي الإجباري ----------
const UPDATE_API = 'https://api.github.com/repos/modyisherw-ui/nsr-mega-bot/releases/tags/desktop';
const UPDATE_PATTERN = /^NSR-HUB-Setup-(\d+\.\d+\.\d+)\.exe$/;

function verLt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false;
}

async function checkForUpdate() {
  try {
    const res = await fetch(UPDATE_API, { headers: { 'User-Agent': 'nsr-hub-updater' } });
    if (!res.ok) return null;
    const rel = await res.json();
    let best = null;
    for (const a of (rel.assets || [])) {
      const m = UPDATE_PATTERN.exec(a.name);
      if (!m) continue;
      if (!best || verLt(best.version, m[1])) best = { version: m[1], url: a.browser_download_url };
    }
    if (!best) return null;
    if (!verLt(app.getVersion(), best.version)) return null;
    return best;
  } catch (_) {
    return null;
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    fetch(url, { headers: { 'User-Agent': 'nsr-hub-updater' } })
      .then((res) => {
        if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
        const total = Number(res.headers.get('content-length')) || 0;
        const ws = fs.createWriteStream(dest);
        let got = 0;
        res.body.getReader()
          .then(function pump(reader) {
            return reader.read().then(({ done, value }) => {
              if (done) { ws.end(); return; }
              got += value.length;
              ws.write(value);
              if (total && onProgress) onProgress(got / total);
              return pump(reader);
            });
          })
          .then(() => { ws.end(); resolve(); })
          .catch((e) => { try { ws.destroy(); } catch (_) {} reject(e); });
      })
      .catch(reject);
  });
}

function installAndRelaunch(installerPath) {
  const exe = process.execPath;
  const installer = installerPath.replace(/"/g, '\\"');
  const appExe = exe.replace(/"/g, '\\"');
  const cmd = `start "" /wait "${installer}" /S & start "" "${appExe}"`;
  try {
    spawn((process.env.ComSpec || 'cmd.exe'), ['/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (_) {}
  setTimeout(() => { try { app.exit(0); } catch (_) {} }, 800);
}

async function runUpdateCheck(win) {
  const send = (s) => { try { if (win && !win.isDestroyed()) win.webContents.send('update:status', s); } catch (_) {} };
  send({ phase: 'checking' });
  const upd = await checkForUpdate();
  if (!upd) {
    send({ phase: 'none' });
    return;
  }
  send({ phase: 'downloading', pct: 0, version: upd.version });
  const dest = path.join(app.getPath('temp'), 'nsr-hub-update-' + upd.version + '.exe');
  try {
    await downloadFile(upd.url, dest, (pct) => send({ phase: 'downloading', pct: Math.round(pct * 100), version: upd.version }));
  } catch (e) {
    send({ phase: 'error', message: (e && e.message) || 'فشل التنزيل' });
    return;
  }
  send({ phase: 'installing', version: upd.version });
  installAndRelaunch(dest);
}

// ---------- نافذة ----------
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0b0f1c',
    autoHideMenuBar: true,
    title: 'NSR HUB',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (e, patch) => {
  const s = saveSettings(patch);
  if (patch.bridgeKey) {
    connectBridge(patch.bridgeKey, win);
    win.webContents.send('bridge:status', { connected: false });
  }
  return s;
});

ipcMain.handle('auth:login', async () => {
  const cfg = await resolveAppConfig();
  if (cfg.bridgeKey) {
    connectBridge(cfg.bridgeKey, win);
    if (win) win.webContents.send('bridge:status', { connected: false });
  }
  const session = await startOAuth(cfg);
  return { session, adminGuilds: getAdminGuilds(session) };
});
ipcMain.handle('auth:session', () => {
  const s = loadSession();
  if (!s) return null;
  if (s.expiresAt && Date.now() > s.expiresAt) {
    clearSession();
    return null;
  }
  return { session: s, adminGuilds: getAdminGuilds(s) };
});
ipcMain.handle('auth:logout', () => {
  clearSession();
  return true;
});

ipcMain.handle('bridge:connect', (e, key) => {
  connectBridge(key, win);
  return { ok: true };
});
ipcMain.handle('bridge:command', (e, data) => sendCommand(data));
ipcMain.handle('bridge:status', () => ({ connected: !!(mqttClient && mqttClient.connected) }));

// ---------- إقلاع ----------
app.whenReady().then(() => {
  createWindow();

  // ربط الجسر عند الإقلاع لو المفتاح محفوظ
  const s = loadSettings();
  if (s.bridgeKey) connectBridge(s.bridgeKey, win);

  // فحص التحديث الإجباري عند الفتح — يعطي الواجهة مهلة للاشتراك
  setTimeout(() => runUpdateCheck(win), 1200);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});