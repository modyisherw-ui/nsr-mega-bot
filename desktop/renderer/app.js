// NSR Dashboard — منطق الواجهة
const NSR = window.api;
const $ = (sel) => document.querySelector(sel);

let settings = {};
let session = null;
let adminGuilds = [];
let botGuilds = [];
let known = false;
let botClientId = '';
let state = null;
let currentGuild = null;
let currentPage = 'home';

const NSR_DISCORD_SERVER = 'https://discord.gg/GGAXRUAQ6x';
const BOT_CLIENT_ID = '1537394763328786572'; // آيدي تطبيق البوت (لرابط الدعوة)
const APP_LOGO_URL = 'https://cdn.discordapp.com/emojis/1537843770911891466.png?size=128'; // icon2
const MSG_TYPES = {
  send: { emoji: '💬', name: 'رسالة', color: '#5865F2', title: '💬 رسالة خاصة' },
  summon: { emoji: '📣', name: 'استدعاء', color: '#F1C40F', title: '📣 استدعاء لك' },
  thanks: { emoji: '🙏', name: 'شكر', color: '#57F287', title: '🙏 شكراً لك' },
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
  const dots = ['#bridge-dot', '#bridge-dot2'];
  const texts = ['#bridge-text', '#bridge-text2'];
  dots.forEach((s) => { const d = $(s); if (d) d.className = 'dot ' + (connected ? 'on' : 'off'); });
  texts.forEach((s) => { const t = $(s); if (t) t.textContent = connected ? 'الجسر متصل ✅' : 'الجسر غير متصل'; });
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
      return botGuilds;
    }
  } catch (_) {}
  return [];
}

// ---------- التحديث الإجباري ----------
const updateOverlay = $('#update-overlay');
const updateTitle = $('#update-title');
const updateSub = $('#update-sub');
const updateBarWrap = $('#update-bar-wrap');
const updateBar = $('#update-bar');
const updateBtn = $('#btn-update-download');

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
  } else if (s.phase === 'found') {
    updateTitle.textContent = 'يوجد تحديث جديد في التطبيق';
    updateSub.textContent = 'الإصدار ' + s.version + ' متوفر الآن — اضغط الزر للتحميل';
    updateBarWrap.classList.add('hidden');
    updateBar.style.width = '0%';
    updateBtn.textContent = 'تحميل التحديث الآن';
    updateBtn.classList.remove('hidden');
  } else if (s.phase === 'downloading') {
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
    updateSub.textContent = (s.message && s.message !== 'فشل التنزيل' ? s.message + ' — ' : '') + 'اضغط الزر لإعادة المحاولة، أو أغلق التطبيق';
    updateBarWrap.classList.add('hidden');
    updateBtn.textContent = 'إعادة المحاولة';
    updateBtn.classList.remove('hidden');
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
    enterServers();
  }

  $('#btn-login').addEventListener('click', doLogin);
  $('#btn-back').addEventListener('click', () => { playSound('click'); enterServers(); });

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
  });

  // علامة الديسكورد → رابط سيرفر NSR HUB
  $('#btn-discord-server').addEventListener('click', () => {
    playSound('click');
    NSR.openExternal(NSR_DISCORD_SERVER);
  });

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => { playSound('click'); goPage(b.dataset.page); });
  });
}

function fillUserMenu() {
  if (!session) return;
  $('#um-avatar').src = session.user.avatarUrl || '';
  $('#um-name').textContent = session.user.username;
  $('#um-id').textContent = '#' + session.user.id;
  const count = known ? botGuilds.filter((g) => g.isAdmin === true).length : adminGuilds.length;
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
    toast('✅ تم تسجيل الدخول بنجاح!');
    enterServers();
  } catch (e) {
    err.textContent = '❌ ' + e.message;
  }
}

async function doLogout() {
  playSound('click');
  await NSR.logout();
  session = null; adminGuilds = []; botGuilds = []; known = false; botClientId = '';
  showScreen('screen-login');
  $('#login-error').textContent = '';
}

