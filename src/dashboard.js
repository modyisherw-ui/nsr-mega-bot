const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const log = require('./utils/logger');
const db = require('./db');
const guildCfg = require('./guildCfg');
const { systemRows } = require('./modules/adminPanel');
const { getProducts, findProduct, saveRatingConfig } = require('./modules/ratings');
const { messagesEmbed, messagesRows } = require('./modules/messages');

const PAGES = {
  logs: { emoji: '📋', name: 'نظام اللوقات', desc: 'يراقب كل أحداث السيرفر: دخول/خروج الأعضاء، حذف/تعديل الرسائل، الرياكشنات، الفويس، الرتب، القنوات، الباند والطرد، والرتب المحمية.', commands: ['عدّل رومات اللوقات مباشرة من هذه الصفحة عبر القوائم بالأسفل'] },
  autoroles: { emoji: '🤖', name: 'الرولات التلقائية', desc: 'رتبة تُعطى تلقائياً عند دخول الأعضاء، ورتبة تُعطى لكل بوت يدخل السيرفر.', commands: ['اختر الرتبة المطلوبة من القوائم بالأسفل، ويتم الحفظ فوراً'] },
  welcome: { emoji: '👋', name: 'نظام الترحيب', desc: 'رسالة ترحيب تلقائية للأعضاء الجدد: اختر الروم أو الخاص، اكتب الرسالة، أضف صورة، وحدد محتواها.', commands: ['اختر **الروم** من القائمة بالأسفل', '✏️ عدّل **الرسالة** (كلمات: {user} منشن العضو، {count} رقم العضو)', '🖼️ ضع **صورة/بنر** للرسالة', '📩 اختر **خاص أو روم** للاستقبال'] },
  ratings: { emoji: '🛍️', name: 'المنتجات والتقييمات', desc: 'أضف منتجاتك مع رول كل منتج، وحدد روم التقييمات. ثم استخدم `/rate @عميل` ليرسل البوت رسالة تقييم للعميل على الخاص (عربي/إنجليزي + نجوم + رسالة + نشر التقييم في الروم).', commands: ['اضغط **إضافة منتج** لإنشاء منتج وربط روله', 'اضبط **روم التقييمات** من القائمة بالأسفل', 'ثم نفّذ: `/rate @user` واكتب اسم المنتج'] },
  suggestions: { emoji: '💡', name: 'نظام الاقتراحات', desc: 'زر تقديم اقتراح — الاقتراح يوصل للمالك على الخاص + روم يحدده الأدمن من هنا.', commands: ['اختر **روم الاقتراحات** من القائمة بالأسفل', 'زر اللوحة يشتغل تلقائياً', '`/suggestions panel` — إرسال اللوحة'] },
  system: { emoji: '⚙️', name: 'نظام الإدارة', desc: 'أدوات إدارية سريعة بالأزرار:\n\n**📋 إمبد** — إرسال إمبد.\n**📜 الأوامر** — قائمة الأوامر الكاملة وصلاحياتها.\n**📢 رسالة** — إرسال رسالة باسم البوت.\n**👮 رتبة الإدارة** — إدارة رتب الإدارة.', commands: [] },
  messages: { emoji: '💬', name: 'نظام الرسائل', desc: 'أرسل رسائل خاصة للأعضاء: رسالة، استدعاء، شكر، أو عرض خاص.\n\n> هناك تهدئة دقيقة واحدة بين كل رسالة لنفس الشخص.', commands: ['اختر نوع الرسالة من الأزرار بالأسفل ثم اكتب المعرّف والنص'] },
  tickets: { emoji: '🎫', name: 'نظام التذاكر', desc: 'تذاكر دعم خاصة باختيارات وأنواع، مع تقييم بعد الإغلاق وسجل نقل.', commands: ['`/ticket panel` — إرسال لوحة التذاكر', '`/ticket stats` — الإحصائيات', '`/ticket close` — إغلاق يدوي', '`/ticket add/remove` — إدارة الأعضاء'] },
  security: { emoji: '🛡️', name: 'نظام الأمان', desc: 'حماية من السبام، الرايد، النسف، والبوتات الخطرة مع مراقبة مستمرة.', commands: ['الحماية تعمل تلقائياً', '`/security status` — الحالة', '`/scan` — فحص شامل'] },
};

