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

  const category = interaction.guild.channels.cache.get(tcfg.categoryId);
  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`,
    parent: category || undefined,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
    ],
  });

  const number = db.tickets.nextNumber(interaction.guild.id);
  db.tickets.create({ channelId: channel.id, guildId: interaction.guild.id, userId: interaction.user.id, type: typeId, number, answers: {} });

  const controlEmbed = new EmbedBuilder()
    .setTitle(`🎫 ${type.label}`)
    .setDescription(`Welcome <@${interaction.user.id}>!\nPlease describe your issue and our staff will assist you shortly.`)
    .setColor(ticketColor(typeId, interaction.guild.id))
    .setTimestamp();
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger),
  );

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [controlEmbed], components: [controlRow] });
  await interaction.reply({ content: `✅ تم فتح تذكرتك: <#${channel.id}>`, ephemeral: true });
}

async function handleTicketClose(interaction) {
  const ticket = db.tickets.get(interaction.channel.id);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: '❌ هذه ليست تذكرة نشطة.', ephemeral: true });
    return;
  }
  db.tickets.close(interaction.channel.id, interaction.user.id);

  await interaction.reply({ content: '🔒 جاري إغلاق التذكرة وحفظ السجل...' });
  let transcript = '';
  try {
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    transcript = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '(مرفق)'}`).join('\n');
  } catch {}

  const logChannelId = ticketConfig(interaction.guild.id).logChannelId;
  const logChannel = logChannelId ? interaction.guild.channels.cache.get(logChannelId) : null;
  if (logChannel) {
    const record = db.tickets.get(interaction.channel.id);
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

  setTimeout(async () => {
    try { await interaction.channel.delete('Ticket closed'); } catch {}
  }, 5000);
}

async function handleTicketActions(interaction, action) {
  const member = interaction.member;
  const staffRoles = ticketConfig(interaction.guild.id).staffRoles || [];
  const isStaff = staffRoles.some(r => member.roles.cache.has(r)) || member.permissions.has('ManageChannels');
  if (!isStaff) {
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

module.exports = { handleTicketSelect, handleTicketClose, handleTicketActions, handleTicketModal };
