const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');
const { config } = require('../config');

let clientRef = null;

const spamState = new Map();
const eventCounters = new Map(); // "guildId:type" -> { count, firstAt }
const bannedWords = [
  // ═══════ كلمات جنسية عربية ═══════
  'كس', 'كسك', 'كسها', 'كسه', 'كسكك', 'كسكم', 'كسكمم', 'كس أم', 'كس ام',
  'زب', 'زبك', 'زبها', 'زبه', 'زبي', 'زبكك', 'زبكم',
  'طيز', 'طيزك', 'طيزها', 'طيزه', 'طيزي', 'طيزكم',
  'شرموط', 'شرموطة', 'شرموته', 'شرموتي', 'شرموطه', 'شرمёт', 'شراميط',
  'قحب', 'قحبة', 'قحبه', 'قحبات', 'قحاب', 'مقحب', 'مقحبة', 'مقحبه',
  'نييك', 'نيك', 'نيكة', 'نيكه', 'متنك', 'متناك', 'متناكه', 'نييكة', 'يانيك', 'ينيك',
  'منيوك', 'منيوكه', 'منيوكين', 'منيك', 'منيكة',
  'عاهر', 'عاهرة', 'عاهره', 'عاهرات', 'عهر',
  'لوطي', 'لوطية', 'لواط', 'مقまح', 'قماص',
  // ═══════ زنا وزانية ═══════
  'زنا', 'زاني', 'زانية', 'زني', 'زنى', 'زانى',
  'ولد الزنا', 'بنت الزنا', 'ابن الزنا', 'بنت الزاني',
  ' xb ',
  // ═══════ ولد + إهانات ═══════
  'ولد كلب', 'ولد الحمار', 'ولد الخنزير', 'بنت كلب',
  // ═══════ كلمات جنسية + إباحية إنجليزية ═══════
  'anal', 'analingus', 'anus',
  'ass', 'asshole', 'assmunch', 'asswipe',
  'bastard', 'bastardo',
  'bdsm',
  'bitch', 'bitches', 'bitchy', 'bitchass',
  'blowjob', 'blow job', 'blumpkin', 'bollocks',
  'bondage', 'boner',
  'boob', 'boobs', 'booty call', 'busty',
  'bullshit',
  'butthole', 'buttcheeks', 'butt',
  'camel toe', 'camgirl', 'camslut', 'camwhore',
  'clit', 'clitoris', 'clusterfuck',
  'cock', 'cocks', 'cocksucker',
  'creampie',
  'cum', 'cumming', 'cumshot', 'cumshots', 'cunt', 'cunts', 'cunty',
  'deepthroat', 'deep throat',
  'dick', 'dickhead', 'dicks', 'dickface',
  'dildo',
  'doggy style', 'doggystyle',
  'domination', 'dominatrix',
  'double penetration',
  'ejaculation', 'erotic', 'erotism', 'escort',
  'fag', 'faggot', 'faggots', 'fags', 'faggy',
  'fellatio', 'femdom',
  'fingerbang', 'fingering', 'fisting',
  'footjob', 'foot fetish',
  'fuck', 'fucker', 'fucking', 'fucked', 'motherfucker', 'fuckboy', 'fuckface', 'fuckin', 'fucktards',
  'gangbang', 'gang bang', 'gay sex',
  'genitals', 'giant cock',
  'golden shower', 'gokkun',
  'handjob', 'hand job', 'hardcore', 'hard core',
  'hentai', 'homoerotic', 'honkey', 'hooker', 'horny',
  'incest', 'intercourse',
  'jack off', 'jailbait', 'jail bait', 'jerk off',
  'jizz', 'juggs',
  'kinky',
  'lolita', 'lovemaking',
  'masturbate', 'masturbating', 'masturbation',
  'milf', 'missionary position',
  'motherfucker',
  'nigga', 'niggas', 'nigger', 'niggers', 'nig nog',
  'nipple', 'nipples', 'nsfw', 'nude', 'nudity',
  'nympho', 'nymphomania',
  'orgasm', 'orgy',
  'paedophile', 'pedophile', 'pedobear',
  'penis', 'panties', 'panty',
  'piss', 'pissing', 'piss pig',
  'playboy', 'poof', 'poon', 'poontang',
  'porn', 'porno', 'pornography',
  'pussy', 'pussies', 'pusy',
  'queef', 'rape', 'raping', 'rapist', 'rectum',
  'rimjob', 'rimming',
  'semen', 'sex', 'sexcam', 'sexual', 'sexually', 'sexuality',
  'shemale',
  'shit', 'shitblimp', 'shitty',
  'slut', 'sluts', 'slutty', 'smut', 'snatch',
  'sodomy', 'sodomize',
  'spunk', 'strapon', 'strip club',
  'suck', 'sucks',
  'swastika', 'swinger',
  'threesome',
  'tit', 'tits', 'titties', 'titty',
  'topless', 'tosser', 'tranny', 'twat',
  'vagina', 'viagra', 'vibrator', 'vulva',
  'voyeur',
  'wanker', 'wank', 'whore',
  'xxx',
  // ═══════ إهانات +种族ية إنجليزية ═══════
  'beaner', 'beaners',
  'coon', 'coons',
  'darkie',
  'jigaboo', 'jiggaboo', 'jiggerboo',
  'kike',
  'mong',
  'negro',
  'neonazi',
  'paki', 'pikey',
  'raghead',
  'spic', 'spastic',
  'slanteye',
  'towelhead',
  'wetback',
  'white power',
  'retard', 'retarded', 'retards',
  'moron', 'morons',
  'idiot', 'idiots', 'idiotic',
  'stupid', 'stupidity',
  'dumbass', 'dumb',
  'scum', 'scumbag',
  'trash', 'garbage',
  'psycho',
  // ═══════ إهانات عربية ═══════
  'ابن الكلب', 'ابن كلب', 'ابنالكلب', 'ولد كلب', 'ولدالكلب',
  'كلب', 'كلبة', 'كلبه', 'كلاب', 'كلابه',
  'خنزير', 'خنازير', 'خنزيره',
  'حمار', 'حماره', 'حمارك', 'جحش', 'جحشه', 'بغل',
  'غبي', 'غبية', 'غبيه', 'غبيين', 'اغبي',
  'حقير', 'حقيرة', 'حقيره', 'حقاره',
  'تافه', 'تافهه', 'تافهين',
  'وسخ', 'وسخه', 'وسخين', 'وسخة',
  'فاشل', 'فاشله', 'فاشلين', 'فاشلة',
  'قذر', 'قذره', 'قذرين', 'انسان قذر', 'انسان قذرة',
  'مخلف', 'مختل', 'مجنون', 'مجنونه', 'مخبول', 'مخبوله', 'خبل', 'خبله',
  'اهبل', 'احمق', 'احمقه',
  'نذل', 'نذله', 'نذلين', 'خسيس', 'خسيسه',
  'حثاله', 'حثالة', 'خايس', 'خايسه',
  'زفت', 'تبن', 'دود', 'حشرة', 'حشرات',
  'خروف', 'خرفان',
  'ساقط', 'ساقطه', 'ساقطين',
  // ═══════ إنجليزي معرب (Arabizi) — أرقام بدل حروف عربية ═══════
  // mappings: 3=ع, 7=ح, 5=خ, 8=ق, 9=ص, 6=ط, 2=ء/أ
  '87b', '87bh', '87ba', '87bt', '87b4',
  '6rby', '6rba',
  'ks', 'ksk', 'kssek', 'kss', 'kssk', 'ksskm',
  'amk', 'amkk', 'amkm',
  'klb', 'klba', 'klb4',
  '7mar', '7mara',
  't5on', 't5ona',
  'zbeni', 'zab', 'zbi', 'zbe', 'zabi', 'zaby', 'zbk', 'zby',
  'tiz', 'tizk', 'tizkk', 'tizkm',
  'sharmouta', 'sharmuta', 'shrmouta', 'shrmwta',
  'jahish', 'jahsha',
  'fashel', 'fashla',
  'ghabi', 'ghabya', 'ghaby',
  // ═══════ اختصارات بذيئة ═══════
  'mf', 'stfu', 'gtfo', 'kys', 'pos', 'dafuq',
];