// أحداث اللوقات المتاحة للتعديل من اللوحة
const LOG_EVENTS = [
  { id: 'memberJoin', emoji: '✅', name: 'دخول عضو' },
  { id: 'memberLeave', emoji: '❌', name: 'خروج عضو' },
  { id: 'deleteMessage', emoji: '🗑️', name: 'حذف رسالة' },
  { id: 'editMessage', emoji: '✏️', name: 'تعديل رسالة' },
  { id: 'reactionAdd', emoji: '👍', name: 'إضافة رد فعل' },
  { id: 'reactionRemove', emoji: '👎', name: 'حذف رد فعل' },
  { id: 'mediaMessage', emoji: '📎', name: 'رسالة مرفق (صورة/فيديو)' },
  { id: 'voiceJoin', emoji: '🔊', name: 'دخول روم صوتي' },
  { id: 'voiceLeave', emoji: '🔇', name: 'خروج روم صوتي' },
  { id: 'voiceMove', emoji: '🔄', name: 'تنقل بين رومات صوتية' },
  { id: 'voiceStateChange', emoji: '🎙️', name: 'تغيير حالة المايك/الدفن' },
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

const pendingLogEvent = new Map(); // userId -> [eventIds]
const pendingLogChannel = new Map(); // userId -> channelId

// لون اللوحة يتبع لون السيرفر المخصص (embedColor) أو الأزرق الافتراضي
function panelColor(guild) {
  const c = guild && guild.id ? guildCfg.get(guild.id).embedColor : null;
  return c || 0x5865F2;
}

function saveLogChannels(guildId) {
  try {
    const g = guildCfg.get(guildId);
    // استبدال كامل بدل الدمج حتى تنجح عمليات الحذف (deepMerge لا يزيل مفاتيح موجودة)
    const stored = db.guildSettings.get(guildId) || {};
    stored.logChannels = g.logChannels || {};
    db.guildSettings.set(guildId, stored);
    guildCfg.set(guildId, { logChannels: stored.logChannels });
    // كتابة إلى config.json حتى تنجو الحذفات من إعادة تشغيل البوت
    // (data/bot.db غير متتبع في git وتُفقد في كل checkout جديد بالعملية)
    try {
      const fs2 = require('fs');
      const path2 = require('path');
      const fp = path2.join(__dirname, '..', 'config.json');
      const raw = JSON.parse(fs2.readFileSync(fp, 'utf8'));
      raw.logChannels = stored.logChannels;
      fs2.writeFileSync(fp, JSON.stringify(raw, null, 2));
    } catch (err2) {
      log.warn('فشل حفظ logChannels في config.json: ' + err2.message);
    }
  } catch (err) {
    log.warn('فشل حفظ إعدادات اللوقات: ' + err.message);
  }
}

function logsEmbed(client, guild) {
  const g = guildCfg.get(guild.id);
  const logChannels = g.logChannels || {};
  const lines = LOG_EVENTS.map(ev => {
    const ch = logChannels[ev.id];
    const channel = ch ? guild?.channels?.cache?.get(ch) : null;
    return `${ev.emoji} **${ev.name}:** ${channel ? `<#${channel.id}>` : '`غير محدد`'}`;
  });
  // الأحداث المستخدمة فعلياً (مربوطة بروم) — قائمة واضحة بالرومات
  const used = LOG_EVENTS.map(ev => ({ ev, ch: logChannels[ev.id] ? guild?.channels?.cache?.get(logChannels[ev.id]) : null }))
    .filter(x => x.ch);
  const usedList = used.length
    ? used.map(x => `${x.ev.emoji} **${x.ev.name}** → <#${x.ch.id}>`).join('\n')
    : 'لا توجد أحداث مربوطة بعد.';
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('📋 إعداد رومات اللوقات')
    .setDescription([
      'اختر الحدث من القوائم بالأسفل، ثم اختر القناة التي تصل إليه.',
      '',
      ...lines,
      '',
      '━━━━━━━━━━━━━━',
      '**📌 الأحداث المستخدمة حالياً في الرومات:**',
      usedList,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function logsRows(guild, state) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  const g = guildCfg.get(guild.id);
  const logChannels = g.logChannels || {};
  // الآن يدعم اختيار أكثر من حدث في نفس الوقت
  const selIds = state?.eventIds && state.eventIds.length ? state.eventIds : [];
  const sel = selIds.map(id => LOG_EVENTS.find(x => x.id === id)).filter(Boolean);
  const opts = LOG_EVENTS.map(ev => {
    const ch = logChannels[ev.id];
    const channel = ch ? guild?.channels?.cache?.get(ch) : null;
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${ev.emoji} ${ev.name}`)
      .setDescription(channel ? `الحالي: #${channel.name}` : 'غير محدد')
      .setValue(ev.id);
  });
  const evtSel = new StringSelectMenuBuilder()
    .setCustomId('bd_logs_evt')
    .setMinValues(1)
    .setMaxValues(LOG_EVENTS.length)
    .setPlaceholder(sel.length ? `✔ المحدد (${sel.length}): ${sel.map(s => s.emoji).join(' ')}` : '1) اختر الأحداث (يمكن أكثر من واحد)...')
    .addOptions(opts);
  const chSel = new ChannelSelectMenuBuilder()
    .setCustomId('bd_logs_channel')
    .setPlaceholder('2) اختر الروم...')
    .addChannelTypes(ChannelType.GuildText);
  const prefill = state?.channelId || (sel.length ? logChannels[sel[0].id] : null);
  if (prefill) {
    const ch = guild?.channels?.cache?.get(prefill);
    if (ch) chSel.setDefaultChannels([ch.id]);
  }
  const applyBtn = new ButtonBuilder().setCustomId('bd_logs_apply').setLabel('✅ تطبيق').setStyle(ButtonStyle.Success);
  const delBtn = new ButtonBuilder().setCustomId('bd_logs_delete').setLabel('🗑️ حذف الحدث').setStyle(ButtonStyle.Danger);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(evtSel),
    new ActionRowBuilder().addComponents(chSel),
    new ActionRowBuilder().addComponents(applyBtn, delBtn, backBtn),
  ];
}

async function handleLogsSelect(interaction) {
  const eventIds = interaction.values || [];
  const evs = eventIds.map(id => LOG_EVENTS.find(x => x.id === id)).filter(Boolean);
  if (!evs.length) return;
  pendingLogEvent.set(interaction.user.id, eventIds);
  await interaction.update({
    embeds: [logsEmbed(interaction.client, interaction.guild)],
    components: logsRows(interaction.guild, { eventIds, channelId: pendingLogChannel.get(interaction.user.id) }),
  });
}

async function handleLogsChannelSelect(interaction) {
  const channelId = interaction.values[0];
  if (!channelId) return;
  pendingLogChannel.set(interaction.user.id, channelId);
  await interaction.update({
    embeds: [logsEmbed(interaction.client, interaction.guild)],
    components: logsRows(interaction.guild, { eventIds: pendingLogEvent.get(interaction.user.id), channelId }),
  });
}

async function handleLogsApply(interaction) {
  const eventIds = pendingLogEvent.get(interaction.user.id) || [];
  const channelId = pendingLogChannel.get(interaction.user.id);
  const evs = eventIds.map(id => LOG_EVENTS.find(x => x.id === id)).filter(Boolean);
  if (!evs.length) {
    await interaction.reply({ content: '⚠️ اختر الأحداث أولاً من القائمة الأولى.', ephemeral: true });
    return;
  }
  if (!channelId) {
    await interaction.reply({ content: '⚠️ اختر الروم من القائمة الثانية.', ephemeral: true });
    return;
  }
  pendingLogEvent.delete(interaction.user.id);
  pendingLogChannel.delete(interaction.user.id);
  const g = guildCfg.get(interaction.guild.id);
  if (!g.logChannels) g.logChannels = {};
  for (const ev of evs) g.logChannels[ev.id] = channelId;
  saveLogChannels(interaction.guild.id);
  await interaction.update({ embeds: [logsEmbed(interaction.client, interaction.guild)], components: logsRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم ضبط **${evs.length}** أحداث: ${evs.map(ev => ev.emoji).join(' ')} <#${channelId}>`, ephemeral: true });
}

async function handleLogsDelete(interaction) {
  const eventIds = pendingLogEvent.get(interaction.user.id) || [];
  const evs = eventIds.map(id => LOG_EVENTS.find(x => x.id === id)).filter(Boolean);
  if (!evs.length) {
    await interaction.reply({ content: '⚠️ اختر الأحداث أولاً من القائمة الأولى.', ephemeral: true });
    return;
  }
  pendingLogEvent.delete(interaction.user.id);
  pendingLogChannel.delete(interaction.user.id);
  const g = guildCfg.get(interaction.guild.id);
  if (!g.logChannels) g.logChannels = {};
  const removedEvs = [];
  for (const ev of evs) {
    if (g.logChannels[ev.id]) {
      delete g.logChannels[ev.id];
      removedEvs.push(ev);
    }
  }
  saveLogChannels(interaction.guild.id);
  await interaction.update({ embeds: [logsEmbed(interaction.client, interaction.guild)], components: logsRows(interaction.guild) });
  await interaction.followUp({ content: removedEvs.length > 0 ? `🗑️ تم حذف رومات اللوقات لـ **${removedEvs.length}** حدث: ${removedEvs.map(ev => ev.emoji).join(' ')}` : '✅ الأحداث المحددة لم يكن أي منها مربوطاً بروم.', ephemeral: true });
}

// ═══════════ رتب الإدارة (staffRoles) ═══════════
function staffEmbed(client, guild) {
  const roles = guildCfg.get(guild.id).staffRoles || [];
  const list = roles.length
    ? roles.map(id => (guild?.roles?.cache?.get(id) ? `<@&${id}>` : `<@&${id}>`)).join(' ')
    : '`لا توجد رتب إدارة محددة`';
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('👮 رتب الإدارة')
    .setDescription([
      'هذه الرتب تستطيع استخدام أوامر الإدارة مثل `/rate` و`/ticket panel` وغيرها.',
      'لوحة التحكم نفسها تبقى **للأدمن (Administrator) فقط**.',
      '',
      `**رتب الإدارة الحالية:**`,
      list,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function staffRows(guild) {
  const { RoleSelectMenuBuilder } = require('discord.js');
  const roles = guildCfg.get(guild.id).staffRoles || [];
  const sel = new RoleSelectMenuBuilder()
    .setCustomId('bd_staff_roles')
    .setPlaceholder(roles.length ? `✔ المحدد (${roles.length}): رتب إدارة` : '👮 اختر رتب الإدارة (يمكن أكثر من رتبة)...')
    .setMinValues(0)
    .setMaxValues(25);
  if (roles.length) sel.setDefaultRoles(roles);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(sel),
    new ActionRowBuilder().addComponents(backBtn),
  ];
}

async function handleStaffRolesSelect(interaction) {
  const roleIds = interaction.values || [];
  const g = guildCfg.get(interaction.guild.id);
  g.staffRoles = roleIds;
  guildCfg.set(interaction.guild.id, { staffRoles: roleIds });
  await interaction.update({ embeds: [staffEmbed(interaction.client, interaction.guild)], components: staffRows(interaction.guild) });
  await interaction.followUp({
    content: roleIds.length ? `✅ تم ضبط رتب الإدارة: ${roleIds.map(id => `<@&${id}>`).join(' ')}` : '✅ تم إفراغ قائمة رتب الإدارة.',
    ephemeral: true,
  });
}

// ═══════════ نظام الاقتراحات ═══════════
function suggestionsEmbed(client, guild) {
  const channelId = guildCfg.get(guild.id).suggestions?.channelId || '';
  const channel = channelId ? guild?.channels?.cache?.get(channelId) : null;
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('💡 نظام الاقتراحات')
    .setDescription([
      `**روم الاقتراحات:** ${channel ? `<#${channel.id}>` : '`غير محدد`'}`,
      '',
      'عندما يرسل أحدهم اقتراحاً سيصلك على الخاص **ومعه نسخة في الروم** المحدد بالأسفل.',
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function suggestionsRows(guild, state) {
  const { ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  const channelId = guildCfg.get(guild.id).suggestions?.channelId || '';
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);

  // وضع اختيار الروم لإرسال اللوحة
  if (state?.mode === 'panel') {
    const chSel = new ChannelSelectMenuBuilder()
      .setCustomId('bd_send_panel_channel')
      .setPlaceholder('اختر الروم لإرسال لوحة الاقتراحات...')
      .addChannelTypes(ChannelType.GuildText);
    return [
      new ActionRowBuilder().addComponents(chSel),
      new ActionRowBuilder().addComponents(backBtn),
    ];
  }

  const chSel = new ChannelSelectMenuBuilder()
    .setCustomId('bd_suggestions_channel')
    .setPlaceholder(channelId && guild?.channels?.cache?.get(channelId) ? `روم الاقتراحات: #${guild.channels.cache.get(channelId).name}` : 'اختر روم الاقتراحات...')
    .addChannelTypes(ChannelType.GuildText);
  if (channelId && guild?.channels?.cache?.get(channelId)) chSel.setDefaultChannels([channelId]);
  const sendBtn = new ButtonBuilder().setCustomId('bd_send_panel').setLabel('📨 إرسال لوحة الاقتراحات').setStyle(ButtonStyle.Success);
  return [
    new ActionRowBuilder().addComponents(chSel),
    new ActionRowBuilder().addComponents(sendBtn, backBtn),
  ];
}

async function handleSendPanel(interaction) {
  await interaction.update({ embeds: [suggestionsEmbed(interaction.client, interaction.guild)], components: suggestionsRows(interaction.guild, { mode: 'panel' }) });
  await interaction.followUp({ content: '📨 اختر الروم من القائمة بالأسفل لإرسال لوحة الاقتراحات.', ephemeral: true });
}

async function handleSendPanelChannel(interaction) {
  const channelId = interaction.values[0];
  if (!channelId) return;
  const ch = interaction.guild.channels.cache.get(channelId);
  await interaction.update({ embeds: [suggestionsEmbed(interaction.client, interaction.guild)], components: suggestionsRows(interaction.guild) });
  if (!ch) {
    await interaction.followUp({ content: '❌ الروم غير موجود.', ephemeral: true });
    return;
  }
  try {
    await sendSuggestionsPanel({ interaction, targetChannel: ch }, { silent: true });
    await interaction.followUp({ content: `✅ تم إرسال لوحة الاقتراحات إلى <#${ch.id}>`, ephemeral: true });
  } catch (err) {
    await interaction.followUp({ content: '❌ فشل الإرسال: ' + err.message, ephemeral: true });
  }
}

async function handleSuggestionsChannelSelect(interaction) {
  const channelId = interaction.values[0];
  if (!channelId) return;
  const g = guildCfg.get(interaction.guild.id);
  if (!g.suggestions) g.suggestions = {};
  g.suggestions.channelId = channelId;
  guildCfg.set(interaction.guild.id, { suggestions: { channelId } });
  await interaction.update({ embeds: [suggestionsEmbed(interaction.client, interaction.guild)], components: suggestionsRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم ضبط روم الاقتراحات: <#${channelId}>`, ephemeral: true });
}

// ═══════════ ضبط صلاحيات الأوامر ═══════════
const ACCESS_LABELS = {
  any: '✓ عام (الجميع)',
  staff: '👮 رتب الإدارة فقط',
  admin: '🔒 أدمن فقط',
  off: '⛔ معطّل',
};

function getAllCommandsList() {
  const fs = require('fs');
  const path = require('path');
  const cmdDir = path.join(__dirname, 'commands');
  const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js') && f !== 'index.js');
  const list = [];
  for (const f of files) {
    const mod = require(path.join(cmdDir, f));
    if (!mod.commands) continue;
    for (const c of mod.commands) list.push({ name: c.data.name, desc: c.data.description || '' });
  }
  return list;
}

function commandsEmbed2(client, guild, page) {
  const cfg = guildCfg.get(guild.id).commands || {};
  const all = getAllCommandsList();
  const p = page ?? 0;
  const chunk = all.slice(p * CMD_PAGE_SIZE, (p + 1) * CMD_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(all.length / CMD_PAGE_SIZE));
  const lines = chunk.map(c => {
    const acc = cfg[c.name] || 'any';
    return `**/${c.name}** — ${c.desc}\n> ${ACCESS_LABELS[acc]}`;
  });
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('📜 قائمة الأوامر والصلاحيات')
    .setDescription([
      'هذه قائمة أوامر البوت. اختر أمراً من القائمة بالأسفل لتغيير من يستطيع استخدامه.',
      '',
      `**الأوامر (صفحة ${p + 1}/${totalPages}):**`,
      '',
      lines.length ? lines.join('\n') : '_لا توجد أوامر._',
    ].join('\n'))
    .setFooter({ text: `صفحة ${p + 1}/${totalPages} • NSR HUB - MoDy Dev` })
    .setTimestamp();
}

const pendingCmd = new Map(); // userId -> command name
const pendingCmdPage = new Map(); // userId -> page number

const CMD_PAGE_SIZE = 24;

function commandsRows(guild, state) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
  const cfg = guildCfg.get(guild.id).commands || {};
  const cmds = getAllCommandsList();
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);

  if (state?.mode === 'perm') {
    const target = state.command;
    const cur = cfg[target] || 'any';
    const permSel = new StringSelectMenuBuilder()
      .setCustomId('bd_cmd_perm')
      .setPlaceholder(`التحديد الحالي: ${ACCESS_LABELS[cur]}`)
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel(ACCESS_LABELS.any).setValue('any').setDescription('يستطيع كل الأعضاء استخدامه'),
        new StringSelectMenuOptionBuilder().setLabel(ACCESS_LABELS.staff).setValue('staff').setDescription('رتب الإدارة أو المالك فقط'),
        new StringSelectMenuOptionBuilder().setLabel(ACCESS_LABELS.admin).setValue('admin').setDescription('صلاحية Administrator أو المالك فقط'),
        new StringSelectMenuOptionBuilder().setLabel(ACCESS_LABELS.off).setValue('off').setDescription('إيقاف الأمر نهائياً'),
      );
    return [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('bd_cmd_pick_dummy')
          .setDisabled(true)
          .setPlaceholder(`الأمر المحدد: /${target}`)
          .addOptions(new StringSelectMenuOptionBuilder().setLabel(`/${target}`).setValue(target)),
      ),
      new ActionRowBuilder().addComponents(permSel),
      new ActionRowBuilder().addComponents(backBtn),
    ];
  }

  const page = state?.page ?? 0;
  const totalPages = Math.max(1, Math.ceil(cmds.length / CMD_PAGE_SIZE));
  const chunk = cmds.slice(page * CMD_PAGE_SIZE, (page + 1) * CMD_PAGE_SIZE);
  const cmdSel = new StringSelectMenuBuilder()
    .setCustomId('bd_cmd_pick')
    .setPlaceholder(`اختر أمراً... (صفحة ${page + 1}/${totalPages})`)
    .addOptions(chunk.map(c => new StringSelectMenuOptionBuilder()
      .setLabel(`/${c.name}`)
      .setDescription(c.desc.slice(0, 50))
      .setValue(c.name)));
  const rowBtns = [backBtn];
  if (totalPages > 1) {
    rowBtns.unshift(
      new ButtonBuilder().setCustomId('bd_cmd_prev').setLabel('◀ السابق').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('bd_cmd_next').setLabel('التالي ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    );
  }
  return [
    new ActionRowBuilder().addComponents(cmdSel),
    new ActionRowBuilder().addComponents(...rowBtns),
  ];
}

async function handleCmdPage(interaction, dir) {
  const cur = pendingCmdPage.get(interaction.user.id) || 0;
  const totalPages = Math.max(1, Math.ceil(getAllCommandsList().length / CMD_PAGE_SIZE));
  const next = dir === 'next' ? Math.min(totalPages - 1, cur + 1) : Math.max(0, cur - 1);
  pendingCmdPage.set(interaction.user.id, next);
  await interaction.update({ embeds: [commandsEmbed2(interaction.client, interaction.guild, next)], components: commandsRows(interaction.guild, { page: next }) });
}

async function handleCmdPick(interaction) {
  const cmdName = interaction.values[0];
  if (!cmdName) return;
  pendingCmd.set(interaction.user.id, cmdName);
  await interaction.update({ embeds: [commandsEmbed2(interaction.client, interaction.guild)], components: commandsRows(interaction.guild, { mode: 'perm', command: cmdName }) });
}

async function handleCmdPerm(interaction) {
  const access = interaction.values[0];
  const cmdName = pendingCmd.get(interaction.user.id);
  if (!cmdName) return;
  pendingCmd.delete(interaction.user.id);
  const g = guildCfg.get(interaction.guild.id);
  if (!g.commands) g.commands = {};
  g.commands[cmdName] = access;
  guildCfg.set(interaction.guild.id, { commands: g.commands });
  await interaction.update({ embeds: [commandsEmbed2(interaction.client, interaction.guild)], components: commandsRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم ضبط صلاحية **/${cmdName}** إلى: ${ACCESS_LABELS[access]}`, ephemeral: true });
}

function pageEmbed(interaction, pageId) {
  const p = PAGES[pageId];
  const parts = [p.desc];
  if (p.commands && p.commands.length) parts.push(`\n**الأوامر:**\n${p.commands.map(c => c).join('\n')}`);
  return new EmbedBuilder()
    .setColor(panelColor(interaction.guild))
    .setTitle(`${p.emoji} ${p.name}`)
    .setDescription(parts.join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

// ═══════════ الرولات التلقائية ═══════════
function saveAutoRoles(guildId) {
  try {
    const g = guildCfg.get(guildId);
    guildCfg.set(guildId, { autoRoles: g.autoRoles || { memberRoleId: null, botRoleId: null } });
  } catch (err) {
    log.warn('فشل حفظ الرولات التلقائية: ' + err.message);
  }
}

function autorolesEmbed(client, guild) {
  const ar = guildCfg.get(guild.id).autoRoles || {};
  const memberRole = ar.memberRoleId ? guild?.roles?.cache?.get(ar.memberRoleId) : null;
  const botRole = ar.botRoleId ? guild?.roles?.cache?.get(ar.botRoleId) : null;
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🤖 الرولات التلقائية')
    .setDescription([
      'اختر من القوائم بالأسفل، ويُحفظ فوراً.',
      '',
      `👤 **رتبة الأعضاء:** ${memberRole ? `<@&${memberRole.id}>` : '`غير محددة`'}`,
      `🤖 **رتبة البوتات:** ${botRole ? `<@&${botRole.id}>` : '`غير محددة`'}`,
      '',
      '> سيحصل أي عضو/بوت يدخل السيرفر على رتبته تلقائياً.',
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function autorolesRows(guild) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder } = require('discord.js');
  const ar = guildCfg.get(guild.id).autoRoles || {};
  const memberRole = ar.memberRoleId ? guild?.roles?.cache?.get(ar.memberRoleId) : null;
  const botRole = ar.botRoleId ? guild?.roles?.cache?.get(ar.botRoleId) : null;
  const memberSel = new RoleSelectMenuBuilder()
    .setCustomId('bd_ar_member')
    .setPlaceholder(memberRole ? `👤 الأعضاء: ${memberRole.name}` : '👤 اختر رتبة الأعضاء...');
  if (memberRole) memberSel.setDefaultRoles([memberRole.id]);
  const botSel = new RoleSelectMenuBuilder()
    .setCustomId('bd_ar_bot')
    .setPlaceholder(botRole ? `🤖 البوتات: ${botRole.name}` : '🤖 اختر رتبة البوتات...');
  if (botRole) botSel.setDefaultRoles([botRole.id]);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(memberSel),
    new ActionRowBuilder().addComponents(botSel),
    new ActionRowBuilder().addComponents(backBtn),
  ];
}

async function handleAutoRoleSelect(interaction) {
  const roleId = interaction.values[0];
  if (!roleId) return;
  const g = guildCfg.get(interaction.guild.id);
  if (!g.autoRoles) g.autoRoles = { memberRoleId: null, botRoleId: null };
  if (interaction.customId === 'bd_ar_member') g.autoRoles.memberRoleId = roleId;
  else if (interaction.customId === 'bd_ar_bot') g.autoRoles.botRoleId = roleId;
  saveAutoRoles(interaction.guild.id);
  await interaction.update({ embeds: [autorolesEmbed(interaction.client, interaction.guild)], components: autorolesRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم حفظ الرتبة: <@&${roleId}>`, ephemeral: true });
}

// ═══════════ المنتجات والتقييمات ═══════════
const pendingProductRole = new Map(); // userId -> productId (بانتظار اختيار الرول)

function ratingsEmbed(client, guild) {
  const roomId = guildCfg.get(guild.id).rating?.reviewsChannelId;
  const room = roomId ? guild?.channels?.cache?.get(roomId) : null;
  const prods = getProducts(guild.id);
  const lines = prods.length
    ? prods.map((p, i) => {
        const role = p.roleId && guild?.roles?.cache?.get(p.roleId) ? `<@&${p.roleId}>` : '`بدون رول`';
        return `${i + 1}. **${p.name}** — ${role}`;
      }).join('\n')
    : 'لا توجد منتجات بعد. اضغط **إضافة منتج** بالأسفل.';
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🛍️ المنتجات والتقييمات')
    .setDescription([
      `**روم التقييمات:** ${room ? `<#${room.id}>` : '`غير محدد`'}`,
      '',
      '**المنتجات المسجلة:**',
      lines,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

const PROD_ADD = 'bd_prod_add';
const PROD_DEL = 'bd_prod_del';
const PROD_ROLE = 'bd_prod_role';
const PROD_CANCEL = 'bd_prod_cancel';
const PROD_TARGET = 'bd_prod_del_sel';

function ratingsRows(guild, state) {
  const { ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder } = require('discord.js');
  const roomId = guildCfg.get(guild.id).rating?.reviewsChannelId;
  const rows = [];
  const roomSel = new ChannelSelectMenuBuilder()
    .setCustomId('bd_rating_channel')
    .setPlaceholder(roomId && guild?.channels?.cache?.get(roomId) ? `روم التقييمات: #${guild.channels.cache.get(roomId).name}` : 'اختر روم التقييمات...')
    .addChannelTypes(ChannelType.GuildText);
  if (roomId && guild?.channels?.cache?.get(roomId)) roomSel.setDefaultChannels([roomId]);
  rows.push(new ActionRowBuilder().addComponents(roomSel));

  if (state?.mode === 'role') {
    const roleSel = new RoleSelectMenuBuilder()
      .setCustomId(PROD_ROLE)
      .setPlaceholder(state.productName ? `اختر رول منتج «${state.productName}»...` : 'اختر رول المنتج...');
    rows.push(new ActionRowBuilder().addComponents(roleSel));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(PROD_CANCEL).setLabel('✖ إلغاء').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
    ));
    return rows;
  }

  if (state?.mode === 'del') {
    const prods = getProducts(guild.id);
    const sel = new StringSelectMenuBuilder()
      .setCustomId(PROD_TARGET)
      .setPlaceholder('اختر المنتج الذي تريد حذفه...')
      .addOptions(prods.map(p => new StringSelectMenuOptionBuilder().setLabel(p.name).setValue(p.id)));
    rows.push(new ActionRowBuilder().addComponents(sel));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(PROD_CANCEL).setLabel('✖ إلغاء').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
    ));
    return rows;
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(PROD_ADD).setLabel('➕ إضافة منتج').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(PROD_DEL).setLabel('🗑️ حذف منتج').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('bd_send_rate').setLabel('📨 إرسال تقييم').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function handleRatingChannelSelect(interaction) {
  const channelId = interaction.values[0];
  if (!channelId) return;
  const g = guildCfg.get(interaction.guild.id);
  if (!g.rating) g.rating = {};
  g.rating.reviewsChannelId = channelId;
  saveRatingConfig(interaction.guild.id, g.rating);
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم ضبط روم التقييمات: <#${channelId}>`, ephemeral: true });
}

// ═══════════ نظام الترحيب ═══════════
function welcomeEmbed(client, guild) {
  const w = guildCfg.get(guild.id).welcome || {};
  const channel = w.channelId ? guild?.channels?.cache?.get(w.channelId) : null;
  const preview = (w.message || '')
    .replace(/{user}/g, `@${client.user?.username || 'العضو'}`)
    .replace(/{count}/g, String(guild.memberCount))
    .replace(/{server}/g, guild.name);
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('👋 نظام الترحيب')
    .setDescription([
      'رسالة ترحيب تلقائية لكل عضو جديد يدخل السيرفر.',
      '',
      `**📢 الروم:** ${channel ? `<#${channel.id}>` : '`غير محدد`'}`,
      `**📩 الاستقبال:** ${w.mode === 'dm' ? 'رسالة خاصة (DM)' : 'روم السيرفر'}`,
      `**🖼️ مع صورة:** ${w.withImage ? (w.imageUrl ? 'نعم ✅' : 'نعم (بدون رابط صورة بعد) ⚠️') : 'لا ❌'}`,
      `**🔢 مع رقم العضو:** ${w.showCount ? 'نعم ✅' : 'لا ❌'}`,
      '',
      '**💬 الرسالة (معاينة):**',
      `> ${preview || '`لا توجد رسالة بعد`'}`,
      '',
      '**كلمات جاهزة:** `{user}` = منشن العضو، `{count}` = رقم العضو، `{server}` = اسم السيرفر.',
      'إذا فعّلت **رقم العضو** تُضاف تلقائياً: "أنت العضو رقم **{count}**".',
      w.mode === 'dm' ? '⚠️ في وضع **DM** تُرسل على الخاص — إن أغلق العضو الخاص، تُحول لحالة فشل صامتة.' : '',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function welcomeRows(guild) {
  const { ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  const w = guildCfg.get(guild.id).welcome || {};
  const chSel = new ChannelSelectMenuBuilder()
    .setCustomId('bd_welcome_channel')
    .setPlaceholder(w.channelId && guild?.channels?.cache?.get(w.channelId) ? `روم الترحيب: #${guild.channels.cache.get(w.channelId).name}` : 'اختر روم الترحيب...')
    .addChannelTypes(ChannelType.GuildText);
  if (w.channelId && guild?.channels?.cache?.get(w.channelId)) chSel.setDefaultChannels([w.channelId]);
  const modeBtn = new ButtonBuilder()
    .setCustomId('bd_welcome_mode')
    .setLabel(w.mode === 'dm' ? '📩 خاص (DM)' : '📢 روم السيرفر')
    .setStyle(ButtonStyle.Secondary);
  const imgBtn = new ButtonBuilder()
    .setCustomId('bd_welcome_img_toggle')
    .setLabel(w.withImage ? '🖼️ مع صورة: نعم' : '🖼️ مع صورة: لا')
    .setStyle(ButtonStyle.Secondary);
  const countBtn = new ButtonBuilder()
    .setCustomId('bd_welcome_count')
    .setLabel(w.showCount ? '🔢 رقم العضو: نعم' : '🔢 رقم العضو: لا')
    .setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(chSel),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bd_welcome_msg').setLabel('✏️ تعديل الرسالة').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bd_welcome_img').setLabel(w.imageUrl ? '🖼️ تغيير الصورة' : '🖼️ إضافة صورة').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(modeBtn, imgBtn, countBtn),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)),
  ];
}

function saveWelcome(guildId, w) {
  guildCfg.set(guildId, { welcome: w || {} });
}

async function handleWelcomeChannelSelect(interaction) {
  const channelId = interaction.values[0];
  if (!channelId) return;
  const g = guildCfg.get(interaction.guild.id);
  const w = g.welcome || {};
  w.channelId = channelId;
  saveWelcome(interaction.guild.id, w);
  await interaction.update({ embeds: [welcomeEmbed(interaction.client, interaction.guild)], components: welcomeRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم ضبط روم الترحيب: <#${channelId}>`, ephemeral: true });
}

async function handleWelcomeMsg(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const w = guildCfg.get(interaction.guild.id).welcome || {};
  const modal = new ModalBuilder().setCustomId('bd_welcome_msg_modal').setTitle('💬 رسالة الترحيب');
  const msgInput = new TextInputBuilder()
    .setCustomId('wel_msg')
    .setLabel('نص الرسالة')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setValue(w.message || '')
    .setPlaceholder('أهلاً بك {user} في سيرفر {server}! 🎉 (كلمات: {user} منشن، {count} العدد، {server} الاسم)');
  modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
  await interaction.showModal(modal);
}

async function handleWelcomeMsgModal(interaction) {
  const text = interaction.fields.getTextInputValue('wel_msg').trim();
  const g = guildCfg.get(interaction.guild.id);
  const w = g.welcome || {};
  w.message = text;
  saveWelcome(interaction.guild.id, w);
  await interaction.reply({ content: '✅ تم حفظ رسالة الترحيب.', ephemeral: true });
  await interaction.message?.edit({ embeds: [welcomeEmbed(interaction.client, interaction.guild)], components: welcomeRows(interaction.guild) }).catch(() => {});
}

async function handleWelcomeImg(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const w = guildCfg.get(interaction.guild.id).welcome || {};
  const modal = new ModalBuilder().setCustomId('bd_welcome_img_modal').setTitle('🖼️ صورة الترحيب');
  const imgInput = new TextInputBuilder()
    .setCustomId('wel_img')
    .setLabel('رابط الصورة (png/jpg) — اتركه فارغاً لحذفها')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(w.imageUrl || '')
    .setPlaceholder('https://...');
  modal.addComponents(new ActionRowBuilder().addComponents(imgInput));
  await interaction.showModal(modal);
}

async function handleWelcomeImgModal(interaction) {
  const url = interaction.fields.getTextInputValue('wel_img').trim();
  const g = guildCfg.get(interaction.guild.id);
  const w = g.welcome || {};
  w.imageUrl = url;
  saveWelcome(interaction.guild.id, w);
  await interaction.reply({ content: url ? `✅ تم حفظ صورة الترحيب.` : '🗑️ تم حذف الصورة.', ephemeral: true });
  await interaction.message?.edit({ embeds: [welcomeEmbed(interaction.client, interaction.guild)], components: welcomeRows(interaction.guild) }).catch(() => {});
}

async function handleWelcomeMode(interaction) {
  const g = guildCfg.get(interaction.guild.id);
  const w = g.welcome || {};
  w.mode = w.mode === 'dm' ? 'room' : 'dm';
  saveWelcome(interaction.guild.id, w);
  await interaction.message.edit({ embeds: [welcomeEmbed(interaction.client, interaction.guild)], components: welcomeRows(interaction.guild) });
  await interaction.deferUpdate();
}

async function handleWelcomeImgToggle(interaction) {
  const g = guildCfg.get(interaction.guild.id);
  const w = g.welcome || {};
  w.withImage = !w.withImage;
  saveWelcome(interaction.guild.id, w);
  await interaction.message.edit({ embeds: [welcomeEmbed(interaction.client, interaction.guild)], components: welcomeRows(interaction.guild) });
  await interaction.deferUpdate();
}

async function handleWelcomeCountToggle(interaction) {
  const g = guildCfg.get(interaction.guild.id);
  const w = g.welcome || {};
  w.showCount = !w.showCount;
  saveWelcome(interaction.guild.id, w);
  await interaction.message.edit({ embeds: [welcomeEmbed(interaction.client, interaction.guild)], components: welcomeRows(interaction.guild) });
  await interaction.deferUpdate();
}

// ═══════════ نظام التذاكر (لوحة إدارة من اللوحة) ═══════════
function ticketsEmbed(client, guild) {
  const t = guildCfg.get(guild.id).ticket || {};
  const types = t.ticketTypes || [];
  const enabled = types.filter(x => x.enabled !== false);
  const lines = types.length
    ? types.map((tp, i) => `${tp.enabled === false ? '❌' : '✅'} ${tp.emoji || ''} **${tp.label}** — ${tp.description}`).join('\n')
    : 'لا توجد أنواع بعد. اضغط **➕ إضافة نوع** بالأسفل.';
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🎫 نظام التذاكر')
    .setDescription([
      'تحكم بأنواع التذاكر التي تظهر للعضو (أظهر/أخفِ أي نوع):',
      '',
      `**عنوان اللوحة:** ${t.panel?.title || '🎫 Support Tickets'}`,
      `**الحالة:** ${enabled.length} نوع مفعّل من ${types.length || 0}`,
      '',
      '**الأنواع:**',
      lines,
      '',
      '⚠️ الأنواع المطفأة (❌) لا تظهر في لوحة التذاكر.',
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function ticketsRows(guild) {
  const t = guildCfg.get(guild.id).ticket || {};
  const types = t.ticketTypes || [];
  const rows = [];
  // 5 أزرار كحد أقصى في كل صف — نقسّم الأنواع على صفوف
  for (let i = 0; i < types.length; i += 5) {
    const rowBtns = types.slice(i, i + 5).map(tp => {
      const btn = new ButtonBuilder()
        .setCustomId(`bd_tk_toggle_${tp.id}`)
        .setLabel(tp.label)
        .setStyle(tp.enabled === false ? ButtonStyle.Secondary : ButtonStyle.Success);
      if (tp.emoji && /^\p{Extended_Pictographic}$/u.test(tp.emoji.trim())) btn.setEmoji(tp.emoji.trim());
      return btn;
    });
    rows.push(new ActionRowBuilder().addComponents(rowBtns));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bd_tk_add').setLabel('➕ إضافة نوع').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bd_send_ticket_panel').setLabel('📨 إرسال لوحة التذاكر').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

function saveTicketCfg(guildId, t) {
  guildCfg.set(guildId, { ticket: t || {} });
}

async function handleTicketToggle(interaction) {
  const typeId = interaction.customId.replace('bd_tk_toggle_', '');
  const g = guildCfg.get(interaction.guild.id);
  const t = g.ticket || {};
  const types = t.ticketTypes || [];
  const tp = types.find(x => x.id === typeId);
  if (!tp) {
    await interaction.reply({ content: '❌ النوع غير موجود.', ephemeral: true });
    return;
  }
  tp.enabled = tp.enabled === false ? true : false;
  saveTicketCfg(interaction.guild.id, t);
  await interaction.message.edit({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild) });
  await interaction.deferUpdate();
  await interaction.followUp({ content: `${tp.enabled === false ? '❌ تم إخفاء' : '✅ تم إظهار'} نوع «${tp.label}».\nأعد إرسال لوحة التذاكر لتطبيق التغيير.`, ephemeral: true });
}

async function handleTicketAdd(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const modal = new ModalBuilder().setCustomId('bd_tk_add_modal').setTitle('➕ إضافة نوع تذكرة');
  const nameInput = new TextInputBuilder()
    .setCustomId('tk_name')
    .setLabel('اسم النوع')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)
    .setPlaceholder('مثال: Purchase');
  const descInput = new TextInputBuilder()
    .setCustomId('tk_desc')
    .setLabel('الوصف')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('مثال: Inquire about buying a product or service');
  const emojiInput = new TextInputBuilder()
    .setCustomId('tk_emoji')
    .setLabel('الإيموجي (حرف واحد)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(4)
    .setPlaceholder('مثال: 🛒');
  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(emojiInput),
  );
  await interaction.showModal(modal);
}

async function handleTicketAddModal(interaction) {
  const name = interaction.fields.getTextInputValue('tk_name').trim();
  const desc = interaction.fields.getTextInputValue('tk_desc').trim();
  const emoji = interaction.fields.getTextInputValue('tk_emoji').trim();
  if (!name || !desc) {
    await interaction.reply({ content: '❌ اسم النوع والوصف مطلوبان.', ephemeral: true });
    return;
  }
  const g = guildCfg.get(interaction.guild.id);
  const t = g.ticket || {};
  if (!t.ticketTypes) t.ticketTypes = [];
  const id = 'c' + Date.now().toString(36);
  const tp = { id, label: name, description: desc, color: 0x5793266, enabled: true };
  // إيموجي صالح فقط (نقطة Unicode واحدة في النطاق الإيموجي) وإلا لا نضيفه
  if (emoji && /^\p{Extended_Pictographic}$/u.test(emoji)) tp.emoji = emoji;
  else if (emoji) tp.emoji = '';
  t.ticketTypes.push(tp);
  saveTicketCfg(interaction.guild.id, t);
  await interaction.reply({ content: `✅ تم إضافة نوع «${name}». أرسل اللوحة لتطبيق التغيير.`, ephemeral: true });
  await interaction.message?.edit({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild) }).catch(() => {});
}

async function handleProdAdd(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const modal = new ModalBuilder().setCustomId('bd_prod_modal').setTitle('إضافة منتج جديد');
  const nameInput = new TextInputBuilder()
    .setCustomId('prod_name')
    .setLabel('اسم المنتج')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('مثال: لعبة ماينكرافت 🎮');
  modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
  await interaction.showModal(modal);
}

async function handleProdModal(interaction) {
  const name = interaction.fields.getTextInputValue('prod_name').trim();
  if (!name) {
    await interaction.reply({ content: '❌ اسم المنتج مطلوب.', ephemeral: true });
    return;
  }
  const g = guildCfg.get(interaction.guild.id);
  if (!g.rating) g.rating = {};
  if (!g.rating.products) g.rating.products = [];
  const id = 'p_' + Date.now().toString(36);
  g.rating.products.push({ id, name, roleId: null });
  pendingProductRole.set(interaction.user.id, id);
  saveRatingConfig(interaction.guild.id, g.rating);
  await interaction.deferUpdate();
  await interaction.message.edit({
    embeds: [ratingsEmbed(interaction.client, interaction.guild)],
    components: ratingsRows(interaction.guild, { mode: 'role', productName: name }),
  });
  await interaction.followUp({ content: `✅ تمت إضافة **«${name}»** — الآن اختر رول المنتج من القائمة بالأسفل.`, ephemeral: true });
}

async function handleProdRoleSelect(interaction) {
  const roleId = interaction.values[0];
  if (!roleId) return;
  const productId = pendingProductRole.get(interaction.user.id);
  const g = guildCfg.get(interaction.guild.id);
  if (!g.rating) g.rating = {};
  if (!Array.isArray(g.rating.products)) g.rating.products = [];
  const product = g.rating.products.find(p => p.id === productId);
  if (!product) {
    await interaction.reply({ content: '⚠️ المنتج غير موجود، جرّب مرة أخرى.', ephemeral: true });
    return;
  }
  product.roleId = roleId;
  pendingProductRole.delete(interaction.user.id);
  saveRatingConfig(interaction.guild.id, g.rating);
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم ربط رول <@&${roleId}> بمنتج **«${product.name}»**.`, ephemeral: true });
}

async function handleProdDelete(interaction) {
  if (!getProducts(interaction.guild.id).length) {
    await interaction.reply({ content: '⚠️ لا توجد منتجات لحذفها.', ephemeral: true });
    return;
  }
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild, { mode: 'del' }) });
}

async function handleProdDeleteSelect(interaction) {
  const productId = interaction.values[0];
  if (!productId) return;
  const g = guildCfg.get(interaction.guild.id);
  const product = (g.rating?.products || []).find(p => p.id === productId);
  if (g.rating) g.rating.products = (g.rating.products || []).filter(p => p.id !== productId);
  saveRatingConfig(interaction.guild.id, g.rating);
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild) });
  await interaction.followUp({ content: `🗑️ تم حذف المنتج **«${product?.name || ''}»**.`, ephemeral: true });
}

async function handleProdCancel(interaction) {
  pendingProductRole.delete(interaction.user.id);
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild) });
}

// ═══════════ زر «إرسال تقييم» — نفس عمل /rate بدون كتابة الأمر ═══════════
const pendingRate = new Map(); // userId -> { type: 'user' | 'product' }

async function handleSendRate(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const prods = getProducts(interaction.guild.id);
  if (!prods.length) {
    await interaction.reply({ content: '❌ لا توجد منتجات بعد — أضف منتجاً أولاً.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId('bd_rate_modal').setTitle('📨 إرسال تقييم');
  const userInput = new TextInputBuilder()
    .setCustomId('rate_target')
    .setLabel('معرف العميل أو منشن (User ID)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('مثال: 123456789012345678');
  const productInput = new TextInputBuilder()
    .setCustomId('rate_product')
    .setLabel('اسم المنتج')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder(prods.map(p => p.name).join(' | '));
  modal.addComponents(
    new ActionRowBuilder().addComponents(userInput),
    new ActionRowBuilder().addComponents(productInput),
  );
  await interaction.showModal(modal);
}

async function handleRateModal(interaction) {
  const { sendPurchaseDM } = require('./modules/ratings');
  await interaction.deferReply({ ephemeral: true });
  const rawTarget = interaction.fields.getTextInputValue('rate_target').trim();
  const targetId = String(rawTarget).replace(/[^0-9]/g, '');
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  const member = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!target || !member) {
    await interaction.editReply({ content: '❌ العضو غير موجود — تأكد من معرفه (User ID).', ephemeral: true });
    return;
  }
  if (member.bot) {
    await interaction.editReply({ content: '❌ اختر عميلاً حقيقياً (وليس بوتاً).', ephemeral: true });
    return;
  }
  const rawProd = interaction.fields.getTextInputValue('rate_product').trim();
  const product = findProduct(interaction.guild.id, rawProd);
  if (!product) {
    await interaction.editReply({
      content: '❌ المنتج غير موجود. المنتجات المتاحة:\n' + getProducts(interaction.guild.id).map(p => `• **${p.name}**`).join('\n'),
      ephemeral: true,
    });
    return;
  }
  const ok = await sendPurchaseDM(member, product, interaction.client, interaction.guild);
  if (!ok) {
    await interaction.editReply({ content: `❌ تعذر إرسال رسالة خاصة إلى ${member} — ربما قفل الخاص.`, ephemeral: true });
    return;
  }
  await interaction.editReply({
    content: `✅ تم إرسال رسالة تقييم **«${product.name}»** إلى ${member} على الخاص.`,
    ephemeral: true,
  });
}

function mainEmbed(client, guild) {
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🎛️ لوحة التحكم الرئيسية')
    .setDescription([
      'اختر النظام الذي تريد الدخول إليه:',
      '',
      Object.entries(PAGES).map(([id, p]) => `${p.emoji} **${p.name}**`).join('\n'),
      '',
      `> السيرفر: **${guild?.name || '-'}**`,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function mainRows() {
  const ids = Object.keys(PAGES);
  const rows = [];
  for (let i = 0; i < ids.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      ids.slice(i, i + 5).map(id =>
        new ButtonBuilder().setCustomId(`bd_${id}`).setLabel(PAGES[id].name).setEmoji(PAGES[id].emoji).setStyle(ButtonStyle.Secondary)
      )
    );
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bd_botinfo').setLabel('🖌️ تغيير معلومات البوت').setStyle(ButtonStyle.Success)
  ));
  return rows;
}

function botInfoEmbed(client, guild) {
  const g = guildCfg.get(guild.id);
  const color = g.embedColor;
  return new EmbedBuilder()
    .setColor(color || 0x5865F2)
    .setTitle('🖌️ تغيير معلومات البوت')
    .setDescription([
      'عدّل صورة البوت ولونه — التغييرات تطبق على **هذا السيرفر فقط**.',
      '',
      `> **صورة البوت:** ${g.logoUrl ? 'محددة ✔' : 'الافتراضية'}`,
      `> **لون البوت:** ${color ? `\`#${color.toString(16).padStart(6, '0').toUpperCase()}\`` : 'الأزرق الافتراضي'}`,
      '',
      'اختر الخيار بالأسفل.'
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function botInfoRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bd_set_logo').setLabel('🖼️ تغيير صورة البوت').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bd_set_color').setLabel('🎨 تغيير لون البوت').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function handleSetColor(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const modal = new ModalBuilder().setCustomId('bd_set_color_modal').setTitle('🎨 تغيير لون البوت');
  const input = new TextInputBuilder()
    .setCustomId('embed_color')
    .setLabel('اللون (Hex مثل #5865F2)')
    .setPlaceholder('#5865F2')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(7);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleSetColorModal(interaction) {
  const val = interaction.fields.getTextInputValue('embed_color').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(val)) {
    await interaction.reply({ content: '❌ اللون غير صحيح، أدخل قيمة Hex من 6 خانات مثل `#FF0000`.', ephemeral: true });
    return;
  }
  const color = parseInt(val, 16);
  guildCfg.set(interaction.guild.id, { embedColor: color });
  await interaction.reply({ content: `✅ تم تغيير لون البوت إلى **#${val.toUpperCase()}** في هذا السيرفر فقط.\nسيظهر من أول رسالة جديدة بعد الآن.`, ephemeral: true });
}

async function handleSetLogo(interaction) {
  const { MessageCollector } = require('discord.js');
  await interaction.reply({
    content: '🖼️ أرفق الصورة في رسالة في هذا الروم خلال **60 ثانية** وسأعتمدها كصورة البوت.\nالصيغ المدعومة: `png / jpg / jpeg / webp / gif`.',
    ephemeral: true,
  });
  const filter = (m) => m.author.id === interaction.user.id && m.attachments.size > 0;
  const collector = new MessageCollector(interaction.channel, { filter, time: 60000, max: 1 });
  collector.on('collect', async (m) => {
    try {
      const attach = m.attachments.first();
      if (!/^image\//i.test(attach.contentType || '')) {
        await interaction.followUp({ content: '❌ الملف المرسل ليس صورة.', ephemeral: true });
        m.delete().catch(() => {});
        return;
      }
      const { setLogoUrl, uploadLogoFromUrl } = require('./utils/logo');
      // لا نمسح رسالة الصورة إلا بعد نجاح الرفع على CDN — رابط CDN دائم ولا يتأثر بالحذف
      const finalUrl = await uploadLogoFromUrl(interaction.client, attach.url, interaction.guild.id);
      setLogoUrl(interaction.guild.id, finalUrl);
      m.delete().catch(() => {});
      // إعادة عرض لوحة التحكم فوراً بالصورة الجديدة
      try {
        await interaction.message.edit({
          embeds: [mainEmbed(interaction.client, interaction.guild)],
          components: mainRows(),
        });
      } catch (_) {}
      await interaction.followUp({ content: '✅ تم تحديث صورة البوت بنجاح، وستظهر في كل الرسائل.', ephemeral: true });
    } catch (err) {
      log.warn('فشل تحديث اللوقو من ملف: ' + err.message);
      // فشل الرفع → لا نغيّر الصورة ولا نمسح رسالة المرفق حتى يبقى القديم ظاهراً
      await interaction.followUp({
        content: '❌ تعذر رفع الصورة على ديسكورد، حاول مرة أخرى أو استخدم صيغة png/jpg.',
        ephemeral: true,
      });
    }
  });
  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await interaction.followUp({ content: '⏰ انتهت المهلة، لم يتم رفع أي صورة.', ephemeral: true });
    }
  });
}

async function handleSetLogoModal(interaction) {
  const url = interaction.fields.getTextInputValue('logo_url').trim();
  if (!/^https?:\/\//i.test(url)) {
    await interaction.reply({ content: '❌ الرابط غير صالح، ابدأ بـ `https://`.', ephemeral: true });
    return;
  }
  const { setLogoUrl, uploadLogoFromUrl } = require('./utils/logo');
  try {
    const cdn = await uploadLogoFromUrl(interaction.client, url, interaction.guild.id);
    setLogoUrl(interaction.guild.id, cdn);
    await interaction.reply({
      content: `✅ تم تحديث صورة البوت بنجاح.\nالصورة الجديدة ستظهر في كل الرسائل.`,
      ephemeral: true,
    });
  } catch (err) {
    log.warn('فشل رفع صورة اللوقو: ' + err.message);
    setLogoUrl(interaction.guild.id, url);
    await interaction.reply({
      content: `✅ تم حفظ الرابط، لكن تعذر رفعه على ديسكورد (${
        err.message || 'خطأ'
      })\nإذا لم تظهر الصورة فتأكد أن الرابط مباشر لصيغة png/jpg.`,
      ephemeral: true,
    });
  }
}

function pageRows(pageId, guild) {
  if (pageId === 'logs') return logsRows(guild);
  if (pageId === 'autoroles') return autorolesRows(guild);
  if (pageId === 'ratings') return ratingsRows(guild);
  if (pageId === 'staff') return staffRows(guild);
  if (pageId === 'suggestions') return suggestionsRows(guild);
  if (pageId === 'commands') return commandsRows(guild);
  if (pageId === 'messages') return messagesRows();
  if (pageId === 'welcome') return welcomeRows(guild);
  if (pageId === 'tickets') return ticketsRows(guild);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  if (pageId === 'system') return [...systemRows(), new ActionRowBuilder().addComponents(backBtn)];
  const row = new ActionRowBuilder().addComponents(backBtn);
  if (pageId === 'suggestions') row.addComponents(new ButtonBuilder().setCustomId('bd_send_suggestions_panel').setLabel('إرسال لوحة الاقتراحات').setStyle(ButtonStyle.Success));
  return [row];
}

async function handleDashboard(interaction, client) {
  const id = interaction.customId;

  if (id === 'bd_back') {
    await interaction.update({ embeds: [mainEmbed(client, interaction.guild)], components: mainRows() });
    return;
  }

  if (id === 'bd_ar_member' || id === 'bd_ar_bot') {
    return handleAutoRoleSelect(interaction);
  }

if (id === PROD_ADD) return handleProdAdd(interaction);
  if (id === PROD_DEL) return handleProdDelete(interaction);
  if (id === PROD_ROLE) return handleProdRoleSelect(interaction);
  if (id === PROD_CANCEL) return handleProdCancel(interaction);
  if (id === 'bd_send_rate') return handleSendRate(interaction);

  if (id === 'bd_set_logo') return handleSetLogo(interaction);
  if (id === 'bd_welcome_msg') return handleWelcomeMsg(interaction);
  if (id === 'bd_welcome_img') return handleWelcomeImg(interaction);
  if (id === 'bd_welcome_mode') return handleWelcomeMode(interaction);
  if (id === 'bd_welcome_img_toggle') return handleWelcomeImgToggle(interaction);
  if (id === 'bd_welcome_count') return handleWelcomeCountToggle(interaction);
  if (id.startsWith('bd_tk_toggle_')) return handleTicketToggle(interaction);
  if (id === 'bd_tk_add') return handleTicketAdd(interaction);
  if (id === 'bd_botinfo') {
    await interaction.update({ embeds: [botInfoEmbed(client, interaction.guild)], components: botInfoRows() });
    return;
  }
  if (id === 'bd_set_color') return handleSetColor(interaction);

  const pageId = id.replace('bd_', '');
  if (PAGES[pageId]) {
    let embed;
    if (pageId === 'ratings') embed = ratingsEmbed(interaction.client, interaction.guild);
    else if (pageId === 'staff') embed = staffEmbed(interaction.client, interaction.guild);
    else if (pageId === 'suggestions') embed = suggestionsEmbed(interaction.client, interaction.guild);
    else if (pageId === 'commands') embed = commandsEmbed2(interaction.client, interaction.guild, pendingCmdPage.get(interaction.user.id) || 0);
    else if (pageId === 'messages') embed = messagesEmbed(interaction.client, interaction.guild);
    else if (pageId === 'tickets') embed = ticketsEmbed(interaction.client, interaction.guild);
    else embed = pageEmbed(interaction, pageId);
    await interaction.update({ embeds: [embed], components: pageRows(pageId, interaction.guild) });
    return;
  }

  if (id === 'bd_send_ticket_panel') return sendTicketPanel(interaction);
  if (id === 'bd_send_suggestions_panel') return sendSuggestionsPanel(interaction);
  if (id === 'bd_send_panel') return handleSendPanel(interaction);
  if (id === 'bd_send_panel_channel') return handleSendPanelChannel(interaction);
  if (id === 'bd_staff_roles') return handleStaffRolesSelect(interaction);
  if (id === 'bd_suggestions_channel') return handleSuggestionsChannelSelect(interaction);
  if (id === 'bd_cmd_pick') return handleCmdPick(interaction);
  if (id === 'bd_cmd_perm') return handleCmdPerm(interaction);
  if (id === 'bd_cmd_next' || id === 'bd_cmd_prev') return handleCmdPage(interaction, id === 'bd_cmd_next' ? 'next' : 'prev');
}

async function sendTicketPanel(interaction) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
  const { tickets } = db;
  // تفاعل الأزرار والأوامر يجب أن يُجاب خلال 3 ثوانٍ — نعترف فوراً ثم نرسل اللوحة
  try {
    await interaction.deferReply({ ephemeral: true });
    const tcfg = guildCfg.get(interaction.guild.id).ticket || {};
    // الأنواع المفعّلة فقط تظهر للعضو (الأنواع المطفأة من لوحة التحكم تُخفى)
    const types = (tcfg.ticketTypes || []).filter(tp => tp.enabled !== false);
    if (!types.length) {
      await interaction.editReply({ content: '❌ لا توجد أنواع تذاكر مفعّلة في هذا السيرفر. فعّل نوعاً واحداً على الأقل من إعدادات التذاكر.', ephemeral: true });
      return;
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_type_select')
      .setPlaceholder('Select a ticket type...')
      .addOptions(types.map(tp => {
        const opt = new StringSelectMenuOptionBuilder().setLabel(tp.label).setDescription(tp.description).setValue(tp.id);
        // إيموجي صالح فقط — نتجنب خطأ COMPONENT_INVALID_EMOJI من الإيموجيات التالفة في config.json
        if (tp.emoji && /^\p{Extended_Pictographic}$/u.test(tp.emoji.trim())) opt.setEmoji(tp.emoji.trim());
        return opt;
      }));
    const embed = new EmbedBuilder()
      .setColor(tcfg.panel?.color || 0x5865F2)
      .setTitle(tcfg.panel?.title || '🎫 Support Tickets')
      .setDescription(`${tcfg.panel?.description || ''}\n\n${types.map(tp => `> ${tp.emoji} **${tp.label}** — ${tp.description}`).join('\n')}`)
      .setFooter({ text: tcfg.panel?.footer || 'NSR HUB - MoDy Dev' });
    const target = interaction.channel;
    if (!target || !target.send) {
      await interaction.editReply({ content: '❌ لا يمكن الإرسال في هذا الروم — استخدم الأمر في روم نصي.', ephemeral: true });
      return;
    }
    await target.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    await interaction.editReply({ content: `✅ تم إرسال لوحة التذاكر إلى <#${target.id}>!`, ephemeral: true });
  } catch (err) {
    log.warn('فشل إرسال لوحة التذاكر: ' + err.message);
    try {
      await interaction.editReply({
        content: `❌ تعذر إرسال لوحة التذاكر في هذا الروم.\nتأكد أن البوت يملك صلاحية **إرسال الرسائل** هنا وأن الروم نصي.\n\n\`${err.message}\``,
        ephemeral: true,
      });
    } catch (_) {}
  }
}

async function sendSuggestionsPanel(interaction, opts) {
  const embed = new EmbedBuilder()
    .setColor(panelColor(interaction.guild))
    .setTitle('📬 Suggestion Box | صندوق الاقتراحات')
    .setDescription([
      '**English**',
      'Have an idea or feedback? Hit the button and share it!',
      '',
      '**العربية**',
      'هل لديك فكرة أو ملاحظات؟ اضغط على الزر وشاركها!',
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_suggestion_modal').setLabel('✏️ Submit a Suggestion | قدّم اقتراحاً').setStyle(ButtonStyle.Secondary)
  );
  // لو مررنا روم محدد نرسل فيه، وإلا نرسل في الروم الحالي
  const target = opts?.targetChannel || interaction.channel;
  if (!target || !target.send) throw new Error('الروم المستهدف غير صالح');
  // المستدعي من الزر في اللوحة: نعترف أولاً حتى لا ينتهي تفاعل الزر (3 ثوانٍ)
  if (!interaction.replied && !interaction.deferred) await interaction.deferReply({ ephemeral: true });
  await target.send({ embeds: [embed], components: [row] });
  if (opts?.silent) return;
  await interaction.editReply({ content: `✅ تم إرسال لوحة الاقتراحات إلى <#${target.id}>!`, ephemeral: true });
}

module.exports = { handleDashboard, handleSetLogoModal, handleSetColorModal, mainEmbed, mainRows, PAGES, commandsEmbed2, commandsRows, handleLogsSelect, handleLogsChannelSelect, handleLogsApply, handleLogsDelete, handleAutoRoleSelect, handleRatingChannelSelect, handleProdRoleSelect, handleProdDeleteSelect, handleProdModal, handleStaffRolesSelect, handleSuggestionsChannelSelect, handleSendPanel, handleSendPanelChannel, handleCmdPick, handleCmdPerm, handleCmdPage, sendTicketPanel, sendSuggestionsPanel, handleSendRate, handleRateModal, handleWelcomeChannelSelect, handleWelcomeMsgModal, handleWelcomeImgModal, handleTicketToggle, handleTicketAdd, handleTicketAddModal };
