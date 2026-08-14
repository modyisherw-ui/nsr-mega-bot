const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const log = require('./utils/logger');
const db = require('./db');
const guildCfg = require('./guildCfg');
const { systemRows } = require('./modules/adminPanel');
const { getProducts, findProduct, saveRatingConfig } = require('./modules/ratings');

const PAGES = {
  logs: { emoji: '📋', name: 'نظام اللوقات', desc: 'يراقب كل أحداث السيرفر: دخول/خروج الأعضاء، حذف/تعديل الرسائل، الرياكشنات، الفويس، الرتب، القنوات، الباند والطرد، والرتب المحمية.', commands: ['عدّل رومات اللوقات مباشرة من هذه الصفحة عبر القوائم بالأسفل'] },
  autoroles: { emoji: '🤖', name: 'الرولات التلقائية', desc: 'رتبة تُعطى تلقائياً عند دخول الأعضاء، ورتبة تُعطى لكل بوت يدخل السيرفر.', commands: ['اختر الرتبة المطلوبة من القوائم بالأسفل، ويتم الحفظ فوراً'] },
  ratings: { emoji: '🛍️', name: 'المنتجات والتقييمات', desc: 'أضف منتجاتك مع رول كل منتج، وحدد روم التقييمات. ثم استخدم `/rate @عميل` ليرسل البوت رسالة تقييم للعميل على الخاص (عربي/إنجليزي + نجوم + رسالة + نشر التقييم في الروم).', commands: ['اضغط **إضافة منتج** لإنشاء منتج وربط روله', 'اضبط **روم التقييمات** من القائمة بالأسفل', 'ثم نفّذ: `/rate @user` واكتب اسم المنتج'] },
  suggestions: { emoji: '💡', name: 'نظام الاقتراحات', desc: 'زر تقديم اقتراح — الاقتراح يوصل للمالك على الخاص + روم يحدده الأدمن من هنا.', commands: ['اختر **روم الاقتراحات** من القائمة بالأسفل', 'زر اللوحة يشتغل تلقائياً', '`/suggestions panel` — إرسال اللوحة'] },
  system: { emoji: '⚙️', name: 'نظام الإدارة', desc: 'أدوات المودريشن كلها بالأزرار:\n\n**⚙️ العقوبات** — طرد، باند، تحذير، فترة صمت، فك باند.\n**📁 القنوات والرتب** — إنشاء/حذف روم، إنشاء/حذف رتبة، إعطاء رتبة لعضو.\n**📝 الرسائل** — إرسال رسالة، إمبد، إعلان، استفتاء، مسح رسائل.\n**🛠️ أدوات** — قفل/فتح القناة، وضع بطيء، لوحة الرتب، جيفاواي.\n\nاضغط أي زر وسيطلب منك البيانات المطلوبة.', commands: [] },
  tickets: { emoji: '🎫', name: 'نظام التذاكر', desc: 'تذاكر دعم خاصة باختيارات وأنواع، مع تقييم بعد الإغلاق وسجل نقل.', commands: ['`/ticket panel` — إرسال لوحة التذاكر', '`/ticket stats` — الإحصائيات', '`/ticket close` — إغلاق يدوي', '`/ticket add/remove` — إدارة الأعضاء'] },
  commands: { emoji: '📜', name: 'قائمة الأوامر', desc: 'عرض جميع الأوامر وصلاحياتها. يمكن تعديل الكود في GitHub إذا لزم الأمر.', commands: [] },
  broadcast: { emoji: '📢', name: 'نظام البرودكاست', desc: 'إرسال رسائل جماعية للأعضاء على الخاص مع شريط تقدم وتقرير.', commands: ['`/broadcast` — إرسال برودكاست', '`/bc_stats` — الإحصائيات', '`/reset_blocked` — مسح المحظورين'] },
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

function saveLogChannels(guildId) {
  try {
    const g = guildCfg.get(guildId);
    guildCfg.set(guildId, { logChannels: g.logChannels || {} });
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
    .setColor(0x5865F2)
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
    .setFooter({ text: 'لوحة التحكم • NSR BOT' })
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
    .setColor(0x5865F2)
    .setTitle('👮 رتب الإدارة')
    .setDescription([
      'هذه الرتب تستطيع استخدام أوامر الإدارة مثل `/rate` و`/ticket panel` وغيرها.',
      'لوحة التحكم نفسها تبقى **للأدمن (Administrator) فقط**.',
      '',
      `**رتب الإدارة الحالية:**`,
      list,
    ].join('\n'))
    .setFooter({ text: 'لوحة التحكم • NSR BOT' })
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
    .setColor(0x5865F2)
    .setTitle('💡 نظام الاقتراحات')
    .setDescription([
      `**روم الاقتراحات:** ${channel ? `<#${channel.id}>` : '`غير محدد`'}`,
      '',
      'عندما يرسل أحدهم اقتراحاً سيصلك على الخاص **ومعه نسخة في الروم** المحدد بالأسفل.',
    ].join('\n'))
    .setFooter({ text: 'لوحة التحكم • NSR BOT' })
    .setTimestamp();
}

function suggestionsRows(guild) {
  const { ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  const channelId = guildCfg.get(guild.id).suggestions?.channelId || '';
  const chSel = new ChannelSelectMenuBuilder()
    .setCustomId('bd_suggestions_channel')
    .setPlaceholder(channelId && guild?.channels?.cache?.get(channelId) ? `روم الاقتراحات: #${guild.channels.cache.get(channelId).name}` : 'اختر روم الاقتراحات...')
    .addChannelTypes(ChannelType.GuildText);
  if (channelId && guild?.channels?.cache?.get(channelId)) chSel.setDefaultChannels([channelId]);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(chSel),
    new ActionRowBuilder().addComponents(backBtn),
  ];
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

function commandsEmbed2(client, guild) {
  const cfg = guildCfg.get(guild.id).commands || {};
  const lines = getAllCommandsList().map(c => {
    const acc = cfg[c.name] || 'any';
    return `**/${c.name}** — ${c.desc}\n> ${ACCESS_LABELS[acc]}`;
  });
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📜 قائمة الأوامر والصلاحيات')
    .setDescription([
      'هذه قائمة أوامر البوت. اختر أمراً من القائمة بالأسفل لتغيير من يستطيع استخدامه.',
      '',
      '**الأوامر والصلاحيات الحالية:**',
      '',
      lines.join('\n'),
    ].join('\n'))
    .setFooter({ text: 'لوحة التحكم • NSR BOT' })
    .setTimestamp();
}

const pendingCmd = new Map(); // userId -> command name

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

  const cmdSel = new StringSelectMenuBuilder()
    .setCustomId('bd_cmd_pick')
    .setPlaceholder('اختر أمراً لتغيير صلاحيته...')
    .addOptions(cmds.map(c => new StringSelectMenuOptionBuilder()
      .setLabel(`/${c.name}`)
      .setDescription(c.desc.slice(0, 50))
      .setValue(c.name)));
  return [
    new ActionRowBuilder().addComponents(cmdSel),
    new ActionRowBuilder().addComponents(backBtn),
  ];
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
    .setColor(0x5865F2)
    .setTitle(`${p.emoji} ${p.name}`)
    .setDescription(parts.join('\n'))
    .setFooter({ text: 'لوحة التحكم • NSR BOT' })
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
    .setColor(0x5865F2)
    .setTitle('🤖 الرولات التلقائية')
    .setDescription([
      'اختر من القوائم بالأسفل، ويُحفظ فوراً.',
      '',
      `👤 **رتبة الأعضاء:** ${memberRole ? `<@&${memberRole.id}>` : '`غير محددة`'}`,
      `🤖 **رتبة البوتات:** ${botRole ? `<@&${botRole.id}>` : '`غير محددة`'}`,
      '',
      '> سيحصل أي عضو/بوت يدخل السيرفر على رتبته تلقائياً.',
    ].join('\n'))
    .setFooter({ text: 'لوحة التحكم • NSR BOT' })
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
    .setColor(0x5865F2)
    .setTitle('🛍️ المنتجات والتقييمات')
    .setDescription([
      `**روم التقييمات:** ${room ? `<#${room.id}>` : '`غير محدد`'}`,
      '',
      '**المنتجات المسجلة:**',
      lines,
    ].join('\n'))
    .setFooter({ text: 'لوحة التحكم • NSR BOT' })
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
  saveRatingConfig(interaction.guild.id);
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild) });
  await interaction.followUp({ content: `✅ تم ضبط روم التقييمات: <#${channelId}>`, ephemeral: true });
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
  saveRatingConfig(interaction.guild.id);
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
  const product = findProduct(interaction.guild.id, productId);
  if (!product) {
    await interaction.reply({ content: '⚠️ المنتج غير موجود، جرّب مرة أخرى.', ephemeral: true });
    return;
  }
  product.roleId = roleId;
  pendingProductRole.delete(interaction.user.id);
  saveRatingConfig(interaction.guild.id);
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
  const product = findProduct(interaction.guild.id, productId);
  const g = guildCfg.get(interaction.guild.id);
  if (g.rating) g.rating.products = (g.rating.products || []).filter(p => p.id !== productId);
  saveRatingConfig(interaction.guild.id);
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild) });
  await interaction.followUp({ content: `🗑️ تم حذف المنتج **«${product?.name || ''}»**.`, ephemeral: true });
}