// ---------- شاشة السيرفرات ----------
async function enterServers() {
  showScreen('screen-servers');
  $('#user-avatar').src = session.user.avatarUrl || '';
  $('#user-name').textContent = session.user.username;

  const grid = $('#servers-grid');
  grid.innerHTML = '<div class="loading">جاري جلب السيرفرات...</div>';
  $('#servers-empty').classList.add('hidden');

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

  // السيرفرات اللي فيها البوت وعندك عليها صلاحية إدارة (أدمن أو رول ستاف) حسب تعريف البوت
  let listed;
  if (known) {
    listed = botGuilds.filter((g) => g.isAdmin === true);
  } else {
    // احتياط: من صلاحيات OAuth إذا الجسر غير متصل
    listed = adminGuilds;
  }

  if (!listed.length) {
    grid.innerHTML = '';
    $('#servers-empty').classList.remove('hidden');
    return;
  }
  grid.innerHTML = '';

  listed.forEach((g, i) => {
    const iconUrl = g.iconUrl || (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : '');
    const card = document.createElement('div');
    card.className = 'server-card';
    card.style.setProperty('--d', (i * 0.06) + 's');
    card.innerHTML = `
      <div class="icon">${iconUrl ? `<img src="${iconUrl}" alt="" />` : '🎮'}</div>
      <h3>${esc(g.name)}</h3>
      <div class="meta">السيرفر: ${g.id}</div>
      <div class="badges">${known ? '<span class="badge ok">✅ البوت موجود</span>' : '<span class="badge no">⚠ البوت غير متصل</span>'}<span class="badge">👑 إدارة</span></div>`;
    card.addEventListener('click', () => openGuild(g));
    grid.appendChild(card);
    requestAnimationFrame(() => card.classList.add('in'));
  });
  wireFx(grid);
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
    toast('📡 تم تحميل إعدادات السيرفر');
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
      toast('❌ ' + e.message, 'err');
      $('#dash-main').innerHTML = '<div class="loading">تعذر الاتصال بالبوت — تأكد أن البوت شغال وأن مفتاح الجسر صحيح</div>';
    }
  }
}

function goPage(page) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  currentPage = page;
  renderPage(page);
}

function renderPage(page) {
  const main = $('#dash-main');
  if (!state) return;
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
  else if (page === 'messages') renderMessages(main);
  wireFx(main);
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
    toast('✅ تم تحديث الإعدادات');
  } catch (e) { toast('❌ ' + e.message, 'err'); }
}