function getProtection(guildId) {
  const g = require('../guildCfg').get(guildId);
  return g.protection || {};
}

// ═══════════ تطبيع النص لكشف التحايل (f-u-c-k / fuuuck / f0ck / ك-س) ═══════════
const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'l', '0': 'o' };
function normalizeText(text) {
  if (!text) return '';
  let t = String(text).toLowerCase().trim();
  // إزالة كل الرموز غير الحروف/الأرقام (فواصل، شرط، نقاط، إيموجي...)
  t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  // استبدال الأرقام المشابهة للحروف (l33t)
  t = t.replace(/[0134578@$!|]/g, (c) => LEET_MAP[c] || c);
  // إزالة التكرار (fuuuck → fuck)
  t = t.replace(/(\p{L})\1{2,}/gu, '$1$1');
  // تطبيع عربي: ة/ه، ي/ى، أ/إ/آ/ا
  t = t.replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[أإآ]/g, 'ا');
  // إزالة الفراغات بين حروف الكلمة (f u c k → fuck) — نزيل الفراغ بين الأحرف العربية/اللاتينية المتتالية
  t = t.replace(/ +/g, ' ');
  return t;
}

// هل النص يحتوي كلمة محظورة (مع كشف التحايل)
function containsBannedWord(text, words) {
  if (!text) return false;
  const norm = normalizeText(text);
  const normNoSpace = norm.replace(/ /g, '');
  for (const w of words || []) {
    const wl = String(w).toLowerCase().trim();
    if (!wl) continue;
    if (norm.includes(wl)) return true;
    if (normNoSpace.includes(wl.replace(/ /g, ''))) return true;
  }
  return false;
}

