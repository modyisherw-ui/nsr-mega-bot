// NSR Dashboard — منطق الواجهة
const api = window.api;
const $ = (sel) => document.querySelector(sel);

let settings = {};
let session = null;
let adminGuilds = [];
let botGuilds = [];
let state = null;
let currentGuild = null;
let currentPage = 'home';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#' + id).classList.add('active');
}

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
function setBridgeStatus(connected) {
  const dots = ['#bridge-dot', '#bridge-dot2'];
  const texts = ['#bridge-text', '#bridge-text2'];
  dots.forEach((s) => { const d = $(s); if (d) d.className = 'dot ' + (connected ? 'on' : 'off'); });
  texts.forEach((s) => { const t = $(s); if (t) t.textContent = connected ? 'الجسر متصل ✅' : 'الجسر غير متصل'; });
}

async function refreshBotGuilds() {
  if (!settings.bridgeKey || !session) return [];
  try {
    const rep = await api.bridgeCommand({ type: 'guilds', userId: session.user.id, guildId: '' });
    if (rep && rep.ok && Array.isArray(rep.data.guilds)) {
      botGuilds = rep.data.guilds;
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

api.onUpdateStatus((s) => {
  updateOverlay.classList.add('visible');
  if (s.phase === 'checking') {
    updateTitle.textContent = 'جاري التحقق من التحديثات...';
    updateSub.textContent = '';
    updateBarWrap.classList.add('hidden');
  } else if (s.phase === 'downloading') {
    updateTitle.textContent = '📥 تم العثور على تحديث جديد — جاري تنزيله';
    updateSub.textContent = s.pct + '%';
    updateBarWrap.classList.remove('hidden');
    updateBar.style.width = s.pct + '%';
  } else if (s.phase === 'installing') {
    updateTitle.textContent = '⚙️ جاري تثبيت التحديث وسيُفتح التطبيق تلقائياً...';
    updateSub.textContent = 'إصدار ' + s.version;
    updateBarWrap.classList.add('hidden');
  } else if (s.phase === 'none') {
    updateOverlay.classList.remove('visible');
    if (!session) showScreen('screen-login');
  } else if (s.phase === 'error') {
    updateOverlay.classList.remove('visible');
    if (!session) showScreen('screen-login');
  }
});

// ---------- الإقلاع ----------
async function init() {
  setTimeout(() => { updateOverlay.classList.add('visible'); }, 50);
  settings = await api.getSettings();
  $('#inp-clientid').value = settings.clientId || '';
  $('#inp-clientsecret').value = settings.clientSecret || '';
  $('#inp-bridgekey').value = settings.bridgeKey || '';

  if (settings.bridgeKey) await api.bridgeConnect(settings.bridgeKey);
  api.onBridgeStatus((s) => setBridgeStatus(s.connected));
  const st = await api.bridgeStatus();
  setBridgeStatus(st.connected);

  const sess = await api.getSession();
  if (sess && sess.session) {
    session = sess.session;
    adminGuilds = sess.adminGuilds;
    enterServers();
  }

  $('#btn-toggle-key').addEventListener('click', () => {
    const inp = $('#inp-bridgekey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  $('#btn-login').addEventListener('click', doLogin);
  $('#btn-logout2').addEventListener('click', doLogout);
  $('#btn-back').addEventListener('click', () => { playSound('click'); enterServers(); });

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => { playSound('click'); goPage(b.dataset.page); });
  });
}

// ---------- تسجيل الدخول ----------
async function doLogin() {
  const clientId = $('#inp-clientid').value.trim();
  const clientSecret = $('#inp-clientsecret').value.trim();
  const bridgeKey = $('#inp-bridgekey').value.trim();
  const err = $('#login-error');
  err.textContent = '';

  if (!clientId) { err.textContent = '❌ أدخل معرف تطبيق Discord أولاً'; return; }
  if (!bridgeKey) {
    err.textContent = '❌ أدخل مفتاح الجسر — تجده في config.json داخل خاصية bridgeKey (جمّلته في أول تشغيل للبوت)';
    return;
  }

  settings = await api.setSettings({ clientId, clientSecret, bridgeKey });
  await api.bridgeConnect(bridgeKey);
  const bst = await api.bridgeStatus();
  setBridgeStatus(bst.connected);

  try {
    const res = await api.login({ clientId, clientSecret });
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
  await api.logout();
  session = null; adminGuilds = []; botGuilds = [];
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

  await refreshBotGuilds();
  const botIds = new Set(botGuilds.map((g) => g.id));
  const known = botGuilds.length > 0;

  // السيرفرات التي فيها البوت (إن كنا نعرفها) والمستخدم أدمن فيها
  const listed = known ? adminGuilds.filter((g) => botIds.has(g.id)) : adminGuilds;

  if (!listed.length) {
    grid.innerHTML = '';
    $('#servers-empty').classList.remove('hidden');
    return;
  }
  grid.innerHTML = '';

  listed.forEach((g, i) => {
    const inBot = botIds.has(g.id);
    const card = document.createElement('div');
    card.className = 'server-card';
    card.style.setProperty('--d', (i * 0.06) + 's');
    card.innerHTML = `
      <div class="icon">${g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128" alt="" />` : '🎮'}</div>
      <h3>${esc(g.name)}</h3>
      <div class="meta">السيرفر: ${g.id}</div>
      <div class="badges">${known ? (inBot ? '<span class="badge ok">✅ البوت موجود</span>' : '<span class="badge no">⚠ البوت غير موجود</span>') : '<span class="badge no">⚠ البوت غير متصل</span>'}<span class="badge">👑 أدمن</span></div>`;
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
  $('#guild-icon').src = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : '';
  $('#guild-name').textContent = g.name;

  goPage('home');
  $('#dash-main').innerHTML = '<div class="loading">جاري تحميل إعدادات السيرفر...</div>';
  try {
    const rep = await api.bridgeCommand({ type: 'state', userId: session.user.id, guildId: g.id });
    if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'لا استجابة');
    state = rep.data;
    renderPage(currentPage);
    toast('📡 تم تحميل إعدادات السيرفر');
  } catch (e) {
    toast('❌ ' + e.message, 'err');
    state = null;
    $('#dash-main').innerHTML = '<div class="loading">تعذر الاتصال بالبوت — تأكد أن البوت شغال وأن مفتاح الجسر صحيح</div>';
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
  wireFx(main);
}

async function refreshState() {
  try {
    const rep = await api.bridgeCommand({ type: 'state', userId: session.user.id, guildId: currentGuild.id });
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
          <option value="">— اختر الروم —</option>
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
    <div class="grid-actions">
      <button class="act-btn" data-save="welcome"><span class="big-emoji">💾</span> حفظ إعدادات الترحيب</button>
    </div>`;
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
      const rep = await api.bridgeCommand({ type: 'setWelcome', userId: session.user.id, guildId: currentGuild.id, welcome: w2 });
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
    <div class="grid-actions">
      <button class="act-btn" data-save="ticket"><span class="big-emoji">💾</span> حفظ اللوحة</button>
      <button class="act-btn" data-send="ticket"><span class="big-emoji">📨</span> إرسال اللوحة لروم</button>
    </div>`;
  main.querySelectorAll('[data-type-id]').forEach((sw) => {
    sw.addEventListener('change', async () => {
      try {
        const rep = await api.bridgeCommand({ type: 'setTicketTypeEnabled', userId: session.user.id, guildId: currentGuild.id, typeId: sw.dataset.typeId, enabled: sw.checked });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast(sw.checked ? '✅ النوع ظاهر الآن' : '🙈 النوع مخفي الآن');
      } catch (e) { sw.checked = !sw.checked; toast('❌ ' + e.message, 'err'); }
    });
  });
  main.querySelectorAll('[data-del-id]').forEach((b) => {
    b.addEventListener('click', async () => {
      playSound('click');
      try {
        const rep = await api.bridgeCommand({ type: 'delTicketType', userId: session.user.id, guildId: currentGuild.id, typeId: b.dataset.delId });
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
      const rep = await api.bridgeCommand({ type: 'addTicketType', userId: session.user.id, guildId: currentGuild.id, label });
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
      const rep = await api.bridgeCommand({ type: 'setTicketPanel', userId: session.user.id, guildId: currentGuild.id, panel: p });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.ticket.panel = rep.data.panel;
      toast('✅ تم حفظ اللوحة');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
  main.querySelector('[data-send="ticket"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await api.bridgeCommand({ type: 'sendTicketPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
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
    <div class="grid-actions">
      <button class="act-btn" data-save="sugg"><span class="big-emoji">💾</span> حفظ الروم</button>
      <button class="act-btn" data-send="sugg"><span class="big-emoji">📨</span> إرسال لوحة الاقتراحات</button>
    </div>`;
  main.querySelector('[data-save="sugg"]').addEventListener('click', async () => {
    const channelId = main.querySelector('#sugg-ch').value;
    if (!channelId) { toast('❌ اختر الروم أولاً', 'err'); return; }
    try {
      const rep = await api.bridgeCommand({ type: 'setSuggestionsChannel', userId: session.user.id, guildId: currentGuild.id, channelId });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.suggestions.channelId = channelId;
      toast('✅ تم حفظ روم الاقتراحات');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
  main.querySelector('[data-send="sugg"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await api.bridgeCommand({ type: 'sendSuggestionsPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
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
        const rep = await api.bridgeCommand({ type: 'sendTicketPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
        if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
        toast('✅ تم الإرسال!');
      } catch (e) { toast('❌ ' + e.message, 'err'); }
    });
  });
  main.querySelector('[data-send="ss"]').addEventListener('click', () => {
    openChannelPicker(async (channelId) => {
      try {
        const rep = await api.bridgeCommand({ type: 'sendSuggestionsPanel', userId: session.user.id, guildId: currentGuild.id, channelId });
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
      const rep = await api.bridgeCommand({ type: 'setStaffRoles', userId: session.user.id, guildId: currentGuild.id, roleIds: ids });
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
      const rep = await api.bridgeCommand({ type: 'setAutoRoles', userId: session.user.id, guildId: currentGuild.id, autoRoles: ar2 });
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
      </div>
    </div>
    <p style="color:var(--muted); font-size:12px; margin-top:14px;">💡 شعار البوت يُدار عادة من لوحة ديسكورد (زر تغيير الشعار في صفحة النظام).</p>`;
  main.querySelector('#save-color').addEventListener('click', async () => {
    const hex = main.querySelector('#brand-color').value.replace('#', '');
    const color = parseInt(hex, 16);
    try {
      const rep = await api.bridgeCommand({ type: 'setColor', userId: session.user.id, guildId: currentGuild.id, color });
      if (!rep || !rep.ok) throw new Error((rep && rep.error) || 'فشل');
      state.color = rep.data.color;
      toast('✅ تم حفظ اللون');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  });
}

function colorToHex(num) {
  const n = Number(num) || 0;
  return '#' + ((n >> 16) & 255).toString(16).padStart(2, '0') + ((n >> 8) & 255).toString(16).padStart(2, '0') + (n & 255).toString(16).padStart(2, '0');
}

init();