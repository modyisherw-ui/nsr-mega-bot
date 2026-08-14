const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, RoleSelectMenuBuilder } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');

function toId(str) {
  const s = String(str).trim();
  const m = s.match(/(\d{15,20})/);
  return m ? m[1] : null;
}

async function resolveMember(interaction, str) {
  const id = toId(str);
  if (!id) return null;
  try { return await interaction.guild.members.fetch(id); } catch { return null; }
}

function resolveRole(guild, str) {
  const s = String(str).trim();
  const id = toId(s);
  let role = id ? guild.roles.cache.get(id) : null;
  if (!role) role = guild.roles.cache.find(r => r.name.toLowerCase() === s.toLowerCase());
  return role || null;
}

const ACTIONS = [
  ['kick', '👢 طرد', ButtonStyle.Danger, PermissionFlagsBits.KickMembers],
  ['ban', '⛔ باند', ButtonStyle.Danger, PermissionFlagsBits.BanMembers],
  ['warn', '⚠️ تحذير', ButtonStyle.Secondary, PermissionFlagsBits.ModerateMembers],
  ['timeout', '⏳ فترة صمت', ButtonStyle.Primary, PermissionFlagsBits.ModerateMembers],
  ['unban', '✅ فك باند', ButtonStyle.Secondary, PermissionFlagsBits.BanMembers],

  ['createchannel', '➕ روم', ButtonStyle.Success, PermissionFlagsBits.ManageChannels],
  ['deletechannel', '🗑️ حذف روم', ButtonStyle.Danger, PermissionFlagsBits.ManageChannels],
  ['createrole', '➕ رتبة', ButtonStyle.Success, PermissionFlagsBits.ManageRoles],
  ['deleterole', '🗑️ حذف رتبة', ButtonStyle.Danger, PermissionFlagsBits.ManageRoles],
  ['role', '🎭 رتبة لعضو', ButtonStyle.Primary, PermissionFlagsBits.ManageRoles],

  ['say', '📢 رسالة', ButtonStyle.Secondary, PermissionFlagsBits.ManageMessages],
  ['embed', '📋 إمبد', ButtonStyle.Secondary, PermissionFlagsBits.ManageMessages],
  ['announce', '📣 إعلان', ButtonStyle.Primary, PermissionFlagsBits.ManageMessages],
  ['poll', '📊 استفتاء', ButtonStyle.Primary, PermissionFlagsBits.ManageMessages],
  ['purge', '🧹 مسح رسائل', ButtonStyle.Danger, PermissionFlagsBits.ManageMessages],

  ['lock', '🔒 قفل القناة', ButtonStyle.Secondary, PermissionFlagsBits.ManageChannels],
  ['unlock', '🔓 فتح القناة', ButtonStyle.Secondary, PermissionFlagsBits.ManageChannels],
  ['slowmode', '🐢 وضع بطيء', ButtonStyle.Primary, PermissionFlagsBits.ManageChannels],
  ['rolespanel', '🏷️ لوحة الرتب', ButtonStyle.Success, PermissionFlagsBits.ManageRoles],
  ['giveaway', '🎁 جيفاواي', ButtonStyle.Success, PermissionFlagsBits.ManageMessages],
];

async function showCmdList(interaction) {
  const dash = require('../dashboard');
  await interaction.update({
    embeds: [dash.commandsEmbed2(interaction.client, interaction.guild, 0)],
    components: dash.commandsRows(interaction.guild, { page: 0 }),
  });
}

function systemRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('admn_embed').setLabel('📋 إمبد').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admn_cmdlist').setLabel('📜 الأوامر').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admn_say').setLabel('📢 رسالة').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('admn_staff').setLabel('👮 رتبة الإدارة').setStyle(ButtonStyle.Primary),
    ),
  ];
}

