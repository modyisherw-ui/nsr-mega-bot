// NSR Dashboard — العملية الرئيسية: نافذة Electron + OAuth Discord (PKCE) + جسر MQTT
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const mqtt = require('mqtt');

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const CALLBACK_PORT = 19563;
const DISCORD_API = 'https://discord.com/api/v10';

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

    const server = http.createServer();
    const cleanup = () => { try { server.close(); } catch (_) {} };

    server.on('error', (err) => { cleanup(); reject(new Error('تعذر فتح منفذ الاستقبال: ' + err.message)); });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      const url = `${DISCORD_API}/oauth2/authorize?client_id=${settings.clientId}&response_type=code&redirect_uri=${encodeURIComponent('http://127.0.0.1:' + CALLBACK_PORT + '/callback')}&scope=identify%20guilds&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
      shell.openExternal(url).catch(() => {});
    });

    server.on('request', async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404); res.end('Not found'); return;
      }
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>حالة التحقق غير صحيحة</h1>'); return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>تم رفض الدخول: ${error || 'لا يوجد كود'}</h1>`);
        cleanup(); reject(new Error('تم إلغاء تسجيل الدخول أو رفضه')); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>تم تسجيل الدخول بنجاح! يمكنك إغلاق هذه الصفحة والعودة للتطبيق.</h1>');
      cleanup();
      try {
        const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: settings.clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: 'http://127.0.0.1:' + CALLBACK_PORT + '/callback',
            code_verifier: verifier,
          }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData).slice(0, 200));
        const meRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: 'Bearer ' + tokenData.access_token } });
        const me = await meRes.json();
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
        reject(err);
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

ipcMain.handle('auth:login', async (e, settings) => {
  const session = await startOAuth(settings);
  return { session, adminGuilds: getAdminGuilds(session) };
});
ipcMain.handle('auth:session', () => {
  const s = loadSession();
  if (!s) return null;
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});