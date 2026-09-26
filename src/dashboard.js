const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const log = require('./utils/logger');
const db = require('./db');
const guildCfg = require('./guildCfg');
const { systemRows } = require('./modules/adminPanel');
const { getProducts, findProduct, saveRatingConfig } = require('./modules/ratings');
const { messagesEmbed, messagesRows } = require('./modules/messages');
const { LOGO_ATTACH, hasLogo } = require('./utils/logo');

const PAGES = {
  home: { emoji: '🏠', name: 'الرئيسية', desc: 'إحصائيات السيرفر' },
  welcome: { emoji: '👋', name: 'الترحيب', desc: 'رسالة ترحيب للأعضاء الجدد' },
  tickets: { emoji: '🎫', name: 'التذاكر', desc: 'أنواع التذاكر ولوحة الإرسال' },
  suggestions: { emoji: '💡', name: 'الاقتراحات', desc: 'روم الاقتراحات وزر التقديم' },
  messages: { emoji: '💬', name: 'الرسائل', desc: 'رسائل خاصة للأعضاء' },
  security: { emoji: '🛡️', name: 'الأمان', desc: 'الحماية والفلاتر' },
  logs: { emoji: '📋', name: 'اللوقات', desc: 'رومات تسجيل الأحداث' },
  ratings: { emoji: '🛍️', name: 'التقييمات', desc: 'المنتجات ورومات التقييم' },
  autoroles: { emoji: '🤖', name: 'الرولات التلقائية', desc: 'رتبة عند الدخول والبوتات' },
  system: { emoji: '⚙️', name: 'نظام الإدارة', desc: 'أدوات إدارية سريعة' },
  commands: { emoji: '📜', name: 'صلاحيات الأوامر', desc: 'من يستخدم كل أمر' },
  staff: { emoji: '👮', name: 'رتب الإدارة', desc: 'الرتب التي تستخدم أوامر الإدارة' },
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
      ...lines,
      '',
      '━━━━━━━━━━━━━━',
      '**📌 الأحداث المربوطة:**',
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
      '**رتب الإدارة:**',
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
      `**صفحة ${p + 1}/${totalPages}**`,
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
  return new EmbedBuilder()
    .setColor(panelColor(interaction.guild))
    .setTitle(`${p.emoji} ${p.name}`)
    .setDescription(p.desc)
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
      `👤 **رتبة الأعضاء:** ${memberRole ? `<@&${memberRole.id}>` : '`غير محددة`'}`,
      `🤖 **رتبة البوتات:** ${botRole ? `<@&${botRole.id}>` : '`غير محددة`'}`,
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
      `**📢 الروم:** ${channel ? `<#${channel.id}>` : '`غير محدد`'}`,
      `**📩 الاستقبال:** ${w.mode === 'dm' ? 'رسالة خاصة (DM)' : 'روم السيرفر'}`,
      `**🖼️ مع صورة:** ${w.withImage ? (w.imageUrl ? 'نعم ✅' : 'نعم (بدون رابط صورة بعد) ⚠️') : 'لا ❌'}`,
      `**🔢 مع رقم العضو:** ${w.showCount ? 'نعم ✅' : 'لا ❌'}`,
      '',
      '**💬 الرسالة (معاينة):**',
      `> ${preview || '`لا توجد رسالة بعد`'}`,
      '',
      '`{user}` منشن • `{count}` رقم العضو • `{server}` اسم السيرفر',
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
  const custom = types.filter(x => String(x.id || '').startsWith('c'));
  const lines = types.length
    ? types.map((tp, i) => `${tp.enabled === false ? '❌' : '✅'} ${tp.emoji || ''} **${tp.label}** — ${tp.description}${String(tp.id || '').startsWith('c') ? ' *(مخصص)*' : ''}`).join('\n')
    : 'لا توجد أنواع بعد. اضغط **➕ إضافة نوع** بالأسفل.';
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🎫 نظام التذاكر')
    .setDescription([
      `**عنوان اللوحة:** ${t.panel?.title || '🎫 Support Tickets'}`,
      `**الحالة:** ${enabled.length} نوع مفعّل من ${types.length || 0}`,
      '',
      '**الأنواع:**',
      lines,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function ticketsRows(guild, state) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
  const t = guildCfg.get(guild.id).ticket || {};
  const types = t.ticketTypes || [];
  const rows = [];

  // وضع الحذف: نعرض الأنواع المخصصة فقط للاختيار
  if (state?.mode === 'del') {
    const custom = types.filter(x => String(x.id || '').startsWith('c'));
    const sel = new StringSelectMenuBuilder()
      .setCustomId('bd_tk_del_sel')
      .setPlaceholder('اختر النوع المخصص الذي تريد حذفه...')
      .addOptions(custom.map(tp => {
        const opt = new StringSelectMenuOptionBuilder().setLabel(tp.label).setDescription(tp.description).setValue(tp.id);
        if (tp.emoji && /^\p{Extended_Pictographic}$/u.test(tp.emoji.trim())) opt.setEmoji(tp.emoji.trim());
        return opt;
      }));
    rows.push(new ActionRowBuilder().addComponents(sel));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع').setStyle(ButtonStyle.Secondary),
    ));
    return rows;
  }

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
    new ButtonBuilder().setCustomId('bd_tk_del').setLabel('🗑️ حذف نوع').setStyle(ButtonStyle.Danger),
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
  const tp = { id, label: name, description: desc, color: 0x57F287, enabled: true };
  // إيموجي صالح فقط (نقطة Unicode واحدة في النطاق الإيموجي) وإلا لا نضيفه
  if (emoji && /^\p{Extended_Pictographic}$/u.test(emoji)) tp.emoji = emoji;
  else if (emoji) tp.emoji = '';
  t.ticketTypes.push(tp);
  saveTicketCfg(interaction.guild.id, t);
  await interaction.reply({ content: `✅ تم إضافة نوع «${name}». أرسل اللوحة لتطبيق التغيير.`, ephemeral: true });
  await interaction.message?.edit({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild) }).catch(() => {});
}

