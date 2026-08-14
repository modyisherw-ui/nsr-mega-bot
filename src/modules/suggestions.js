const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

let clientRef = null;

const SUGGEST_COOLDOWN_MS = 10 * 60 * 1000; // 10 دقائق
const lastSuggestion = new Map(); // userId -> timestamp

async function handleSuggestion(interaction) {
  const last = lastSuggestion.get(interaction.user.id) || 0;
  const remaining = SUGGEST_COOLDOWN_MS - (Date.now() - last);
  if (remaining > 0) {
    const mins = Math.ceil(remaining / 60000);
    const secs = Math.ceil((remaining % 60000) / 1000);
    const wait = mins > 0 ? `${mins} دقيقة و ${secs} ثانية` : `${secs} ثانية`;
    await interaction.reply({ content: `⏳ عليك الانتظار **${wait}** قبل إرسال اقتراح جديد.`, ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId('suggestion_modal')
    .setTitle('📬 شارك اقتراحك');
  const input = new TextInputBuilder()
    .setCustomId('suggestion_input')
    .setLabel('ما الاقتراح الذي تريد مشاركته؟')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('اكتب اقتراحك هنا...')
    .setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleSuggestionModal(interaction) {
  // تأكيد سريع حتى لا تنتهي مهلة Discord (3 ثوانٍ)
  await interaction.deferReply({ ephemeral: true });

  const suggestion = interaction.fields.getTextInputValue('suggestion_input').trim();
  if (!suggestion) {
    await interaction.editReply({ content: '❌ لا يمكنك إرسال اقتراح فارغ.' });
    return;
  }
  lastSuggestion.set(interaction.user.id, Date.now());

  const guildCfg = require('../guildCfg').get(interaction.guild.id);
  const channelId = guildCfg.suggestions?.channelId || '';
  const embed = new EmbedBuilder()
    .setColor('Blurple')
    .setTitle('📬 Suggestion Received')
    .setDescription(suggestion)
    .addFields({ name: 'Submitted By', value: `<@${interaction.user.id}>` })
    .setTimestamp();

  const sentTo = [];

  // الروم المحدد من اللوحة
  const channel = channelId ? interaction.guild.channels.cache.get(channelId) : null;
  if (channel) {
    try {
      await channel.send({ embeds: [embed] });
      sentTo.push(`<#${channel.id}>`);
    } catch (err) {
      log.warn('فشل إرسال الاقتراح للروم: ' + err.message);
    }
  }

  // رسالة خاصة للمالك (Fetch دائماً حتى لو غير موجود بالكاش)
  try {
    const guild = interaction.guild;
    const owner = guild.ownerId ? (guild.members.cache.get(guild.ownerId) || await guild.fetchOwner().catch(() => null)) : null;
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
    } else {
      log.warn('تعذر إيجاد مالك السيرفر');
    }
  } catch (err) {
    log.warn('فشل إرسال الاقتراح للمالك: ' + err.message);
  }

  await interaction.editReply({ content: '✅ تم إرسال اقتراحك إلى المالك.' });
}

module.exports = { handleSuggestion, handleSuggestionModal };
