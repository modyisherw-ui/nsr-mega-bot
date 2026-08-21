// NSR Dashboard — منطق الواجهة
const NSR = window.api;
const $ = (sel) => document.querySelector(sel);

let settings = {};
let session = null;
let adminGuilds = [];
let allGuilds = [];
let botGuilds = [];
let known = false;
let botClientId = '';
let state = null;
let currentGuild = null;
let currentPage = 'home';
let isOwner = false;
let isCustomer = false;
let featureAccess = {};
let ownerMode = false;

// ═══════════ حماية الخروج بدون حفظ ═══════════
let pageDirty = false;
function markDirty() { pageDirty = true; }
function markSaved() { pageDirty = false; }

let _pendingNav = null;
let _navBlocked = false;
function guardNav() {
  if (!pageDirty || _navBlocked) return true;
  const overlay = $('#unsaved-overlay');
  overlay.style.display = 'flex';
  overlay.classList.remove('hidden');
  overlay.classList.add('visible');
  return false;
}
function closeUnsaved() {
  const overlay = $('#unsaved-overlay');
  overlay.style.display = 'none';
  overlay.classList.remove('visible');
  overlay.classList.add('hidden');
  _pendingNav = null;
}
function setPendingNav(fn) { _pendingNav = fn; }

// أزرار نافذة الحفظ
try {
  $('#unsaved-save').addEventListener('click', async () => {
    _navBlocked = true;
    // حاول الضغط على زر الحفظ في الصفحة الحالية
    const saveBtn = $('#dash-main').querySelector('[data-save]') || $('#dash-main').querySelector('.btn.primary[data-save]');
    if (saveBtn) {
      saveBtn.click();
      // انتظر قليلاً ثم انتقل
      await new Promise((r) => setTimeout(r, 600));
    }
    pageDirty = false;
    _navBlocked = false;
    closeUnsaved();
    if (_pendingNav) { _pendingNav(); _pendingNav = null; }
  });
  $('#unsaved-discard').addEventListener('click', () => {
    pageDirty = false;
    closeUnsaved();
    if (_pendingNav) { _pendingNav(); _pendingNav = null; }
  });
  $('#unsaved-cancel').addEventListener('click', closeUnsaved);
} catch (_) {}

const NSR_DISCORD_SERVER = 'https://discord.gg/GGAXRUAQ6x';
const BOT_CLIENT_ID = '1537394763328786572'; // آيدي تطبيق البوت (لرابط الدعوة)
const APP_LOGO_URL = 'https://cdn.discordapp.com/emojis/1537843770911891466.png?size=128'; // icon2

// أيقونات SVG بيضاء (بدل الإيموجيات) — stroke باللون الحالي
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4 17.5v-3a2.5 2.5 0 0 1-.5-4.92A2.5 2.5 0 0 1 5 5.5h3.5A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 20 17.5v-3a2.5 2.5 0 0 0 .5-4.92A2.5 2.5 0 0 0 19 5.5h-3.5A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.35 8.5 8.5 0 0 1-3.1-.59L3 21l1.74-5.9A8.5 8.5 0 0 1 3 11.5 8.38 8.38 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z"/><path d="M8 11h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.6 1.5-1.4 0-.35-.13-.66-.35-.9a1.4 1.4 0 0 1-.9-1.3c0-.8.65-1.4 1.45-1.4H17c3.3 0 5-2.2 5-4.8C22 6 17.5 2 12 2Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5l6 5 4-7 4 7 6-5-2 13H4Z"/><path d="M4 21h16"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.88-.61 1.27a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.27.08.08 0 0 0-.08-.04c-1.71.29-3.34.8-4.88 1.52a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06c0 .02.01.04.03.05a19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.1 13 13 0 0 1-1.87-.9.08.08 0 0 1-.01-.13c.13-.1.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.92 1.79 8.18 1.79 12.05 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.3a.08.08 0 0 1-.01.12 12.4 12.4 0 0 1-1.88.9.08.08 0 0 0-.04.1c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .08.03 19.9 19.9 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};
const MSG_TYPES = {
  send: { emoji: ICONS.chat, name: 'رسالة', color: '#5865F2', title: 'رسالة خاصة', description: '{{TEXT}}\n\n**{{GUILD}}**', canEditText: true },
  summon: { emoji: ICONS.send, name: 'استدعاء', color: '#F1C40F', title: 'استدعاء لك', description: 'نرجى منك فتح تكت في اسرع وقت.\n\n**{{GUILD}}**', canEditText: false },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}

// ---------- شريط العنوان ----------
try {
  $('#tb-min').addEventListener('click', () => NSR.winMinimize());
  $('#tb-max').addEventListener('click', () => NSR.winToggleMaximize());
  $('#tb-close').addEventListener('click', () => NSR.winClose());
  NSR.onWinMaximized((m) => {
    $('#tb-max').innerHTML = m ? '&#x2750;' : '&#x25A1;';
    document.body.classList.toggle('maximized', m);
  });
} catch (_) {}

// ---------- الأصوات (WebAudio) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    } catch (_) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}
function playSound(type) {
  if (settings.soundEnabled === false) return;
  ensureAudio();
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = 'sine';
    if (type === 'hover') { osc.frequency.value = 620; gain.gain.value = 0.03; }
    else if (type === 'click') { osc.frequency.value = 880; gain.gain.value = 0.055; }
    else if (type === 'success') { osc.frequency.value = 1046; gain.gain.value = 0.065; }
    else { osc.frequency.value = 210; gain.gain.value = 0.07; }
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.15);
  } catch (_) {}
}

// تطبيق الصوت والحركة على كل عنصر تفاعلي
let fxWired = 0;
function wireFx(root) {
  if (!root) return;
  if (fxWired > 200) return;
  fxWired++;
  root.querySelectorAll('button:not(.nav-btn), .server-card, .act-btn, .del-btn, select').forEach((el) => {
    if (el.dataset.fx) return;
    el.dataset.fx = '1';
    el.addEventListener('mouseenter', () => playSound('hover'));
    el.addEventListener('click', () => playSound('click'));
  });
}

// ---------- إشعارات ----------
let toastTimer = null;
function toast(text, type = 'ok') {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast show ' + type;
  if (type === 'ok') playSound('success'); else playSound('error');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
}

// ---------- حالة الجسر ----------
let bridgeConnected = false;
async function waitBridgeReady(timeoutMs) {
  const t0 = Date.now();
  while (bridgeConnected) return true;
  while (Date.now() - t0 < (timeoutMs || 12000)) {
    try {
      const st = await NSR.bridgeStatus();
      if (st && st.connected) { bridgeConnected = true; return true; }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

function setBridgeStatus(connected) {
  const was = bridgeConnected;
  bridgeConnected = connected;
  const dots = ['#bridge-dot', '#bridge-dot2', '#bridge-dot3'];
  const texts = ['#bridge-text', '#bridge-text2', '#bridge-text3'];
  dots.forEach((s) => { const d = $(s); if (d) d.className = 'dot ' + (connected ? 'on' : 'off'); });
  texts.forEach((s) => { const t = $(s); if (t) t.textContent = connected ? 'الجسر متصل' : 'الجسر غير متصل'; });
  // اتصال الجسر بعد الدخول → أعد تعبئة قائمة السيرفرات تلقائياً
  if (connected && !was && session && $('#screen-servers').classList.contains('active')) {
    enterServers();
  }
}

async function refreshBotGuilds() {
  if (!settings.bridgeKey || !session) return [];
  if (!bridgeConnected) {
    const ok = await waitBridgeReady(15000);
    if (!ok) return [];
  }
  try {
    const rep = await NSR.bridgeCommand({ type: 'guilds', userId: session.user.id, guildId: '' });
    if (rep && rep.ok && Array.isArray(rep.data.guilds)) {
      botGuilds = rep.data.guilds;
      botClientId = rep.data.botClientId || botClientId;
      isOwner = !!rep.data.isOwner;
      const ownerBtn = $('#btn-owner-view');
      if (ownerBtn) ownerBtn.classList.toggle('hidden', !isOwner);
      return botGuilds;
    }
  } catch (_) {}
  return [];
}

async function refreshCustomerStatus() {
  const badge = $('#customer-badge');
  if (!session || !settings.bridgeKey) { isCustomer = false; featureAccess = {}; if (badge) badge.classList.add('hidden'); return; }
  try {
    const rep = await NSR.bridgeCommand({ type: 'getCustomerStatus', userId: session.user.id, guildId: '' });
    if (rep && rep.ok) {
      isCustomer = !!rep.data.isCustomer || isOwner;
      if (rep.data.features) featureAccess = rep.data.features;
      if (badge) badge.classList.toggle('hidden', !isCustomer);
      if (window.__applyNavLocks) window.__applyNavLocks();
    }
  } catch (_) {}
}

// ---------- التحديث الإجباري ----------
const updateOverlay = $('#update-overlay');
const updateTitle = $('#update-title');
const updateSub = $('#update-sub');
const updateBarWrap = $('#update-bar-wrap');
const updateBar = $('#update-bar');
const updateBtn = $('#btn-update-download');
const updateManualBtn = $('#btn-update-manual');

let updatePhase = '';
NSR.onUpdateStatus((s) => {
  updatePhase = s.phase;
  updateOverlay.classList.add('visible');
  if (s.phase === 'checking') {
    updateTitle.textContent = 'جاري التحقق من التحديثات...';
    updateSub.textContent = '';
    updateBarWrap.classList.add('hidden');
    updateBar.style.width = '0%';
    updateBtn.classList.add('hidden');
    updateManualBtn.classList.add('hidden');
  } else if (s.phase === 'found') {
    updateTitle.textContent = 'يوجد تحديث جديد في التطبيق';
    updateSub.textContent = 'الإصدار ' + s.version + ' متوفر الآن — اضغط الزر للتحميل';
    updateBarWrap.classList.add('hidden');
    updateBar.style.width = '0%';
    updateBtn.textContent = 'تحميل التحديث الآن';
    updateBtn.classList.remove('hidden');
    updateManualBtn.classList.toggle('hidden', !s.manualUrl);
    if (s.manualUrl) updateManualBtn.dataset.url = s.manualUrl;
  } else if (s.phase === 'downloading') {
    updateManualBtn.classList.add('hidden');
    updateTitle.textContent = 'يوجد تحديث في التطبيق';
    updateSub.textContent = 'جاري تحديث التطبيق... ' + s.pct + '%';
    updateBarWrap.classList.remove('hidden');
    updateBar.style.width = s.pct + '%';
    updateBtn.classList.add('hidden');
  } else if (s.phase === 'installing') {
    updateTitle.textContent = 'يوجد تحديث في التطبيق';
    updateSub.textContent = 'جاري تثبيت التحديث — سيُفتح التطبيق تلقائياً...';
    updateBarWrap.classList.remove('hidden');
    updateBar.style.width = '100%';
    updateBtn.classList.add('hidden');
  } else if (s.phase === 'none') {
    updateOverlay.classList.remove('visible');
    if (!session) showScreen('screen-login');
  } else if (s.phase === 'error') {
    updateTitle.textContent = 'فشل تحميل التحديث';
    updateSub.textContent = (s.message && s.message !== 'فشل التنزيل' ? s.message + ' — ' : '') + 'اضغط الزر لإعادة المحاولة، أو حمّله يدوياً';
    updateBarWrap.classList.add('hidden');
    updateBtn.textContent = 'إعادة المحاولة';
    updateBtn.classList.remove('hidden');
    updateManualBtn.classList.toggle('hidden', !s.manualUrl);
    if (s.manualUrl) updateManualBtn.dataset.url = s.manualUrl;
  }
});

// ضمان: الشاشة لا تعلق فوق الواجهة أبداً إلا إذا كان التحديث جارياً (تحميل/تثبيت/انتظار ضغط) — عندها نتركها حتى يكتمل
setTimeout(() => {
  const active = updatePhase === 'found' || updatePhase === 'downloading' || updatePhase === 'installing';
  if (active) return;
  updateOverlay.classList.remove('visible');
  if (!session) showScreen('screen-login');
}, 15000);

// ---------- الإقلاع ----------
async function init() {
  updateBtn.addEventListener('click', () => {
    playSound('click');
    NSR.startUpdate();
  });
  updateManualBtn.addEventListener('click', () => {
    playSound('click');
    const url = updateManualBtn.dataset.url;
    if (url) NSR.openExternal(url);
  });
  setTimeout(() => { updateOverlay.classList.add('visible'); }, 50);
  const ver = await NSR.getVersion();
  if (ver) $('#titlebar-version').textContent = 'v' + ver;
  settings = await NSR.getSettings();
  if (settings.bridgeKey) await NSR.bridgeConnect(settings.bridgeKey);
  NSR.onBridgeStatus((s) => setBridgeStatus(s.connected));
  const st = await NSR.bridgeStatus();
  setBridgeStatus(st.connected);

  const sess = await NSR.getSession();
  if (sess && sess.session) {
    session = sess.session;
    adminGuilds = sess.adminGuilds;
    allGuilds = sess.allGuilds || (session.guilds || []);
    enterServers();
  }

  $('#btn-login').addEventListener('click', doLogin);
  $('#btn-back').addEventListener('click', () => { playSound('click'); enterServers(); });
  $('#btn-subs-back').addEventListener('click', () => { playSound('click'); enterServers(); });

  // زر المالك → قائمة منسدلة (مرة واحدة فقط)
  const ownerWrap = $('#btn-owner-wrap');
  const ownerMenu = $('#owner-menu');
  const ownerSearch = $('#servers-search');
  ownerWrap.addEventListener('click', (e) => {
    if (e.target.closest('#btn-owner-view')) {
      playSound('click');
      ownerMenu.classList.toggle('hidden');
      return;
    }
    const opt = e.target.closest('[data-owner-opt]');
    if (!opt) return;
    ownerMenu.classList.add('hidden');
    playSound('click');
    if (opt.dataset.ownerOpt === 'subs') {
      openSubscriptions();
      return;
    }
    ownerMode = true;
    $('#servers-search-wrap').classList.remove('hidden');
    if (currentGuild) currentGuild = null;
    const grid = $('#servers-grid');
    if (grid) {
      grid.innerHTML = '';
      const q = ownerSearch.value;
      // وضع "كل السيرفرات": فقط السيرفرات التي البوت موجود فيها
      const listed = botGuilds.filter((g) => !q || String(g.name || '').toLowerCase().includes(q.toLowerCase()) || String(g.id || '').includes(q));
      const empty = $('#servers-empty');
      empty.classList.toggle('hidden', listed.length > 0);
      listed.forEach((g, i) => grid.appendChild(serverCard(g, i)));
      wireFx(grid);
    }
  });
  ownerSearch.addEventListener('input', () => {
    if (!ownerMode) return;
    const grid = $('#servers-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const q = ownerSearch.value;
    const listed = botGuilds.filter((g) => !q || String(g.name || '').toLowerCase().includes(q.toLowerCase()) || String(g.id || '').includes(q));
    const empty = $('#servers-empty');
    empty.classList.toggle('hidden', listed.length > 0);
    listed.forEach((g, i) => grid.appendChild(serverCard(g, i)));
    wireFx(grid);
  });

  // زر الصورة الشخصية → القائمة الشخصية
  $('#btn-user-menu').addEventListener('click', () => {
    playSound('click');
    const menu = $('#user-menu');
    const show = menu.classList.toggle('hidden');
    if (!show) fillUserMenu();
  });
  $('#btn-logout').addEventListener('click', doLogout);
  document.addEventListener('click', (e) => {
    if (!$('#user-menu').classList.contains('hidden') && !e.target.closest('.user-chip')) {
      $('#user-menu').classList.add('hidden');
    }
    const om = $('#owner-menu');
    if (om && !om.classList.contains('hidden') && !e.target.closest('#btn-owner-wrap')) {
      om.classList.add('hidden');
    }
  });

  // علامة الديسكورد → رابط سيرفر NSR HUB
  $('#btn-discord-server').addEventListener('click', () => {
    playSound('click');
    NSR.openExternal(NSR_DISCORD_SERVER);
  });

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => { playSound('click'); goPage(b.dataset.page); });
  });

  // علامة قفل على الأزرار المقفلة
  const applyNavLocks = () => {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      const pg = b.dataset.page;
      const locked = featureLocked(pg);
      if (locked && !b.dataset.locked) {
        b.dataset.locked = '1';
        b.innerHTML = (FEATURE_LABELS[pg] && FEATURE_LABELS[pg].icon ? FEATURE_LABELS[pg].icon : '') + '<span class="nav-lock">' + ICONS.lock + '</span>' + '<span class="nav-txt">' + (FEATURE_LABELS[pg] ? FEATURE_LABELS[pg].name : b.textContent.trim()) + '</span>';
      } else if (!locked && b.dataset.locked) {
        delete b.dataset.locked;
        const icon = FEATURE_LABELS[pg] ? FEATURE_LABELS[pg].icon : '';
        b.innerHTML = icon + '<span class="nav-txt">' + (FEATURE_LABELS[pg] ? FEATURE_LABELS[pg].name : b.textContent.trim()) + '</span>';
      }
    });
  };
  applyNavLocks();
  window.__applyNavLocks = applyNavLocks;
}

