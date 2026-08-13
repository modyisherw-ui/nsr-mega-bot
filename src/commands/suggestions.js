const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');
const { isOwner, isAdmin } = require('../config');


module.exports = {
  name: 'suggestions-group',
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('suggestions')
        .setDescription('نظام الاقتراحات')
        .addSubcommand(s => s.setName('panel').setDescription('إرسال لوحة الاقتراحات')),
        async execute(interaction) {
          // فقط الأدمن (أو المالك) يمكنه استخدام /suggestions panel
          if (!interaction.member.permissions?.has('Administrator') && !isOwner(interaction.user.id)) {
            await interaction.reply({ content: '❌ هذه الميزة للإدارة فقط.', ephemeral: true });
            return;
          }
          const { sendSuggestionsPanel } = require('../dashboard');
          await sendSuggestionsPanel(interaction);
        },
    },
  ],
};
