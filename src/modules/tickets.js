const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

let clientRef = null;

function ticketConfig(guildId) {
  return require('../guildCfg').get(guildId).ticket || {};
}

function ticketColor(typeId, guildId) {
  const t = (ticketConfig(guildId).ticketTypes || []).find(tp => tp.id === typeId);
  return t?.color || 0x57F287;
}

async function handleTicketSelect(interaction) {
  if (interaction.customId !== 'ticket_type_select') return;
  const typeId = interaction.values[0];
  const tcfg = ticketConfig(interaction.guild.id);
  const type = (tcfg.ticketTypes || []).find(tp => tp.id === typeId);
  if (!type) return;

  const existing = db.tickets.getUserOpen(interaction.user.id, interaction.guild.id);
  if (existing.length > 0) {
    await interaction.reply({ content: `⚠️ لديك تذكرة مفتوحة بالفعل: <#${existing[0].channel_id}>\nأغلقها أولاً قبل فتح تذكرة جديدة.`, ephemeral: true });
    return;
  }

  const number = db.tickets.nextNumber(interaction.guild.id);
  const staffRoleIds = tcfg.staffRoles || [];
  const category = interaction.guild.channels.cache.get(tcfg.categoryId);
  const channel = await interaction.guild.channels.create({
    name: `${type.emoji || '🎫'} ticket-${number}`,
    parent: category || undefined,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
      ...staffRoleIds.map(rid => ({ id: rid, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] })),
    ],
  });

  db.tickets.create({ channelId: channel.id, guildId: interaction.guild.id, userId: interaction.user.id, type: typeId, number, answers: {} });

  const controlEmbed = new EmbedBuilder()
    .setTitle(`${type.emoji || '🎫'} ${type.label} #${number}`)
    .setDescription(`Welcome <@${interaction.user.id}>!\nPlease describe your issue and our staff will assist you shortly.`)
    .setColor(ticketColor(typeId, interaction.guild.id))
    .setTimestamp();
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim_btn').setLabel('📥 Claim').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_summon_btn').setLabel('📣 Summon').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger),
  );

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [controlEmbed], components: [controlRow] });
  await interaction.reply({ content: `✅ تم فتح تذكرتك: <#${channel.id}>`, ephemeral: true });
}

function canManageTicket(member, guildId) {
  if (!member) return false;
  const staffRoles = ticketConfig(guildId).staffRoles || [];
  if (staffRoles.some(r => member.roles.cache.has(r))) return true;
  if (member.permissions.has('ManageChannels')) return true;
  return false;
}

async function getTicketUser(interaction, userId) {
  const real = interaction.interaction || interaction;
  try {
    return await (real.client || interaction.client).users.fetch(userId);
  } catch {
    return null;
  }
}

// ═══════════ استلام التذكرة (Claim) ═══════════
async function handleTicketClaim(interaction) {
  const ticket = db.tickets.get(interaction.channel.id);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: '❌ هذه ليست تذكرة نشطة.', ephemeral: true });
    return;
  }
  if (!canManageTicket(interaction.member, interaction.guild.id)) {
    await interaction.reply({ content: '❌ فقط فريق الدعم يمكنه استلام التذكرة.', ephemeral: true });
    return;
  }
  db.tickets.claim(interaction.channel.id, interaction.user.id);
  const user = await getTicketUser(interaction, ticket.user_id);
  if (user) {
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('📥 Your ticket has been claimed!')
        .setDescription(`Your ticket **#${ticket.number}** has been claimed by the support team.\nتم استلام تذكرتك **رقم ${ticket.number}** من قبل فريق الدعم.\n\n<@${interaction.user.id}>`)
        .setFooter({ text: 'NSR BOT' })
        .setTimestamp()],
    }).catch(() => {});
  }
  await interaction.reply({ content: `✅ تم استلام التذكرة! أُرسل إشعار لصاحبها.`, ephemeral: true });
  await interaction.channel.send({ content: `📥 تم استلام التذكرة بواسطة <@${interaction.user.id}>` }).catch(() => {});
}