function fillUserMenu() {
  if (!session) return;
  $('#um-avatar').src = session.user.avatarUrl || '';
  $('#um-name').textContent = session.user.username;
  $('#um-id').textContent = '#' + session.user.id;
  const count = (allGuilds && allGuilds.length ? allGuilds : adminGuilds).length;
  $('#um-count').textContent = String(count);
}

// ---------- تسجيل الدخول ----------
async function doLogin() {
  const err = $('#login-error');
  err.textContent = '';

  try {
    const res = await NSR.login();
    session = res.session;
    adminGuilds = res.adminGuilds;
    allGuilds = res.allGuilds || (session.guilds || []);
    toast('تم تسجيل الدخول بنجاح!');
    enterServers();
  } catch (e) {
    err.textContent = e.message;
  }
}

async function doLogout() {
  playSound('click');
  await NSR.logout();
  session = null; adminGuilds = []; allGuilds = []; botGuilds = []; known = false; botClientId = '';
  showScreen('screen-login');
  $('#login-error').textContent = '';
}

// ---------- شاشة السيرفرات ----------
async function enterServers() {
  showScreen('screen-servers');
  $('#user-avatar').src = session.user.avatarUrl || '';
  $('#user-name').textContent = session.user.username;

  const grid = $('#servers-grid');
  const ownerWrap = $('#btn-owner-wrap');
  const ownerMenu = $('#owner-menu');
  const searchInput = $('#servers-search');
  grid.innerHTML = '<div class="loading">جاري جلب السيرفرات...</div>';
  $('#servers-empty').classList.add('hidden');
  ownerWrap.classList.add('hidden');
  ownerMenu.classList.add('hidden');
  $('#servers-search-wrap').classList.add('hidden');
  searchInput.value = '';
  ownerMode = false;

  // انتظر اتصال الجسر أولاً حتى تظهر السيرفرات التي فيها البوت مباشرة (بدل قائمة OAuth)
  if (!settings.bridgeKey) {
    try {
      const cfg = await NSR.getSettings();
      settings = cfg;
    } catch (_) {}
  }
  if (settings.bridgeKey && !bridgeConnected) await waitBridgeReady(15000);

  await refreshBotGuilds();
  known = botGuilds.length > 0;
  await refreshCustomerStatus();

  const renderList = (search) => {
    grid.innerHTML = '';
    $('#servers-empty').classList.add('hidden');
    const q = (search || '').trim().toLowerCase();
    let listed;
    if (ownerMode && known) {
      // وضع "كل السيرفرات": فقط السيرفرات التي البوت موجود فيها
      listed = botGuilds.filter((g) => !q || String(g.name || '').toLowerCase().includes(q) || String(g.id || '').includes(q));
    } else {
      // السيرفرات المملوكة + الإدارية فقط: مصدر البوت هو الأساس، وOAuth يغطي الباقي
      const byId = new Map();
      // أضف سيرفرات البوت فقط إذا المستخدم عضو فيها أيضاً (موجودة في OAuth)
      const userGuildIds = new Set((allGuilds && allGuilds.length ? allGuilds : adminGuilds || []).map((g) => String(g.id)));
      for (const g of botGuilds) {
        if (userGuildIds.has(String(g.id))) {
          byId.set(String(g.id), { ...g, isAdminMine: g.isAdmin === true, isOwnerMine: false, inBot: true });
        }
      }
      for (const g of (allGuilds && allGuilds.length ? allGuilds : adminGuilds || [])) {
        const ex = byId.get(String(g.id));
        if (ex) {
          if (g.owner === true) ex.isOwnerMine = true;
        } else {
          // سيرفرات المستخدم التي البوت غير فيها — لا تظهر
        }
      }
      // فقط: سيرفرات يملكها المستخدم أو لديه فيها إدارة
      listed = [...byId.values()]
        .filter((g) => g.isOwnerMine === true || g.isAdminMine === true)
        .sort((a, b) => Number(b.isAdminMine) - Number(a.isAdminMine))
        .filter((g) => !q || String(g.name || '').toLowerCase().includes(q) || String(g.id || '').includes(q));
    }

    if (!listed.length) {
      grid.innerHTML = '';
      $('#servers-empty').classList.remove('hidden');
      return;
    }

    listed.forEach((g, i) => grid.appendChild(serverCard(g, i)));
    wireFx(grid);
  };

  if (isOwner && known) {
    ownerWrap.classList.remove('hidden');
  }

  renderList('');
}

// بطاقة سيرفر واحدة (تُستخدم في وضع العادي ووضع المالك "كل السيرفرات")
function serverCard(g, i) {
  const iconUrl = g.iconUrl || (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : '');
  const inBot = known && botGuilds.some((x) => String(x.id) === String(g.id));
  const isAdminHere = known
    ? (g.isAdminMine !== undefined ? g.isAdminMine : (botGuilds.some((x) => String(x.id) === String(g.id) && x.isAdmin === true)))
    : (adminGuilds || []).some((x) => String(x.id) === String(g.id));
  const badgeBot = known
    ? (inBot ? `<span class="badge ok">${ICONS.check} البوت موجود</span>` : `<span class="badge no">${ICONS.warn} البوت غير موجود</span>`)
    : `<span class="badge no">${ICONS.warn} البوت غير متصل</span>`;
  const badgeRole = ownerMode
    ? (isAdminHere ? `${ICONS.crown} أدمن` : `${ICONS.eye} عضو`)
    : (isAdminHere ? `${ICONS.crown} أدمن` : `${ICONS.eye} عضو`);
  const iconHtml = iconUrl ? `<img src="${iconUrl}" alt="" />` : `<span class="svg-icon">${ICONS.server}</span>`;
  const card = document.createElement('div');
  card.className = 'server-card';
  card.style.setProperty('--d', (i * 0.06) + 's');
  card.innerHTML = `
    <div class="icon">${iconHtml}</div>
    <h3>${esc(g.name)}</h3>
    <div class="meta">السيرفر: ${g.id}</div>
    <div class="badges">
      ${badgeBot}
      <span class="badge">${badgeRole}</span>
    </div>`;
  if (ownerMode && known) {
    const actions = document.createElement('div');
    actions.className = 'server-actions';
    actions.innerHTML = `
      <button class="btn primary" data-owner-enter="${g.id}" style="flex:1;">${inBot ? `${ICONS.gear} الدخول` : `${ICONS.plus} دعوة البوت`}</button>
      <button class="btn ghost" data-owner-invite="${g.id}">${ICONS.discord}</button>`;
    card.appendChild(actions);
    card.querySelector('[data-owner-enter]').addEventListener('click', (e) => {
      e.stopPropagation();
      const gg = botGuilds.find((x) => String(x.id) === String(g.id));
      if (gg) openGuild(gg);
      else {
        const cid = botClientId || settings.clientId || BOT_CLIENT_ID;
        NSR.openExternal(`https://discord.com/api/oauth2/authorize?client_id=${cid}&permissions=8&scope=bot%20applications.commands`);
      }
    });
    card.querySelector('[data-owner-invite]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      playSound('click');
      btn.textContent = '...';
      try {
        const rep = await NSR.bridgeCommand({ type: 'getGuildInvite', userId: session.user.id, guildId: g.id });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('تم إنشاء رابط الدعوة');
        NSR.openExternal(rep.data.invite);
      } catch (err) { toast(err.message, 'err'); }
      btn.innerHTML = ICONS.discord;
    });
  } else {
    card.addEventListener('click', () => {
      if (isAdminHere) openGuild(g);
      else toast('لا تملك صلاحية أدمن في هذا السيرفر — الدخول متاح فقط للسيرفرات الإدارية', 'err');
    });
  }
  requestAnimationFrame(() => card.classList.add('in'));
  return card;
}

// ---------- شاشة الاشتراكات (المالك) ----------
async function openSubscriptions() {
  playSound('click');
  showScreen('screen-subs');
  const main = $('#subs-main');
  main.innerHTML = '<div class="loading">جاري تحميل الاشتراكات...</div>';
  try {
    const rep = await NSR.bridgeCommand({ type: 'getSubscriptions', userId: session.user.id, guildId: '' });
    if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
    renderSubscriptions(main, rep.data);
  } catch (e) {
    main.innerHTML = '<div class="loading">' + esc(e.message) + '</div>';
  }
}