// f = { id, label, ph, required(true), long(false), value }
function makeModal(action, title, fields) {
  const modal = new ModalBuilder().setCustomId(`admn_${action}_modal`).setTitle(title);
  const rows = fields.map(f => {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel(f.label)
      .setPlaceholder(f.ph || '')
      .setRequired(f.required !== false)
      .setStyle(f.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setMaxLength(f.max || 1024);
    if (f.value) input.setValue(f.value);
    return new ActionRowBuilder().addComponents(input);
  });
  modal.addComponents(rows);
  return modal;
}

const val = (i, id) => i.fields.getTextInputValue(id).trim();

function staffEmbed(interaction) {
  const roles = require('../guildCfg').get(interaction.guild.id).staffRoles || [];
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('👮 رتب الإدارة')
    .setDescription([
      'الرتب المضافة هنا تستطيع استخدام أوامر البوت مثل `/rate` و`/ticket`.',
      'لوحة التحكم نفسها تبقى **للأدمن (Administrator) فقط**.',
      '',
      '**رتب الإدارة الحالية:**',
      roles.length ? roles.map(id => `<@&${id}>`).join(' ') : '`لا توجد رتب إدارة`',
    ].join('\n'))
    .setFooter({ text: 'NSR HUB - MoDy Dev' })
    .setTimestamp();
}

async function showStaffPanel(interaction, addMode) {
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  if (!addMode) {
    const addBtn = new ButtonBuilder().setCustomId('admn_staff_add').setLabel('➕ إضافة رتبة').setStyle(ButtonStyle.Success);
    await interaction.update({
      embeds: [staffEmbed(interaction)],
      components: [
        new ActionRowBuilder().addComponents(addBtn),
        new ActionRowBuilder().addComponents(backBtn),
      ],
    });
    return;
  }
  const roles = require('../guildCfg').get(interaction.guild.id).staffRoles || [];
  const sel = new RoleSelectMenuBuilder()
    .setCustomId('admn_staff_roles')
    .setPlaceholder('👮 اختر رتب الأدمن الجديدة...')
    .setMinValues(1);
  if (roles.length) sel.setDefaultRoles(roles);
  const cancelBtn = new ButtonBuilder().setCustomId('admn_staff').setLabel('↩️ رجوع').setStyle(ButtonStyle.Secondary);
  await interaction.update({
    embeds: [staffEmbed(interaction)],
    components: [
      new ActionRowBuilder().addComponents(sel),
      new ActionRowBuilder().addComponents(cancelBtn, backBtn),
    ],
  });
}

async function handleStaffRolesSelect(interaction) {
  const roleIds = interaction.values || [];
  const g = require('../guildCfg').get(interaction.guild.id);
  g.staffRoles = roleIds;
  require('../guildCfg').set(interaction.guild.id, { staffRoles: roleIds });
  await interaction.update({ embeds: [staffEmbed(interaction)], components: staffListComponents(interaction.guild) });
  await interaction.followUp({
    content: roleIds.length ? `✅ تم تعيين رتب الإدارة: ${roleIds.map(id => `<@&${id}>`).join(' ')}` : '✅ تم إفراغ القائمة.',
    ephemeral: true,
  });
}

function staffListComponents(guild) {
  const addBtn = new ButtonBuilder().setCustomId('admn_staff_add').setLabel('➕ إضافة رتبة').setStyle(ButtonStyle.Success);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(addBtn),
    new ActionRowBuilder().addComponents(backBtn),
  ];
}

// اختيار روم الإمبد/الرسالة: يخزن روم الانتظار ثم يفتح المودال
const pendingMsgChannel = new Map(); // userId -> channelId

function embedChannelRow() {
  const { ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  const chSel = new ChannelSelectMenuBuilder()
    .setCustomId('admn_embed_channel')
    .setPlaceholder('📌 اختر الروم الذي تريد الإرسال فيه...')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const backBtn = new ButtonBuilder().setCustomId('bd_back').setLabel('🔙 رجوع للرئيسية').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(chSel),
    new ActionRowBuilder().addComponents(backBtn),
  ];
}

