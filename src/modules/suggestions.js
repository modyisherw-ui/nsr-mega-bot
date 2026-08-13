const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

let clientRef = null;

async function handleSuggestion(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('suggestion_modal')
    .setTitle('📬 Share Your Suggestion | شارك اقتراحك');
  const input = new TextInputBuilder()
    .setCustomId('suggestion_input')
    .setLabel('What suggestion would you like to share? | ما الاقتراح الذي تريد مشاركته؟')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Type your suggestion here... | اكتب اقتراحك هنا...')
    .setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleSuggestionModal(interaction) {
  const suggestion = interaction.fields.getTextInputValue('suggestion_input').trim();
  if (!suggestion) {
    await interaction.reply({ content: '❌ لا يمكنك إرسال اقتراح فارغ.', ephemeral: true });
    return;
  }

  const owner = interaction.guild?.members.cache.get(interaction.guild?.ownerId) || null;
  const embed = new EmbedBuilder()
    .setColor('Blurple')
    .setTitle('📬 Suggestion Received')
    .setDescription(suggestion)
    .addFields({ name: 'Submitted By', value: `<@${interaction.user.id}>` })
    .setTimestamp();

  const sendEmbed = (channel, label) => channel.send({ embeds: [embed] });

  let sentTo = ['📬 لوحة الاقتراحات'];
  try {
    if (owner) {
      const dm = await owner.createDM().catch(() => null);
      if (dm) {
        const dmEmbed = new EmbedBuilder()
          .setColor('Gold')
          .setTitle('📩 Suggestion from ' + interaction.guild.name)
          .setDescription(suggestion)
          .addFields({ name: 'Submitted By', value: `<@${interaction.user.id}>` })
          .setTimestamp();
        await dm.send({ embeds: [dmEmbed] });
        sentTo.push('💌 رسالة خاصة للمالك');
      }
    }
  } catch (err) {
    log.warn('فشل إرسال الاقتراح للمالك: ' + err.message);
  }

  await interaction.reply({ content: `✅ تم إرسال اقتراحك بنجاح إلى ${sentTo.join(' و ')}`, ephemeral: true });
}

module.exports = { handleSuggestion, handleSuggestionModal };