function countEvent(guildId, type, windowSec) {
  const key = `${guildId}:${type}`;
  const now = Date.now();
  const st = eventCounters.get(key) || { count: 0, firstAt: now };
  if (now - st.firstAt > (windowSec || 10) * 1000) { st.count = 0; st.firstAt = now; }
  st.count++;
  eventCounters.set(key, st);
  return st.count;
}

async function fetchExecutor(guild, actionType, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type: actionType });
    const entry = logs.entries.first();
    if (!entry) return null;
    if (targetId && entry.target && entry.target.id !== targetId) return null;
    return entry.executor || null;
  } catch { return null; }
}

function isBypassed(guild, executor) {
  if (!executor) return false;
  if (clientRef && executor.id === clientRef.user.id) return true; // البوت نفسه ليس مخالفاً
  if (executor.id === guild.ownerId) return true;
  const g = require('../guildCfg').get(guild.id);
  const bypass = (g.protectionBypassRoles || []).concat(g.protection?.bypassRoles || []);
  return bypass.some(rid => executor.roles?.cache?.has(rid));
}

function isAdminOrStaff(guild, member) {
  if (!member) return false;
  if (member.permissions?.has('Administrator') || member.permissions?.has('ManageGuild')) return true;
  const g = require('../guildCfg').get(guild.id);
  return (g.staffRoles || []).some(rid => member.roles?.cache?.has(rid));
}

async function punish(guild, executor, action, reason) {
  if (!executor) return;
  if (isBypassed(guild, executor)) return;
  try {
    if (action === 'ban') await guild.members.ban(executor.id, { reason });
    else await guild.members.kick(executor.id, reason);
  } catch (err) { log.warn('فشل تنفيذ العقوبة: ' + err.message); }
}