function renderSubscriptions(main, data) {
  const roles = data.roles || [];
  const featureRoles = data.featureRoles || {};
  const features = data.features || {};
  const userRoles = data.userRoles || [];

  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('plus')} إنشاء رتبة جديدة (داخل التطبيق)</h4>
        <p style="font-size:12px; color:var(--muted); line-height:1.9;">أنشئ رتبة داخل التطبيق ثم اربطها بأي زر/ميزة تريد. لا علاقة لها بالديسكورد.</p>
        <label>اسم الرتبة الجديدة</label>
        <input id="subs-new-role-name" type="text" placeholder="مثال: باقة VIP" />
        <button class="btn primary" id="subs-create-role" style="margin-top:10px;">${ic('plus')} إنشاء الرتبة</button>
      </div>
      <div class="card">
        <h4>${ic('users')} إعطاء/سحب رتبة لعضو</h4>
        <p style="font-size:12px; color:var(--muted); line-height:1.9; margin-bottom:10px;">اكتب <b style="color:var(--text)">معرف المستخدم (User ID)</b> واختر الرتبة — يظهر له الدور في التطبيق وتنفتح الأزرار المربوطة بالرتبة.</p>
        <label>معرف المستخدم (User ID)</label>
        <input id="subs-user-id" type="text" placeholder="مثال: 123456789012345678" />
        <label>الرتبة</label>
        <select id="subs-member-role">
          ${roles.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
        </select>
        <button class="btn primary" id="subs-member-give" style="margin-top:10px;">${ic('plus')} إعطاء الرتبة</button>
        <button class="btn ghost" id="subs-member-remove" style="margin-top:8px;">${ic('close')} سحب الرتبة</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h4>${ic('settings')} ربط الميزات بالرتب</h4>
      <p style="font-size:12px; color:var(--muted); line-height:1.9; margin-bottom:10px;">
        لكل زر في اللوحة حدد الرتب المسموح لها بفتحه. إذا لم تختر أي رتبة → الزر مفتوح للجميع.
      </p>
      <div class="subs-features" id="subs-features">
        ${Object.keys(features).map((f) => `
          <div class="subs-feature-row" data-feature="${f}">
            <div class="subs-feature-info">
              <span class="ic">${features[f].icon}</span>
              <b>${esc(features[f].name)}</b>
            </div>
            <div class="subs-feature-roles">
              ${roles.map((r) => {
                const on = r.features && r.features.includes(f);
                return `<label class="subs-role-check ${on ? 'on' : ''}" data-role="${r.id}">
                  <input type="checkbox" ${on ? 'checked' : ''} /> ${esc(r.name)}
                </label>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>
      <button class="btn primary" id="subs-features-save" style="margin-top:14px;">${ic('check')} حفظ ربط الميزات</button>
    </div>
    <div class="card" style="margin-top:16px;">
      <h4>${ic('list')} الرتب الموجودة</h4>
      <div id="subs-roles-list">
        ${roles.length ? roles.map((r) => `
          <div class="subs-member-item" style="display:flex; align-items:center; gap:10px; justify-content:space-between;" data-rid="${r.id}">
            <b>${esc(r.name)}</b>
            <div style="display:flex; gap:6px; align-items:center;">
              <small style="color:var(--muted);">${(r.features || []).length} ميزة</small>
              <button class="btn ghost sm" data-rename="${r.id}">${ic('palette')} إعادة تسمية</button>
              <button class="btn ghost sm danger" data-del-role="${r.id}">${ic('close')} حذف</button>
            </div>
          </div>`).join('') : '<p style="color:var(--muted); font-size:12.5px;">لا توجد رتب بعد — أنشئ أول رتبة من الأعلى.</p>'}
      </div>
    </div>`;
  wireFx(main);

  // إنشاء رتبة
  main.querySelector('#subs-create-role').addEventListener('click', async () => {
    const name = main.querySelector('#subs-new-role-name').value.trim();
    if (!name) { toast('اكتب اسم الرتبة أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'createRole', userId: session.user.id, guildId: '', name });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      toast('تم إنشاء رتبة: ' + rep.data.name);
      openSubscriptions();
    } catch (e) { toast('' + e.message, 'err'); }
  });

  // تفعيل/تعطيل رتبة في ميزة
  main.querySelectorAll('.subs-role-check').forEach((c) => c.addEventListener('click', () => {
    c.classList.toggle('on');
    const input = c.querySelector('input');
    input.checked = !input.checked;
  }));

  // حفظ الميزات
  main.querySelector('#subs-features-save').addEventListener('click', async () => {
    const rows = main.querySelectorAll('.subs-feature-row');
    try {
      for (const row of rows) {
        const f = row.dataset.feature;
        const sel = Array.from(row.querySelectorAll('input:checked')).map((i) => i.closest('.subs-role-check').dataset.role);
        const rep = await NSR.bridgeCommand({ type: 'setFeatureRoles', userId: session.user.id, guildId: '', feature: f, roles: sel });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      }
      toast('تم حفظ ربط الميزات بالرتب');
      await refreshCustomerStatus();
    } catch (e) { toast('' + e.message, 'err'); }
  });

  // إعطاء/سحب رتبة عبر User ID
  const doAssign = async (remove) => {
    const targetId = main.querySelector('#subs-user-id').value.trim();
    const roleId = main.querySelector('#subs-member-role').value;
    if (!targetId) { toast('اكتب معرف المستخدم (User ID) أولاً', 'err'); return; }
    if (!/^\d{10,20}$/.test(targetId)) { toast('معرف المستخدم غير صالح — يجب أن يكون أرقاماً فقط', 'err'); return; }
    if (!roleId) { toast('اختر رتبة', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'assignRoleToUser', userId: session.user.id, guildId: '', targetId, roleId, remove });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      toast('' + (remove ? 'تم سحب' : 'تم إعطاء') + ' الرتبة للمستخدم ' + targetId);
    } catch (e) { toast('' + e.message, 'err'); }
  };
  main.querySelector('#subs-member-give').addEventListener('click', () => doAssign(false));
  main.querySelector('#subs-member-remove').addEventListener('click', () => doAssign(true));

  // إعادة تسمية / حذف رتبة
  main.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', async () => {
    const roleId = b.dataset.rename;
    const newName = prompt('الاسم الجديد للرتبة:');
    if (!newName || !newName.trim()) return;
    try {
      const rep = await NSR.bridgeCommand({ type: 'renameRole', userId: session.user.id, guildId: '', roleId, name: newName.trim() });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      toast('تمت إعادة تسمية الرتبة');
      openSubscriptions();
    } catch (e) { toast('' + e.message, 'err'); }
  }));
  main.querySelectorAll('[data-del-role]').forEach((b) => b.addEventListener('click', async () => {
    const roleId = b.dataset.delRole;
    if (!confirm('متأكد من حذف هذه الرتبة؟ سيُسحب من كل من يملكها.')) return;
    try {
      const rep = await NSR.bridgeCommand({ type: 'deleteRole', userId: session.user.id, guildId: '', roleId });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      toast('تم حذف الرتبة');
      openSubscriptions();
    } catch (e) { toast('' + e.message, 'err'); }
  }));
}

// ---------- فتح اللوحة ----------
async function openGuild(g) {
  playSound('click');
  currentGuild = g;
  showScreen('screen-dashboard');
  $('#guild-icon').src = g.iconUrl || (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : '');
  $('#guild-name').textContent = g.name;

  goPage('home');
  $('#dash-main').innerHTML = '<div class="loading">جاري تحميل إعدادات السيرفر...</div>';
  try {
    const rep = await NSR.bridgeCommand({ type: 'state', userId: session.user.id, guildId: g.id });
    if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'لا استجابة');
    state = rep.data;
    renderPage(currentPage);
    toast('تم تحميل إعدادات السيرفر');
  } catch (e) {
    state = null;
    const missing = /البوت ليس في هذا السيرفر/.test(e.message || '');
    if (missing) {
      $('#dash-main').innerHTML = `
        <div class="loading">
          <p style="margin-bottom:16px;">البوت لا يوجد في هذا السيرفر — قم بدعوته أولاً لتتمكن من إدارة اللوحة</p>
          <button id="btn-invite-bot" class="btn primary invite-btn"><img id="inv-logo" src="${APP_LOGO_URL}" alt="" /> دعوة البوت</button>
        </div>`;
      $('#btn-invite-bot').addEventListener('click', () => {
        playSound('click');
        const cid = botClientId || settings.clientId || BOT_CLIENT_ID;
        NSR.openExternal(`https://discord.com/api/oauth2/authorize?client_id=${cid}&permissions=8&scope=bot%20applications.commands`);
      });
    } else {
      toast('' + e.message, 'err');
      $('#dash-main').innerHTML = '<div class="loading">تعذر الاتصال بالبوت — تأكد أن البوت شغال وأن مفتاح الجسر صحيح</div>';
    }
  }
}

function goPage(page) {
  if (pageDirty) {
    setPendingNav(() => { document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === page)); currentPage = page; pageDirty = false; renderPage(page); });
    if (!guardNav()) return;
  }
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  currentPage = page;
  pageDirty = false;
  renderPage(page);
}

function featureLocked(page) {
  if (isOwner) return false;
  if (!featureAccess || !Object.prototype.hasOwnProperty.call(featureAccess, page)) return false;
  return featureAccess[page] === false;
}

function renderPage(page) {
  const main = $('#dash-main');
  if (!state) return;
  if (featureLocked(page)) {
    // ميزة مقفلة برتبة — أظهر شاشة الشراء
    renderLockedFeature(page, main);
    return;
  }
  main.innerHTML = '';
  if (page === 'home') renderHome(main);
  else if (page === 'welcome') renderWelcome(main);
  else if (page === 'tickets') renderTickets(main);
  else if (page === 'suggestions') renderSuggestions(main);
  else if (page === 'send') renderSend(main);
  else if (page === 'auth') renderAuth(main);
  else if (page === 'brand') renderBrand(main);
  else if (page === 'logs') renderLogs(main);
  else if (page === 'security') renderSecurity(main);
  else if (page === 'ratings') renderRatings(main);
  else if (page === 'ai') renderAi(main);
  else if (page === 'messages') renderMessages(main);
  wireFx(main);
}

const FEATURE_LABELS = {
  home: { icon: ICONS.home, name: 'الرئيسية' },
  welcome: { icon: ICONS.users, name: 'الترحيب' },
  tickets: { icon: ICONS.ticket, name: 'التذاكر' },
  suggestions: { icon: ICONS.bulb, name: 'الاقتراحات' },
  ai: { icon: ICONS.brain, name: 'معالج AI' },
  ratings: { icon: ICONS.cart, name: 'المتجر' },
  logs: { icon: ICONS.list, name: 'اللوقات' },
  security: { icon: ICONS.shield, name: 'الأمان' },
  messages: { icon: ICONS.chat, name: 'الرسائل' },
  send: { icon: ICONS.send, name: 'إرسال اللوحات' },
  auth: { icon: ICONS.lock, name: 'الصلاحيات' },
  brand: { icon: ICONS.palette, name: 'المظهر' },
};

function featureIconHTML(name) {
  return '<span class="ic">' + (ICONS[name] || '') + '</span>';
}
function ic(name) { return '<span class="ic">' + (ICONS[name] || '') + '</span>'; }

function renderLockedFeature(page, main) {
  const f = FEATURE_LABELS[page] || { icon: ICONS.lock, name: page };
  main.innerHTML = `
    <div class="card" style="max-width:560px; margin:40px auto; text-align:center; padding:34px;">
      <div class="locked-ico">${ICONS.lock}</div>
      <h4>${f.icon} ${esc(f.name)} — ميزة مقفلة</h4>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.9; margin-top:10px;">
        هذه الميزة مخصصة لحاملي رتبة معينة في سيرفر <b style="color:var(--text)">NSR HUB</b>.<br/>
        اشترك في الباقة المناسبة ليتم فتحها لك تلقائياً.
      </p>
      <button class="btn primary big" id="locked-buy-btn" style="margin-top:20px;">${ICONS.cart} الشراء / الاشتراك من NSR HUB</button>
      <button class="btn ghost" id="locked-back" style="margin-top:10px;">${ICONS.home} العودة للرئيسية</button>
    </div>`;
  main.querySelector('#locked-buy-btn').addEventListener('click', () => {
    playSound('click');
    NSR.openExternal(NSR_DISCORD_SERVER);
  });
  main.querySelector('#locked-back').addEventListener('click', () => {
    playSound('click');
    goPage('home');
  });
}

// ---------- مكوّن المعاينة الحية (تشبه ديسكورد) ----------
function previewEmbedHTML(opts) {
  const c = colorToHex(Number(opts.color) || 5793266);
  const logo = opts.logoUrl || APP_LOGO_URL;
  const img = opts.imageUrl
    ? `<img class="d-prev-img" src="${esc(opts.imageUrl)}" alt="" onerror="this.style.display='none'" />` : '';
  const select = opts.select
    ? `<div class="d-prev-sel">${opts.select}<span class="arr">▾</span></div>` : '';
  return `
    <div class="d-prev" style="border-left-color:${c}">
      <div class="d-prev-author"><img src="${esc(logo)}" alt="" /><b>NSR HUB</b><span class="tag">لوحة التحكم</span></div>
      ${opts.title ? `<div class="d-prev-title">${esc(opts.title)}</div>` : ''}
      <div class="d-prev-desc">${opts.desc || ''}</div>
      ${select}
      ${img}
      <div class="d-prev-footer"><img src="${esc(logo)}" alt="" />${esc(opts.footer || 'NSR HUB - MoDy Dev')} · اليوم</div>
    </div>`;
}

function previewDesc(text, vars) {
  let s = esc(text == null ? '' : text);
  s = s.replace(/\{user\}/g, '<span class="m-mention">@' + esc((vars && vars.user) || 'Naeem') + '</span>');
  s = s.replace(/\{server\}/g, '<span class="m-mention">#' + esc((vars && vars.server) || 'Server') + '</span>');
  s = s.replace(/\{count\}/g, String((vars && vars.count) || '1,234'));
  return s.replace(/\n/g, '\n');
}

async function refreshState() {
  try {
    const rep = await NSR.bridgeCommand({ type: 'state', userId: session.user.id, guildId: currentGuild.id });
    if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'لا استجابة');
    state = rep.data;
    renderPage(currentPage);
    toast('تم تحديث الإعدادات');
  } catch (e) { toast('' + e.message, 'err'); }
}