async function handleEmbedChannelSelect(interaction) {
  const channelId = interaction.values[0];
  if (!channelId) return;
  pendingMsgChannel.set(interaction.user.id, channelId);
  const U = (id, label, ph, required = true, value) => ({ id, label, ph, required, value });
  await interaction.showModal(makeModal('embed', '📋 إرسال إمبد', [
    U('f_title', 'العنوان', 'عنوان الإمبد'), { id: 'f_desc', label: 'الوصف', ph: 'وصف الإمبد', required: true, long: true }]));
}

async function handleAdminButton(interaction) {
  const action = interaction.customId.replace('admn_', '');
  if (action === 'cmdlist') return showCmdList(interaction);
  if (action === 'staff' || action === 'staff_add') return showStaffPanel(interaction, action === 'staff_add');
  const cfg = ACTIONS.find(a => a[0] === action);
  if (!cfg) return;
  const [, , , perm] = cfg;
  if (perm && !interaction.member.permissions.has(perm)) {
    await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true });
    return;
  }

  const U = (id, label, ph, required = true, value) => ({ id, label, ph, required, value });

  switch (action) {
    case 'embed': return interaction.update({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('📋 إرسال إمبد').setDescription(['خطوة 1/2: اختر الروم الذي تريد إرسال الإمبد فيه.', '', '> ثم سيفتح لك نافذة لكتابة العنوان والوصف.'].join('\n')).setFooter({ text: 'NSR HUB - MoDy Dev' })], components: embedChannelRow() });
    case 'say': return interaction.showModal(makeModal('say', '📢 إرسال رسالة', [{ id: 'f_message', label: 'الرسالة', ph: 'النص', required: true, long: true }]));
    case 'lock': return lockChannel(interaction, false);
    case 'unlock': return lockChannel(interaction, true);
    case 'rolespanel': return sendRolesPanel(interaction);
    case 'kick': return interaction.showModal(makeModal('kick', '👢 طرد عضو', [
      U('f_user', 'معرف العضو', 'كليك يمين على العضو ← نسخ معرف المستخدم'), U('f_reason', 'السبب (اختياري)', '', false)]));
    case 'ban': return interaction.showModal(makeModal('ban', '⛔ باند عضو', [
      U('f_user', 'معرف العضو', 'كليك يمين على العضو ← نسخ معرف المستخدم'), U('f_reason', 'السبب (اختياري)', '', false)]));
    case 'warn': return interaction.showModal(makeModal('warn', '⚠️ تحذير عضو', [
      U('f_user', 'معرف العضو', 'كليك يمين على العضو ← نسخ معرف المستخدم'), U('f_reason', 'السبب (اختياري)', '', false)]));
    case 'timeout': return interaction.showModal(makeModal('timeout', '⏳ فترة صمت', [
      U('f_user', 'معرف العضو', 'كليك يمين على العضو ← نسخ معرف المستخدم'),
      U('f_minutes', 'المدة بالدقائق', 'مثال: 30'), U('f_reason', 'السبب (اختياري)', '', false)]));
    case 'unban': return interaction.showModal(makeModal('unban', '✅ فك باند', [U('f_user', 'معرف المستخدم', 'معرف المستخدم المحظور')]));
    case 'createchannel': return interaction.showModal(makeModal('createchannel', '➕ إنشاء روم', [
      U('f_name', 'اسم الروم', 'اسم الروم'), U('f_type', 'النوع (text/voice/category)', '', false, 'text')]));
    case 'deletechannel': return interaction.showModal(makeModal('deletechannel', '🗑️ حذف روم', [U('f_channel', 'معرف القناة', 'كليك يمين على القناة ← نسخ معرف القناة')]));
    case 'createrole': return interaction.showModal(makeModal('createrole', '➕ إنشاء رتبة', [U('f_name', 'اسم الرتبة', 'اسم الرتبة')]));
    case 'deleterole': return interaction.showModal(makeModal('deleterole', '🗑️ حذف رتبة', [U('f_role', 'اسم أو معرف الرتبة', 'اسم الرتبة')]));
    case 'role': return interaction.showModal(makeModal('role', '🎭 إعطاء/سحب رتبة', [
      U('f_user', 'معرف العضو', 'كليك يمين على العضو ← نسخ معرف المستخدم'), U('f_role', 'اسم أو معرف الرتبة', 'اسم الرتبة')]));
    case 'announce': return interaction.showModal(makeModal('announce', '📣 إعلان', [
      { id: 'f_message', label: 'الإعلان', ph: 'نص الإعلان', required: true, long: true }, U('f_role', 'رتبة المنشن (اختياري)', '', false)]));
    case 'poll': return interaction.showModal(makeModal('poll', '📊 استفتاء', [U('f_question', 'السؤال', 'سؤال الاستفتاء')]));
    case 'purge': return interaction.showModal(makeModal('purge', '🧹 مسح رسائل', [U('f_amount', 'العدد (1-100)', 'مثال: 20')]));
    case 'slowmode': return interaction.showModal(makeModal('slowmode', '🐢 وضع بطيء', [U('f_seconds', 'المدة بالثواني', 'مثال: 10')]));
    case 'giveaway': return interaction.showModal(makeModal('giveaway', '🎁 جيفاواي', [
      U('f_prize', 'الجائزة', 'مثال: Nitro'),
      U('f_duration', 'المدة بالدقائق', 'مثال: 60'), U('f_channel', 'القناة (اختياري)', 'معرف القناة', false)]));
    default: return;
  }
}

