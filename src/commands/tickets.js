const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');

module.exports = {
  name: 'ticket-group',
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('🎫 نظام التذاكر')
        .addSubcommand(s => s.setName('panel').setDescription('إرسال لوحة التذاكر'))
        .addSubcommand(s => s.setName('stats').setDescription('إحصائيات التذاكر'))
        .addSubcommand(s => s.setName('close').setDescription('إغلاق تذكرة').addChannelOption(o => o.setName('channel').setDescription('قناة التذكرة (اختياري)'))),
      async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'panel') {
          const { sendTicketPanel } = require('../dashboard');
          await sendTicketPanel(interaction);
        } else if (sub === 'stats') {
          const stats = db.tickets.stats(interaction.guild.id);
          const embed = new emb.infoEmbed(interaction.client, '🎫 إحصائيات التذاكر', [
            `**المفتوحة:** \`${stats.open}\``,
            `**المغلقة:** \`${stats.closed}\``,
            `**الإجمالي:** \`${stats.total}\``,
            `**اليوم:** \`${stats.today}\``,
          ].join('\n'));
          await interaction.reply({ embeds: [embed] });
        } else if (sub === 'close') {
          const channel = interaction.options.getChannel('channel') || interaction.channel;
          const record = db.tickets.get(channel.id);
          if (!record || record.status !== 'open') {
            await interaction.reply({ content: '❌ هذه القناة ليست تذكرة مفتوحة.', ephemeral: true });
            return;
          }
          const { handleTicketClose } = require('../modules/tickets');
          await handleTicketClose({ interaction, channel });
        }
      },
    },
  ],
};