async function sendSecurityLog(guild, title, fields, color = 'Red') {
  const g = require('../guildCfg').get(guild.id);
  const channelId = (g.logChannels || {}).security;
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return;
  const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
  (fields || []).forEach(f => embed.addFields(f));
  await ch.send({ embeds: [embed] }).catch(() => {});
}

async function notifyOwner(guild, subject, lines) {
  const ownerId = (config.owners || [])[0];
  if (!ownerId || !clientRef) return;
  try {
    const owner = await clientRef.users.fetch(ownerId);
    const embed = new EmbedBuilder()
      .setTitle(subject)
      .setColor('Red')
      .setDescription(lines.join('\n'))
      .setTimestamp();
    await owner.send({ embeds: [embed] }).catch(() => {});
  } catch { /* تجاهل */ }
}

async function checkProtectedRoles(member, roleId) {
  const guild = member.guild;
  const guildCfg = require('../guildCfg').get(guild.id);
  const protectedRoles = guildCfg.protectedRoles || [];
  if (!protectedRoles.includes(roleId)) return false;
  const isOwner = member.id === guild.ownerId;
  const bypass = (guildCfg.protectionBypassRoles || []).some(r => member.roles.cache.has(r));
  if (isOwner || bypass) return false;
  const action = guildCfg.protectionAction || 'kick';
  if (action === 'kick') { try { await member.kick('أعطى رتبة محمية'); } catch {} }
  else if (action === 'ban') { try { await member.ban({ reason: 'أعطى رتبة محمية' }); } catch {} }
  const embed = new EmbedBuilder()
    .setTitle('🚨 محاولة إعطاء رتبة محمية!')
    .setColor('Red')
    .setDescription(`**المخالف:** ${member.user.tag} (<@${member.id}>)\n**العقوبة:** ${action}`)
    .setTimestamp();
  const logChannel = (guildCfg.logChannels || {}).protectedRoleViolation ? guild.channels.cache.get(guildCfg.logChannels.protectedRoleViolation) : null;
  if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
  log.warn(`محاولة إعطاء رتبة محمية من ${member.user.tag} — ${action}`);
  return true;
}

