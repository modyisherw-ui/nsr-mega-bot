const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');
const emb = require('../utils/embeds');
const { config } = require('../config');

const STARS = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

function ratingPanelRow(targetId, currentStars) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map(s => new ButtonBuilder()
      .setCustomId(`rate_${s}`)
      .setLabel('⭐'.repeat(s))
      .setStyle(currentStars === s ? ButtonStyle.Success : ButtonStyle.Primary))
  );
}

async function sendRatingPanel(target, channel, client, guild) {
  const stats = db.ratings.stats(guild.id, target.id);
  const user = (target.username ? target : { username: target.displayName });
  const embed = emb.buildPanelEmbed({ client, target: { ...user, displayAvatarURL: () => target.displayAvatarURL?.() }, title: `⭐ قيّم ${target.displayName || target.username || target.name}`, stats });
  await channel.send({ embeds: [embed], components: [ratingPanelRow(target.id, null)] });
}

async function handleRatingButton(interaction) {
  const modal = new ModalBuilder().setCustomId(`rating_modal_${interaction.customId}`).setTitle('تقييم');
  const commentInput = new TextInputBuilder().setCustomId('comment_input').setLabel('تعليق (اختياري)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
  await interaction.showModal(modal);
}

async function handleRatingModal(interaction) {
  const customIdParts = interaction.customId.split('_');
  const stars = parseInt(customIdParts[2]);
  const comment = interaction.fields.getTextInputValue('comment_input').trim();

  const target = await resolveTarget(interaction);
  if (!target) { await interaction.reply({ content: '⚠️ تعذر العثور على المستخدم المستهدف.', ephemeral: true }); return; }
  const targetId = target.id || target.user?.id;

  const old = db.ratings.get(interaction.guild.id, targetId, interaction.user.id);
  const result = db.ratings.upsert({ guildId: interaction.guild.id, targetId, raterId: interaction.user.id, stars, comment });
  const stats = db.ratings.stats(interaction.guild.id, targetId);

  if (config.rating.feedChannelId) {
    const ch = interaction.guild.channels.cache.get(config.rating.feedChannelId);
    if (ch) {
      const feed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`${old ? '🔄' : '⭐'} ${old ? 'تقييم محدث' : 'تقييم جديد'}`)
        .setDescription(`${interaction.user.tag} ${old ? 'عدّل تقييمه لـ' : 'قيّم'} <@${targetId}> ب ${'⭐'.repeat(stars)}`)
        .setTimestamp();
      ch.send({ embeds: [feed] }).catch(() => {});
    }
  }

  const reply = new EmbedBuilder()
    .setColor('Gold')
    .setTitle('✅ تم تسجيل تقييمك!')
    .setDescription(`${'⭐'.repeat(stars)} — شكراً لوقتك ${interaction.user.globalName || interaction.user.username}!`)
    .addFields({ name: '📊 المتوسط الآن', value: `\`${stats.average}/5\`` });
  await interaction.reply({ embeds: [reply], ephemeral: true });

  await interaction.message.edit({ embeds: [emb.buildPanelEmbed({ client: interaction.client, target: target.user || target, stats })], components: [ratingPanelRow(targetId, stars)] });
}

async function resolveTarget(interaction) {
  const embed = interaction.message?.embeds?.[0];
  if (!embed) return null;
  const desc = embed.description || '';
  const mention = desc.match(/<@!?(\d+)>/);
  const title = embed.title || '';
  const titleMention = title.match(/<@!?(\d+)>/);
  const targetId = (mention || titleMention)?.[1];
  if (!targetId) return null;
  const member = interaction.guild?.members.cache.get(targetId);
  if (member) return member;
  const user = await interaction.client.users.fetch(targetId).catch(() => null);
  return user;
}

module.exports = { handleRatingButton, handleRatingModal, ratingPanelRow, sendRatingPanel, resolveTarget };
