const { EmbedBuilder } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

let clientRef = null;

function isMod(member) {
  const { config } = require('../config');
  return (config.moderation.staffRoles || []).some(r => member.roles.cache.has(r)) || member.permissions.has('Administrator');
}

function giveawayEmbed(g) {
  return new EmbedBuilder()
    .setTitle(`🎉 ${g.prize}`)
    .setColor('Gold')
    .setDescription([
      `**ينتهي:** <t:${Math.floor(g.ends_at / 1000)}:R>`,
      `**الفائز:** <@${(g.picked_winners && g.picked_winners[0]) || '?'}>`,
      '',
      '> اضغط على 🎉 للمشاركة!',
    ].join('\n'))
    .setTimestamp();
}

async function checkExpired() {
  const all = db.giveaways.all().map(db.giveaways.parse);
  for (const g of all) {
    if (g.ended || g.ends_at > Date.now()) continue;
    const guild = clientRef.guilds.cache.get(g.guild_id);
    if (!guild) continue;
    const channel = guild.channels.cache.get(g.channel_id);
    if (!channel) continue;

    const message = await channel.messages.fetch(g.message_id).catch(() => null);
    let winnerId = null;
    if (message) {
      const reaction = message.reactions.cache.get(g.emoji || '🎉');
      if (reaction) {
        const users = await reaction.users.fetch().catch(() => []);
        const valid = [...users.values()].filter(u => !u.bot && g.entrants.includes(u.id));
        if (valid.length) winnerId = valid[Math.floor(Math.random() * valid.length)].id;
      }
    }
    if (!winnerId && g.entrants.length) winnerId = g.entrants[Math.floor(Math.random() * g.entrants.length)];

    db.giveaways.end(g.message_id, winnerId ? [winnerId] : []);

    const endedEmbed = giveawayEmbed({ ...g, picked_winners: winnerId ? [winnerId] : [] });
    endedEmbed.setFooter({ text: 'انتهت الجيفاواي' });
    if (winnerId) {
      endedEmbed.setDescription(`**الفائز:** <@${winnerId}> 🎉\n\nمبروووك! أرسل رسالة للمنظم لاستلام جائزتك.`);
      try {
        const winner = await guild.members.fetch(winnerId);
        await winner.send(`🎉 مبروك! ربحت **${g.prize}** من سيرفر **${guild.name}**!`);
      } catch {}
    } else {
      endedEmbed.setDescription('لا يوجد مشاركين كافيين.');
    }
    if (message) message.edit({ embeds: [endedEmbed] });
  }
}

async function handleReaction(reaction, user) {
  if (user.bot || reaction.partial) return;
  try { await reaction.message.fetch(); } catch { return; }
  const g = db.giveaways.get(reaction.message.id);
  if (!g) return;
  const parsed = db.giveaways.parse(g);
  if (parsed.ended) return;
  const entrants = parsed.entrants.filter(id => id !== user.id);
  entrants.push(user.id);
  db.giveaways.setEntrants(reaction.message.id, entrants);
}

module.exports = { checkExpired, handleReaction, isMod };