async function handleMessageSecurity(message) {
  if (!message.guild || message.author.bot) return;
  const guildCfg = require('../guildCfg').get(message.guild.id);
  const prot = getProtection(message.guild.id);
  const cfg = db.securityCfg.get(message.guild.id);
  const am = prot.automod || {};
  const member = message.member;
  const isMod = isAdminOrStaff(message.guild, member) || member?.permissions?.has('ManageMessages');
  const content = (message.content || '').toLowerCase();

  // 🛡️ فلتر @everyone / @here
  if (am.enabled && am.everyone && !isMod && /@everyone|@here/.test(content)) {
    try { await message.delete().catch(() => {}); } catch {}
    await sendSecurityLog(message.guild, '🚫 تم حذف رسالة فيها @everyone', [
      { name: 'العضو', value: `${member?.user?.tag || '?'} (<@${message.author.id}>)` },
      { name: 'القناة', value: `<#${message.channel.id}>` },
    ]);
    return;
  }

  // 🔗 فلتر الروابط
  if (am.enabled && am.links && !isMod && /(https?:\/\/|discord\.gg|invite\.gg)/i.test(content)) {
    try { await message.delete().catch(() => {}); } catch {}
    await sendSecurityLog(message.guild, '🔗 تم حذف رسالة فيها رابط', [
      { name: 'العضو', value: `${member?.user?.tag || '?'} (<@${message.author.id}>)` },
      { name: 'القناة', value: `<#${message.channel.id}>` },
    ]);
    return;
  }

  // 💬 فلتر السب (كل الأعضاء حتى الإدارة — حماية البوت من الباند)
  const swearProt = prot.swearWords || {};
  if (swearProt.enabled && containsBannedWord(content, bannedWords.concat(prot.customWords || []))) {
    const severity = prot.swearWords?.severity || 'delete';
    try { await message.delete().catch(() => {}); } catch {}
    if (severity === 'mute') {
      try { await member.timeout(60 * 1000, 'سب - فلتر ذكي'); } catch {}
    } else if (severity === 'warn') {
      try { await message.author.send({ content: '⚠️ رسالتك في سيرفر ' + message.guild.name + ' تحتوي على كلمات غير لائقة — الرجاء الالتزام بقوانين السيرفر.' }).catch(() => {}); } catch {}
    }
    await sendSecurityLog(message.guild, '💢 تم حذف رسالة فيها سب (كشف تحايل)', [
      { name: 'العضو', value: `${member?.user?.tag || '?'} (<@${message.author.id}>)` },
      { name: 'القناة', value: `<#${message.channel.id}>` },
      { name: 'الرسالة', value: (message.content || '').slice(0, 200) || '—' },
    ]);
    return;
  }

  // 🚀 كشف السبام
  const spamOn = am.spam !== undefined ? am.spam : cfg.spam_enabled;
  if (spamOn && !isMod) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const state = spamState.get(key) || { count: 0, first: now };
    if (now - state.first > cfg.spam_window * 1000) { state.count = 0; state.first = now; }
    state.count++;
    spamState.set(key, state);

    if (state.count >= cfg.spam_max_messages) {
      try {
        await message.delete().catch(() => {});
        const duration = cfg.spam_timeout * 1000;
        await member.timeout(duration, 'سبام - الحماية التلقائية');
        const embed = new EmbedBuilder()
          .setTitle('🚫 تم كتم العضو تلقائياً (سبام)')
          .setColor('Red')
          .addFields(
            { name: 'العضو', value: member.user.tag },
            { name: 'المدة', value: `${cfg.spam_timeout} دقيقة` },
          )
          .setTimestamp();
        const logChannel = (guildCfg.logChannels || {}).security ? message.guild.channels.cache.get(guildCfg.logChannels.security) : null;
        if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
        log.warn(`كتم سبام لـ ${member.user.tag}`);
      } catch (err) { log.warn('فشل كتم السبام: ' + err.message); }
      spamState.delete(key);
    }
  }
}

async function handleBotJoin(member) {
  if (!member.user.bot) return;
  const guildCfg = require('../guildCfg').get(member.guild.id);
  const prot = getProtection(member.guild.id);
  if (!(prot.bot || {}).enabled) return;
  const isOwner = member.id === member.guild.ownerId;
  const bypass = (guildCfg.protectionBypassRoles || []).some(r => member.roles.cache.has(r));
  if (isOwner || bypass) return;
  try {
    await member.kick('دخول بوت غير مصرح');
    const embed = new EmbedBuilder()
      .setTitle('🚨 تم طرد بوت غير مصرح!')
      .setColor('Red')
      .setDescription(`**البوت:** ${member.user.tag} (<@${member.id}>)`)
      .setTimestamp();
    const logChannel = (guildCfg.logChannels || {}).security ? member.guild.channels.cache.get(guildCfg.logChannels.security) : null;
    if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
    log.warn(`طرد بوت: ${member.user.tag}`);
  } catch (err) { log.warn('فشل طرد البوت: ' + err.message); }
}

// ═══════════ حماية حذف الرومات ═══════════
async function rollbackChannel(channel) {
  try {
    const copy = await channel.clone({ name: channel.name, reason: 'استرجاع روم محذوف (حماية)' });
    // إرجاع الروم إلى نفس الفئة (Category)
    if (channel.parentId) await copy.setParent(channel.parentId, { lockPermissions: true }).catch(() => {});
    // نسخ الرتب (permission overwrites) للروم المسترجع
    for (const [id, ov] of channel.permissionOverwrites.cache) {
      try { await copy.permissionOverwrites.create(id, { allow: ov.allow, deny: ov.deny }); } catch {}
    }
    return copy;
  } catch (err) { log.warn('فشل استرجاع الروم: ' + err.message); return null; }
}

