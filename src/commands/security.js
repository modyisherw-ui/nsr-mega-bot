const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');

module.exports = {
  name: 'security-group',
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('security')
        .setDescription('نظام الأمان')
        .addSubcommand(s => s.setName('status').setDescription('حالة الحماية')),
      async execute(interaction) {
        const cfg = db.securityCfg.get(interaction.guild.id);
        const guildCfg = require('../guildCfg').get(interaction.guild.id);
        const protectedRoles = cfg.protected_roles.length ? cfg.protected_roles : (guildCfg.protectedRoles || []);
        const embed = new emb.infoEmbed(interaction.client, '🛡️ حالة الحماية', [
          `**مكافحة السبام:** \`${cfg.spam_enabled ? '✅ مفعّل' : '❌ معطّل'}\``,
          `**حد الرسائل:** \`${cfg.spam_max_messages}\` خلال \`${cfg.spam_window}\` ثانية`,
          `**مدة الكتم:** \`${cfg.spam_timeout}\` دقيقة`,
          '',
          '**الرتب المحمية:**',
          protectedRoles.length
            ? protectedRoles.map(id => `<@&${id}>`).join(', ')
            : 'لا توجد',
          `**العقوبة:** \`${guildCfg.protectionAction || 'kick'}\``,
        ].join('\n'));
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('scan')
        .setDescription('فحص شامل للسيرفر')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: '❌ هذه الميزة للإدارة فقط.', ephemeral: true });
          return;
        }
        const guild = interaction.guild;
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const guildCfg = require('../guildCfg').get(guild.id);
        const protected = (guildCfg.protectedRoles || []).filter(id => guild.roles.cache.has(id)).length;
        const dangerousPerms = ['Administrator', 'BanMembers', 'KickMembers', 'ManageRoles', 'ManageChannels'];
        const flagged = guild.roles.cache.filter(r => r.permissions.has('Administrator') && r.members.size > 0).size;
        const embed = new emb.infoEmbed(interaction.client, '🔍 تقرير الفحص', [
          `**👥 الأعضاء:** \`${guild.memberCount}\``,
          `**🤖 البوتات:** \`${bots}\``,
          `**🛡️ رتب محمية:** \`${protected}\``,
          `**⚠️ رتب بأدمن ممنوح لأعضاء:** \`${flagged}\``,
          '',
          '**نصيحة:** تأكد من إزالة صلاحية الأدمن من الرتب غير الموثوقة.',
        ].join('\n'));
        await interaction.reply({ embeds: [embed] });
      },
    },
  ],
};