// زر حذف نوع: يدخل وضع اختيار النوع المخصص فقط (العامة لا تُحذف)
async function handleTicketDel(interaction) {
  const g = guildCfg.get(interaction.guild.id);
  const types = (g.ticket || {}).ticketTypes || [];
  const custom = types.filter(x => String(x.id || '').startsWith('c'));
  if (!custom.length) {
    await interaction.update({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild) });
    await interaction.followUp({ content: '🗑️ لا توجد أنواع مخصصة للحذف — الأنواع العامة لا تُحذف.', ephemeral: true });
    return;
  }
  await interaction.update({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild, { mode: 'del' }) });
  await interaction.followUp({ content: '🗑️ اختر النوع المخصص الذي تريد حذفه من القائمة بالأسفل.', ephemeral: true });
}

async function handleTicketDelSelect(interaction) {
  const typeId = interaction.values[0];
  if (!typeId) return;
  // حماية: لا يُحذف إلا النوع المخصص (معرّفه يبدأ بـ c)
  const g = guildCfg.get(interaction.guild.id);
  const t = g.ticket || {};
  const types = t.ticketTypes || [];
  const tp = types.find(x => x.id === typeId);
  if (!tp || !String(tp.id || '').startsWith('c')) {
    await interaction.update({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild) });
    await interaction.followUp({ content: '❌ هذا النوع عام ولا يمكن حذفه.', ephemeral: true });
    return;
  }
  t.ticketTypes = types.filter(x => x.id !== typeId);
  saveTicketCfg(interaction.guild.id, t);
  await interaction.update({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild) });
  await interaction.followUp({ content: `🗑️ تم حذف نوع «${tp.label}». أرسل اللوحة لتطبيق التغيير.`, ephemeral: true });
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

// ═══════════ الرئيسية (إحصائيات) ═══════════
async function buildHomeData(guild) {
  const gs = db.guildStats.get(guild.id);
  let tk = { total: 0, open: 0, closed: 0, today: 0 };
  try { tk = db.tickets.stats(guild.id) || tk; } catch (_) {}
  let bansTotal = 0;
  const bans = [];
  try {
    const banList = await guild.bans.fetch();
    bansTotal = banList.size;
    const { AuditLogEvent } = require('discord.js');
    const byUser = {};
    try {
      const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 20 });
      for (const e of audit.entries.values()) if (e.target) byUser[e.target.id] = e.executor?.username || 'غير معروف';
    } catch (_) {}
    banList.forEach((b, id) => bans.push({ username: b.user.username, reason: b.reason || 'بدون سبب', bannedBy: byUser[id] || 'غير معروف' }));
  } catch (_) {}
  return { gs, tk, bansTotal, bans: bans.slice(0, 10) };
}