// ═══════════ استدعاء صاحب التذكرة (Summon) ═══════════
async function handleTicketSummon(interaction) {
  const ticket = db.tickets.get(interaction.channel.id);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: '❌ هذه ليست تذكرة نشطة.', ephemeral: true });
    return;
  }
  if (!canManageTicket(interaction.member, interaction.guild.id)) {
    await interaction.reply({ content: '❌ فقط فريق الدعم يمكنه استدعاء صاحب التذكرة.', ephemeral: true });
    return;
  }
  const user = await getTicketUser(interaction, ticket.user_id);
  if (user) {
    const link = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}`;
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('📣 Please reply to your ticket!')
        .setDescription(`Please reply to your ticket **#${ticket.number}**.\nالرجاء الرد على تذكرتك **رقم ${ticket.number}**.\n\n${link}`)
        .setFooter({ text: 'NSR BOT' })
        .setTimestamp()],
    }).catch(() => {});
  }
  await interaction.reply({ content: `✅ تم استدعاء صاحب التذكرة (إشعار على الخاص).`, ephemeral: true });
  await interaction.channel.send({ content: `📣 تم استدعاء صاحب التذكرة بواسطة <@${interaction.user.id}>` }).catch(() => {});
}

async function handleTicketClose(interaction) {
  // يدعم نداء الزر المباشر أو أمر /ticket close (يصل كـ { interaction, channel })
  const real = interaction.interaction || interaction;
  const channel = interaction.channel || real.channel;
  const guild = real.guild;
  const client = real.client;
  const ticket = db.tickets.get(channel.id);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: '❌ هذه ليست تذكرة نشطة.', ephemeral: true });
    return;
  }
  db.tickets.close(channel.id, real.user.id);

  await interaction.reply({ content: '🔒 جاري إغلاق التذكرة وحفظ السجل...' });
  let transcript = '';
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    transcript = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '(مرفق)'}`).join('\n');
  } catch {}

  const record = db.tickets.get(channel.id);
  const logChannelId = ticketConfig(guild.id).logChannelId;
  const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setTitle('🔒 Ticket Closed')
      .setColor('Red')
      .addFields(
        { name: 'المستخدم', value: `<@${record.user_id}>` },
        { name: 'أغلقها', value: `<@${record.closed_by}>` },
        { name: 'النوع', value: record.type }
      )
      .setTimestamp();
    await logChannel.send({ embeds: [embed], files: transcript ? [{ attachment: Buffer.from(transcript), name: 'transcript.txt' }] : undefined });
  }

  // نسخة على الخاص لصاحب التذكرة: رسالة الإغلاق + سطرين + الترانكسكريبت
  const user = await getTicketUser(interaction, record.user_id);
  if (user) {
    await user.send({
      embeds: [new EmbedBuilder()
        .setColor('Red')
        .setTitle('🔒 Your ticket has been closed')
        .setDescription(`Your ticket **#${record.number}** has been closed. If you need more help, feel free to open a new ticket!\nتم قفل تذكرتك **رقم ${record.number}**، إذا كنت بحاجة لأي مساعدة يمكنك فتح تذكرة جديدة.`)
        .setFooter({ text: 'NSR BOT' })
        .setTimestamp()],
      files: transcript ? [{ attachment: Buffer.from(transcript), name: `ticket-${record.number}-transcript.txt` }] : undefined,
    }).catch(() => {});
  }

  setTimeout(async () => {
    try { await channel.delete('Ticket closed'); } catch {}
  }, 5000);
}

async function handleTicketActions(interaction, action) {
  if (!canManageTicket(interaction.member, interaction.guild.id)) {
    await interaction.reply({ content: '❌ فقط فريق الدعم يمكنه استخدام هذه الأزرار.', ephemeral: true });
    return;
  }

  if (action === 'add' || action === 'remove') {
    const modal = new ModalBuilder().setCustomId(`ticket_${action}_modal`).setTitle(action === 'add' ? '➕ إضافة عضو للتذكرة' : '➖ إزالة عضو من التذكرة');
    const input = new TextInputBuilder().setCustomId('ticket_user_input').setLabel('معرف المستخدم (User ID)').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }
}

async function handleTicketModal(interaction) {
  const action = interaction.customId.includes('add') ? 'add' : 'remove';
  const targetId = interaction.fields.getTextInputValue('ticket_user_input').trim();
  if (!/^\d{17,20}$/.test(targetId)) {
    await interaction.reply({ content: '❌ معرف مستخدم غير صالح.', ephemeral: true });
    return;
  }
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) {
    await interaction.reply({ content: '❌ لم يتم العثور على العضو.', ephemeral: true });
    return;
  }
  try {
    if (action === 'add') await interaction.channel.permissionOverwrites.create(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    else await interaction.channel.permissionOverwrites.delete(target.id);
    await interaction.reply({ content: `${action === 'add' ? '✅ تمت إضافة' : '✅ تمت إزالة'} <@${target.id}> من التذكرة.`, ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: '❌ فشل تنفيذ العملية: ' + err.message, ephemeral: true });
  }
}

module.exports = { handleTicketSelect, handleTicketClose, handleTicketClaim, handleTicketSummon, handleTicketActions, handleTicketModal };
