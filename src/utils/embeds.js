const { EmbedBuilder } = require('discord.js');
const { config } = require('../config');
const { starsToEmoji, starsToLabel, progressBar, truncate, formatDuration } = require('./helpers');

function footer(client) {
  return { text: config.footerText, iconURL: client?.user?.displayAvatarURL() || undefined };
}

function colorByAverage(avg) {
  if (!avg || avg < 2) return 0xED4245;
  if (avg < 3) return 0xFEE75C;
  if (avg < 4) return 0x5865F2;
  return 0x57F287;
}

function buildDistribution(stats) {
  const total = stats?.total || 0;
  const rows = [
    ['⭐⭐⭐⭐⭐', stats?.five], ['⭐⭐⭐⭐☆', stats?.four], ['⭐⭐⭐☆☆', stats?.three],
    ['⭐⭐☆☆☆', stats?.two], ['⭐☆☆☆☆', stats?.one],
  ];
  return rows.map(r => `${r[0]} \`${progressBar(r[1] || 0, total, 8)}\` (${r[1] || 0})`).join('\n');
}

function successEmbed(client, title, description) {
  return new EmbedBuilder().setColor(0x57F287).setTitle(`✅ ${title}`).setDescription(description).setTimestamp().setFooter(footer(client));
}
function errorEmbed(client, title, description) {
  return new EmbedBuilder().setColor(0xED4245).setTitle(`❌ ${title}`).setDescription(description).setTimestamp().setFooter(footer(client));
}
function infoEmbed(client, title, description) {
  return new EmbedBuilder().setColor(0x5865F2).setTitle(`ℹ️ ${title}`).setDescription(description).setTimestamp().setFooter(footer(client));
}

function buildPanelEmbed({ client, target, targetType, title, description, stats }) {
  const avg = stats?.average ? parseFloat(stats.average).toFixed(1) : '0.0';
  const total = stats?.total || 0;
  const name = target?.displayName || target?.username || target?.name || targetType;
  const embed = new EmbedBuilder()
    .setColor(colorByAverage(stats?.average))
    .setTitle(title || `⭐ تقييم ${name}`)
    .setDescription(description ? `${description}\n\n> اضغط على النجوم أدناه لتقييمك!` : '> اضغط على النجوم أدناه لتقييمك!')
    .setTimestamp().setFooter(footer(client));
  if (target?.displayAvatarURL) embed.setThumbnail(target.displayAvatarURL());
  embed.addFields(total > 0
    ? { name: '📊 الإحصائيات', value: `**المتوسط:** ${starsToEmoji(Math.round(stats.average))} \`${avg}/5\`\n**عدد التقييمات:** \`${total}\`` }
    : { name: '📊 الإحصائيات', value: '*لا يوجد تقييمات بعد — كن أول من يقيّم!*' });
  if (total > 0) embed.addFields({ name: '📈 التوزيع', value: buildDistribution(stats) });
  return embed;
}

function buildReviewPanelEmbed({ client, guild, target, stats }) {
  const avg = stats?.average ? parseFloat(stats.average).toFixed(1) : '0.0';
  const total = stats?.total || 0;
  const name = target?.displayName || target?.username || target?.name || 'المتجر';
  const embed = new EmbedBuilder()
    .setColor(colorByAverage(stats?.average))
    .setTitle(`🏪 قيّم ${name}`)
    .setDescription(['> **شاركنا رأيك وساعد الآخرين في اتخاذ قرارهم!**', '', '📌 اضغط على الزر أدناه لتقييمنا بسهولة.', '✏️ يمكنك تعديل تقييمك في أي وقت.'].join('\n'))
    .setTimestamp().setFooter(footer(client));
  if (target?.displayAvatarURL) embed.setThumbnail(target.displayAvatarURL());
  else if (guild?.iconURL) embed.setThumbnail(guild.iconURL());
  embed.addFields(total > 0
    ? { name: '📊 تقييماتنا الحالية', value: `**المتوسط:** ${starsToEmoji(Math.round(stats.average))} \`${avg}/5\`\n**عدد التقييمات:** \`${total}\`` }
    : { name: '📊 التقييمات', value: '*لا يوجد تقييمات بعد — كن أول من يقيّم!* 🎉' });
  if (total > 0) embed.addFields({ name: '📈 التوزيع', value: buildDistribution(stats) });
  return embed;
}

function buildProfileEmbed({ client, target, stats, recent }) {
  const avg = stats?.average ? parseFloat(stats.average).toFixed(1) : '0.0';
  const total = stats?.total || 0;
  const name = target?.displayName || target?.username || target?.name || 'غير معروف';
  const embed = new EmbedBuilder()
    .setColor(colorByAverage(stats?.average))
    .setTitle(`⭐ ملف تقييمات — ${name}`)
    .setTimestamp().setFooter(footer(client));
  if (target?.displayAvatarURL) embed.setThumbnail(target.displayAvatarURL());
  if (total === 0) { embed.setDescription('*لا يوجد تقييمات بعد.*'); return embed; }
  embed.addFields(
    { name: '📊 الملخص', value: `**المتوسط:** ${starsToEmoji(Math.round(stats.average))} \`${avg}/5\`\n**إجمالي التقييمات:** \`${total}\`` },
    { name: '📈 التوزيع', value: buildDistribution(stats) },
  );
  if (recent?.length) {
    embed.addFields({
      name: '💬 آخر التقييمات',
      value: recent.map(r => `${starsToEmoji(r.stars)} — <@${r.rater_id}>\n> ${r.comment ? `"${truncate(r.comment, 60)}"` : '*بدون تعليق*'}`).join('\n\n'),
    });
  }
  return embed;
}

function buildLeaderboardEmbed({ client, rows, guild }) {
  const medals = ['🥇', '🥈', '🥉'];
  return new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle(`🏆 لوحة الصدارة — ${guild?.name || ''}`)
    .setDescription(rows.length === 0
      ? '*لا يوجد تقييمات في هذا السيرفر بعد.*'
      : rows.map((r, i) => `${medals[i] || `\`${i + 1}.\``} <@${r.target_id}> — ${starsToEmoji(Math.round(r.average))} \`${parseFloat(r.average).toFixed(1)}/5\` (${r.total} تقييم)`).join('\n'))
    .setThumbnail(guild?.iconURL() || null)
    .setTimestamp().setFooter(footer(client));
}

function buildBroadcastStats({ client, blocked, totalMembers, recentLogs }) {
  const available = Math.max(0, totalMembers - blocked);
  const pct = totalMembers > 0 ? Math.round((available / totalMembers) * 100) : 0;
  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('📊 إحصائيات البرودكاست')
    .addFields(
      { name: '👥 الأعضاء', value: `\`${totalMembers}\``, inline: true },
      { name: '🚫 المحظورون', value: `\`${blocked}\``, inline: true },
      { name: '✅ المتاحون', value: `\`${available}\` (${pct}%)`, inline: true },
    )
    .setTimestamp().setFooter(footer(client));
  if (recentLogs?.length) {
    embed.addFields({ name: '🕘 آخر الإرساليات', value: recentLogs.map(l => `✅ ${l.success}/${l.total} — <t:${Number(l.created_at)}:R>`).join('\n') });
  }
  return embed;
}

module.exports = { successEmbed, errorEmbed, infoEmbed, buildPanelEmbed, buildReviewPanelEmbed, buildProfileEmbed, buildLeaderboardEmbed, colorByAverage, buildDistribution, buildBroadcastStats };