// ---------- الرئيسية ----------
function renderHome(main) {
  const w = state.welcome || {};
  const types = (state.ticket.ticketTypes || []).filter((t) => t.enabled !== false);
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>🏠 السيرفر</h4>
        <p style="font-size:13.5px; color:var(--muted); margin-bottom:10px;">
          <b style="color:var(--text)">${esc(state.guild.name)}</b><br/>
          المعرّف: ${state.guild.id}<br/>
          يوجد ${types.length} نوع تذاكر مفعّل
        </p>
        <div class="badges">
          <span class="badge ok">👋 ترحيب ${w.channelId ? 'مفعّل' : 'غير مضبوط'}</span>
          <span class="badge ok">🎫 التذاكر جاهزة</span>
        </div>
      </div>
      <div class="card">
        <h4>📊 اختصارات سريعة</h4>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn ghost" data-quick="tickets">🎫 التذاكر</button>
          <button class="btn ghost" data-quick="welcome">👋 الترحيب</button>
          <button class="btn ghost" data-quick="suggestions">💡 الاقتراحات</button>
          <button class="btn ghost" data-quick="send">📨 الإرسال</button>
        </div>
        <p style="color:var(--muted); font-size:12px; margin-top:14px;">الجسر: <b id="home-bridge"></b></p>
      </div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-act="refresh"><span class="big-emoji">🔄</span> تحديث الإعدادات</button>
      <button class="act-btn" data-act="servers"><span class="big-emoji">📡</span> تحديث قائمة السيرفرات</button>
    </div>`;
  const bridgeState = $('.bridge-status .dot').className.includes('on');
  $('#home-bridge').textContent = bridgeState ? 'متصل ✅' : 'غير متصل';
  main.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => goPage(b.dataset.quick)));
  main.querySelector('[data-act="refresh"]').addEventListener('click', refreshState);
  main.querySelector('[data-act="servers"]').addEventListener('click', async () => {
    playSound('click'); enterServers();
  });
}

// ---------- الترحيب ----------
function renderWelcome(main) {
  const w = state.welcome || {};
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>👋 رسالة الترحيب</h4>
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
        <h4>⚙️ خيارات الاستقبال</h4>
        <div class="toggle-row"><span>📩 إرسال على الخاص (DM) بدل الروم</span>
          <label class="switch"><input type="checkbox" id="w-mode" ${w.mode === 'dm' ? 'checked' : ''}/><span class="slider"></span></label></div>
        <div class="toggle-row"><span>🖼️ مع الصورة</span>
          <label class="switch"><input type="checkbox" id="w-img" ${w.withImage !== false ? 'checked' : ''}/><span class="slider"></span></label></div>
        <div class="toggle-row"><span>🔢 إظهار رقم العضو ({count})</span>
          <label class="switch"><input type="checkbox" id="w-count" ${w.showCount !== false ? 'checked' : ''}/><span class="slider"></span></label></div>
      </div>
    </div>
    <div class="preview-card">
      <h4>👁️ معاينة رسالة الترحيب (كما تصل في ديسكورد)</h4>
      <div id="welcome-preview"></div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="welcome"><span class="big-emoji">💾</span> حفظ إعدادات الترحيب</button>
    </div>`;

  const updatePreview = () => {
    const msg = main.querySelector('#welcome-msg').value;
    const withImg = main.querySelector('#w-img').checked;
    const withCount = main.querySelector('#w-count').checked;
    const imgUrl = main.querySelector('#welcome-img').value.trim();
    const q = state.guild.name;
    main.querySelector('#welcome-preview').innerHTML = previewEmbedHTML({
      title: '👋 أهلاً بك',
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
    if (!msg) { toast('❌ اكتب رسالة الترحيب أولاً', 'err'); return; }
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
      toast('✅ تم حفظ إعدادات الترحيب');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
}

// ---------- التذاكر ----------
function renderTickets(main) {
  const t = state.ticket || {};
  const panel = t.panel || {};
  const types = t.ticketTypes || [];
  const typeList = types.map((tp) => `
    <div class="type-row">
      <span class="emoji">${esc(tp.emoji || '🔹')}</span>
      <div class="info"><b>${esc(tp.label)}</b>${tp.id.startsWith('c') ? ' <small>(مخصص)</small>' : ' <small>(أساسي)</small>'}<small>${esc(tp.description || '')}</small></div>
      <label class="switch" title="${tp.enabled === false ? 'إظهار' : 'إخفاء'}"><input type="checkbox" data-type-id="${tp.id}" ${tp.enabled !== false ? 'checked' : ''}/><span class="slider"></span></label>
      ${tp.id.startsWith('c') ? `<button class="del-btn" data-del-id="${tp.id}">🗑 حذف</button>` : ''}
    </div>`).join('') || '<p style="color:var(--muted)">لا توجد أنواع.</p>';
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>🎫 لوحة التذاكر</h4>
        <label>العنوان</label>
        <input id="tk-title" type="text" value="${esc(panel.title || '')}" />
        <label>الوصف</label>
        <textarea id="tk-desc">${esc(panel.description || '')}</textarea>
      </div>
      <div class="card">
        <h4>🗂 أنواع التذاكر — فعّل/أطفئ أو أضف مخصصاً</h4>
        <div>${typeList}</div>
        <div style="display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:14px;">
          <input id="tk-new-label" type="text" placeholder="اسم النوع الجديد" />
          <button class="btn ghost" id="tk-add">➕ إضافة</button>
        </div>
      </div>
    </div>
    <div class="preview-card">
      <h4>👁️ معاينة لوحة التذاكر (كما تصل في ديسكورد)</h4>
      <div id="tickets-preview"></div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="ticket"><span class="big-emoji">💾</span> حفظ اللوحة</button>
      <button class="act-btn" data-send="ticket"><span class="big-emoji">📨</span> إرسال اللوحة لروم</button>
    </div>`;

  const updateTicketPreview = () => {
    const title = main.querySelector('#tk-title').value.trim() || '🎫 Support Tickets';
    const desc = main.querySelector('#tk-desc').value.trim();
    const enabled = (state.ticket.ticketTypes || []).filter((tp) => tp.enabled !== false);
    const selOpt = enabled[0] ? `${enabled[0].emoji || '🔹'} ${esc(enabled[0].label)}` : 'لا توجد أنواع مفعلة';
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
        toast(sw.checked ? '✅ النوع ظاهر الآن' : '🙈 النوع مخفي الآن');
      } catch (e) { sw.checked = !sw.checked; toast('❌ ' + e.message, 'err'); }
    });
  });
  main.querySelectorAll('[data-del-id]').forEach((b) => {
    b.addEventListener('click', async () => {
      playSound('click');
      try {
        const rep = await NSR.bridgeCommand({ type: 'delTicketType', userId: session.user.id, guildId: currentGuild.id, typeId: b.dataset.delId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('🗑 تم حذف النوع المخصص');
        refreshState();
      } catch (e) { toast('❌ ' + e.message, 'err'); }
    });
  });
  main.querySelector('#tk-add').addEventListener('click', async () => {
    const label = main.querySelector('#tk-new-label').value.trim();
    if (!label) { toast('❌ اكتب اسم النوع', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'addTicketType', userId: session.user.id, guildId: currentGuild.id, label });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      main.querySelector('#tk-new-label').value = '';
      toast('✅ تمت إضافة النوع');
      refreshState();
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
  main.querySelector('[data-save="ticket"]').addEventListener('click', async () => {
    const p = {
      title: main.querySelector('#tk-title').value.trim() || '🎫 Support Tickets',
      description: main.querySelector('#tk-desc').value.trim(),
    };
    try {
      const rep = await NSR.bridgeCommand({ type: 'setTicketPanel', userId: session.user.id, guildId: currentGuild.id, panel: p });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.ticket.panel = rep.data.panel;
      toast('✅ تم حفظ اللوحة');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
  main.querySelector('[data-send="ticket"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendTicketPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
        toast('✅ تم إرسال لوحة التذاكر');
      } catch (e) { toast('❌ ' + e.message, 'err'); }
    });
  });
}

// ---------- الاقتراحات ----------
function renderSuggestions(main) {
  const s = state.suggestions || {};
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>💡 روم الاقتراحات</h4>
        <label>الروم الذي تصل فيه الاقتراحات للأدمن</label>
        <select id="sugg-ch">
          <option value="">— اختر الروم —</option>
          ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(s.channelId) === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <h4>📝 ملاحظة</h4>
        <p style="font-size:13px; color:var(--muted); line-height:1.9;">
          زر <b>✏️ تقديم اقتراح</b> يعمل تلقائياً على لوحة الاقتراحات.<br/>
          بعد الحفظ اضغط <b>إرسال اللوحة</b> لتنزيلها في أي روم.
        </p>
      </div>
    </div>
    <div class="preview-card">
      <h4>👁️ معاينة لوحة الاقتراحات (كما تصل في ديسكورد)</h4>
      <div id="sugg-preview"></div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="sugg"><span class="big-emoji">💾</span> حفظ الروم</button>
      <button class="act-btn" data-send="sugg"><span class="big-emoji">📨</span> إرسال لوحة الاقتراحات</button>
    </div>`;
  $('#sugg-preview').innerHTML = previewEmbedHTML({
    color: state.color || 5793266,
    title: '📬 Suggestion Box | صندوق الاقتراحات',
    desc: '**English**\nHave an idea or feedback? Hit the button and share it!\n\n**العربية**\nهل لديك فكرة أو ملاحظات؟ اضغط على الزر وشاركها!',
    logoUrl: state.logoUrl,
    footer: 'NSR HUB - MoDy Dev',
    select: '✏️ Submit a Suggestion | قدّم اقتراحاً',
  });
  main.querySelector('[data-save="sugg"]').addEventListener('click', async () => {
    const channelId = main.querySelector('#sugg-ch').value;
    if (!channelId) { toast('❌ اختر الروم أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'setSuggestionsChannel', userId: session.user.id, guildId: currentGuild.id, channelId });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.suggestions.channelId = channelId;
      toast('✅ تم حفظ روم الاقتراحات');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
  main.querySelector('[data-send="sugg"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendSuggestionsPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
        toast('✅ تم إرسال لوحة الاقتراحات');
      } catch (e) { toast('❌ ' + e.message, 'err'); }
    });
  });
}

// ---------- إرسال اللوحات ----------
function renderSend(main) {
  main.innerHTML = `
    <div class="grid-actions">
      <button class="act-btn" data-send="st"><span class="big-emoji">🎫</span> إرسال لوحة التذاكر</button>
      <button class="act-btn" data-send="ss"><span class="big-emoji">💡</span> إرسال لوحة الاقتراحات</button>
      <button class="act-btn" data-act="refresh"><span class="big-emoji">🔄</span> تحديث الإعدادات</button>
    </div>
    <p style="color:var(--muted); margin-top:22px; font-size:13px;">📌 اختر الروم ثم سيُرسل فوراً — اللوحة تبقى متزامنة مع لوحة تحكم ديسكورد.</p>`; 
  main.querySelector('[data-send="st"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendTicketPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('✅ تم الإرسال!');
      } catch (e) { toast('❌ ' + e.message, 'err'); }
    });
  });
  main.querySelector('[data-send="ss"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await NSR.bridgeCommand({ type: 'sendSuggestionsPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('✅ تم الإرسال!');
      } catch (e) { toast('❌ ' + e.message, 'err'); }
    });
  });
  main.querySelector('[data-act="refresh"]').addEventListener('click', refreshState);
}

