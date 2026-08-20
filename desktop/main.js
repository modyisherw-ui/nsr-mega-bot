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
      const ctl = AbortSignal.timeout(6000);
      const res = await fetch(BOT_CONFIG_URL, { headers: { 'User-Agent': 'nsr-hub' }, signal: ctl });
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
      settle(reject, new Error('انتهت مهلة تسجيل الدخول — تأكد أن رابط التوجيه مضاف بالظبط في Discord Developer Portal → OAuth2 → Redirects: http://127.0.0.1:19563/callback'));
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
      const errorDesc = url.searchParams.get('error_description') || '';
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        if (error === 'invalid_request' && /redirect/i.test(errorDesc)) {
          res.end(`<meta charset="utf-8"><h1>خطأ في رابط التوجيه (redirect_uri)</h1><p>أضف هذا الرابط بالظبط في Discord Developer Portal ← OAuth2 ← Redirects:</p><code>http://127.0.0.1:19563/callback</code><p>ثم أعد المحاولة.</p>`);
        } else {
          res.end(`<h1>تم رفض الدخول: ${error || 'لا يوجد كود'}</h1>`);
        }
        settle(reject, error === 'access_denied'
          ? 'تم إلغاء تسجيل الدخول في متصفح Discord'
          : /redirect/i.test(errorDesc) || error == null
            ? 'Discord رفض رابط التوجيه (Invalid OAuth2 redirect_uri) — أضف الرابط http://127.0.0.1:19563/callback بالظبط في Discord Developer Portal → OAuth2 → Redirects ثم أعد المحاولة'
            : `فشل تسجيل الدخول: ${error || 'لا يوجد كود'} — تحقق من Client ID وأضف الرابط في Redirects`);
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
const UPDATE_RAW = 'https://raw.githubusercontent.com/modyisherw-ui/nsr-mega-bot/main/desktop/LATEST';
const UPDATE_API = 'https://api.github.com/repos/modyisherw-ui/nsr-mega-bot/releases/tags/desktop';
const UPDATE_API_FALLBACK = 'https://api.github.com/repos/modyisherw-ui/nsr-mega-bot/releases?per_page=10';
const UPDATE_PATTERN = /^NSR-HUB-Setup-(\d+\.\d+\.\d+)\.exe$/;
const UPDATE_BASE_URL = 'https://github.com/modyisherw-ui/nsr-mega-bot/releases/download/desktop/';

function updateLog(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'update.log'), '[' + new Date().toISOString() + '] ' + msg + '\n');
  } catch (_) {}
}

function verStr(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
  return m ? m[1] + '.' + m[2] + '.' + m[3] : null;
}

function verLt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false;
}

function pickBestAsset(assets) {
  let best = null;
  for (const a of (assets || [])) {
    const m = UPDATE_PATTERN.exec(a.name);
    if (!m) continue;
    if (!best || verLt(best.version, m[1])) best = { version: m[1], url: a.browser_download_url };
  }
  return best;
}

async function checkForUpdate() {
  // المسار الأساسي: ملف LATEST من raw.githubusercontent — بلا حدود طلبات API
  // صيغة الملف: السطر الأول = الإصدار، السطر الثاني (اختياري) = رابط تحميل مباشر (مرآة)
  try {
    const rawRes = await fetch(UPDATE_RAW, { headers: { 'User-Agent': 'nsr-hub-updater' }, signal: AbortSignal.timeout(10000) });
    if (rawRes.ok) {
      const text = await rawRes.text();
      const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const latest = verStr(lines[0] || '');
      if (latest && verLt(app.getVersion(), latest)) {
        const urls = lines.filter((l) => /^https?:\/\//i.test(l));
        const direct = urls[0] || (UPDATE_BASE_URL + 'NSR-HUB-Setup-' + latest + '.exe');
        const manual = urls[1] || direct;
        updateLog('update found (raw): installed=' + app.getVersion() + ' latest=' + latest + (direct ? ' (mirror)' : ''));
        return { version: latest, url: direct, fallbackUrl: UPDATE_BASE_URL + 'NSR-HUB-Setup-' + latest + '.exe', manualUrl: manual || null };
      }
      updateLog('no newer (raw): installed=' + app.getVersion() + ' latest=' + latest);
    }
  } catch (_) {}

  // مسار احتياطي: GitHub API
  try {
    let rel = null;
    try {
      const res = await fetch(UPDATE_API, { headers: { 'User-Agent': 'nsr-hub-updater' }, signal: AbortSignal.timeout(10000) });
      if (res.ok) rel = await res.json();
    } catch (_) {}
    if (!rel || !rel.assets) {
      updateLog('tag API failed, trying fallback list');
      try {
        const res2 = await fetch(UPDATE_API_FALLBACK, { headers: { 'User-Agent': 'nsr-hub-updater' }, signal: AbortSignal.timeout(10000) });
        if (res2.ok) {
          const list = await res2.json();
          for (const r of list) {
            if (pickBestAsset(r.assets)) { rel = r; break; }
          }
        }
      } catch (_) {}
    }
    if (!rel || !rel.assets) return null;
    const best = pickBestAsset(rel.assets);
    if (!best) return null;
    if (!verLt(app.getVersion(), best.version)) {
      updateLog('no newer (api): installed=' + app.getVersion() + ' latest=' + best.version);
      return null;
    }
    updateLog('update found (api): installed=' + app.getVersion() + ' latest=' + best.version);
    return best;
  } catch (e) {
    updateLog('checkForUpdate error: ' + (e && e.message));
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
        const reader = res.body.getReader();
        let got = 0;
        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) return;
            got += value.length;
            const ok = ws.write(value);
            if (total && onProgress) onProgress(got / total);
            if (ok) return pump();
            return new Promise((resolveWrite) => ws.once('drain', resolveWrite)).then(pump);
          });
        }
        pump()
          .then(() => ws.end())
          .then(() => resolve())
          .catch((e) => { try { ws.destroy(); } catch (_) {} reject(e); });
      })
      .catch(reject);
  });
}

