const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');
const emb = require('../utils/embeds');
const { ratingPanelRow } = require('../modules/ratings');
const { config } = require('../config');

module.exports = {
  name: 'rating-group',
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('⭐ قيّم عضواً من 1 إلى 5 نجوم')
        .addUserOption(o => o.setName('user').setDescription('العضو الذي تريد تقييمه').setRequired(true))
        .addIntegerOption(o => o.setName('stars').setDescription('عدد النجوم (1-5)').setRequired(true).setMinValue(1).setMaxValue(5))
        .addStringOption(o => o.setName('comment').setDescription('تعليق اختياري')),
      async execute(interaction) {
        const target = interaction.options.getUser('user');
        const stars = interaction.options.getInteger('stars');
        const comment = interaction.options.getString('comment') || '';
        if (target.id === interaction.user.id) {
          await interaction.reply({ content: '❌ لا يمكنك تقييم نفسك!', ephemeral: true });
          return;
        }
        if (target.bot) {
          await interaction.reply({ content: '❌ لا يمكنك تقييم بوت!', ephemeral: true });
          return;
        }
        const result = db.ratings.upsert({ guildId: interaction.guild.id, targetId: target.id, raterId: interaction.user.id, stars, comment });
        const stats = db.ratings.stats(interaction.guild.id, target.id);
        const embed = new emb.successEmbed(interaction.client, result.action === 'updated' ? 'تقييم محدث' : 'تقييم جديد', `قيّمت **${target.username}** ب ${'⭐'.repeat(stars)}\n\n**المتوسط الآن:** \`${stats.average}/5\``)
          .setThumbnail(target.displayAvatarURL());
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('setupreview')
        .setDescription('🏪 إرسال رسالة تقييم قابلة للتفاعل')
        .addUserOption(o => o.setName('user').setDescription('العضو أو المتجر الذي سيتم تقييمه').setRequired(true)),
      async execute(interaction) {
        const target = interaction.options.getUser('user');
        const stats = db.ratings.stats(interaction.guild.id, target.id);
        const embed = emb.buildPanelEmbed({ client: interaction.client, target, stats, title: `⭐ قيّم ${target.username}` });
        const msg = await interaction.channel.send({ embeds: [embed], components: [ratingPanelRow(target.id, null)] });
        db.ratings.savePanel({ guildId: interaction.guild.id, channelId: interaction.channel.id, messageId: msg.id, targetId: target.id, targetType: 'user', title: `⭐ قيّم ${target.username}`, description: null, createdBy: interaction.user.id });
        await interaction.reply({ content: '✅ تم إرسال لوحة التقييم!', ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('⭐ لوحة تقييم لشخص ما')
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),
      async execute(interaction) {
        const target = interaction.options.getUser('user');
        const stats = db.ratings.stats(interaction.guild.id, target.id);
        const embed = emb.buildPanelEmbed({ client: interaction.client, target, stats, title: `⭐ قيّم ${target.username}` });
        const msg = await interaction.channel.send({ embeds: [embed], components: [ratingPanelRow(target.id, null)] });
        db.ratings.savePanel({ guildId: interaction.guild.id, channelId: interaction.channel.id, messageId: msg.id, targetId: target.id, targetType: 'user', title: `⭐ قيّم ${target.username}`, description: null, createdBy: interaction.user.id });
        await interaction.reply({ content: '✅ تم إرسال لوحة التقييم.', ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('👤 ملف تقييمات')
        .addUserOption(o => o.setName('user').setDescription('العضو (اختياري)')),
      async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const stats = db.ratings.stats(interaction.guild.id, target.id);
        const recent = db.ratings.recent(interaction.guild.id, target.id, 5);
        const embed = emb.buildProfileEmbed({ client: interaction.client, target, stats, recent });
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('🏆 لوحة صدارة التقييمات'),
      async execute(interaction) {
        const rows = db.ratings.leaderboard(interaction.guild.id, 10);
        const embed = emb.buildLeaderboardEmbed({ client: interaction.client, rows, guild: interaction.guild });
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('myratings')
        .setDescription('📋 التقييمات التي أرسلتها'),
      async execute(interaction) {
        const rows = db.ratings.byRater(interaction.guild.id, interaction.user.id, 10);
        const embed = new emb.infoEmbed(interaction.client, '📋 تقييماتي', rows.length === 0
          ? 'لم تقم بتقييم أحد بعد.'
          : rows.map(r => `${'⭐'.repeat(r.stars)} — <@${r.target_id}> ${r.comment ? `\n> "${r.comment}"` : ''}`).join('\n\n'));
        await interaction.reply({ embeds: [embed] });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName('deleterating')
        .setDescription('🗑️ حذف تقييمك لشخص')
        .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),
      async execute(interaction) {
        const target = interaction.options.getUser('user');
        const deleted = db.ratings.del(interaction.guild.id, target.id, interaction.user.id);
        const embed = deleted
          ? new emb.successEmbed(interaction.client, 'تم حذف التقييم', `تم حذف تقييمك لـ **${target.username}** بنجاح.`)
          : new emb.errorEmbed(interaction.client, 'لا يوجد تقييم', `لم تجد تقييمك لـ **${target.username}**.`);
        await interaction.reply({ embeds: [embed] });
      },
    },
  ],
};
