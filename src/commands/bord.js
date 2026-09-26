const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { mainEmbed, mainRows } = require('../dashboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bord')
    .setDescription('فتح لوحة التحكم الكاملة للسيرفر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: '❌ هذا الأمر يعمل داخل السيرفر فقط.', ephemeral: true });
      return;
    }
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '❌ لوحة التحكم للإدارة فقط.', ephemeral: true });
      return;
    }
    await interaction.reply({
      embeds: [mainEmbed(interaction.client, interaction.guild)],
      components: mainRows(),
    });
  },
};