async function handleChannelDelete(channel) {
  const guild = channel.guild;
  const prot = getProtection(guild.id);
  const cfg = prot.channelDelete || {};
  if (!cfg.enabled) return;
  const executor = await fetchExecutor(guild, 'CHANNEL_DELETE', channel.id);
  if (isBypassed(guild, executor)) return;

  const reqRole = cfg.requiredRole || '';
  const hasReqRole = !reqRole || (executor?.roles?.cache?.has(reqRole) ?? false);
  const count = countEvent(guild.id, 'channelDelete', cfg.window || 10);

  const shouldPunish = count >= (cfg.threshold || 3) || !hasReqRole;
  if (!shouldPunish) return;

  await rollbackChannel(channel);
  await punish(guild, executor, cfg.action || 'kick', 'حذف رومات متعدد/غير مصرح');
  await sendSecurityLog(guild, '🚨 حماية حذف الرومات', [
    { name: 'المخالف', value: `${executor?.user?.tag || '?'} (<@${executor?.id || '?'}>)` },
    { name: 'الروم المحذوف', value: channel.name },
    { name: 'العقوبة', value: (cfg.action || 'kick') === 'ban' ? 'باند' : 'طرد' },
  ]);
  log.warn(`حذف روم بواسطة ${executor?.user?.tag || '?'} — عقوبة ${cfg.action || 'kick'}`);
}

// ═══════════ حماية التدمير الشامل (Nuke) ═══════════
const LOCKED = new Map(); // guildId -> { everyonePerms, channelOverwrites: [{id, overwrite}] }
async function lockServer(guild) {
  if (LOCKED.has(guild.id)) return; // مقفول سابقاً
  try {
    const everyone = guild.roles.everyone;
    const prevPerms = everyone.permissions;
    await everyone.setPermissions([]).catch(() => {});
    const channelOverwrites = [];
    for (const ch of guild.channels.cache.values()) {
      if (!ch.permissionOverwrites) continue;
      const ov = ch.permissionOverwrites.cache.get(guild.id);
      channelOverwrites.push({ id: ch.id, deny: ov?.deny || 0n });
      await ch.permissionOverwrites.create(everyone, { SendMessages: false, AddReactions: false, CreateInstantInvite: false }).catch(() => {});
    }
    LOCKED.set(guild.id, { everyonePerms: prevPerms, channelOverwrites });
    log.warn(`🔒 تم قفل السيرفر ${guild.name} مؤقتاً (هجوم تدمير)`);
    // فتح تلقائي بعد 10 دقائق
    setTimeout(() => unlockServer(guild), 10 * 60 * 1000).unref?.();
  } catch (err) { log.warn('فشل قفل السيرفر: ' + err.message); }
}

async function unlockServer(guild) {
  const data = LOCKED.get(guild.id);
  if (!data) return;
  try {
    await guild.roles.everyone.setPermissions(data.everyonePerms).catch(() => {});
    for (const { id } of data.channelOverwrites) {
      const ch = guild.channels.cache.get(id);
      if (ch?.permissionOverwrites) await ch.permissionOverwrites.get(guild.id)?.delete().catch(() => {});
    }
  } catch (err) { log.warn('فشل فتح السيرفر: ' + err.message); }
  LOCKED.delete(guild.id);
  log.ok(`🔓 تم فتح السيرفر ${guild.name}`);
}