async function handleProdCancel(interaction) {
  pendingProductRole.delete(interaction.user.id);
  await interaction.update({ embeds: [ratingsEmbed(interaction.client, interaction.guild)], components: ratingsRows(interaction.guild) });
}

function mainEmbed(client, guild) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎛️ لوحة التحكم الرئيسية')
    .setDescription([
      'اختر النظام الذي تريد الدخول إليه:',
      '',
      Object.entries(PAGES).map(([id, p]) => `${p.emoji} **${p.name}**`).join('\n'),
      '',
      `> السيرفر: **${guild?.name || '-'}**`,
    ].join('\n'))
    .setFooter({ text: 'اضغط على أي زر للدخول للنظام' })
    .setTimestamp();
}

function mainRows() {
  const ids = Object.keys(PAGES);
  const rows = [];
  for (let i = 0; i < ids.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      ids.slice(i, i + 5).map(id =>
        new ButtonBuilder().setCustomId(`bd_${id}`).setLabel(PAGES[id].name).setEmoji(PAGES[id].emoji).setStyle(ButtonStyle.Primary)
      )
    );
    rows.push(row);
  }
  return rows;
}

function pageRows(pageId, guild) {
  if (pageId === 'logs') return logsRows(guild);
  if (pageId === 'autoroles') return autorolesRows(guild);
  if (pageId === 'ratings') return ratingsRows(guild);
  if (pageId === 'staff') return staffRows(guild);
  if (pageId === 'suggestions') return suggestionsRows(guild);
  if (pageId === 'commands') return commandsRows(guild);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  if (pageId === 'system') return [...systemRows(), new ActionRowBuilder().addComponents(backBtn)];
  const row = new ActionRowBuilder().addComponents(backBtn);
  if (pageId === 'tickets') row.addComponents(new ButtonBuilder().setCustomId('bd_send_ticket_panel').setLabel('إرسال لوحة التذاكر').setStyle(ButtonStyle.Success));
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
  if (id === PROD_CANCEL) return handleProdCancel(interaction);

  const pageId = id.replace('bd_', '');
  if (PAGES[pageId]) {
    let embed;
    if (pageId === 'ratings') embed = ratingsEmbed(interaction.client, interaction.guild);
    else if (pageId === 'staff') embed = staffEmbed(interaction.client, interaction.guild);
    else if (pageId === 'suggestions') embed = suggestionsEmbed(interaction.client, interaction.guild);
    else if (pageId === 'commands') embed = commandsEmbed2(interaction.client, interaction.guild);
    else embed = pageEmbed(interaction, pageId);
    await interaction.update({ embeds: [embed], components: pageRows(pageId, interaction.guild) });
    return;
  }

  if (id === 'bd_send_ticket_panel') return sendTicketPanel(interaction);
  if (id === 'bd_send_suggestions_panel') return sendSuggestionsPanel(interaction);
  if (id === 'bd_staff_roles') return handleStaffRolesSelect(interaction);
  if (id === 'bd_suggestions_channel') return handleSuggestionsChannelSelect(interaction);
  if (id === 'bd_cmd_pick') return handleCmdPick(interaction);
  if (id === 'bd_cmd_perm') return handleCmdPerm(interaction);
}

