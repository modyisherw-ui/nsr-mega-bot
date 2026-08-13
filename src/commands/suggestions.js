const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');

module.exports = {
  name: 'suggestions-group',
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('suggestions')
        .setDescription('💡 نظام الاقتراحات')
        .addSubcommand(s => s.setName('panel').setDescription('إرسال لوحة الاقتراحات')),
      async execute(interaction) {
        const { sendSuggestionsPanel } = require('../dashboard');
        await sendSuggestionsPanel(interaction);
      },
    },
  ],
};
