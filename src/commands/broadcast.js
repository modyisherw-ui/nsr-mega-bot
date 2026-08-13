const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');
const { isAdmin, isOwner } = require('../config');

function checkAdmin(interaction) {
  return isOwner(interaction.user.id) || isAdmin(interaction.member);
}

module.exports = {
  name: 'broadcast-group',
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('إرسال برودكاست لأعضاء السيرفر'),
      async execute(interaction) {
        if (!checkAdmin(interaction)) {
          await interaction.reply({ content: '❌ هذه الميزة لرتب الإدارة فقط (حددها من لوحة التحكم).', ephemeral: true });
          return;
        }
        const modal = new ModalBuilder().setCustomId('broadcast_modal').setTitle('📢 برودكاست جديد');
        const input = new TextInputBuilder()
          .setCustomId('bc_message')
          .setLabel('رسالة البرودكاست')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('bc_stats')
        .setDescription('إحصائيات البرودكاست'),
      async execute(interaction) {
        if (!checkAdmin(interaction)) {
          await interaction.reply({ content: '❌ هذه الميزة لرتب الإدارة فقط.', ephemeral: true });
          return;
        }
        const blocked = db.broadcast.blockedCount();
        const totalMembers = interaction.guild.members.cache.filter(m => !m.user.bot).size;
        const recentLogs = db.broadcast.lastLogs(interaction.guild.id, 5);
        const embed = emb.buildBroadcastStats({ client: interaction.client, blocked, totalMembers, recentLogs });
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('reset_blocked')
        .setDescription('مسح قائمة الأعضاء المحظورين من البرودكاست'),
      async execute(interaction) {
        if (!checkAdmin(interaction)) {
          await interaction.reply({ content: '❌ هذه الميزة لرتب الإدارة فقط.', ephemeral: true });
          return;
        }
        const cleared = db.broadcast.clearBlocked();
        const embed = new emb.successEmbed(interaction.client, 'تم مسح القائمة', `تم إزالة **${cleared}** عضو من قائمة الحظر.`);
        await interaction.reply({ embeds: [embed] });
      },
    },
  ],
};
