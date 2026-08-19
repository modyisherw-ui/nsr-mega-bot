const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

let clientRef = null;

function ticketConfig(guildId) {
  return require('../guildCfg').get(guildId).ticket || {};
}

function rebuildPanelComponents(tcfg) {
  // الأنواع المفعّلة فقط تظهر (نظام إخفاء الأنواع من لوحة التحكم)
  const types = (tcfg.ticketTypes || []).filter(tp => tp.enabled !== false);
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_type_select')
    .setPlaceholder('Select a ticket type...')
    .addOptions(types.map(tp => {
      const opt = new StringSelectMenuOptionBuilder().setLabel(tp.label).setDescription(tp.description).setValue(tp.id);
      // إيموجي صالح فقط (نقطة Unicode واحدة في النطاق الإيموجي) — نتجنب خطأ COMPONENT_INVALID_EMOJI
      if (tp.emoji && /^\p{Extended_Pictographic}$/u.test(tp.emoji.trim())) opt.setEmoji(tp.emoji.trim());
      return opt;
    }));
  return [new ActionRowBuilder().addComponents(select)];
}

function ticketColor(typeId, guildId) {
  const t = (ticketConfig(guildId).ticketTypes || []).find(tp => tp.id === typeId);
  const c = t?.color;
  // عصبية: أي لون خارج النطاق (0 - 0xFFFFFF) أو نص أو رقم كبير مكتوب بالغلط → لون افتراضي آمن
  if (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 0xFFFFFF) return c;
  return 0x57F287;
}

async function handleTicketSelect(interaction) {
  if (interaction.customId !== 'ticket_type_select') return;
  // نعترف بالتفاعل فوراً — إنشاء الروم (channels.create) قد يتعدى 3 ثوانٍ
  // ويسبب "didn't respond in time"، فنتفاعل بانتظار ثم نرد بالنص بعد الإنجاز
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    log.warn('تعذر تأجيل رد فتح التذكرة: ' + err.message);
  }
  const typeId = interaction.values[0];
  const tcfg = ticketConfig(interaction.guild.id);
  const type = (tcfg.ticketTypes || []).find(tp => tp.id === typeId);
  if (!type) {
    const disabled = (tcfg.ticketTypes || []).some(tp => tp.id === typeId && tp.enabled === false);
    if (disabled) {
      // النوع مُطفأ من لوحة التحكم — العضو ما زال يرى لوحة قديمة
      await interaction.editReply({ content: '❌ هذا النوع معطّل حالياً من إعدادات التذاكر. انتظر إعادة إرسال اللوحة.', ephemeral: true }).catch(() => {});
      return;
    }
    await interaction.editReply({ content: '❌ نوع التذكرة غير موجود.', ephemeral: true }).catch(() => {});
    return;
  }

  const existing = db.tickets.getUserOpen(interaction.user.id, interaction.guild.id);
  if (existing.length > 0) {
    await interaction.editReply({ content: `⚠️ لديك تذكرة مفتوحة بالفعل: <#${existing[0].channel_id}>\nأغلقها أولاً قبل فتح تذكرة جديدة.`, ephemeral: true }).catch(() => {});
    return;
  }

  // إعادة تعيين قائمة الاختيار باللوحة حتى يتمكن المستخدم من اختيار نفس النوع مرة أخرى
  const panelMsg = interaction.message;
  if (panelMsg) {
    try {
      await panelMsg.edit({ components: rebuildPanelComponents(tcfg) });
    } catch {}
  }

  try {
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
      new ButtonBuilder().setCustomId('ticket_summon_btn').setLabel('📣 Summon').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger),
    );

    await channel.send({ content: `<@${interaction.user.id}>`, embeds: [controlEmbed], components: [controlRow] });
    await interaction.editReply({ content: `✅ تم فتح تذكرتك: <#${channel.id}>`, ephemeral: true }).catch(() => {});
  } catch (err) {
    log.warn('فشل فتح التذكرة: ' + err.message);
    await interaction.editReply({
      content: `❌ تعذر فتح التذكرة.\nتأكد أن البوت لديه صلاحية **إنشاء الرومات** وصلاحية **عرض/إدارة** الكاتيجوري المحددة.\n\n\`${err.message}\``,
      ephemeral: true,
    }).catch(() => {});
  }
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
  // نعترف بالتفاعل فوراً — إرسال DM لإشعار صاحب التذكرة قد يتجاوز 3 ثوانٍ
  await interaction.deferReply({ ephemeral: true });
  const ticket = db.tickets.get(interaction.channel.id);
  if (!ticket || ticket.status === 'closed') {
    await interaction.editReply({ content: '❌ هذه ليست تذكرة نشطة.', ephemeral: true });
    return;
  }
  if (!canManageTicket(interaction.member, interaction.guild.id)) {
    await interaction.editReply({ content: '❌ فقط فريق الدعم يمكنه استلام التذكرة.', ephemeral: true });
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
        .setFooter({ text: 'NSR HUB - MoDy Dev' })
        .setTimestamp()],
    }).catch(() => {});
  }
  await interaction.editReply({ content: `✅ تم استلام التذكرة! أُرسل إشعار لصاحبها.`, ephemeral: true });
  await interaction.channel.send({ content: `📥 تم استلام التذكرة بواسطة <@${interaction.user.id}>` }).catch(() => {});
}

// ═══════════ استدعاء صاحب التذكرة (Summon) ═══════════
async function handleTicketSummon(interaction) {
  // نعترف بالتفاعل فوراً — جلب المستخدم + إرسال DM قد يتجاوز 3 ثوانٍ
  await interaction.deferReply({ ephemeral: true });
  const ticket = db.tickets.get(interaction.channel.id);
  if (!ticket || ticket.status === 'closed') {
    await interaction.editReply({ content: '❌ هذه ليست تذكرة نشطة.', ephemeral: true });
    return;
  }
  if (!canManageTicket(interaction.member, interaction.guild.id)) {
    await interaction.editReply({ content: '❌ فقط فريق الدعم يمكنه استدعاء صاحب التذكرة.', ephemeral: true });
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
        .setFooter({ text: 'NSR HUB - MoDy Dev' })
        .setTimestamp()],
    }).catch(() => {});
  }
  await interaction.editReply({ content: `✅ تم استدعاء صاحب التذكرة (إشعار على الخاص).`, ephemeral: true });
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
        .setFooter({ text: 'NSR HUB - MoDy Dev' })
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