// ---------- منتقي الروم ----------
function openChannelPicker(cb) {
  const main = $('#dash-main');
  main.innerHTML = `
    <div class="card" style="max-width:520px; margin:0 auto;">
      <h4>📌 اختر الروم للإرسال</h4>
      <select id="picker-ch">
        <option value="">— اختر الروم —</option>
        ${(state.channels || []).map((c) => `<option value="${c.id}"># ${esc(c.name)}</option>`).join('')}
      </select>
      <div style="display:flex; gap:10px; margin-top:16px;">
        <button class="btn primary" id="picker-go" style="flex:1;">🚀 إرسال</button>
        <button class="btn ghost" id="picker-back">🔙 رجوع</button>
      </div>
    </div>`;
  main.querySelector('#picker-go').addEventListener('click', () => {
    const ch = main.querySelector('#picker-ch').value;
    if (!ch) { toast('❌ اختر الروم أولاً', 'err'); return; }
    cb(ch);
    goPage(currentPage === 'tickets' ? 'tickets' : currentPage);
  });
  main.querySelector('#picker-back').addEventListener('click', () => goPage(currentPage));
  wireFx(main);
}

// ---------- الصلاحيات ----------
function renderAuth(main) {
  const staffIds = (state.staffRoles || []).map(String);
  const ar = state.autoRoles || {};
  const roleChips = (state.roles || [])
    .map((r) => `<span class="member-chip" data-role-id="${r.id}" data-picked="${staffIds.includes(String(r.id)) ? '1' : '0'}" style="cursor:pointer;${staffIds.includes(String(r.id)) ? 'border-color:var(--green); color:var(--green);' : ''}">${esc(r.name)} ${staffIds.includes(String(r.id)) ? '✓' : ''}</span>`)
    .join('') || '<p style="color:var(--muted)">لا توجد رتب.</p>';
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>👔 رتب الإدارة</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">اضغط على الرتب المراد منحها صلاحية لوحة التحكم (أو هي من تسمح بفتح اللوحة)</p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">${roleChips}</div>
        <button class="btn ghost" id="save-staff">💾 حفظ رتب الإدارة</button>
      </div>
      <div class="card">
        <h4>🤖 الرولات التلقائية</h4>
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
        <button class="btn ghost" id="save-aro" style="margin-top:14px;">💾 حفظ الرولات التلقائية</button>
      </div>
    </div>`;
  main.querySelectorAll('[data-role-id]').forEach((chip) => {
    chip.addEventListener('click', () => {
      playSound('click');
      const picked = chip.dataset.picked !== '1';
      chip.dataset.picked = picked ? '1' : '0';
      chip.style.borderColor = picked ? 'var(--green)' : '';
      chip.style.color = picked ? 'var(--green)' : '';
      chip.textContent = chip.textContent.replace(/\s*✓$/, '') + (picked ? ' ✓' : '');
    });
  });
  main.querySelector('#save-staff').addEventListener('click', async () => {
    const ids = Array.from(main.querySelectorAll('[data-role-id][data-picked="1"]')).map((c) => c.dataset.roleId);
    try {
      const rep = await NSR.bridgeCommand({ type: 'setStaffRoles', userId: session.user.id, guildId: currentGuild.id, roleIds: ids });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.staffRoles = rep.data.staffRoles;
      toast('✅ تم حفظ رتب الإدارة');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
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
      toast('✅ تم حفظ الرولات التلقائية');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
}

// ---------- المظهر ----------
function renderBrand(main) {
  const logoUrl = state.logoUrl || '';
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>🎨 لون الإمبد</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">اللون المستخدم في رسائل البوت ولوحات التذاكر</p>
        <input type="color" id="brand-color" value="${colorToHex(state.color || 5793266)}" style="width:100%; height:46px; border:none; border-radius:10px; background:transparent; cursor:pointer;" />
        <button class="btn ghost" id="save-color" style="margin-top:14px;">💾 حفظ اللون</button>
      </div>
      <div class="card">
        <h4>🖼️ شعار البوت</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">اللوقو الذي يظهر في الزاوية العلوية لكل الإمبدات</p>
        ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" style="width:72px; height:72px; border-radius:16px; margin-bottom:12px; border:1px solid var(--border);" />` : '<p style="color:var(--muted)">لا يوجد شعار محفوظ — البوت يولّده تلقائياً من أول رفع</p>'}
        <label>تغيير الشعار (رابط صورة)</label>
        <input id="brand-logo-url" type="text" placeholder="https://...png" />
        <button class="btn ghost" id="save-logo" style="margin-top:10px;">💾 حفظ الشعار الجديد</button>
        <p style="font-size:11.5px; color:var(--muted); margin-top:8px;">⚠️ الصورة تُرفع إلى ديسكورد CDN وتُعرض لكل الإمبدات فوراً (PNG/JPG).</p>
      </div>
    </div>
    <div class="preview-card">
      <h4>👁️ معاينة الإمبد (اللون والشعار كما يظهران في ديسكورد)</h4>
      <div id="brand-preview"></div>
    </div>
    <p style="color:var(--muted); font-size:12px; margin-top:14px;">💡 شعار البوت يُدار أيضاً من لوحة ديسكورد (زر تغيير الشعار في صفحة النظام).</p>`;
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
      toast('✅ تم حفظ اللون');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
  main.querySelector('#save-logo').addEventListener('click', async () => {
    const url = main.querySelector('#brand-logo-url').value.trim();
    if (!url) { toast('❌ اكتب رابط الصورة أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'setLogo', userId: session.user.id, guildId: currentGuild.id, logoUrl: url });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.logoUrl = rep.data.logoUrl;
      main.querySelector('#brand-logo-url').value = '';
      toast('✅ تم حفظ الشعار الجديد');
      refreshState();
    } catch (e) { toast('❌ ' + e.message, 'err'); }
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
      <span>${ev.emoji}</span>
      <b style="flex:1; font-size:13px;">${ev.name}</b>
      <select data-log="${ev.id}">
        <option value="">— بدون —</option>
        ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(lc[ev.id]) === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
      </select>
    </div>`).join('');
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>📋 رومات اللوقات — كل حدث برومه</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">سيُرصد كل حدث ويرسل للروم الذي تختاره. اتركه «بدون» لإيقاف رصده.</p>
        <div>${rows}</div>
      </div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="logs"><span class="big-emoji">💾</span> حفظ رومات اللوقات</button>
    </div>`;
  main.querySelector('[data-save="logs"]').addEventListener('click', async () => {
    const events = {};
    main.querySelectorAll('[data-log]').forEach((sel) => { events[sel.dataset.log] = sel.value || ''; });
    try {
      const rep = await NSR.bridgeCommand({ type: 'setLogChannels', userId: session.user.id, guildId: currentGuild.id, events });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.logChannels = rep.data.logChannels;
      toast('✅ تم حفظ رومات اللوقات');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
}

// ---------- الأمان ----------
function renderSecurity(main) {
  const pr = state.protection || {};
  const protectedIds = (pr.protectedRoles || []).map(String);
  const bypassIds = (pr.bypassRoles || []).map(String);
  const pick = (ids) => (ids.length ? ids.map((id) => { const r = (state.roles || []).find((x) => String(x.id) === String(id)); return r ? esc(r.name) : id; }).join(', ') : '—');
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>🛡️ رتب محمية</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">من يحاول تعديل/حذف هذه الرتب يُعاقب فوراً. اضغط على الرتب لاختيارها.</p>
        <div class="selected-list">${(state.roles || []).map((r) => `<span class="member-chip" data-prot="${r.id}" data-picked="${protectedIds.includes(String(r.id)) ? '1' : '0'}" style="cursor:pointer;${protectedIds.includes(String(r.id)) ? 'border-color:var(--red); color:var(--red);' : ''}">${esc(r.name)}</span>`).join('') || '<p style="color:var(--muted)">لا توجد رتب.</p>'}</div>
        <p style="font-size:12px; color:var(--muted);">الحالي: <b style="color:var(--red)">${pick(protectedIds)}</b></p>
      </div>
      <div class="card">
        <h4>🧑‍💼 رتب التجاوز</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">رتب لا تنطبق عليها الحماية (يسمح لها بالتعديل).</p>
        <div class="selected-list">${(state.roles || []).map((r) => `<span class="member-chip" data-bypass="${r.id}" data-picked="${bypassIds.includes(String(r.id)) ? '1' : '0'}" style="cursor:pointer;${bypassIds.includes(String(r.id)) ? 'border-color:var(--green); color:var(--green);' : ''}">${esc(r.name)}</span>`).join('') || '<p style="color:var(--muted)">لا توجد رتب.</p>'}</div>
        <p style="font-size:12px; color:var(--muted);">الحالي: <b style="color:var(--green)">${pick(bypassIds)}</b></p>
      </div>
    </div>
    <div class="grid2">
      <div class="card">
        <h4>⚖️ عقوبة المخالف</h4>
        <select id="sec-action">
          <option value="kick" ${pr.action !== 'ban' ? 'selected' : ''}>👢 طرد (Kick)</option>
          <option value="ban" ${pr.action === 'ban' ? 'selected' : ''}>⛔ باند (Ban)</option>
        </select>
        <p style="font-size:12px; color:var(--muted); margin-top:8px;">تنفَّذ فوراً عند عبثه برتبة محمية.</p>
      </div>
    </div>
    <div class="grid-actions">
      <button class="act-btn" data-save="sec"><span class="big-emoji">💾</span> حفظ إعدادات الأمان</button>
    </div>`;
  const toggle = (attr, colorVar) => {
    main.querySelectorAll(attr).forEach((chip) => chip.addEventListener('click', () => {
      playSound('click');
      const picked = chip.dataset.picked !== '1';
      chip.dataset.picked = picked ? '1' : '0';
      chip.style.borderColor = picked ? 'var(' + colorVar + ')' : '';
      chip.style.color = picked ? 'var(' + colorVar + ')' : '';
    }));
  };
  toggle('[data-prot]', '--red');
  toggle('[data-bypass]', '--green');
  main.querySelector('[data-save="sec"]').addEventListener('click', async () => {
    const protectedRoles = Array.from(main.querySelectorAll('[data-prot][data-picked="1"]')).map((c) => c.dataset.prot);
    const bypassRoles = Array.from(main.querySelectorAll('[data-bypass][data-picked="1"]')).map((c) => c.dataset.bypass);
    const action = main.querySelector('#sec-action').value;
    try {
      const rep = await NSR.bridgeCommand({ type: 'setProtection', userId: session.user.id, guildId: currentGuild.id, protectedRoles, bypassRoles, action });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.protection = rep.data;
      toast('✅ تم حفظ إعدادات الأمان');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
}

// ---------- المنتجات والتقييمات ----------
function renderRatings(main) {
  const rt = state.rating || {};
  const products = rt.products || [];
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>🛍️ المنتجات</h4>
        <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">المستخدم يقيّم المنتج بعد الشراء عبر سلوك /rate.</p>
        <div>${products.length
          ? products.map((p) => `<div class="prod-row"><span>🛒</span><div style="flex:1;"><b>${esc(p.name)}</b><br/><span>${esc(p.id)}</span></div><button class="del-btn" data-del="${p.id}">🗑 حذف</button></div>`).join('')
          : '<p style="color:var(--muted)">لا توجد منتجات بعد.</p>'}</div>
        <div style="display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:14px;">
          <input id="prod-name" type="text" placeholder="اسم المنتج الجديد" />
          <button class="btn ghost" id="prod-add">➕ إضافة</button>
        </div>
      </div>
      <div class="card">
        <h4>⭐ روم التقييمات</h4>
        <label>الروم الذي تُنشر فيه التقييمات بعد استلامها</label>
        <select id="rating-ch">
          <option value="">— اختر الروم —</option>
          ${(state.channels || []).map((c) => `<option value="${c.id}" ${String(rt.reviewsChannelId || '') === String(c.id) ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}
        </select>
        <button class="btn ghost" id="save-rating" style="margin-top:14px;">💾 حفظ الروم</button>
      </div>
    </div>`;
  main.querySelector('#prod-add').addEventListener('click', async () => {
    const name = main.querySelector('#prod-name').value.trim();
    if (!name) { toast('❌ اكتب اسم المنتج', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'addProduct', userId: session.user.id, guildId: currentGuild.id, name });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      main.querySelector('#prod-name').value = '';
      toast('✅ تمت إضافة المنتج');
      refreshState();
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    playSound('click');
    try {
      const rep = await NSR.bridgeCommand({ type: 'delProduct', userId: session.user.id, guildId: currentGuild.id, productId: b.dataset.del });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      toast('🗑 تم حذف المنتج');
      refreshState();
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  }));
  main.querySelector('#save-rating').addEventListener('click', async () => {
    const channelId = main.querySelector('#rating-ch').value;
    if (!channelId) { toast('❌ اختر الروم أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'setRatingChannel', userId: session.user.id, guildId: currentGuild.id, channelId });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.rating.reviewsChannelId = channelId;
      toast('✅ تم حفظ روم التقييمات');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
}

// ---------- الرسائل ----------
function renderMessages(main) {
  let msgType = 'send';
  main.innerHTML = `
    <div class="grid2">
      <div class="card">
        <h4>💬 إرسال رسالة خاصة</h4>
        <div class="msg-type-tabs">
          ${Object.entries(MSG_TYPES).map(([id, t]) => `<button class="msg-type-tab${id === msgType ? ' active' : ''}" data-type="${id}">${t.emoji} ${t.name}</button>`).join('')}
        </div>
        <label>معرف العضو (User ID)</label>
        <input id="msg-user" type="text" placeholder="كليك يمين على العضو ← نسخ معرف المستخدم" />
        <label>النص</label>
        <textarea id="msg-text" placeholder="اكتب نص الرسالة هنا..."></textarea>
        <button class="btn primary" id="msg-send" style="margin-top:14px; width:100%;">📨 إرسال</button>
      </div>
      <div class="card">
        <h4>👁️ معاينة رسالة الخاص (كما تصله في ديسكورد)</h4>
        <div id="msg-preview"></div>
        <p style="font-size:12px; color:var(--muted); margin-top:10px;">⏳ تهدئة دقيقة واحدة بين رسالتين لنفس الشخص.</p>
      </div>
    </div>`;
  const renderMsgPreview = () => {
    const t = MSG_TYPES[msgType];
    const text = main.querySelector('#msg-text').value.trim() || 'اكتب نص الرسالة هنا...';
    const isSummon = msgType === 'summon';
    const desc = (isSummon ? 'نرجى منك فتح تكت في اسرع وقت.\n\n' : '') + text + '\n\n**' + currentGuild.name + '**';
    main.querySelector('#msg-preview').innerHTML = previewEmbedHTML({
      color: t.color,
      title: t.title,
      desc: previewDesc(desc).replace(/\*\*/g, ''),
      logoUrl: state.logoUrl,
      footer: currentGuild.name,
    });
  };
  main.querySelectorAll('.msg-type-tab').forEach((b) => b.addEventListener('click', () => {
    playSound('click');
    main.querySelectorAll('.msg-type-tab').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    msgType = b.dataset.type;
    renderMsgPreview();
  }));
  main.querySelector('#msg-text').addEventListener('input', renderMsgPreview);
  renderMsgPreview();
  main.querySelector('#msg-send').addEventListener('click', async () => {
    const targetId = main.querySelector('#msg-user').value.trim();
    const text = main.querySelector('#msg-text').value.trim();
    if (!targetId) { toast('❌ أدخل معرف العضو أولاً', 'err'); return; }
    if (!text) { toast('❌ اكتب النص أولاً', 'err'); return; }
    try {
      const rep = await NSR.bridgeCommand({ type: 'sendDm', userId: session.user.id, guildId: currentGuild.id, type: msgType, targetId, text });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل الإرسال');
      toast('✅ تم إرسال ' + rep.data.type + ' للعضو');
      main.querySelector('#msg-text').value = '';
      renderMsgPreview();
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
}

init();