async function handleNukeEvent(guild, executor, label, auditType) {
  const prot = getProtection(guild.id);
  const cfg = prot.nuke || {};
  if (!cfg.enabled) return;
  if (!executor && auditType) executor = await fetchExecutor(guild, auditType);
  if (isBypassed(guild, executor)) return;
  const count = countEvent(guild.id, 'nuke', cfg.window || 20);
  if (count < (cfg.threshold || 8)) return;

  await lockServer(guild);
  await punish(guild, executor, cfg.action || 'kick', 'تدمير شامل للسيرفر');
  await sendSecurityLog(guild, '☢️ هجوم تدمير شامل!', [
    { name: 'المخالف', value: `${executor?.user?.tag || '?'} (<@${executor?.id || '?'}>)` },
    { name: 'العملية', value: label },
    { name: 'عدد العمليات', value: count + ' خلال ' + (cfg.window || 20) + ' ثانية' },
  ]);
  log.warn(`هجوم تدمير في ${guild.name} — عقوبة ${cfg.action || 'kick'}`);
}

// ═══════════ حماية الباند الجماعي ═══════════
async function handleBanAdd(guild, user) {
  const prot = getProtection(guild.id);
  const cfg = prot.ban || {};
  if (!cfg.enabled) return;
  const executor = await fetchExecutor(guild, 'MEMBER_BAN_ADD', user.id);
  if (isBypassed(guild, executor)) return;
  const count = countEvent(guild.id, 'ban', cfg.window || 10);
  if (count < (cfg.threshold || 3)) return;

  await punish(guild, executor, cfg.action || 'kick', 'باند جماعي');
  await sendSecurityLog(guild, '⛔ حماية الباند الجماعي', [
    { name: 'المخالف', value: `${executor?.user?.tag || '?'} (<@${executor?.id || '?'}>)` },
    { name: 'عدد العمليات', value: count + ' خلال ' + (cfg.window || 10) + ' ثانية' },
  ]);
}

// ═══════════ حماية الطرد الجماعي ═══════════
async function handleKick(guild, user) {
  const prot = getProtection(guild.id);
  const cfg = prot.kick || {};
  if (!cfg.enabled) return;
  const executor = await fetchExecutor(guild, 'MEMBER_KICK', user.id);
  if (!executor) return; // ليس طرداً (خروج عادي/باند) — لا نعدّه
  if (isBypassed(guild, executor)) return;
  const count = countEvent(guild.id, 'kick', cfg.window || 10);
  if (count < (cfg.threshold || 3)) return;

  await punish(guild, executor, cfg.action || 'kick', 'طرد جماعي');
  await sendSecurityLog(guild, '👢 حماية الطرد الجماعي', [
    { name: 'المخالف', value: `${executor?.user?.tag || '?'} (<@${executor?.id || '?'}>)` },
    { name: 'عدد العمليات', value: count + ' خلال ' + (cfg.window || 10) + ' ثانية' },
  ]);
}

// ═══════════ حماية حذف الرتب ═══════════
async function rollbackRole(role) {
  try {
    const copy = await role.clone({ name: role.name, reason: 'استرجاع رتبة محذوفة (حماية)' });
    if (role.color) await copy.setColor(role.color).catch(() => {});
    if (role.hoist) await copy.setHoist(true).catch(() => {});
    if (role.mentionable) await copy.setMentionable(true).catch(() => {});
    return copy;
  } catch (err) { log.warn('فشل استرجاع الرتبة: ' + err.message); return null; }
}

async function handleRoleDelete(role) {
  const guild = role.guild;
  const prot = getProtection(guild.id);
  const cfg = prot.roleDelete || {};
  if (!cfg.enabled) return;
  const executor = await fetchExecutor(guild, 'ROLE_DELETE', role.id);
  if (isBypassed(guild, executor)) return;
  const count = countEvent(guild.id, 'roleDelete', cfg.window || 10);
  if (count < (cfg.threshold || 3)) return;

  await rollbackRole(role);
  await punish(guild, executor, cfg.action || 'kick', 'حذف رتب متعدد');
  await sendSecurityLog(guild, '🎭 حماية حذف الرتب', [
    { name: 'المخالف', value: `${executor?.user?.tag || '?'} (<@${executor?.id || '?'}>)` },
    { name: 'الرتبة المحذوفة', value: role.name },
  ]);
}