function installAndRelaunch(installerPath) {
  if (!installerPath || !fs.existsSync(installerPath)) {
    updateLog('installer missing: ' + installerPath);
    return;
  }
  const exe = process.execPath;
  const iPath = String(installerPath);
  const aPath = String(exe);
  const exeName = path.basename(exe) + ''; // e.g. "NSR HUB.exe"
  const tmpDir = app.getPath('temp');
  const logFile = path.join(tmpDir, 'nsr-hub-updater.log');
  const scriptFile = path.join(tmpDir, 'nsr-hub-updater-' + Date.now() + '.ps1');

  // سكربت منفصل مكتوب في ملف (بدل -Command المضمن) — يتجنب مشاكل الاقتباس
  // ويضمن: انتظار خروج التطبيق → قتل أي عملية باقية → التثبيت → التحقق → إعادة الفتح
  const ps = `
$ErrorActionPreference = "Continue"
$log = '${logFile.replace(/'/g, "''")}'
function L($m) { Add-Content -Path $log -Value ("[" + (Get-Date -Format "HH:mm:ss") + "] " + $m) }
L "=== updater start ==="
$exeName = '${exeName.replace(/'/g, "''")}'
$iPath = '${iPath.replace(/'/g, "''")}'
$aPath = '${aPath.replace(/'/g, "''")}'

# 1) انتظر حتى يخرج التطبيق الحالي نهائياً (حتى 20 ثانية) ثم اقتل الباقي
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($exeName)) -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
}
Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($exeName)) -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
L "old app stopped"

# 2) قم بتثبيت النسخة الجديدة بصمت
if (-not (Test-Path $iPath)) { L "INSTALLER MISSING: $iPath"; exit 1 }
L "running installer"
$proc = Start-Process -FilePath $iPath -ArgumentList '/S' -PassThru -Wait
L ("installer exit code: " + $proc.ExitCode)

Start-Sleep -Seconds 2

# 3) تحقق من وجود التطبيق الجديد ثم افتحه
if (Test-Path $aPath) {
  L "launching: $aPath"
  Start-Process -FilePath $aPath
  L "=== updater done ==="
} else {
  # محاولة في مسار التثبيت الافتراضي
  $alt = Join-Path $env:LOCALAPPDATA ('Programs\\nsr-hub\\' + $exeName)
  if (Test-Path $alt) {
    L "launching alt: $alt"
    Start-Process -FilePath $alt
    L "=== updater done (alt) ==="
  } else {
    L "APP NOT FOUND: $aPath | $alt"
  }
}
`;
  try {
    fs.writeFileSync(scriptFile, ps, 'utf8');
    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptFile], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    updateLog('launched updater script: ' + installerPath + ' (log: ' + logFile + ')');
  } catch (e) {
    updateLog('launch updater failed: ' + (e && e.message));
  }
  // نترك التطبيق يخرج بسرعة حتى يتسنى للمثبّت استبدال الملفات
  setTimeout(() => { try { app.exit(0); } catch (_) {} }, 1500);
}

