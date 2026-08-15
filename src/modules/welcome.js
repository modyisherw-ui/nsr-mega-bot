const { EmbedBuilder } = require('discord.js');
const log = require('../utils/logger');
const guildCfg = require('../guildCfg');

function compile(text, member) {
  return (text || '')
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{count}/g, String(member.guild.memberCount))
    .replace(/{server}/g, member.guild.name);
}

async function sendWelcome(member) {
  try {
    const cfg = guildCfg.get(member.guild.id).welcome || {};
    if (cfg.mode !== 'dm' && !cfg.channelId) return;
    if (!cfg.message && !cfg.imageUrl) return;

    let content = compile(cfg.message, member);
    if (cfg.showCount && content && content.indexOf('{count}') === -1 && !content.match(/أنت العضو رقم/)) {
      content += `\n🎉 أنت العضو رقم **${member.guild.memberCount}** في السيرفر.`;
    }

    const embeds = [];
    if (cfg.withImage && cfg.imageUrl) {
      const color = guildCfg.get(member.guild.id).embedColor || 0x5865F2;
      embeds.push(new EmbedBuilder().setColor(color).setImage(cfg.imageUrl));
    }

    const payload = { content: content || undefined, embeds: embeds.length ? embeds : undefined };

    if (cfg.mode === 'dm') {
      await member.send(payload).catch(() => {
        log.warn(`تعذر إرسال ترحيب DM لـ ${member.user.tag} (الخاص مغلق)`);
      });
      return;
    }

    const channel = member.guild.channels.cache.get(cfg.channelId);
    if (!channel) return;
    await channel.send(payload);
  } catch (err) {
    log.warn('فشل إرسال رسالة الترحيب: ' + err.message);
  }
}

module.exports = { sendWelcome };