// ═══════════ حماية الويبهوك ═══════════
async function handleWebhookCreate(channel) {
  const guild = channel.guild;
  const prot = getProtection(guild.id);
  const cfg = prot.webhook || {};
  if (!cfg.enabled) return;
  const executor = await fetchExecutor(guild, 'WEBHOOK_CREATE');
  if (!executor) return; // ليس إنشاء ويبهوك (تعديل/حذف) — لا نعدّه
  if (isBypassed(guild, executor)) return;
  try {
    const whs = await channel.fetchWebhooks();
    const newWh = whs.first();
    if (newWh) await newWh.delete('ويبهوك غير مصرح');
  } catch {}
  await punish(guild, executor, cfg.action || 'kick', 'إنشاء ويبهوك');
  await sendSecurityLog(guild, '🪝 حماية الويبهوك', [
    { name: 'المخالف', value: `${executor?.user?.tag || '?'} (<@${executor?.id || '?'}>)` },
    { name: 'الروم', value: `<#${channel.id}>` },
  ]);
}

// ═══════════ فحص السب في النصوص المرسلة من التطبيق (رسائل/ثيمات) ═══════════
function containsSwear(text) {
  if (!text) return false;
  return containsBannedWord(text, bannedWords);
}

async function checkSwearAndNotify(guild, text) {
  if (!containsSwear(text)) return false;
  await notifyOwner(guild, '💢 محاولة إرسال رسالة فيها سب من لوحة التحكم', [
    `**السيرفر:** ${guild.name} (\`${guild.id}\`)`,
    `**النص الذي حاول إرساله:** ${String(text).slice(0, 200)}`,
    '',
    'تم منع الإرسال حفاظاً على البوت من المخالفة.',
  ]);
  return true;
}

// ═══════════ التعلم من قرارات المودرز ═══════════
// المود يضع تفاعل 🚫 على رسالة مخالفة لم يكتشفها الفلتر → نضيف كلماتها البارزة للقائمة المخصصة
async function learnFromReaction(reaction, user) {
  try {
    const guild = reaction.message.guild;
    if (!guild) return;
    if (!['🚫', '❌', '⛔'].includes(reaction.emoji.name)) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    if (!isAdminOrStaff(guild, member)) return;
    if (user.id === reaction.message.author?.id) return;
    const text = reaction.message.content || '';
    if (!text || text.length < 6) return;
    const g = require('../guildCfg').get(guild.id);
    const custom = g.protection?.customWords || g.protection?.learnedWords || [];
    // كلمات بارزة (3 أحرف فأكثر) لم يسبق وجودها
    const words = normalizeText(text).split(/\s+/).filter(w => w.length >= 3 && !bannedWords.includes(w) && !custom.includes(w));
    if (!words.length) return;
    const merged = Array.from(new Set([...custom, ...words])).slice(0, 60);
    const prot = g.protection || {};
    require('../guildCfg').set(guild.id, { protection: { ...prot, customWords: merged } });
    await sendSecurityLog(guild, '🧠 تعلم البوت كلمات جديدة من قرار المود', [
      { name: 'الرسالة', value: text.slice(0, 120) },
      { name: 'الكلمات المضافة', value: words.join('، ').slice(0, 200) },
      { name: 'بواسطة', value: user.tag },
    ]);
  } catch (err) { log.warn('فشل التعلم من التفاعل: ' + err.message); }
}

module.exports = {
  handleMessageSecurity, handleBotJoin, checkProtectedRoles, spamState,
  handleChannelDelete, handleNukeEvent, handleBanAdd, handleKick,
  handleRoleDelete, handleWebhookCreate, containsSwear, checkSwearAndNotify,
  normalizeText, containsBannedWord, learnFromReaction,
  setClient: (c) => { clientRef = c; },
};