function homeEmbed(guild, data) {
  const { gs, tk, bansTotal, bans } = data;
  const banList = bans.length
    ? bans.map(b => `• **${b.username}** — ${b.reason} *(بواسطة: ${b.bannedBy})*`).join('\n')
    : 'لا توجد باندات (أو البوت لا يملك صلاحية القراءة).';
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🏠 الرئيسية — نظرة عامة')
    .setDescription([
      `> **${guild.name}** • ${guild.memberCount} عضو • ${guild.channels.cache.size} روم`,
      '',
      `🎫 **التذاكر:** ${tk.open || 0} مفتوحة • ${tk.closed || 0} مغلقة • ${tk.total || 0} إجمالي (${tk.today || 0} اليوم)`,
      `👋 **دخول اليوم:** ${gs.joins_today || 0} • الإجمالي: ${gs.joins_total || 0}`,
      `💬 **رسائل اليوم:** ${gs.msgs_today || 0} • الإجمالي: ${gs.msgs_total || 0}`,
      `⛔ **الباندات:** ${bansTotal}`,
      '',
      '**آخر الباندات:**',
      banList,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function homeRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bd_home_refresh').setLabel('🔄 تحديث الإحصائيات').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 القائمة الرئيسية').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ═══════════ الأمان (حماية كاملة) ═══════════
const SEC_CARDS = {
  channelDelete: { key: 'cd', emoji: '🧹', name: 'حذف الرومات', num: true, action: true, role: true },
  nuke: { key: 'nk', emoji: '💣', name: 'النسف (Nuke)', num: true, action: true },
  ban: { key: 'bn', emoji: '⛔', name: 'حظر جماعي', num: true, action: true },
  kick: { key: 'kk', emoji: '👢', name: 'طرد جماعي', num: true, action: true },
  roleDelete: { key: 'rd', emoji: '🎭', name: 'حذف الرتب', num: true, action: true },
  webhook: { key: 'wh', emoji: '🔗', name: 'إنشاء ويبهوك', num: false, action: true },
  bot: { key: 'bt', emoji: '🤖', name: 'دخول بوتات', num: false, action: false },
};
const SEC_SUBS = {
  core: { emoji: '🛡️', name: 'الرومات والدمار', cards: ['channelDelete', 'nuke', 'webhook', 'bot'] },
  mem: { emoji: '👥', name: 'حماية الأعضاء', cards: ['ban', 'kick'] },
  role: { emoji: '🎭', name: 'حماية الرتب', cards: ['roleDelete'] },
  am: { emoji: '🤖', name: 'أوتومود', cards: [] },
};
const secKeyToField = (key) => Object.keys(SEC_CARDS).find(k => SEC_CARDS[k].key === key);
const pendingSecSub = new Map(); // userId -> sub id

function securityEmbed(client, guild) {
  const g = guildCfg.get(guild.id);
  const prot = g.protectedRoles || [];
  const byp = g.protectionBypassRoles || [];
  const act = g.protectionAction === 'ban' ? 'باند ⛔' : 'طرد 👢';
  const p = g.protection || {};
  const lines = Object.entries(SEC_CARDS).map(([k, c]) => `${c.emoji} **${c.name}:** ${(p[k] && p[k].enabled !== false) ? '✅ مفعّل' : '❌ معطّل'}`);
  const am = p.automod || {};
  const sw = p.swearWords || {};
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🛡️ نظام الأمان والحماية')
    .setDescription([
      `**🔴 الرتب المحمية:** ${prot.length ? prot.map(id => `<@&${id}>`).join(' ') : '`لا توجد`'}`,
      `**🟢 رتب تتجاوز الحماية:** ${byp.length ? byp.map(id => `<@&${id}>`).join(' ') : '`لا توجد`'}`,
      `**⚖️ الإجراء الافتراضي:** ${act}`,
      '',
      '**حالة الحمايات:**',
      lines.join('\n'),
      '',
      '**أوتومود:**',
      `> ${am.enabled !== false ? '✅' : '❌'} مفعّل • ${am.links !== false ? '✅' : '❌'} روابط • ${am.spam !== false ? '✅' : '❌'} سبام • ${am.everyone !== false ? '✅' : '❌'} @everyone • ${sw.enabled !== false ? '✅' : '❌'} ألفاظ`,
      `> ${am.includeAdmins ? '✅' : '❌'} يشمل الأدمنين`,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function securityRows(guild) {
  const { RoleSelectMenuBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
  const g = guildCfg.get(guild.id);
  const protSel = new RoleSelectMenuBuilder()
    .setCustomId('bd_sec_prot')
    .setPlaceholder('🔴 الرتب المحمية (لا تُمس حمايتها)')
    .setMinValues(0).setMaxValues(10);
  if ((g.protectedRoles || []).length) protSel.setDefaultRoles(g.protectedRoles.slice(0, 10));
  const bypSel = new RoleSelectMenuBuilder()
    .setCustomId('bd_sec_bypass')
    .setPlaceholder('🟢 الرتب التي تتجاوز الحماية (المشرفين)')
    .setMinValues(0).setMaxValues(10);
  if ((g.protectionBypassRoles || []).length) bypSel.setDefaultRoles(g.protectionBypassRoles.slice(0, 10));
  const actSel = new StringSelectMenuBuilder()
    .setCustomId('bd_sec_action')
    .setPlaceholder(`الإجراء الافتراضي: ${g.protectionAction === 'ban' ? 'باند' : 'طرد'}`)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('👢 طرد (kick)').setValue('kick').setDescription('طرد المخالف فوراً'),
      new StringSelectMenuOptionBuilder().setLabel('⛔ باند (ban)').setValue('ban').setDescription('حظر المخالف فوراً'),
    );
  return [
    new ActionRowBuilder().addComponents(protSel),
    new ActionRowBuilder().addComponents(bypSel),
    new ActionRowBuilder().addComponents(actSel),
    new ActionRowBuilder().addComponents(
      ...Object.entries(SEC_SUBS).map(([id, s]) =>
        new ButtonBuilder().setCustomId(`bd_sec_sub_${id}`).setLabel(s.name).setEmoji(s.emoji).setStyle(ButtonStyle.Secondary)),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary)),
  ];
}

function secSubEmbed(client, guild, subId) {
  const s = SEC_SUBS[subId] || SEC_SUBS.core;
  const p = guildCfg.get(guild.id).protection || {};
  let lines;
  if (subId === 'am') {
    const am = p.automod || {};
    const sw = p.swearWords || {};
    lines = [
      `> **${am.enabled !== false ? '✅' : '❌'} الأوتومود**`,
      '',
      `🔗 **روابط:** ${am.links !== false ? '✅' : '❌'}`,
      `⚡ **سبام:** ${am.spam !== false ? '✅' : '❌'}`,
      `📢 **@everyone:** ${am.everyone !== false ? '✅' : '❌'}`,
      `🤬 **ألفاظ:** ${sw.enabled !== false ? '✅' : '❌'}`,
      `👮 **يشمل الأدمنين:** ${am.includeAdmins ? '✅' : '❌'}`,
    ];
  } else {
    lines = s.cards.map(k => {
      const c = SEC_CARDS[k];
      const v = p[k] || {};
      const parts = [`${v.enabled !== false ? '✅' : '❌'} **${c.emoji} ${c.name}**`];
      if (c.num) parts.push(`> الحد: **${v.threshold ?? 3}** / **${v.window ?? 10}** ثانية`);
      if (c.action) parts.push(`> الإجراء: **${v.action === 'ban' ? 'باند ⛔' : 'طرد 👢'}**`);
      if (c.role) parts.push(`> تتجاوز: ${v.requiredRole ? `<@&${v.requiredRole}>` : '`أي شخص`'}`);
      return parts.join('\n');
    });
  }
  return new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle(`${s.emoji} ${s.name}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

function secSubRows(guild, subId) {
  const s = SEC_SUBS[subId] || SEC_SUBS.core;
  const p = guildCfg.get(guild.id).protection || {};
  const rows = [];
  if (subId === 'am') {
    const am = p.automod || {};
    const sw = p.swearWords || {};
    const tog = (f, label, on) => new ButtonBuilder()
      .setCustomId(`bd_am_${f}`).setLabel(`${label}: ${on ? '✅' : '❌'}`)
      .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary);
    rows.push(new ActionRowBuilder().addComponents(
      tog('enabled', '🤖 الأوتومود', am.enabled !== false),
      tog('links', '🔗 الروابط', am.links !== false),
      tog('spam', '⚡ السبام', am.spam !== false),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      tog('everyone', '📢 @everyone', am.everyone !== false),
      tog('swear', '🤬 الألفاظ', sw.enabled !== false),
      tog('includeAdmins', '👮 يشمل الأدمنين', !!am.includeAdmins),
    ));
  } else {
    for (let i = 0; i < s.cards.length; i += 2) {
      const btns = [];
      for (const k of s.cards.slice(i, i + 2)) {
        const c = SEC_CARDS[k];
        const v = p[k] || {};
        const on = v.enabled !== false;
        btns.push(new ButtonBuilder()
          .setCustomId(`bd_sec_tog_${c.key}`)
          .setLabel(`${c.emoji} ${c.name}: ${on ? '✅' : '❌'}`)
          .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary));
        if (c.num || c.action) {
          btns.push(new ButtonBuilder().setCustomId(`bd_sec_cfg_${c.key}`).setLabel('⚙️').setStyle(ButtonStyle.Secondary));
        }
      }
      rows.push(new ActionRowBuilder().addComponents(btns));
    }
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bd_sec_back').setLabel('🔙 رجوع لقسم الأمان').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function handleSecCfgShow(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const key = interaction.customId.replace('bd_sec_cfg_', '');
  const fieldName = secKeyToField(key);
  const c = SEC_CARDS[fieldName];
  if (!c) return;
  const v = (guildCfg.get(interaction.guild.id).protection || {})[fieldName] || {};
  pendingSecSub.set(interaction.user.id, pendingSecSub.get(interaction.user.id) || 'core');
  const modal = new ModalBuilder().setCustomId(`bd_sec_cfgm_${key}`).setTitle(`⚙️ ${c.name}`);
  if (c.num) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('sec_threshold').setLabel('الحد الأقصى للعمليات')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4)
        .setValue(String(v.threshold ?? 3)).setPlaceholder('3')),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('sec_window').setLabel('النافذة الزمنية بالثواني')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5)
        .setValue(String(v.window ?? 10)).setPlaceholder('10')),
    );
  }
  if (c.action) {
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('sec_action').setLabel('الإجراء (kick أو ban)')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4)
      .setValue(v.action === 'ban' ? 'ban' : 'kick').setPlaceholder('kick')));
  }
  if (c.role) {
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('sec_role').setLabel('رتبة تتجاوز الحماية (ID) — اختياري')
      .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(25)
      .setValue(v.requiredRole || '').setPlaceholder('123456789012345678')));
  }
  await interaction.showModal(modal);
}

async function handleSecCfgModal(interaction) {
  const key = interaction.customId.replace('bd_sec_cfgm_', '');
  const fieldName = secKeyToField(key);
  const c = SEC_CARDS[fieldName];
  if (!c) return interaction.reply({ content: '❌ إعداد غير معروف.', ephemeral: true });
  const g = guildCfg.get(interaction.guild.id);
  const cur = (g.protection || {})[fieldName] || {};
  const patch = { ...cur };
  if (c.num) {
    const th = parseInt(interaction.fields.getTextInputValue('sec_threshold'), 10);
    const wn = parseInt(interaction.fields.getTextInputValue('sec_window'), 10);
    if (Number.isFinite(th) && th > 0) patch.threshold = Math.min(th, 99);
    if (Number.isFinite(wn) && wn > 0) patch.window = Math.min(wn, 86400);
  }
  if (c.action) {
    const a = interaction.fields.getTextInputValue('sec_action').trim().toLowerCase();
    if (a === 'ban' || a === 'kick') patch.action = a;
  }
  if (c.role) {
    patch.requiredRole = interaction.fields.getTextInputValue('sec_role').replace(/[^0-9]/g, '');
  }
  guildCfg.set(interaction.guild.id, { protection: { [fieldName]: patch } });
  const sub = pendingSecSub.get(interaction.user.id) || 'core';
  await interaction.reply({ content: `✅ تم حفظ إعدادات **${c.name}**.`, ephemeral: true });
  await interaction.message?.edit({
    embeds: [secSubEmbed(interaction.client, interaction.guild, sub)],
    components: secSubRows(interaction.guild, sub),
  }).catch(() => {});
}

async function handleSecToggle(interaction) {
  const fieldName = secKeyToField(interaction.customId.replace('bd_sec_tog_', ''));
  if (!fieldName) return;
  const g = guildCfg.get(interaction.guild.id);
  const cur = (g.protection || {})[fieldName] || {};
  const next = { ...cur, enabled: cur.enabled === false };
  guildCfg.set(interaction.guild.id, { protection: { [fieldName]: next } });
  const sub = pendingSecSub.get(interaction.user.id) || 'core';
  await interaction.update({
    embeds: [secSubEmbed(interaction.client, interaction.guild, sub)],
    components: secSubRows(interaction.guild, sub),
  });
}

async function handleAmToggle(interaction) {
  const f = interaction.customId.replace('bd_am_', '');
  const g = guildCfg.get(interaction.guild.id);
  const p = g.protection || {};
  if (f === 'swear') {
    const cur = p.swearWords || {};
    guildCfg.set(interaction.guild.id, { protection: { swearWords: { ...cur, enabled: cur.enabled === false } } });
  } else {
    const am = p.automod || {};
    const cur = am[f];
    const next = f === 'includeAdmins' ? !cur : cur === false;
    guildCfg.set(interaction.guild.id, { protection: { automod: { ...am, [f]: next } } });
  }
  await interaction.update({
    embeds: [secSubEmbed(interaction.client, interaction.guild, 'am')],
    components: secSubRows(interaction.guild, 'am'),
  });
}

async function handleSecRolesSelect(interaction) {
  const ids = interaction.values || [];
  if (interaction.customId === 'bd_sec_prot') guildCfg.set(interaction.guild.id, { protectedRoles: ids });
  else guildCfg.set(interaction.guild.id, { protectionBypassRoles: ids });
  await interaction.update({ embeds: [securityEmbed(interaction.client, interaction.guild)], components: securityRows(interaction.guild) });
  await interaction.followUp({ content: ids.length ? `✅ تم الحفظ: ${ids.map(id => `<@&${id}>`).join(' ')}` : '✅ تم إفراغ القائمة.', ephemeral: true });
}

async function handleSecActionSelect(interaction) {
  const v = interaction.values[0];
  if (v !== 'kick' && v !== 'ban') return;
  guildCfg.set(interaction.guild.id, { protectionAction: v });
  await interaction.update({ embeds: [securityEmbed(interaction.client, interaction.guild)], components: securityRows(interaction.guild) });
  await interaction.followUp({ content: `✅ الإجراء الافتراضي الآن: ${v === 'ban' ? 'باند ⛔' : 'طرد 👢'}`, ephemeral: true });
}

async function handleSecSub(interaction) {
  const sub = interaction.customId.replace('bd_sec_sub_', '');
  if (!SEC_SUBS[sub]) return;
  pendingSecSub.set(interaction.user.id, sub);
  await interaction.update({
    embeds: [secSubEmbed(interaction.client, interaction.guild, sub)],
    components: secSubRows(interaction.guild, sub),
  });
}

function mainEmbed(client, guild) {
  const embed = new EmbedBuilder()
    .setColor(panelColor(guild))
    .setTitle('🎛️ لوحة التحكم الرئيسية')
    .setDescription([
      Object.entries(PAGES).map(([id, p]) => `${p.emoji} **${p.name}** — ${p.desc}`).join('\n'),
      '',
      `> ${guild?.name || '-'} • ${guild?.memberCount || 0} عضو`,
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
  if (hasLogo) embed.setImage(LOGO_ATTACH);
  return embed;
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
    new ButtonBuilder().setCustomId('bd_botinfo').setLabel('🖌️ تغيير معلومات البوت').setStyle(ButtonStyle.Success),
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
      `> **صورة البوت:** ${g.logoUrl ? 'محددة ✔' : 'الافتراضية'}`,
      `> **لون البوت:** ${color ? `\`#${color.toString(16).padStart(6, '0').toUpperCase()}\`` : 'الأزرق الافتراضي'}`,
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
  if (color < 0 || color > 0xFFFFFF) {
    await interaction.reply({ content: '❌ اللون خارج النطاق المسموح.', ephemeral: true });
    return;
  }
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
  if (pageId === 'home') return homeRows();
  if (pageId === 'security') return securityRows(guild);
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
  if (id === 'bd_tk_del') return handleTicketDel(interaction);
  if (id === 'bd_botinfo') {
    await interaction.update({ embeds: [botInfoEmbed(client, interaction.guild)], components: botInfoRows() });
    return;
  }
  if (id === 'bd_set_color') return handleSetColor(interaction);

  // ══ الرئيسية (إحصائيات) ══
  if (id === 'bd_home' || id === 'bd_home_refresh') {
    const data = await buildHomeData(interaction.guild);
    await interaction.update({ embeds: [homeEmbed(interaction.guild, data)], components: homeRows() });
    return;
  }

  // ══ الأمان ══
  if (id.startsWith('bd_sec_tog_')) return handleSecToggle(interaction);
  if (id.startsWith('bd_sec_cfg_')) return handleSecCfgShow(interaction);
  if (id.startsWith('bd_sec_sub_')) return handleSecSub(interaction);
  if (id === 'bd_sec_back') {
    pendingSecSub.delete(interaction.user.id);
    await interaction.update({ embeds: [securityEmbed(interaction.client, interaction.guild)], components: securityRows(interaction.guild) });
    return;
  }
  if (id === 'bd_sec_prot' || id === 'bd_sec_bypass') return handleSecRolesSelect(interaction);
  if (id === 'bd_sec_action') return handleSecActionSelect(interaction);
  if (id.startsWith('bd_am_')) return handleAmToggle(interaction);

  const pageId = id.replace('bd_', '');
  if (PAGES[pageId]) {
    if (pageId === 'home') {
      const data = await buildHomeData(interaction.guild);
      await interaction.update({ embeds: [homeEmbed(interaction.guild, data)], components: homeRows() });
      return;
    }
    let embed;
    if (pageId === 'security') embed = securityEmbed(interaction.client, interaction.guild);
    else if (pageId === 'ratings') embed = ratingsEmbed(interaction.client, interaction.guild);
    else if (pageId === 'staff') embed = staffEmbed(interaction.client, interaction.guild);
    else if (pageId === 'suggestions') embed = suggestionsEmbed(interaction.client, interaction.guild);
    else if (pageId === 'commands') embed = commandsEmbed2(interaction.client, interaction.guild, pendingCmdPage.get(interaction.user.id) || 0);
    else if (pageId === 'messages') embed = messagesEmbed(interaction.client, interaction.guild);
    else if (pageId === 'tickets') embed = ticketsEmbed(interaction.client, interaction.guild);
    else embed = pageEmbed(interaction, pageId);
    await interaction.update({ embeds: [embed], components: pageRows(pageId, interaction.guild) });
    return;
  }

  // ══ مودالات الأمان ══
  if (id.startsWith('bd_sec_cfgm_')) return handleSecCfgModal(interaction);

  if (id === 'bd_send_ticket_panel') return handleSendTicketPanel(interaction);
  if (id === 'bd_send_suggestions_panel') return sendSuggestionsPanel(interaction);
  if (id === 'bd_send_panel') return handleSendPanel(interaction);
  if (id === 'bd_send_panel_channel') return handleSendPanelChannel(interaction);
  if (id === 'bd_staff_roles') return handleStaffRolesSelect(interaction);
  if (id === 'bd_suggestions_channel') return handleSuggestionsChannelSelect(interaction);
  if (id === 'bd_cmd_pick') return handleCmdPick(interaction);
  if (id === 'bd_cmd_perm') return handleCmdPerm(interaction);
  if (id === 'bd_cmd_next' || id === 'bd_cmd_prev') return handleCmdPage(interaction, id === 'bd_cmd_next' ? 'next' : 'prev');
}

// حمالة لوحة التذاكر
function buildTicketPanelPayload(guild, tcfg) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
  const types = (tcfg.ticketTypes || []).filter(tp => tp.enabled !== false);
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_type_select')
    .setPlaceholder('Select a ticket type...')
    .addOptions(types.map(tp => {
      const opt = new StringSelectMenuOptionBuilder().setLabel(tp.label).setDescription(tp.description).setValue(tp.id);
      if (tp.emoji && /^\p{Extended_Pictographic}$/u.test(tp.emoji.trim())) opt.setEmoji(tp.emoji.trim());
      return opt;
    }));
  const embed = new EmbedBuilder()
    .setColor(0x0099FF) // أزرق ثابت للتذاكر (لون لا يُستبدل بنظام لون السيرفر)
    .setTitle(tcfg.panel?.title || '🎫 Support Tickets')
    .setDescription(`${tcfg.panel?.description || ''}\n\n${types.map(tp => `> ${tp.emoji} **${tp.label}** — ${tp.description}`).join('\n')}`)
    .setFooter({ text: tcfg.panel?.footer || 'NSR HUB - MoDy Dev' });
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

// حمالة لوحة الاقتراحات
function buildSuggestionsPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(panelColor)
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
  return { embeds: [embed], components: [row] };
}

async function sendTicketPanel(interaction, opts) {
  // تفاعل الأزرار والأوامر يجب أن يُجاب خلال 3 ثوانٍ — نعترف فوراً ثم نرسل اللوحة
  try {
    if (!interaction.replied && !interaction.deferred) await interaction.deferReply({ ephemeral: true });
    const tcfg = guildCfg.get(interaction.guild.id).ticket || {};
    // الأنواع المفعّلة فقط تظهر للعضو (الأنواع المطفأة من لوحة التحكم تُخفى)
    const types = (tcfg.ticketTypes || []).filter(tp => tp.enabled !== false);
    if (!types.length) {
      const msg = '❌ لا توجد أنواع تذاكر مفعّلة في هذا السيرفر. فعّل نوعاً واحداً على الأقل من إعدادات التذاكر.';
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      return;
    }
    // لو مررنا روم محدد نرسل فيه (من لوحة التحكم)، وإلا نرسل في الروم الحالي
    const target = opts?.targetChannel || interaction.channel;
    if (!target || !target.send) {
      const msg = '❌ لا يمكن الإرسال في هذا الروم — استخدم الأمر في روم نصي.';
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      return;
    }
    await target.send(buildTicketPanelPayload(interaction.guild, tcfg));
    if (opts?.silent) return;
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: `✅ تم إرسال لوحة التذاكر إلى <#${target.id}>!`, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: `✅ تم إرسال لوحة التذاكر إلى <#${target.id}>!`, ephemeral: true }).catch(() => {});
    }
  } catch (err) {
    log.warn('فشل إرسال لوحة التذاكر: ' + err.message);
    const msg = `❌ تعذر إرسال لوحة التذاكر في هذا الروم.\nتأكد أن البوت يملك صلاحية **إرسال الرسائل** هنا وأن الروم نصي.\n\n\`${err.message}\``;
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    } catch (_) {}
  }
}

// زر إرسال لوحة التذاكر من لوحة التحكم: يطلب اختيار الروم أولاً ثم يرسل فيه
async function handleSendTicketPanel(interaction) {
  const { ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  const chSel = new ChannelSelectMenuBuilder()
    .setCustomId('bd_send_ticket_panel_channel')
    .setPlaceholder('اختر الروم لإرسال لوحة التذاكر...')
    .addChannelTypes(ChannelType.GuildText);
  await interaction.update({
    embeds: [ticketsEmbed(interaction.client, interaction.guild)],
    components: [
      new ActionRowBuilder().addComponents(chSel),
      new ActionRowBuilder().addComponents(backBtn),
    ],
  });
  await interaction.followUp({ content: '📨 اختر الروم من القائمة بالأسفل لإرسال لوحة التذاكر إليه.', ephemeral: true });
}

async function handleSendTicketPanelChannel(interaction) {
  const channelId = interaction.values[0];
  if (!channelId) return;
  const ch = interaction.guild.channels.cache.get(channelId);
  await interaction.update({ embeds: [ticketsEmbed(interaction.client, interaction.guild)], components: ticketsRows(interaction.guild) });
  if (!ch) {
    await interaction.followUp({ content: '❌ الروم غير موجود.', ephemeral: true });
    return;
  }
  try {
    await sendTicketPanel(interaction, { targetChannel: ch, silent: true });
    await interaction.followUp({ content: `✅ تم إرسال لوحة التذاكر إلى <#${ch.id}>!`, ephemeral: true });
  } catch (err) {
    log.warn('فشل إرسال لوحة التذاكر لروم محدد: ' + err.message);
    await interaction.followUp({ content: `❌ تعذر الإرسال إلى <#${ch.id}>: ${err.message}`, ephemeral: true });
  }
}

async function sendSuggestionsPanel(interaction, opts) {
  // لو مررنا روم محدد نرسل فيه، وإلا نرسل في الروم الحالي
  const target = opts?.targetChannel || interaction.channel;
  if (!target || !target.send) throw new Error('الروم المستهدف غير صالح');
  // المستدعي من الزر في اللوحة: نعترف أولاً حتى لا ينتهي تفاعل الزر (3 ثوانٍ)
  if (!interaction.replied && !interaction.deferred) await interaction.deferReply({ ephemeral: true });
  await target.send(buildSuggestionsPanelPayload());
  if (opts?.silent) return;
  await interaction.editReply({ content: `✅ تم إرسال لوحة الاقتراحات إلى <#${target.id}>!`, ephemeral: true });
}

module.exports = { handleDashboard, handleSetLogoModal, handleSetColorModal, mainEmbed, mainRows, PAGES, LOG_EVENTS, commandsEmbed2, commandsRows, handleLogsSelect, handleLogsChannelSelect, handleLogsApply, handleLogsDelete, handleAutoRoleSelect, handleRatingChannelSelect, handleProdRoleSelect, handleProdDeleteSelect, handleProdModal, handleStaffRolesSelect, handleSuggestionsChannelSelect, handleSendPanel, handleSendPanelChannel, handleCmdPick, handleCmdPerm, handleCmdPage, sendTicketPanel, handleSendTicketPanel, handleSendTicketPanelChannel, sendSuggestionsPanel, handleSendRate, handleRateModal, handleWelcomeChannelSelect, handleWelcomeMsgModal, handleWelcomeImgModal, handleTicketToggle, handleTicketAdd, handleTicketAddModal, handleTicketDel, handleTicketDelSelect, buildTicketPanelPayload, buildSuggestionsPanelPayload, pageRows, homeEmbed, homeRows, buildHomeData, securityEmbed, securityRows, secSubEmbed, secSubRows, SEC_SUBS, SEC_CARDS };