// ---------- الرئيسية ----------
async function renderHome(main) {
  const w = state.welcome || {};
  const types = (state.ticket.ticketTypes || []).filter((t) => t.enabled !== false);
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('home')} السيرفر</h4>
        <p style="font-size:13.5px; color:var(--muted); margin-bottom:10px;">
          <b style="color:var(--text)">${esc(state.guild.name)}</b><br/>
          المعرّف: ${state.guild.id}<br/>
          يوجد ${types.length} نوع تذاكر مفعّل
        </p>
        <div class="badges">
          <span class="badge ok">${ic('users')} ترحيب ${w.channelId ? 'مفعّل' : 'غير مضبوط'}</span>
          <span class="badge ok">${ic('ticket')} التذاكر جاهزة</span>
        </div>
      </div>
      <div class="card">
        <h4>${ic('settings')} اختصارات سريعة</h4>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn ghost" data-quick="tickets">${ic('ticket')} التذاكر</button>
          <button class="btn ghost" data-quick="welcome">${ic('users')} الترحيب</button>
          <button class="btn ghost" data-quick="suggestions">${ic('bulb')} الاقتراحات</button>
          <button class="btn ghost" data-quick="send">${ic('send')} الإرسال</button>
          <button class="btn ghost" data-quick="ratings">${ic('cart')} المتجر</button>
        </div>
        <p style="color:var(--muted); font-size:12px; margin-top:14px;">الجسر: <b id="home-bridge"></b></p>
      </div>
    </div>
    <div class="stats-grid" id="stats-grid">
      <div class="stat-box">${ic('ticket')}<b id="st-tickets">…</b><small>التذاكر المفتوحة</small></div>
      <div class="stat-box">${ic('check')}<b id="st-tickets-closed">…</b><small>التذاكر المغلقة</small></div>
      <div class="stat-box">${ic('users')}<b id="st-joins">…</b><small>الدخول اليوم</small></div>
      <div class="stat-box">${ic('chat')}<b id="st-msgs">…</b><small>الرسائل اليوم</small></div>
      <div class="stat-box">${ic('shield')}<b id="st-bans">…</b><small>المتبندين</small></div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h4>${ic('shield')} قائمة المتبندين <span style="font-size:11px;color:var(--muted);font-weight:400;">(السبب + من متبند)</span></h4>
      <div id="bans-list" class="bans-list"><p style="color:var(--muted); font-size:12.5px;">جاري التحميل…</p></div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-act="refresh"><span class="big-emoji">${ic('settings')}</span> تحديث الإعدادات</button>
      <button class="act-btn" data-act="stats"><span class="big-emoji">${ic('list')}</span> تحديث الإحصائيات</button>
      <button class="act-btn" data-act="servers"><span class="big-emoji">${ic('server')}</span> تحديث قائمة السيرفرات</button>
    </div>`;
  const bridgeState = $('.bridge-status .dot').className.includes('on');
  $('#home-bridge').textContent = bridgeState ? 'متصل' : 'غير متصل';
  main.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => goPage(b.dataset.quick)));
  main.querySelector('[data-act="refresh"]').addEventListener('click', refreshState);
  main.querySelector('[data-act="stats"]').addEventListener('click', () => loadHomeStats(main));
  main.querySelector('[data-act="servers"]').addEventListener('click', async () => {
    playSound('click'); enterServers();
  });
  loadHomeStats(main);
}

async function loadHomeStats(main) {
  const set = (id, v) => { const el = main.querySelector('#' + id); if (el) el.textContent = String(v); };
  try {
    const rep = await NSR.bridgeCommand({ type: 'stats', userId: session.user.id, guildId: currentGuild.id });
    if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'لا استجابة');
    const d = rep.data;
    set('st-tickets', d.tickets.open);
    set('st-tickets-closed', d.tickets.closed);
    set('st-joins', d.joins.today);
    set('st-msgs', d.messages.today);
    set('st-bans', d.bansTotal);
    const listEl = main.querySelector('#bans-list');
    if (!d.bans.length) {
      listEl.innerHTML = '<p style="color:var(--muted); font-size:12.5px;">لا يوجد متبندون في السيرفر</p>';
    } else {
      listEl.innerHTML = d.bans.map((b) => `
        <div class="ban-row">
          <span class="ban-tag">${esc(b.username)}</span>
          <span class="ban-info">السبب: <b>${esc(b.reason)}</b></span>
          <span class="ban-info">من متبند: <b>${esc(b.bannedBy)}</b></span>
        </div>`).join('');
    }
  } catch (e) {
    set('st-tickets', '—'); set('st-tickets-closed', '—'); set('st-joins', '—'); set('st-msgs', '—'); set('st-bans', '—');
    const listEl = main.querySelector('#bans-list');
    if (listEl) listEl.innerHTML = '<p style="color:var(--red); font-size:12.5px;">تعذر تحميل الإحصائيات: ' + esc(e.message) + '</p>';
  }
}

// ---------- الترحيب ----------
function renderWelcome(main) {
  const w = state.welcome || {};
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('users')} رسالة الترحيب</h4>
        <label>الرسالة — {user} منشن العضو، {server} اسم السيرفر، {count} رقم العضو</label>
        <textarea id="welcome-msg">${esc(w.message || '')}</textarea>
        <label>روم الاستقبال</label>
        <select id="welcome-room">
          <option value="">— بدون (اختر من لوحة ديسكورد) —</option>
          ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(w.channelId) === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
        </select>
        <label>صورة (رابط)</label>
        <input id="welcome-img" type="text" value="${esc(w.imageUrl || '')}" placeholder="https://...png" />
      </div>
      <div class="card">
        <h4>${ic('gear')} خيارات الاستقبال</h4>
        <div class="toggle-row"><span>${ic('send')} إرسال على الخاص (DM) بدل الروم</span>
          <label class="switch"><input type="checkbox" id="w-mode" ${w.mode === 'dm' ? 'checked' : ''}/><span class="slider"></span></label></div>
        <div class="toggle-row"><span>${ic('palette')} مع الصورة</span>
          <label class="switch"><input type="checkbox" id="w-img" ${w.withImage !== false ? 'checked' : ''}/><span class="slider"></span></label></div>
        <div class="toggle-row"><span>${ic('list')} إظهار رقم العضو ({count})</span>
          <label class="switch"><input type="checkbox" id="w-count" ${w.showCount !== false ? 'checked' : ''}/><span class="slider"></span></label></div>
      </div>
    </div>
    <div class="preview-card">
      <h4>${ic('eye')} معاينة رسالة الترحيب (كما تصل في ديسكورد)</h4>
      <div id="welcome-preview"></div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="welcome"><span class="big-emoji">${ic('check')}</span> حفظ إعدادات الترحيب</button>
    </div>`;

  const updatePreview = () => {
    const msg = main.querySelector('#welcome-msg').value;
    const withImg = main.querySelector('#w-img').checked;
    const withCount = main.querySelector('#w-count').checked;
    const imgUrl = main.querySelector('#welcome-img').value.trim();
    const q = state.guild.name;
    main.querySelector('#welcome-preview').innerHTML = previewEmbedHTML({
      title: 'أهلاً بك',
      desc: previewDesc(msg, { user: 'Naeem', server: q, count: withCount ? '1,234' : '' }),
      imageUrl: (withImg && imgUrl) ? imgUrl : '',
      logoUrl: state.logoUrl,
    });
  };
  ['#welcome-msg', '#welcome-img'].forEach((sel) => main.querySelector(sel).addEventListener('input', updatePreview));
  ['#w-img', '#w-count'].forEach((sel) => main.querySelector(sel).addEventListener('change', updatePreview));
  updatePreview();

  main.querySelector('[data-save="welcome"]').addEventListener('click', async () => {
    const msg = main.querySelector('#welcome-msg').value.trim();
    if (!msg) { toast('اكتب رسالة الترحيب أولاً', 'err'); return; }
    const w2 = {
      message: msg,
      channelId: main.querySelector('#welcome-room').value || '',
      imageUrl: main.querySelector('#welcome-img').value.trim(),
      mode: main.querySelector('#w-mode').checked ? 'dm' : 'room',
      withImage: main.querySelector('#w-img').checked,
      showCount: main.querySelector('#w-count').checked,
    };
    try {
      const rep = await NSR.bridgeCommand({ type: 'setWelcome', userId: session.user.id, guildId: currentGuild.id, welcome: w2 });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الحفظ');
      state.welcome = rep.data.welcome;
      toast('تم حفظ إعدادات الترحيب');
    } catch (e) { toast('' + e.message, 'err'); }
  });
}

// ---------- التذاكر ----------
function renderTickets(main) {
  const t = state.ticket || {};
  const panel = t.panel || {};
  const types = t.ticketTypes || [];
  const typeList = types.map((tp) => `
    <div class="type-row">
      <span class="emoji">${esc(tp.emoji || '')}</span>
      <div class="info"><b>${esc(tp.label)}</b>${tp.id.startsWith('c') ? ' <small>(مخصص)</small>' : ' <small>(أساسي)</small>'}<small>${esc(tp.description || '')}</small></div>
      <label class="switch" title="${tp.enabled === false ? 'إظهار' : 'إخفاء'}"><input type="checkbox" data-type-id="${tp.id}" ${tp.enabled !== false ? 'checked' : ''}/><span class="slider"></span></label>
      ${tp.id.startsWith('c') ? `<button class="del-btn" data-del-id="${tp.id}">${ic('close')} حذف</button>` : ''}
    </div>`).join('') || '<p style="color:var(--muted)">لا توجد أنواع.</p>';
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('ticket')} لوحة التذاكر</h4>
        <label>العنوان</label>
        <input id="tk-title" type="text" value="${esc(panel.title || '')}" />
        <label>الوصف</label>
        <textarea id="tk-desc">${esc(panel.description || '')}</textarea>
      </div>
      <div class="card">
        <h4>${ic('list')} أنواع التذاكر — فعّل/أطفئ أو أضف مخصصاً</h4>
        <div>${typeList}</div>
        <div style="display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:14px;">
          <input id="tk-new-label" type="text" placeholder="اسم النوع الجديد" />
          <button class="btn ghost" id="tk-add">${ic('plus')} إضافة</button>
        </div>
      </div>
    </div>
    <div class="preview-card">
      <h4>${ic('eye')} معاينة لوحة التذاكر (كما تصل في ديسكورد)</h4>
      <div id="tickets-preview"></div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="ticket"><span class="big-emoji">${ic('check')}</span> حفظ اللوحة</button>
      <button class="act-btn" data-send="ticket"><span class="big-emoji">${ic('send')}</span> إرسال اللوحة لروم</button>
    </div>`;

  const updateTicketPreview = () => {
    const title = main.querySelector('#tk-title').value.trim() || 'Support Tickets';
    const desc = main.querySelector('#tk-desc').value.trim();
    const enabled = (state.ticket.ticketTypes || []).filter((tp) => tp.enabled !== false);
    const selOpt = enabled[0] ? `${enabled[0].emoji || ''} ${esc(enabled[0].label)}` : 'لا توجد أنواع مفعلة';
    let d = previewDesc(desc).replace(/\n\n/g, '\n');
    main.querySelector('#tickets-preview').innerHTML = previewEmbedHTML({
      color: 0x0099FF,
      title,
      desc: d,
      footer: 'NSR HUB - MoDy Dev',
      logoUrl: state.logoUrl,
      select: selOpt,
    });
  };
  ['#tk-title', '#tk-desc'].forEach((sel) => main.querySelector(sel).addEventListener('input', updateTicketPreview));
  updateTicketPreview();
  main.querySelectorAll('[data-type-id]').forEach((sw) => {
    sw.addEventListener('change', async () => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'setTicketTypeEnabled', userId: session.user.id, guildId: currentGuild.id, typeId: sw.dataset.typeId, enabled: sw.checked });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast(sw.checked ? 'النوع ظاهر الآن' : 'النوع مخفي الآن');
      } catch (e) { sw.checked = !sw.checked; toast('' + e.message, 'err'); }
    });
  });
  main.querySelectorAll('[data-del-id]').forEach((b) => {
    b.addEventListener('click', async () => {
      playSound('click');
      try {
        const rep = await NSR.bridgeCommand({ type: 'delTicketType', userId: session.user.id, guildId: currentGuild.id, typeId: b.dataset.delId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('تم حذف النوع المخصص');
        refreshState();
      } catch (e) { toast('' + e.message, 'err'); }
    });
  });
  main.querySelector('#tk-add').addEventListener('click', async () => {
    const label = main.querySelector('#tk-new-label').value.trim();
    if (!label) { toast('اكتب اسم النوع', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'addTicketType', userId: session.user.id, guildId: currentGuild.id, label });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      main.querySelector('#tk-new-label').value = '';
      toast('تمت إضافة النوع');
      refreshState();
    } catch (e) { toast('' + e.message, 'err'); }
  });
  main.querySelector('[data-save="ticket"]').addEventListener('click', async () => {
    const p = {
      title: main.querySelector('#tk-title').value.trim() || 'Support Tickets',
      description: main.querySelector('#tk-desc').value.trim(),
    };
    try {
      const rep = await NSR.bridgeCommand({ type: 'setTicketPanel', userId: session.user.id, guildId: currentGuild.id, panel: p });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.ticket.panel = rep.data.panel;
      toast('تم حفظ اللوحة');
    } catch (e) { toast('' + e.message, 'err'); }
  });
  main.querySelector('[data-send="ticket"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendTicketPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
        toast('تم إرسال لوحة التذاكر');
      } catch (e) { toast('' + e.message, 'err'); }
    });
  });
}

// ---------- الاقتراحات ----------
function renderSuggestions(main) {
  const s = state.suggestions || {};
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('bulb')} روم الاقتراحات</h4>
        <label>الروم الذي تصل فيه الاقتراحات للأدمن</label>
        <select id="sugg-ch">
          <option value="">— اختر الروم —</option>
          ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(s.channelId) === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <h4>${ic('list')} ملاحظة</h4>
        <p style="font-size:13px; color:var(--muted); line-height:1.9;">
          زر <b>${ic('plus')} تقديم اقتراح</b> يعمل تلقائياً على لوحة الاقتراحات.<br/>
          بعد الحفظ اضغط <b>إرسال اللوحة</b> لتنزيلها في أي روم.
        </p>
      </div>
    </div>
    <div class="preview-card">
      <h4>${ic('eye')} معاينة لوحة الاقتراحات (كما تصل في ديسكورد)</h4>
      <div id="sugg-preview"></div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="sugg"><span class="big-emoji">${ic('check')}</span> حفظ الروم</button>
      <button class="act-btn" data-send="sugg"><span class="big-emoji">${ic('send')}</span> إرسال لوحة الاقتراحات</button>
    </div>`;
  $('#sugg-preview').innerHTML = previewEmbedHTML({
    color: state.color || 5793266,
    title: 'Suggestion Box | صندوق الاقتراحات',
    desc: '**English**\nHave an idea or feedback? Hit the button and share it!\n\n**العربية**\nهل لديك فكرة أو ملاحظات؟ اضغط على الزر وشاركها!',
    logoUrl: state.logoUrl,
    footer: 'NSR HUB - MoDy Dev',
    select: 'Submit a Suggestion | قدّم اقتراحاً',
  });
  main.querySelector('[data-save="sugg"]').addEventListener('click', async () => {
    const channelId = main.querySelector('#sugg-ch').value;
    if (!channelId) { toast('اختر الروم أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'setSuggestionsChannel', userId: session.user.id, guildId: currentGuild.id, channelId });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.suggestions.channelId = channelId;
      toast('تم حفظ روم الاقتراحات');
    } catch (e) { toast(e.message, 'err'); }
  });
  main.querySelector('[data-send="sugg"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendSuggestionsPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
        toast('تم إرسال لوحة الاقتراحات');
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}

// ---------- إرسال اللوحات ----------
function renderSend(main) {
  main.innerHTML = `
    <div class="grid-actions">
      <button class="act-btn" data-send="st"><span class="big-emoji">${ic('ticket')}</span> إرسال لوحة التذاكر</button>
      <button class="act-btn" data-send="ss"><span class="big-emoji">${ic('bulb')}</span> إرسال لوحة الاقتراحات</button>
      <button class="act-btn" data-act="refresh"><span class="big-emoji">${ic('settings')}</span> تحديث الإعدادات</button>
    </div>
    <p style="color:var(--muted); margin-top:22px; font-size:13px;">اختر الروم ثم سيُرسل فوراً — اللوحة تبقى متزامنة مع لوحة تحكم ديسكورد.</p>`; 
  main.querySelector('[data-send="st"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendTicketPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('تم الإرسال!');
      } catch (e) { toast('' + e.message, 'err'); }
    });
  });
  main.querySelector('[data-send="ss"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendSuggestionsPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('تم الإرسال!');
      } catch (e) { toast('' + e.message, 'err'); }
    });
  });
  main.querySelector('[data-act="refresh"]').addEventListener('click', refreshState);
}

