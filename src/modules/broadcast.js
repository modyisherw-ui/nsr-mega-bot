const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

let clientRef = null;

async function handleBroadcastModal(interaction) {
  const message = interaction.fields.getTextInputValue('bc_message').trim();
  if (!message) {
    await interaction.reply({ content: '❌ اكتب رسالة البرودكاست.', ephemeral: true });
    return;
  }
  const preview = new EmbedBuilder()
    .setTitle('📢 معاينة البرودكاست')
    .setDescription(message)
    .setColor(0x2ecc71)
    .setFooter({ text: 'اضغط ✅ للإرسال أو ⛔ للإلغاء' })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bc_confirm').setLabel('✅ إرسال').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bc_cancel').setLabel('⛔ إلغاء').setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({ embeds: [preview], components: [row], ephemeral: true });
}

async function handleBroadcastConfirm(interaction) {
  const message = interaction.message.embeds[0]?.description;
  if (!message) return;
  await interaction.update({ components: [] });
  const members = interaction.guild.members.cache.filter(m => !m.user.bot);
  const total = members.size;
  let success = 0;
  let failed = 0;
  let blockedCount = 0;

  await interaction.followUp({ content: `📢 بدأ الإرسال لـ \`${total}\` عضو...`, ephemeral: true });

  for (const member of members.values()) {
    if (db.broadcast.isBlocked(member.id)) { blockedCount++; continue; }
    try {
      const dm = await member.createDM();
      await dm.send({ content: message });
      success++;
    } catch { failed++; }
    await new Promise(r => setTimeout(r, 150));
  }

  const report = new EmbedBuilder()
    .setTitle('📊 تقرير البرودكاست')
    .setColor(0x3498db)
    .addFields(
      { name: '✅ تم الإرسال', value: `\`${success}\``, inline: true },
      { name: '❌ فشل', value: `\`${failed}\``, inline: true },
      { name: '🚫 محظورون', value: `\`${blockedCount}\``, inline: true },
      { name: '📝 الرسالة', value: message.slice(0, 500), inline: false },
    )
    .setTimestamp();
  db.broadcast.log({ guildId: interaction.guild.id, sentBy: interaction.user.id, total, success, failed, blocked: blockedCount, duration: 0 });
  await interaction.followUp({ embeds: [report], ephemeral: true });
}

module.exports = { handleBroadcastModal, handleBroadcastConfirm };