async function sendTicketPanel(interaction) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
  const { tickets } = db;
  const tcfg = guildCfg.get(interaction.guild.id).ticket || {};
  const types = tcfg.ticketTypes || [];
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_type_select')
    .setPlaceholder('Select a ticket type...')
    .addOptions(types.map(tp => new StringSelectMenuOptionBuilder().setLabel(tp.label).setDescription(tp.description).setValue(tp.id).setEmoji(tp.emoji)));
  const embed = new EmbedBuilder()
    .setColor(tcfg.panel?.color || 0x5865F2)
    .setTitle(tcfg.panel?.title || '🎫 Support Tickets')
    .setDescription(`${tcfg.panel?.description || ''}\n\n${types.map(tp => `> ${tp.emoji} **${tp.label}** — ${tp.description}`).join('\n')}`)
    .setFooter({ text: tcfg.panel?.footer || 'NSR BOT' });
  await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
  await interaction.reply({ content: '✅ تم إرسال لوحة التذاكر!', ephemeral: true });
}

async function sendSuggestionsPanel(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📬 Suggestion Box | صندوق الاقتراحات')
    .setDescription([
      '**English**',
      'Have an idea or feedback? Hit the button and share it!',
      '',
      '**العربية**',
      'هل لديك فكرة أو ملاحظات؟ اضغط على الزر وشاركها!',
    ].join('\n'))
    .setFooter({ text: 'Your feedback matters 💙 | رأيك يهمنا 💙' })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_suggestion_modal').setLabel('✏️ Submit a Suggestion | قدّم اقتراحاً').setStyle(ButtonStyle.Primary)
  );
  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ تم إرسال لوحة الاقتراحات!', ephemeral: true });
}

module.exports = { handleDashboard, mainEmbed, mainRows, PAGES, handleLogsSelect, handleLogsChannelSelect, handleLogsApply, handleLogsDelete, handleAutoRoleSelect, handleRatingChannelSelect, handleProdRoleSelect, handleProdDeleteSelect, handleProdModal, handleStaffRolesSelect, handleSuggestionsChannelSelect, handleCmdPick, handleCmdPerm, sendTicketPanel, sendSuggestionsPanel };