// ---------- منتقي الروم ----------
function openChannelPicker(cb) {
  const main = $('#dash-main');
  main.innerHTML = `
    <div class="card" style="max-width:520px; margin:0 auto;">
      <h4>${ic('send')} اختر الروم للإرسال</h4>
      <select id="picker-ch">
        <option value="">— اختر الروم —</option>
        ${(state.channels || []).map((c) => `<option value="${c.id}"># ${esc(c.name)}</option>`).join('')}
      </select>
      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn primary" id="picker-go" style="flex:1;">${ic('send')} إرسال</button>
        <button class="btn ghost" id="picker-back">${ic('back')} رجوع</button>
      </div>
    </div>`;
  main.querySelector('#picker-go').addEventListener('click', () => {
    const ch = main.querySelector('#picker-ch').value;
    if (!ch) { toast('اختر الروم أولاً', 'err'); return; }
    cb(ch);
    goPage(currentPage === 'tickets' ? 'tickets' : currentPage);
  });
  main.querySelector('#picker-back').addEventListener('click', () => goPage(currentPage));
  wireFx(main);
}

// ---------- منتقي الرتب (اختيار من قائمة بدل إظهار كل الرتب) ----------
function rolePickerHTML(uid, selectedIds, accent) {
  const sel = new Set(selectedIds.map(String));
  return `
    <div class="role-picker" data-rp="${uid}">
      <div class="rp-selected" data-rp-selected>
        ${sel.size ? '' : '<span class="rp-empty">لم تُختر رتب بعد</span>'}
      </div>
      <button type="button" class="rp-toggle" data-rp-toggle>+ إضافة رتبة</button>
      <div class="rp-dropdown hidden" data-rp-drop>
        <input type="text" class="rp-search" data-rp-search placeholder="ابحث عن رتبة..." />
        <div class="rp-list" data-rp-list></div>
      </div>
    </div>`;
}

function setupRolePicker(root, uid, opts) {
  const wrap = root.querySelector(`[data-rp="${uid}"]`);
  if (!wrap) return;
  const allRoles = (state.roles || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  const accent = opts.accent || 'var(--green)';
  const selected = new Set((opts.selected || []).map(String));
  const listEl = wrap.querySelector('[data-rp-list]');
  const selEl = wrap.querySelector('[data-rp-selected]');
  const drop = wrap.querySelector('[data-rp-drop]');
  const search = wrap.querySelector('[data-rp-search]');
  const toggle = wrap.querySelector('[data-rp-toggle]');

  const renderSelected = () => {
    const items = allRoles.filter((r) => selected.has(String(r.id)));
    selEl.innerHTML = items.map((r) => `
      <span class="member-chip rp-chip" style="border-color:${accent}; color:${accent};">
        ${esc(r.name)} <b data-rp-remove="${r.id}" style="cursor:pointer; margin-inline-start:6px;">${ic('close')}</b>
      </span>`).join('') || '<span class="rp-empty">لم تُختر رتب بعد</span>';
    selEl.querySelectorAll('[data-rp-remove]').forEach((x) => x.addEventListener('click', () => {
      playSound('click');
      selected.delete(String(x.dataset.rpRemove));
      renderSelected(); renderList('');
    }));
  };

  const renderList = (q) => {
    const ql = (q || '').trim().toLowerCase();
    const filtered = allRoles.filter((r) => !ql || String(r.name).toLowerCase().includes(ql));
    if (!filtered.length) { listEl.innerHTML = '<div class="rp-none">لا توجد رتب مطابقة</div>'; return; }
    listEl.innerHTML = filtered.slice(0, 60).map((r) => `
      <div class="rp-item" data-rp-pick="${r.id}" style="${selected.has(String(r.id)) ? 'border-color:' + accent + ';' : ''}">
        <span>${esc(r.name)}</span>
        <span class="rp-tick">${selected.has(String(r.id)) ? ic('check') : ''}</span>
      </div>`).join('');
    listEl.querySelectorAll('[data-rp-pick]').forEach((it) => it.addEventListener('click', () => {
      playSound('click');
      const id = String(it.dataset.rpPick);
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      renderSelected(); renderList(search.value);
    }));
  };

  toggle.addEventListener('click', () => {
    playSound('click');
    const show = drop.classList.toggle('hidden');
    if (!show) { renderList(''); search.focus(); }
  });
  search.addEventListener('input', () => renderList(search.value));
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) drop.classList.add('hidden');
  });
  renderSelected();
  return () => Array.from(selected);
}

// ---------- الصلاحيات ----------
function renderAuth(main) {
  const staffIds = (state.staffRoles || []).map(String);
  const ar = state.autoRoles || {};
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('users')} رتب الإدارة</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">اختر الرتب المراد منحها صلاحية لوحة التحكم.</p>
        ${rolePickerHTML('staff', staffIds, 'var(--green)')}
        <button class="btn ghost" id="save-staff" style="margin-top:14px;">${ic('check')} حفظ رتب الإدارة</button>
      </div>
      <div class="card">
        <h4>${ic('gear')} الرولات التلقائية</h4>
        <label>رتبة العضو الجديد</label>
        <select id="ar-member">
          <option value="">— بدون —</option>
          ${(state.roles || []).map((r) => `<option value="${r.id}" ${String(ar.memberRoleId) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select>
        <label>رتبة البوت الجديد</label>
        <select id="ar-bot">
          <option value="">— بدون —</option>
          ${(state.roles || []).map((r) => `<option value="${r.id}" ${String(ar.botRoleId) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select>
        <button class="btn ghost" id="save-aro" style="margin-top:14px;">${ic('check')} حفظ الرولات التلقائية</button>
      </div>
    </div>`;
  const getPicked = setupRolePicker(main, 'staff', { selected: staffIds, accent: 'var(--green)' });
  main.querySelector('#save-staff').addEventListener('click', async () => {
    const ids = getPicked();
    try {
      const rep = await NSR.bridgeCommand({ type: 'setStaffRoles', userId: session.user.id, guildId: currentGuild.id, roleIds: ids });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.staffRoles = rep.data.staffRoles;
      toast('تم حفظ رتب الإدارة');
    } catch (e) { toast(e.message, 'err'); }
  });
  main.querySelector('#save-aro').addEventListener('click', async () => {
    const ar2 = {
      memberRoleId: main.querySelector('#ar-member').value || null,
      botRoleId: main.querySelector('#ar-bot').value || null,
    };
    try {
      const rep = await NSR.bridgeCommand({ type: 'setAutoRoles', userId: session.user.id, guildId: currentGuild.id, autoRoles: ar2 });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.autoRoles = rep.data.autoRoles;
      toast('تم حفظ الرولات التلقائية');
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- المظهر ----------
function renderBrand(main) {
  const logoUrl = state.logoUrl || '';
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('palette')} لون الإمبد</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">اللون المستخدم في رسائل البوت ولوحات التذاكر</p>
        <input type="color" id="brand-color" value="${colorToHex(state.color || 5793266)}" style="width:100%; height:46px; border:none; border-radius:10px; background:transparent; cursor:pointer;" />
        <button class="btn ghost" id="save-color" style="margin-top:14px;">${ic('check')} حفظ اللون</button>
      </div>
      <div class="card">
        <h4>${ic('image')} شعار البوت</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">اللوقو الذي يظهر في الزاوية العلوية لكل الإمبدات</p>
        ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" style="width:72px; height:72px; border-radius:16px; margin-bottom:12px; border:1px solid var(--border);" />` : '<p style="color:var(--muted)">لا يوجد شعار محفوظ — البوت يولّده تلقائياً من أول رفع</p>'}
        <label>تغيير الشعار (رابط صورة)</label>
        <input id="brand-logo-url" type="text" placeholder="https://...png" />
        <button class="btn ghost" id="save-logo" style="margin-top:10px;">${ic('check')} حفظ الشعار الجديد</button>
        <p style="font-size:11.5px; color:var(--muted); margin-top:8px;">${ic('warn')} الصورة تُرفع إلى ديسكورد CDN وتُعرض لكل الإمبدات فوراً (PNG/JPG).</p>
      </div>
    </div>
    <div class="preview-card">
      <h4>${ic('eye')} معاينة الإمبد (اللون والشعار كما يظهران في ديسكورد)</h4>
      <div id="brand-preview"></div>
    </div>
    <p style="color:var(--muted); font-size:12px; margin-top:14px;">${ic('bulb')} شعار البوت يُدار أيضاً من لوحة ديسكورد (زر تغيير الشعار في صفحة النظام).</p>`;
  const renderBrandPreview = () => {
    const color = main.querySelector('#brand-color').value.replace('#', '');
    main.querySelector('#brand-preview').innerHTML = previewEmbedHTML({
      color: parseInt(color, 16),
      title: 'مثال على رسالة البوت',
      desc: 'هكذا تظهر رسائل البوت: باللون المختار ومع الشعار الحالي.\n\nيمكنك التعديل من باقي الصفحات وإرسال اللوحات.',
      logoUrl: logoUrl,
      footer: 'NSR HUB - MoDy Dev',
    });
  };
  renderBrandPreview();
  main.querySelector('#brand-color').addEventListener('input', renderBrandPreview);
  main.querySelector('#save-color').addEventListener('click', async () => {
    const hex = main.querySelector('#brand-color').value.replace('#', '');
    const color = parseInt(hex, 16);
    try {
      const rep = await NSR.bridgeCommand({ type: 'setColor', userId: session.user.id, guildId: currentGuild.id, color });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.color = rep.data.color;
      toast('تم حفظ اللون');
    } catch (e) { toast('' + e.message, 'err'); }
  });
  main.querySelector('#save-logo').addEventListener('click', async () => {
    const url = main.querySelector('#brand-logo-url').value.trim();
    if (!url) { toast('اكتب رابط الصورة أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'setLogo', userId: session.user.id, guildId: currentGuild.id, logoUrl: url });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.logoUrl = rep.data.logoUrl;
      main.querySelector('#brand-logo-url').value = '';
      toast('تم حفظ الشعار الجديد');
      refreshState();
    } catch (e) { toast('' + e.message, 'err'); }
  });
}

function colorToHex(num) {
  const n = Number(num) || 0;
  return '#' + ((n >> 16) & 255).toString(16).padStart(2, '0') + ((n >> 8) & 255).toString(16).padStart(2, '0') + (n & 255).toString(16).padStart(2, '0');
}

// ---------- اللوقات ----------
const LOG_EVENTS = [
  { id: 'memberJoin', emoji: '✅', name: 'دخول عضو' },
  { id: 'memberLeave', emoji: '❌', name: 'خروج عضو' },
  { id: 'deleteMessage', emoji: '🗑️', name: 'حذف رسالة' },
  { id: 'editMessage', emoji: '✏️', name: 'تعديل رسالة' },
  { id: 'reactionAdd', emoji: '👍', name: 'إضافة رد فعل' },
  { id: 'reactionRemove', emoji: '👎', name: 'حذف رد فعل' },
  { id: 'mediaMessage', emoji: '📎', name: 'رسالة مرفق' },
  { id: 'voiceJoin', emoji: '🔊', name: 'دخول روم صوتي' },
  { id: 'voiceLeave', emoji: '🔇', name: 'خروج روم صوتي' },
  { id: 'voiceMove', emoji: '🔄', name: 'تنقل صوتي' },
  { id: 'voiceStateChange', emoji: '🎙️', name: 'مايك/دفن' },
  { id: 'timeoutAdd', emoji: '⏳', name: 'تطبيق تايم أوت' },
  { id: 'timeoutRemove', emoji: '✅', name: 'انتهاء تايم أوت' },
  { id: 'roleAdd', emoji: '🎁', name: 'إعطاء رتبة' },
  { id: 'roleRemove', emoji: '🚫', name: 'سحب رتبة' },
  { id: 'roleCreate', emoji: '➕', name: 'إنشاء رتبة' },
  { id: 'roleDelete', emoji: '➖', name: 'حذف رتبة' },
  { id: 'roleUpdate', emoji: '🛠️', name: 'تعديل رتبة' },
  { id: 'channelCreate', emoji: '➕', name: 'إنشاء روم' },
  { id: 'channelDelete', emoji: '🧹', name: 'حذف روم' },
  { id: 'channelUpdate', emoji: '🛠️', name: 'تعديل روم' },
  { id: 'banAdd', emoji: '⛔', name: 'باند عضو' },
  { id: 'banRemove', emoji: '✅', name: 'إلغاء باند' },
  { id: 'kickAdd', emoji: '👢', name: 'طرد عضو' },
  { id: 'protectedRoleViolation', emoji: '🛡️', name: 'انتهاك رتبة محمية' },
];

function renderLogs(main) {
  const lc = state.logChannels || {};
  const rows = LOG_EVENTS.map((ev) => `
    <div class="log-row">
      <b style="flex:1; font-size:13px;">${ev.name}</b>
      <select data-log="${ev.id}">
        <option value="">— بدون —</option>
        ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(lc[ev.id]) === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
      </select>
    </div>`).join('');
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('list')} رومات اللوقات — كل حدث برومه</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">سيُرصد كل حدث ويرسل للروم الذي تختاره. اتركه «بدون» لإيقاف رصده.</p>
        <div>${rows}</div>
      </div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="logs"><span class="big-emoji">${ic('check')}</span> حفظ رومات اللوقات</button>
    </div>`;
  main.querySelector('[data-save="logs"]').addEventListener('click', async () => {
    const events = {};
    main.querySelectorAll('[data-log]').forEach((sel) => { events[sel.dataset.log] = sel.value || ''; });
    try {
      const rep = await NSR.bridgeCommand({ type: 'setLogChannels', userId: session.user.id, guildId: currentGuild.id, events });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.logChannels = rep.data.logChannels;
      toast('تم حفظ رومات اللوقات');
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- الأمان ----------
function renderSecurity(main) {
  const pr = state.protection || {};
  const protectedIds = (pr.protectedRoles || []).map(String);
  const bypassIds = (pr.bypassRoles || []).map(String);
  const cfg = pr.config || {};
  const pick = (ids) => (ids.length ? ids.map((id) => { const r = (state.roles || []).find((x) => String(x.id) === String(id)); return r ? esc(r.name) : id; }).join(', ') : '—');
  const roleOpts = (sel) => (state.roles || []).map((r) => `<option value="${r.id}" ${String(sel) === String(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`).join('') || '<option value="">لا رتب</option>';
  const secCard = (id, icon, title, desc, body, enabled, onToggle) => `
    <div class="sec-card card" data-sec="${id}">
      <div class="sec-head">
        <div><b>${icon} ${title}</b><br/><span class="sec-desc">${desc}</span></div>
        <label class="switch"><input type="checkbox" data-sw="${id}" ${enabled ? 'checked' : ''}/><span class="slider"></span></label>
      </div>
      <div class="sec-body" ${enabled ? '' : 'style="opacity:.45; pointer-events:none;"'}>
        ${body}
      </div>
    </div>`;
  const numInp = (id, label, val, min, max) => `
    <div class="sec-field"><label>${label}</label><input id="${id}" type="number" min="${min}" max="${max}" value="${val}" /></div>`;
  const selInp = (id, label, val, opts) => `
    <div class="sec-field"><label>${label}</label><select id="${id}">${opts}</select></div>`;

  const cd = cfg.channelDelete || {};
  const nk = cfg.nuke || {};
  const bn = cfg.ban || {};
  const kk = cfg.kick || {};
  const rd = cfg.roleDelete || {};
  const wh = cfg.webhook || {};
  const bt = cfg.bot || {};
  const am = cfg.automod || {};
  const sw = cfg.swearWords || {};

  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('shield')} الرتب المحمية</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">من يعطي/يحذف/يعدل هذه الرتب يُعاقب تلقائياً.</p>
        ${rolePickerHTML('prot', protectedIds, 'var(--red)')}
        <p style="font-size:12px; color:var(--muted); margin-top:10px;">الحالي: <b style="color:var(--red)">${pick(protectedIds)}</b></p>
      </div>
      <div class="card">
        <h4>${ic('users')} رتب التجاوز (مستثناة من الحماية)</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">أصحاب هذه الرتب لا تطالهم الحماية التلقائية.</p>
        ${rolePickerHTML('bypass', bypassIds, 'var(--green)')}
        <p style="font-size:12px; color:var(--muted); margin-top:10px;">الحالي: <b style="color:var(--green)">${pick(bypassIds)}</b></p>
        <label style="margin-top:12px; display:block;">العقوبة الافتراضية للمخالف</label>
        <select id="sec-action">
          <option value="kick" ${pr.action !== 'ban' ? 'selected' : ''}>طرد (Kick)</option>
          <option value="ban" ${pr.action === 'ban' ? 'selected' : ''}>باند (Ban)</option>
        </select>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h4>${ic('shield')} حمايات السيرفر (التفعيل والإعدادات)</h4>
      <p style="font-size:12px; color:var(--muted); margin-bottom:8px;">فعّل الحماية التي تريدها واضبط الحدود — "الحد" = عدد العمليات المسموحة قبل العقوبة، "خلال" = الإطار الزمني بالثواني.</p>
      ${secCard('cd', ic('close'), 'حماية حذف الرومات', 'يمنع حذف عدة رومات دفعة واحدة (هجوم).', `
        ${numInp('cd-thr', 'الحد (رومات)', cd.threshold ?? 3, 1, 20)}
        ${numInp('cd-win', 'خلال (ثانية)', cd.window ?? 10, 5, 120)}
        ${selInp('cd-action', 'العقوبة', cd.action || 'kick', `<option value="kick" ${cd.action !== 'ban' ? 'selected' : ''}>طرد</option><option value="ban" ${cd.action === 'ban' ? 'selected' : ''}>باند</option>`)}
        ${selInp('cd-role', 'رتبة إلزامية للحذف (اختياري)', cd.requiredRole || '', '<option value="">بدون رتبة إلزامية</option>' + roleOpts(cd.requiredRole))}
      `, cd.enabled !== false, true)}
      ${secCard('nk', ic('warn'), 'حماية التدمير الشامل (Nuke)', 'أي عمليات حذف/إنشاء كثيرة خلال ثوانٍ = هجوم تدمير.', `
        ${numInp('nk-thr', 'الحد (عمليات)', nk.threshold ?? 8, 3, 50)}
        ${numInp('nk-win', 'خلال (ثانية)', nk.window ?? 20, 5, 120)}
        ${selInp('nk-action', 'العقوبة', nk.action || 'kick', `<option value="kick" ${nk.action !== 'ban' ? 'selected' : ''}>طرد</option><option value="ban" ${nk.action === 'ban' ? 'selected' : ''}>باند</option>`)}
      `, nk.enabled !== false, true)}
      ${secCard('bn', ic('shield'), 'حماية الباند الجماعي', 'يمنع باند أعضاء كثر دفعة واحدة.', `
        ${numInp('bn-thr', 'الحد (باند)', bn.threshold ?? 3, 1, 20)}
        ${numInp('bn-win', 'خلال (ثانية)', bn.window ?? 10, 5, 120)}
        ${selInp('bn-action', 'العقوبة', bn.action || 'kick', `<option value="kick" ${bn.action !== 'ban' ? 'selected' : ''}>طرد</option><option value="ban" ${bn.action === 'ban' ? 'selected' : ''}>باند</option>`)}
      `, bn.enabled !== false, true)}
      ${secCard('kk', ic('send'), 'حماية الطرد الجماعي', 'يمنع طرد أعضاء كثر دفعة واحدة.', `
        ${numInp('kk-thr', 'الحد (طرد)', kk.threshold ?? 3, 1, 20)}
        ${numInp('kk-win', 'خلال (ثانية)', kk.window ?? 10, 5, 120)}
        ${selInp('kk-action', 'العقوبة', kk.action || 'kick', `<option value="kick" ${kk.action !== 'ban' ? 'selected' : ''}>طرد</option><option value="ban" ${kk.action === 'ban' ? 'selected' : ''}>باند</option>`)}
      `, kk.enabled !== false, true)}
      ${secCard('rd', ic('warn'), 'حماية حذف الرتب', 'يمنع حذف رتب كثر دفعة واحدة.', `
        ${numInp('rd-thr', 'الحد (رتب)', rd.threshold ?? 3, 1, 20)}
        ${numInp('rd-win', 'خلال (ثانية)', rd.window ?? 10, 5, 120)}
        ${selInp('rd-action', 'العقوبة', rd.action || 'kick', `<option value="kick" ${rd.action !== 'ban' ? 'selected' : ''}>طرد</option><option value="ban" ${rd.action === 'ban' ? 'selected' : ''}>باند</option>`)}
      `, rd.enabled !== false, true)}
      ${secCard('wh', ic('link'), 'حماية الويبهوك', 'يمنع إنشاء ويبهوك خبيث.', `
        ${selInp('wh-action', 'العقوبة', wh.action || 'kick', `<option value="kick" ${wh.action !== 'ban' ? 'selected' : ''}>طرد</option><option value="ban" ${wh.action === 'ban' ? 'selected' : ''}>باند</option>`)}
      `, wh.enabled !== false, true)}
      ${secCard('bt', ic('brain'), 'حماية البوتات', 'يرفض دخول البوتات غير المصرح بها ويطردها.', ``, bt.enabled !== false, true)}
    </div>

    <div class="card" style="margin-top:16px;">
      <h4>${ic('chat')} حماية الرسائل (Automod)</h4>
      <p style="font-size:12px; color:var(--muted); margin-bottom:8px;">تُفحص الرسائل تلقائياً وتحذف المخالفة — تحمي السيرفر والبوت من الحظر.</p>
      ${secCard('am', ic('link'), 'حماية الروابط', 'يحذف الرسائل التي تحتوي روابط (ماعدا الإدارة).', ``, am.enabled !== false && am.links !== false, true)}
      ${secCard('amspam', ic('chat'), 'حماية السبام', 'يكتم من يرسل رسائل كثيرة بسرعة.', ``, am.enabled !== false && am.spam !== false, true)}
      ${secCard('amev', ic('users'), 'حماية @everyone / @here', 'يحذف رسائل الإشارة الجماعية غير المصرح بها.', ``, am.enabled !== false && am.everyone !== false, true)}
      ${secCard('sw', ic('warn'), 'حماية السب (كلمات بذيئة)', 'يحذف أي رسالة فيها سب/قدف — حتى من الإدارة — لحماية البوت من الحظر، ويُبلَّغ المالك.', ``, sw.enabled !== false, true)}
    </div>

    <div class="grid-actions">
      <button class="act-btn" data-save="sec"><span class="big-emoji">${ic('check')}</span> حفظ إعدادات الحماية</button>
    </div>`;
  const getProt = setupRolePicker(main, 'prot', { selected: protectedIds, accent: 'var(--red)' });
  const getBypass = setupRolePicker(main, 'bypass', { selected: bypassIds, accent: 'var(--green)' });
  // تبديل إظهار/إخفاء جسم البطاقة
  main.querySelectorAll('.sec-card').forEach((card) => {
    const sw = card.querySelector('[data-sw]');
    if (!sw) return;
    sw.addEventListener('change', () => {
      playSound('click');
      card.querySelector('.sec-body').style.opacity = sw.checked ? '1' : '.45';
      card.querySelector('.sec-body').style.pointerEvents = sw.checked ? '' : 'none';
    });
  });
  main.querySelector('[data-save="sec"]').addEventListener('click', async () => {
    const protectedRoles = getProt();
    const bypassRoles = getBypass();
    const action = main.querySelector('#sec-action').value;
    const num = (id, dflt) => { const v = parseInt(main.querySelector(id)?.value, 10); return isNaN(v) ? dflt : Math.max(1, v); };
    const act = (id, dflt) => main.querySelector(id)?.value || dflt;
    const config = {
      channelDelete: {
        enabled: main.querySelector('[data-sw="cd"]')?.checked ?? true,
        threshold: num('#cd-thr', 3), window: num('#cd-win', 10),
        action: act('#cd-action', 'kick'), requiredRole: main.querySelector('#cd-role')?.value || '',
      },
      nuke: {
        enabled: main.querySelector('[data-sw="nk"]')?.checked ?? true,
        threshold: num('#nk-thr', 8), window: num('#nk-win', 20), action: act('#nk-action', 'kick'),
      },
      ban: {
        enabled: main.querySelector('[data-sw="bn"]')?.checked ?? true,
        threshold: num('#bn-thr', 3), window: num('#bn-win', 10), action: act('#bn-action', 'kick'),
      },
      kick: {
        enabled: main.querySelector('[data-sw="kk"]')?.checked ?? true,
        threshold: num('#kk-thr', 3), window: num('#kk-win', 10), action: act('#kk-action', 'kick'),
      },
      roleDelete: {
        enabled: main.querySelector('[data-sw="rd"]')?.checked ?? true,
        threshold: num('#rd-thr', 3), window: num('#rd-win', 10), action: act('#rd-action', 'kick'),
      },
      webhook: { enabled: main.querySelector('[data-sw="wh"]')?.checked ?? true, action: act('#wh-action', 'kick') },
      bot: { enabled: main.querySelector('[data-sw="bt"]')?.checked ?? true, action: 'kick' },
      automod: {
        enabled: main.querySelector('[data-sw="am"]')?.checked || main.querySelector('[data-sw="amspam"]')?.checked || main.querySelector('[data-sw="amev"]')?.checked || false,
        links: main.querySelector('[data-sw="am"]')?.checked ?? false,
        spam: main.querySelector('[data-sw="amspam"]')?.checked ?? false,
        everyone: main.querySelector('[data-sw="amev"]')?.checked ?? false,
      },
      swearWords: { enabled: main.querySelector('[data-sw="sw"]')?.checked ?? true },
    };
    try {
      const rep = await NSR.bridgeCommand({ type: 'setProtection', userId: session.user.id, guildId: currentGuild.id, protectedRoles, bypassRoles, action, config });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.protection = rep.data;
      toast('تم حفظ إعدادات الحماية');
    } catch (e) { toast('' + e.message, 'err'); }
  });
}

// ---------- معالج AI ----------
function renderAi(main) {
  const ai = state.ai || {};

  const mode = ai.mode === 'inquiry' ? 'inquiry' : 'solve';
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('brain')} معالج AI</h4>
        <div class="toggle-row" style="margin-bottom:6px;">
          <span>${ic('settings')} تفعيل المعالج</span>
          <label class="switch"><input type="checkbox" id="ai-enabled" ${ai.enabled ? 'checked' : ''}/><span class="slider"></span></label>
        </div>
        <p style="font-size:12px; color:var(--muted);">يعمل فقط في الروم الذي تختاره أدناه.</p>
        <label>اختر الروم الذي يرد فيه البوت</label>
        <select id="ai-channel">
          <option value="">— اختر الروم —</option>
          ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(ai.channelId) === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
        </select>
        <label>نمط الرد</label>
        <select id="ai-mode">
          <option value="solve" ${mode === 'solve' ? 'selected' : ''}>${ic('gear')} حل مشاكل — يرد على المشاكل فقط</option>
          <option value="inquiry" ${mode === 'inquiry' ? 'selected' : ''}>${ic('chat')} استفسارات — يجيب على الأسئلة العامة</option>
        </select>
        <label>شدة التعامل مع السب</label>
        <select id="ai-severity">
          <option value="delete" ${(ai.severity || 'delete') === 'delete' ? 'selected' : ''}>${ic('close')} حذف فقط</option>
          <option value="warn" ${ai.severity === 'warn' ? 'selected' : ''}>${ic('warn')} حذف + تحذير خاص</option>
          <option value="mute" ${ai.severity === 'mute' ? 'selected' : ''}>${ic('lock')} حذف + كتم دقيقة</option>
        </select>
      </div>
      <div class="card">
        <h4>${ic('plus')} جرب الرد الذكي</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">اكتب مشكلة أو سؤالاً وشاهد كيف سيرد البوت.</p>
        <textarea id="ai-test" placeholder="مثال: وين ألقى معرض السيارات في فايف ام؟"></textarea>
        <button class="btn primary" id="ai-test-btn" style="margin-top:10px; width:100%;">${ic('brain')} اختبر الرد</button>
        <div id="ai-test-result" class="ai-test-result" style="margin-top:12px;"></div>
      </div>
    </div>
    ${isOwner ? `
    <div class="card" style="margin-top:16px;">
      <h4>${ic('crown')} الرتب المسموح لها بالتحدث الى ai</h4>
      <p style="font-size:12px; color:var(--muted); line-height:1.9; margin-bottom:10px;">
        حدد رتب <b style="color:var(--text)">التطبيق</b> التي يُسمح لحامليها بالتحدث مع معالج AI —<br/>
        أي شخص يملك رتبة مسموحة يفتح له زر المعالج AI تلقائياً.<br/>
        <span id="ai-cust-role-status">جاري تحميل الرتب...</span>
      </p>
      <div class="grid2" style="gap:10px; align-items:end;">
        <div>
          <label>الرتب المسموح لها بالتحدث الى ai</label>
          <select id="ai-cust-role" multiple></select>
        </div>
        <button class="btn primary" id="ai-cust-role-btn">${ic('check')} حفظ الرتب المسموحة</button>
      </div>
    </div>` : ''}
    <div class="card" style="margin-top:16px;">
      <h4>${ic('shield')} الفلترة الذكية (كشف التحايل + التعلم)</h4>
      <p style="font-size:12.5px; color:var(--muted); line-height:1.9;">
        ${ic('check')} يكشف الكلمات المحظورة حتى لو كُتبت ملتوية: <code>f-u-c-k</code>، <code>fuuuck</code>، <code>f0ck</code>، <code>ك-س</code>.<br/>
        ${ic('brain')} المودرز يضعون تفاعل ممنوع على أي رسالة مخالفة فاتت الفلتر → يتعلم البوت كلماتها تلقائياً.<br/>
        ${ic('chat')} يرد فقط على الرسائل التي فيها مشكلة أو سؤال واضح — ما يسولف ولا يرد على الإعلانات.
      </p>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="ai"><span class="big-emoji">${ic('check')}</span> حفظ إعدادات معالج AI</button>
    </div>`;
  main.querySelector('#ai-test-btn').addEventListener('click', async () => {
    const text = main.querySelector('#ai-test').value.trim();
    const resEl = main.querySelector('#ai-test-result');
    if (!text) { toast('اكتب سؤالاً أو مشكلة أولاً', 'err'); return; }
    resEl.innerHTML = '<span style="color:var(--muted);">جاري التفكير...</span>';
    try {
      const rep = await NSR.bridgeCommand({ type: 'testAi', userId: session.user.id, guildId: currentGuild.id, text });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      resEl.innerHTML = `<b style="color:var(--green);">${rep.data.matched ? `${ic('check')} سيُرد على هذه الرسالة` : '— لن يرد (كلام عادي)'}</b><br/><span style="font-size:13px; line-height:1.8;">${esc(rep.data.reply)}</span>`;
    } catch (e) {
      resEl.innerHTML = '<span style="color:var(--red);">' + esc(e.message) + '</span>';
    }
  });
  main.querySelector('[data-save="ai"]').addEventListener('click', async () => {
    const payload = {
      enabled: main.querySelector('#ai-enabled').checked,
      channelId: main.querySelector('#ai-channel').value,
      mode: main.querySelector('#ai-mode').value,
      severity: main.querySelector('#ai-severity').value,
    };
    try {
      const rep = await NSR.bridgeCommand({ type: 'setAiConfig', userId: session.user.id, guildId: currentGuild.id, ...payload });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.ai = rep.data.ai;
      toast('تم حفظ إعدادات معالج AI');
    } catch (e) { toast('' + e.message, 'err'); }
  });

  if (isOwner) {
    const custSel = main.querySelector('#ai-cust-role');
    const custStatus = main.querySelector('#ai-cust-role-status');
    const custBtn = main.querySelector('#ai-cust-role-btn');
    (async () => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'getSubscriptions', userId: session.user.id, guildId: '' });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        const roles = rep.data.roles || [];
        const allowed = (rep.data.featureRoles && rep.data.featureRoles.ai) || [];
        custStatus.textContent = `عدد رتب التطبيق: ${roles.length}`;
        custSel.innerHTML = roles.map((r) =>
          `<option value="${r.id}" ${allowed.includes(String(r.id)) ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
        custSel.disabled = false;
        custBtn.disabled = false;
      } catch (e) {
        custStatus.textContent = 'فشل تحميل الرتب: ' + e.message;
      }
    })();
    custBtn.addEventListener('click', async () => {
      try {
        const sel = Array.from(custSel.selectedOptions).map((o) => o.value);
        const rep = await NSR.bridgeCommand({ type: 'setFeatureRoles', userId: session.user.id, guildId: '', feature: 'ai', roles: sel });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('تم حفظ الرتب المسموح لها بالتحدث الى AI');
      } catch (e) { toast('' + e.message, 'err'); }
    });
  }
}

// نافذة الشراء (ميزة مقفلة)
function openPurchaseModal(feature) {
  const main = $('#dash-main');
  main.innerHTML = `
    <div class="card" style="max-width:520px; margin:0 auto; text-align:center; padding:28px;">
      ${feature ? `<div class="locked-ico">${feature.icon}</div>` : '<img src="logo.png" alt="" style="width:76px; height:76px; border-radius:18px; margin-bottom:8px;" />'}
      <h4>${ic('lock')} ${feature ? esc(feature.name) : 'معالج AI — ميزة مدفوعة'}</h4>
      <p style="color:var(--muted); font-size:13px; line-height:1.9; margin-top:8px;">
        ${feature ? esc(feature.desc) : 'باقة كوستمر تفتح لك معالج AI كاملاً: الرد الذكي على المشاكل والاستفسارات والفلترة الذكية.'}<br/>
        <b style="color:var(--text);">اشترك من سيرفر NSR HUB الرسمي للشراء والتفعيل.</b>
      </p>
      <button class="btn primary big" id="buy-now-btn" style="margin-top:18px; width:100%;">${ic('cart')} الشراء من سيرفر NSR HUB</button>
      <button class="btn ghost" id="buy-back" style="margin-top:8px; width:100%;">${ic('back')} رجوع</button>
    </div>`;
  main.querySelector('#buy-now-btn').addEventListener('click', () => {
    playSound('click');
    NSR.openExternal(NSR_DISCORD_SERVER);
    toast('تم فتح سيرفر NSR HUB');
  });
  main.querySelector('#buy-back').addEventListener('click', () => { playSound('click'); renderAi(main); });
  wireFx(main);
}

// ---------- المنتجات والتقييمات ----------
function renderRatings(main) {
  const rt = state.rating || {};
  const products = rt.products || [];
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('cart')} المنتجات</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">المستخدم يقيّم المنتج بعد الشراء عبر سلوك /rate.</p>
        <div>${products.length
          ? products.map((p) => `<div class="prod-row"><span class="ic">${ic('cart')}</span><div style="flex:1;"><b>${esc(p.name)}</b><br/><span>${esc(p.id)}</span></div><button class="del-btn" data-del="${p.id}">${ic('close')} حذف</button></div>`).join('')
          : '<p style="color:var(--muted)">لا توجد منتجات بعد.</p>'}</div>
        <div style="display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:14px;">
          <input id="prod-name" type="text" placeholder="اسم المنتج الجديد" />
          <button class="btn ghost" id="prod-add">${ic('plus')} إضافة</button>
        </div>
      </div>
      <div class="card">
        <h4>${ic('list')} روم التقييمات</h4>
        <label>الروم الذي تُنشر فيه التقييمات بعد استلامها</label>
        <select id="rating-ch">
          <option value="">— اختر الروم —</option>
          ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(rt.reviewsChannelId || '') === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
        </select>
        <label>إرسال تقييم لعميل (مثل /rate)</label>
        <div class="send-rate-row">
          <input id="rate-member-search" type="text" placeholder="ابحث عن العميل..." />
          <select id="rate-member" style="margin-top:8px;">
            <option value="">— اختر العميل —</option>
            ${(state.members || []).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
          </select>
          <select id="rate-product" style="margin-top:8px;">
            <option value="">— اختر المنتج —</option>
            ${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex; gap:10px; margin-top:14px;">
          <button class="btn ghost" id="save-rating" style="flex:1;">${ic('check')} حفظ الروم</button>
          <button class="btn primary" id="send-rating" style="flex:1;">${ic('send')} إرسال التقييم</button>
        </div>
        <p id="send-rate-msg" style="font-size:11.5px; color:var(--muted); margin-top:8px;"></p>
      </div>
    </div>`;
  main.querySelector('#prod-add').addEventListener('click', async () => {
    const name = main.querySelector('#prod-name').value.trim();
    if (!name) { toast('اكتب اسم المنتج', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'addProduct', userId: session.user.id, guildId: currentGuild.id, name });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      main.querySelector('#prod-name').value = '';
      toast('تمت إضافة المنتج');
      refreshState();
    } catch (e) { toast(e.message, 'err'); }
  });
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    playSound('click');
    try {
      const rep = await NSR.bridgeCommand({ type: 'delProduct', userId: session.user.id, guildId: currentGuild.id, productId: b.dataset.del });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      toast('تم حذف المنتج');
      refreshState();
    } catch (e) { toast(e.message, 'err'); }
  }));
  main.querySelector('#save-rating').addEventListener('click', async () => {
    const channelId = main.querySelector('#rating-ch').value;
    if (!channelId) { toast('اختر الروم أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'setRatingChannel', userId: session.user.id, guildId: currentGuild.id, channelId });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.rating.reviewsChannelId = channelId;
      toast('تم حفظ روم التقييمات');
    } catch (e) { toast(e.message, 'err'); }
  });

  // بحث فوري عن العملاء (أصحاب المتجر)
  const searchInput = main.querySelector('#rate-member-search');
  const memberSel = main.querySelector('#rate-member');
  let searchTimer = null;
  const searchMembers = async (q) => {
    try {
      const rep = await NSR.bridgeCommand({ type: 'searchMembers', userId: session.user.id, guildId: currentGuild.id, query: q });
      if (!rep || !rep.ok) return;
      const cur = memberSel.value;
      memberSel.innerHTML = '<option value="">— اختر العميل —</option>' +
        rep.data.members.map((m) => `<option value="${m.id}">${esc(m.name)}${m.nick ? ' (' + esc(m.nick) + ')' : ''}</option>`).join('');
      if (cur) memberSel.value = cur;
    } catch (_) {}
  };
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchMembers(searchInput.value.trim()), 300);
  });
  main.querySelector('#send-rating').addEventListener('click', async () => {
    const targetId = memberSel.value;
    const productId = main.querySelector('#rate-product').value;
    const msgEl = main.querySelector('#send-rate-msg');
    if (!targetId) { toast('اختر العميل أولاً', 'err'); return; }
    if (!productId) { toast('اختر المنتج أولاً', 'err'); return; }
    msgEl.textContent = 'جاري الإرسال…';
    try {
      const rep = await NSR.bridgeCommand({ type: 'sendRating', userId: session.user.id, guildId: currentGuild.id, targetId, productId });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
      msgEl.textContent = 'تم إرسال رسالة التقييم إلى العميل على الخاص';
      toast('تم إرسال التقييم');
    } catch (e) {
      msgEl.textContent = e.message;
      toast(e.message, 'err');
    }
  });
}

// ---------- الرسائل ----------
function renderMessages(main) {
  let msgType = 'send';
  let themeColor = state.embedColor ? '#' + Number(state.embedColor).toString(16).padStart(6, '0') : '#5865F2';
  const renderTextArea = () => {
    const t = MSG_TYPES[msgType];
    const editable = t.canEditText !== false;
    const textarea = main.querySelector('#msg-text');
    const label = textarea ? textarea.previousElementSibling : null;
    const note = main.querySelector('#msg-text-note');
    if (editable) {
      textarea.style.display = '';
      if (label && label.tagName === 'LABEL') label.style.display = '';
      textarea.disabled = false;
      textarea.placeholder = 'اكتب نص الرسالة هنا...';
      if (note) note.style.display = 'none';
    } else {
      textarea.style.display = 'none';
      if (label && label.tagName === 'LABEL') label.style.display = 'none';
      textarea.disabled = true;
      if (note) note.style.display = 'block';
    }
  };
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>${ic('chat')} إرسال رسالة خاصة</h4>
        <div class="msg-type-tabs">
          ${Object.entries(MSG_TYPES).map(([id, t]) => `<button class="msg-type-tab${id === msgType ? ' active' : ''}" data-type="${id}"><span class="ic">${t.emoji}</span> ${t.name}</button>`).join('')}
        </div>
        <label>معرف العضو (User ID)</label>
        <input id="msg-user" type="text" placeholder="كليك يمين على العضو ← نسخ معرف المستخدم" />
        <label>النص</label>
        <textarea id="msg-text" placeholder="اكتب نص الرسالة هنا..."></textarea>
        <p id="msg-text-note" style="font-size:12px; color:var(--muted); display:none;">هذا النوع من الرسائل ثابت النص — لا يمكنك كتابة محتوى مخصص. النص المخصص متاح فقط لنوع "رسالة".</p>
        <button class="btn primary" id="msg-send" style="margin-top:14px; width:100%;">${ic('send')} إرسال</button>
      </div>
      <div class="card">
        <h4>${ic('eye')} معاينة رسالة الخاص (كما تصله في ديسكورد)</h4>
        <div id="msg-preview"></div>
        <p style="font-size:12px; color:var(--muted); margin-top:10px;">هدوء دقيقة واحدة بين رسالتين لنفس الشخص.</p>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h4>${ic('palette')} إرسال ثيم لروم</h4>
      <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">أرسل رسالة مُنسّقة (ثيم) إلى أي روم في السيرفر مباشرةً.</p>
      <div class="grid2">
        <div>
          <label>اختر الروم</label>
          <select id="theme-channel">
            <option value="">— اختر الروم —</option>
            ${(state.channels || []).map((c) => `<option value="${c.id}"># ${esc(c.name)}</option>`).join('')}
          </select>
          <label>عنوان الثيم</label>
          <input id="theme-title" type="text" placeholder="مثال: حدث جديد" />
          <label>اللون</label>
          <input id="theme-color" type="color" value="${themeColor}" style="width:100%; height:38px; padding:2px; cursor:pointer;" />
        </div>
        <div>
          <label>نص الثيم</label>
          <textarea id="theme-text" placeholder="اكتب محتوى الثيم هنا..." style="min-height:72px;"></textarea>
          <label>صورة الثيم (رابط — اختياري)</label>
          <input id="theme-img" type="text" placeholder="https://...png" />
          <div class="toggle-row" style="margin-top:8px;">
            <span>${ic('send')} إرسال كرسالة نصية بدل الإمبد</span>
            <label class="switch"><input type="checkbox" id="theme-asmsg"/><span class="slider"></span></label>
          </div>
          <button class="btn primary" id="theme-send" style="margin-top:14px; width:100%;">${ic('send')} إرسال الثيم للروم</button>
        </div>
      </div>
      <div class="theme-preview-wrap" style="margin-top:16px;">
        <h4 style="font-size:12.5px; color:var(--muted); margin-bottom:10px; display:flex; align-items:center; gap:8px;">${ic('eye')} معاينة الثيم (كما تصل في ديسكورد)</h4>
        <div id="theme-preview"></div>
      </div>
    </div>`;
  const renderThemePreview = () => {
    const c = colorToHex(Number.parseInt(main.querySelector('#theme-color').value.replace('#', ''), 16) || 5793266);
    const logo = state.logoUrl || APP_LOGO_URL;
    const title = main.querySelector('#theme-title').value.trim();
    const text = main.querySelector('#theme-text').value.trim();
    const img = main.querySelector('#theme-img').value.trim();
    const asMsg = main.querySelector('#theme-asmsg').checked;
    const tdesc = text.replace(/\n/g, '\n');
    if (asMsg) {
      main.querySelector('#theme-preview').innerHTML = `
        <div class="theme-msg">
          <img class="theme-msg-avatar" src="${esc(logo)}" alt="" />
          <div class="theme-msg-body">
            <div class="theme-msg-head"><b>NSR HUB</b><span class="tag">لوحة التحكم</span><small>اليوم</small></div>
            <div class="theme-msg-text">${esc(tdesc) || 'اكتب نص الثيم هنا...'}</div>
          </div>
        </div>`;
      return;
    }
    main.querySelector('#theme-preview').innerHTML = `
      <div class="theme-msg">
        <img class="theme-msg-avatar" src="${esc(logo)}" alt="" />
        <div class="theme-msg-body">
          <div class="theme-msg-head"><b>NSR HUB</b><span class="tag">لوحة التحكم</span><small>اليوم</small></div>
          <div class="theme-msg-embed" style="border-left-color:${c}">
            ${title ? `<div class="t-title">${esc(title)}</div>` : ''}
            <div class="t-desc">${esc(tdesc) || 'اكتب نص الثيم هنا...'}</div>
            ${img ? `<img class="t-img" src="${esc(img)}" alt="" onerror="this.style.display='none'" />` : ''}
            <div class="t-foot"><img src="${esc(logo)}" alt="" />${esc(currentGuild.name)} · اليوم</div>
          </div>
        </div>
      </div>`;
  };

  const renderMsgPreview = () => {
    const t = MSG_TYPES[msgType];
    const editable = t.canEditText !== false;
    const text = editable ? (main.querySelector('#msg-text').value.trim() || 'اكتب نص الرسالة هنا...') : '';
    let desc = t.description.replace('{{TEXT}}', text).replace('{{GUILD}}', currentGuild.name);
    desc = previewDesc(desc).replace(/\*\*/g, '');
    main.querySelector('#msg-preview').innerHTML = previewEmbedHTML({
      color: t.color,
      title: t.title,
      desc,
      logoUrl: state.logoUrl,
      footer: currentGuild.name,
    });
  };
  main.querySelectorAll('.msg-type-tab').forEach((b) => b.addEventListener('click', () => {
    playSound('click');
    main.querySelectorAll('.msg-type-tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    msgType = b.dataset.type;
    renderTextArea();
    renderMsgPreview();
  }));
  main.querySelector('#msg-text').addEventListener('input', renderMsgPreview);
  renderTextArea();
  renderMsgPreview();
  ['#theme-title', '#theme-text', '#theme-img', '#theme-color'].forEach((sel) => main.querySelector(sel).addEventListener('input', renderThemePreview));
  main.querySelector('#theme-asmsg').addEventListener('change', renderThemePreview);
  renderThemePreview();
  main.querySelector('#msg-send').addEventListener('click', async () => {
    const targetId = main.querySelector('#msg-user').value.trim();
    const t = MSG_TYPES[msgType];
    const editable = t.canEditText !== false;
    const text = editable ? main.querySelector('#msg-text').value.trim() : '';
    if (!targetId) { toast('أدخل معرف العضو أولاً', 'err'); return; }
    if (editable && !text) { toast('اكتب النص أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'sendDm', userId: session.user.id, guildId: currentGuild.id, dmType: msgType, targetId, text });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
      toast('تم إرسال ' + rep.data.type + ' للعضو');
      main.querySelector('#msg-text').value = '';
      renderMsgPreview();
    } catch (e) { toast(e.message, 'err'); }
  });
  main.querySelector('#theme-send').addEventListener('click', async () => {
    const channelId = main.querySelector('#theme-channel').value;
    const title = main.querySelector('#theme-title').value.trim();
    const text = main.querySelector('#theme-text').value.trim();
    const img = main.querySelector('#theme-img').value.trim();
    const rawColor = main.querySelector('#theme-color').value;
    const color = parseInt(rawColor.replace('#', ''), 16);
    const asMsg = main.querySelector('#theme-asmsg').checked;
    if (!channelId) { toast('اختر الروم أولاً', 'err'); return; }
    if (!text) { toast('اكتب نص الثيم أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'sendTheme', userId: session.user.id, guildId: currentGuild.id, channelId, title, text, imageUrl: img, color, asMessage: asMsg });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
      toast('تم إرسال الثيم للروم');
      main.querySelector('#theme-title').value = '';
      main.querySelector('#theme-text').value = '';
      main.querySelector('#theme-img').value = '';
      renderThemePreview();
    } catch (e) { toast(e.message, 'err'); }
  });
}

// ---------- كل السيرفرات (المالك فقط) ----------
init();

// ═══════════ حماية الخروج بدون حفظ: تتبع التغييرات ═══════════
document.addEventListener('input', (e) => {
  if (e.target.closest('#dash-main') && e.target.matches('input,select,textarea')) markDirty();
});
document.addEventListener('change', (e) => {
  if (e.target.closest('#dash-main') && e.target.matches('input,select,textarea')) markDirty();
});

// حماية أزرار الرجوع (capture phase)
  $('#btn-back').addEventListener('click', (e) => {
    if (pageDirty) {
      e.stopImmediatePropagation();
      e.preventDefault();
      setPendingNav(() => { playSound('click'); enterServers(); });
      guardNav();
    }
  }, true);
  $('#btn-subs-back').addEventListener('click', (e) => {
    if (pageDirty) {
      e.stopImmediatePropagation();
      e.preventDefault();
      setPendingNav(() => { playSound('click'); enterServers(); });
      guardNav();
    }
  }, true);

  // حماية عامة لأزرار الـ nav
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', (e) => {
      if (pageDirty) {
        e.stopImmediatePropagation();
        e.preventDefault();
        setPendingNav(() => { playSound('click'); goPage(b.dataset.page); });
        guardNav();
      }
    }, true);
  });