async function lockChannel(interaction, unlock) {
  try {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: unlock ? null : false });
    await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, unlock ? '🔓 تم فتح القناة' : '🔒 تم قفل القناة', `${interaction.channel.name}`)] });
  } catch (err) { await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }); }
}

async function sendRolesPanel(interaction) {
  const roles = interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id && r.managed === false && r.members.size > 0).sort((a, b) => b.position - a.position).first(10);
  if (!roles.length) { await interaction.reply({ content: '❌ لا توجد رتب للأعضاء.', ephemeral: true }); return; }
  const row = new ActionRowBuilder().addComponents(roles.map(r => new ButtonBuilder().setCustomId(`role_${r.id}`).setLabel(r.name).setStyle(ButtonStyle.Secondary)));
  const embed = new EmbedBuilder().setTitle('🏷️ لوحة الرتب').setColor('Blurple').setDescription('اضغط على الزر للحصول على الرتبة أو إزالتها.').setTimestamp();
  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: '✅ تم إرسال لوحة الرتب.', ephemeral: true });
}

async function handleAdminModal(interaction) {
  const action = interaction.customId.replace('admn_', '').replace('_modal', '');
  const cfg = ACTIONS.find(a => a[0] === action);
  if (!cfg) return;
  const [, , , perm] = cfg;
  if (perm && !interaction.member.permissions.has(perm)) {
    await interaction.reply({ content: '❌ بدون صلاحية.', ephemeral: true });
    return;
  }

  try {
    switch (action) {
      case 'kick': {
        const target = await resolveMember(interaction, val(interaction, 'f_user'));
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود، تأكد من المعرف.', ephemeral: true }); return; }
        if (target.id === interaction.user.id) { await interaction.reply({ content: '❌ لا يمكنك طرد نفسك.', ephemeral: true }); return; }
        const reason = val(interaction, 'f_reason') || 'بدون سبب';
        await target.kick(reason);
        await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, '👢 تم طرد العضو', `**العضو:** ${target.user.tag}\n**السبب:** ${reason}`)] });
        return;
      }
      case 'ban': {
        const target = await resolveMember(interaction, val(interaction, 'f_user'));
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود، تأكد من المعرف.', ephemeral: true }); return; }
        const reason = val(interaction, 'f_reason') || 'بدون سبب';
        await interaction.guild.members.ban(target, { reason });
        await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, '⛔ تم باند العضو', `**العضو:** ${target.user.tag}\n**السبب:** ${reason}`)] });
        return;
      }
      case 'warn': {
        const target = await resolveMember(interaction, val(interaction, 'f_user'));
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود، تأكد من المعرف.', ephemeral: true }); return; }
        const reason = val(interaction, 'f_reason') || 'بدون سبب';
        db.warnings.add(interaction.guild.id, target.id, reason, interaction.user.id);
        const count = db.warnings.list(interaction.guild.id, target.id).length;
        await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, '⚠️ تم تحذير العضو', `**العضو:** ${target.user.tag}\n**السبب:** ${reason}\n**عدد التحذيرات:** \`${count}\``)] });
        target.send({ content: `⚠️ تم تحذيرك في ${interaction.guild.name}!\n**السبب:** ${reason}` }).catch(() => {});
        return;
      }
      case 'timeout': {
        const target = await resolveMember(interaction, val(interaction, 'f_user'));
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود، تأكد من المعرف.', ephemeral: true }); return; }
        const minutes = parseInt(val(interaction, 'f_minutes'));
        if (!minutes || minutes < 1) { await interaction.reply({ content: '❌ أدخل مدة صحيحة بالدقائق.', ephemeral: true }); return; }
        const reason = val(interaction, 'f_reason') || 'بدون سبب';
        await target.timeout(minutes * 60000, reason);
        await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, '⏳ تم تطبيق الفترة', `**العضو:** ${target.user.tag}\n**المدة:** ${minutes} دقيقة\n**السبب:** ${reason}`)] });
        return;
      }
      case 'unban': {
        const id = toId(val(interaction, 'f_user'));
        if (!id) { await interaction.reply({ content: '❌ أدخل معرف صحيح.', ephemeral: true }); return; }
        await interaction.guild.members.unban(id);
        await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, '✅ تم إلغاء الباند', `<@${id}>`)] });
        return;
      }
      case 'createchannel': {
        const name = val(interaction, 'f_name');
        const type = (val(interaction, 'f_type') || 'text').toLowerCase();
        const channel = await interaction.guild.channels.create({ name, type: type === 'voice' ? 2 : type === 'category' ? 4 : 0 });
        await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, '➕ تم إنشاء الروم', `<#${channel.id}>`)] });
        return;
      }
      case 'deletechannel': {
        const id = toId(val(interaction, 'f_channel'));
        const channel = id ? interaction.guild.channels.cache.get(id) : null;
        if (!channel) { await interaction.reply({ content: '❌ القناة غير موجودة، تأكد من المعرف.', ephemeral: true }); return; }
        await interaction.reply({ content: `🗑️ جاري حذف ${channel.name}...`, ephemeral: true });
        await channel.delete('حذف بواسطة إدارة');
        return;
      }
      case 'createrole': {
        const role = await interaction.guild.roles.create({ name: val(interaction, 'f_name') });
        await interaction.reply({ content: `✅ تم إنشاء رتبة **${role.name}**.` });
        return;
      }
      case 'deleterole': {
        const role = resolveRole(interaction.guild, val(interaction, 'f_role'));
        if (!role) { await interaction.reply({ content: '❌ الرتبة غير موجودة.', ephemeral: true }); return; }
        await role.delete();
        await interaction.reply({ content: `✅ تم حذف رتبة **${role.name}**.` });
        return;
      }
      case 'role': {
        const target = await resolveMember(interaction, val(interaction, 'f_user'));
        const role = resolveRole(interaction.guild, val(interaction, 'f_role'));
        if (!target) { await interaction.reply({ content: '❌ العضو غير موجود، تأكد من المعرف.', ephemeral: true }); return; }
        if (!role) { await interaction.reply({ content: '❌ الرتبة غير موجودة.', ephemeral: true }); return; }
        if (target.roles.cache.has(role.id)) {
          await target.roles.remove(role);
          await interaction.reply({ content: `✅ تم سحب رتبة **${role.name}** من ${target.user.tag}.` });
        } else {
          await target.roles.add(role);
          await interaction.reply({ content: `✅ تم إعطاء **${role.name}** لـ ${target.user.tag}.` });
        }
        return;
      }
      case 'say': {
        await interaction.channel.send({ content: val(interaction, 'f_message') });
        await interaction.reply({ content: '✅ تم الإرسال.', ephemeral: true });
        return;
      }
      case 'embed': {
        const targetChannel = pendingMsgChannel.get(interaction.user.id);
        pendingMsgChannel.delete(interaction.user.id);
        let channel = targetChannel ? interaction.guild.channels.cache.get(targetChannel) : interaction.channel;
        if (!channel) channel = interaction.channel;
        const embed = new EmbedBuilder().setTitle(val(interaction, 'f_title')).setDescription(val(interaction, 'f_desc')).setColor('Blurple').setFooter({ text: interaction.user.tag });
        await channel.send({ embeds: [embed] });
        await interaction.reply({ content: `✅ تم الإرسال إلى <#${channel.id}>.`, ephemeral: true });
        return;
      }
      case 'announce': {
        const role = val(interaction, 'f_role') ? resolveRole(interaction.guild, val(interaction, 'f_role')) : null;
        await interaction.channel.send({ content: (role ? `<@&${role.id}> ` : '@everyone ') + val(interaction, 'f_message') });
        await interaction.reply({ content: '✅ تم الإعلان.', ephemeral: true });
        return;
      }
      case 'poll': {
        const msg = await interaction.channel.send({ content: `📊 **${val(interaction, 'f_question')}**` });
        await msg.react('👍'); await msg.react('👎'); await msg.react('🤷');
        await interaction.reply({ content: '✅ تم إنشاء الاستفتاء.', ephemeral: true });
        return;
      }
      case 'purge': {
        const amount = Math.min(100, Math.max(1, parseInt(val(interaction, 'f_amount')) || 1));
        await interaction.channel.bulkDelete(amount, true);
        const reply = await interaction.channel.send({ content: `🧹 تم حذف \`${amount}\` رسالة.` });
        setTimeout(() => reply.delete().catch(() => {}), 3000);
        return;
      }
      case 'slowmode': {
        const seconds = Math.max(0, parseInt(val(interaction, 'f_seconds')) || 0);
        await interaction.channel.setRateLimitPerUser(seconds);
        await interaction.reply({ embeds: [new emb.successEmbed(interaction.client, '🐢 تم تعيين الوضع البطيء', `\`${seconds}\` ثانية`)] });
        return;
      }
      case 'giveaway': {
        const prize = val(interaction, 'f_prize');
        const duration = parseInt(val(interaction, 'f_duration'));
        if (!prize || !duration || duration < 1) { await interaction.reply({ content: '❌ أدخل الجائزة والمدة الصحيحة.', ephemeral: true }); return; }
        const chId = toId(val(interaction, 'f_channel'));
        const channel = chId ? interaction.guild.channels.cache.get(chId) : interaction.channel;
        if (!channel) { await interaction.reply({ content: '❌ القناة غير موجودة.', ephemeral: true }); return; }
        const endAt = Date.now() + duration * 60000;
        const embed = new EmbedBuilder()
          .setTitle(`🎉 ${prize}`)
          .setColor('Gold')
          .setDescription([`**ينتهي:** <t:${Math.floor(endAt / 1000)}:R>`, `**الفائز:** ?`, '', '> اضغط على 🎉 للمشاركة!'].join('\n'))
          .setFooter({ text: `بواسطة ${interaction.user.tag}` })
          .setTimestamp();
        const msg = await channel.send({ embeds: [embed] });
        await msg.react('🎉');
        db.giveaways.create({ messageId: msg.id, guildId: interaction.guild.id, channelId: channel.id, prize, description: '', winners: 1, hostedBy: interaction.user.id, emoji: '🎉', endsAt: endAt, entrants: [], pickedWinners: [] });
        await interaction.reply({ content: `✅ تم بدء الجيفاواي: ${prize}`, ephemeral: true });
        return;
      }
      default: return;
    }
  } catch (err) {
    await interaction.reply({ content: '❌ فشل: ' + err.message, ephemeral: true }).catch(() => {});
  }
}

module.exports = { systemRows, handleAdminButton, handleAdminModal, handleStaffRolesSelect, handleEmbedChannelSelect };
