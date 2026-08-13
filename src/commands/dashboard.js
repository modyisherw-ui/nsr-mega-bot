const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { mainEmbed, mainRows } = require('../dashboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bordnsr')
    .setDescription('🎛️ لوحة التحكم الرئيسية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '❌ لوحة التحكم للإدارة فقط.', ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [mainEmbed(interaction.client, interaction.guild)], components: mainRows() });
  },
};