async function runUpdateCheck(win) {
  const send = (s) => { try { if (win && !win.isDestroyed()) win.webContents.send('update:status', s); } catch (_) {} };
  send({ phase: 'checking' });
  const upd = await checkForUpdate();
  if (!upd) {
    send({ phase: 'none' });
    return;
  }
  // وجود تحديث: نخبر الواجهة وننتظر المستخدم يضغط زر التحميل
  updateLog('update ready: ' + upd.version + ' -> ' + upd.url);
  send({ phase: 'found', version: upd.version, url: upd.url, manualUrl: upd.manualUrl || null });
}

async function runUpdateDownload(win, upd) {
  const send = (s) => { try { if (win && !win.isDestroyed()) win.webContents.send('update:status', s); } catch (_) {} };
  if (!upd) {
    const found = await checkForUpdate();
    if (!found) { send({ phase: 'none' }); return; }
    upd = found;
  }
  // نبث تقدم اصطناعي على مدى 4 ثوانٍ حتى يظهر الشريط بصورة واضحة وثابتة
  const MIN_SHOW_MS = 4000;
  const start = Date.now();
  send({ phase: 'downloading', pct: 0, version: upd.version });
  const dest = path.join(app.getPath('temp'), 'nsr-hub-update-' + upd.version + '.exe');
  updateLog('downloading ' + upd.version);
  try {
    await Promise.all([
      downloadFile(upd.url, dest, (pct) => {
        const remaining = Math.max(0, MIN_SHOW_MS - (Date.now() - start));
        const pctSpeed = Math.max(pct, 1 - remaining / MIN_SHOW_MS) * 100;
        send({ phase: 'downloading', pct: Math.min(100, Math.round(pctSpeed)), version: upd.version });
      }),
      (async () => {
        // نضمن بقاء الرسالة 4 ثوانٍ على الأقل مهما كانت سرعة التحميل
        const waitMs = Math.max(0, MIN_SHOW_MS - (Date.now() - start));
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
      })(),
    ]);
  } catch (e) {
    updateLog('download failed (primary): ' + (e && e.message));
    // محاولة احتياطية: الرابط الثاني إن وجد (غالباً GitHub) — وإلا نعرض الخطأ النهائي
    if (upd.fallbackUrl && upd.fallbackUrl !== upd.url) {
      updateLog('trying fallback: ' + upd.fallbackUrl);
      try {
        const dest2 = path.join(app.getPath('temp'), 'nsr-hub-update-' + upd.version + '-fb.exe');
        await downloadFile(upd.fallbackUrl, dest2, (pct) => {
          const remaining = Math.max(0, MIN_SHOW_MS - (Date.now() - start));
          const pctSpeed = Math.max(pct, 1 - remaining / MIN_SHOW_MS) * 100;
          send({ phase: 'downloading', pct: Math.min(100, Math.round(pctSpeed)), version: upd.version });
        });
        updateLog('fallback download ok: ' + upd.fallbackUrl);
        send({ phase: 'installing', version: upd.version });
        installAndRelaunch(dest2);
        return;
      } catch (e2) {
        updateLog('fallback failed: ' + (e2 && e2.message));
        send({ phase: 'error', message: (e && e.message) || 'فشل التنزيل', manualUrl: upd.manualUrl || null });
        return;
      }
    }
    send({ phase: 'error', message: (e && e.message) || 'فشل التنزيل', manualUrl: upd.manualUrl || null });
    return;
  }
  send({ phase: 'installing', version: upd.version });
  updateLog('installing ' + upd.version);
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
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    title: 'NSR HUB',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('maximize', () => { try { win.webContents.send('window:maximized', true); } catch (_) {} });
  win.on('unmaximize', () => { try { win.webContents.send('window:maximized', false); } catch (_) {} });
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
  return { session, adminGuilds: getAdminGuilds(session), allGuilds: session.guilds || [] };
});
ipcMain.handle('auth:session', () => {
  const s = loadSession();
  if (!s) return null;
  if (s.expiresAt && Date.now() > s.expiresAt) {
    clearSession();
    return null;
  }
  return { session: s, adminGuilds: getAdminGuilds(s), allGuilds: s.guilds || [] };
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

// ---------- أزرار شريط العنوان ----------
ipcMain.handle('window:minimize', () => { win && win.minimize(); });
ipcMain.handle('window:toggle-maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.handle('window:close', () => { win && win.close(); });
  ipcMain.handle('open:external', (e, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:start', async () => {
    const w = win;
    if (!w) return;
    const upd = await checkForUpdate();
    await runUpdateDownload(w, upd);
  });

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