const { EmbedBuilder } = require('discord.js');
const log = require('../utils/logger');

let clientRef = null;

async function sendLog(guild, type, embed) {
  if (!guild) return;
  const guildCfg = require('../guildCfg').get(guild.id);
  const channelId = (guildCfg.logChannels || {})[type];
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

function e(color, title) {
  return new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
}

async function fetchAudit(guild, actionType, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type: actionType });
    const entry = logs.entries.first();
    if (!entry) return null;
    if (targetId && entry.target && entry.target.id !== targetId) return null;
    return entry;
  } catch { return null; }
}

module.exports = function registerLogs(client) {
  clientRef = client;

  client.on('guildMemberAdd', async member => {
    const embed = e('Green', '✅ دخول عضو جديد')
      .setDescription(`**العضو:** ${member.user.tag} (<@${member.id}>)`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
    await sendLog(member.guild, 'memberJoin', embed);

    if (member.user.bot) {
      const guildCfg = require('../guildCfg').get(member.guild.id);
      const isOwner = member.id === member.guild.ownerId;
      const bypass = (guildCfg.protectionBypassRoles || []).some(rid => member.roles.cache.has(rid));
      if (isOwner || bypass) return;
      try { await member.kick('دخول بوت ممنوع'); } catch {}
      const b = e('Red', '🚫 محاولة دخول بوت - تم الطرد')
        .setDescription(`**البوت:** ${member.user.tag} (<@${member.id}>)\nتم طرده من السيرفر تلقائياً.`);
      await sendLog(member.guild, 'protectedRoleViolation', b);
    }
  });

  client.on('guildMemberRemove', async member => {
    try {
      const kickLog = await fetchAudit(member.guild, 'MEMBER_KICK', member.id);
      if (kickLog && Date.now() - kickLog.createdTimestamp < 5000) {
        const embed = e('Orange', '👢 تم طرد عضو')
          .setDescription(`**العضو:** ${member.user.tag} (<@${member.id}>)\n**تم بواسطة:** ${kickLog.executor?.tag} (<@${kickLog.executor?.id}>)`);
        await sendLog(member.guild, 'kickAdd', embed);
        return;
      }
    } catch {}
    const embed = e('Red', '❌ خروج عضو')
      .setDescription(`**العضو:** ${member.user.tag} (<@${member.id}>)`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
    await sendLog(member.guild, 'memberLeave', embed);
  });

  client.on('messageDelete', async message => {
    if (!message.guild) return;
    if (message.partial || message.author?.bot) return;
    const db = require('../db');
    if (message.content) db.snipe.set(message.channel.id, { author: message.author.tag, content: message.content, avatar: message.author.displayAvatarURL(), deletedAt: Date.now() });
    const embed = e('Red', '🗑️ تم حذف رسالة')
      .setDescription(`**العضو:** ${message.author.tag} (<@${message.author.id}>)\n**القناة:** <#${message.channel.id}>`)
      .addFields({ name: 'محتوى الرسالة', value: message.content || '*بدون محتوى*' })
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
    await sendLog(message.guild, 'deleteMessage', embed);
  });

  client.on('messageUpdate', async (oldMsg, newMsg) => {
    if (!newMsg.guild) return;
    if (oldMsg.partial || newMsg.partial || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
    const embed = e('Orange', '✏️ تم تعديل رسالة')
      .setDescription(`**العضو:** ${newMsg.author.tag} (<@${newMsg.author.id}>)\n**القناة:** <#${newMsg.channel.id}>`)
      .addFields(
        { name: 'قبل التعديل', value: oldMsg.content || '*فارغة*' },
        { name: 'بعد التعديل', value: newMsg.content || '*فارغة*' }
      )
      .setThumbnail(newMsg.author.displayAvatarURL({ dynamic: true }));
    await sendLog(newMsg.guild, 'editMessage', embed);
  });

  const handleReaction = (kind) => async (reaction, user) => {
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
    if (user.bot || !reaction.message.guild) return;
    const isAdd = kind === 'add';
    const embed = e(isAdd ? 'Blue' : 'Red', isAdd ? '👍 تم إضافة رد فعل' : '❌ تم حذف رد فعل')
      .setDescription(`**العضو:** ${user.tag} (<@${user.id}>)\n**الرسالة في:** <#${reaction.message.channel.id}>\n**الرد:** ${reaction.emoji}`);
    await sendLog(reaction.message.guild, isAdd ? 'reactionAdd' : 'reactionRemove', embed);
  };
  client.on('messageReactionAdd', handleReaction('add'));
  client.on('messageReactionRemove', handleReaction('remove'));

  client.on('messageCreate', async message => {
    if (!message.guild) return;
    if (message.author.bot || message.attachments.size === 0) return;
    const images = [], videos = [], files = [];
    message.attachments.forEach(att => {
      const n = att.name.toLowerCase();
      if (/\.(png|jpg|jpeg|gif|webp)$/.test(n)) images.push(`[${att.name}](${att.url})`);
      else if (/\.(mp4|mov|webm|mkv)$/.test(n)) videos.push(`[${att.name}](${att.url})`);
      else files.push(`[${att.name}](${att.url})`);
    });
    const embed = e('DarkPurple', '📎 تم إرسال مرفق')
      .setDescription(`**العضو:** ${message.author.tag} (<@${message.author.id}>)\n**القناة:** <#${message.channel.id}>`);
    if (images.length) embed.addFields({ name: '🖼️ صور', value: images.join('\n') });
    if (videos.length) embed.addFields({ name: '🎬 فيديوهات', value: videos.join('\n') });
    if (files.length) embed.addFields({ name: '📁 ملفات', value: files.join('\n') });
    await sendLog(message.guild, 'mediaMessage', embed);
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    if (!member || !newState.guild) return;
    const tag = member.user.tag;
    if (!oldState.channelId && newState.channelId) {
      sendLog(newState.guild, 'voiceJoin', e('Green', '🔊 دخول عضو لروم صوتي').setDescription(`**العضو:** ${tag} (<@${newState.id}>)\n**الروم:** ${newState.channel.name}`));
    } else if (oldState.channelId && !newState.channelId) {
      sendLog(newState.guild, 'voiceLeave', e('Red', '🔇 خروج عضو من روم صوتي').setDescription(`**العضو:** ${tag} (<@${newState.id}>)\n**الروم:** ${oldState.channel.name}`));
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      sendLog(newState.guild, 'voiceMove', e('Yellow', '🔄 تنقل عضو بين رومات صوتية').setDescription(`**العضو:** ${tag} (<@${newState.id}>)\n**من روم:** ${oldState.channel.name}\n**إلى روم:** ${newState.channel.name}`));
    }
    if (oldState.selfMute !== newState.selfMute || oldState.selfDeaf !== newState.selfDeaf) {
      const actions = [];
      if (!oldState.selfMute && newState.selfMute) actions.push('🔇 تم ميوت ذاتي');
      if (oldState.selfMute && !newState.selfMute) actions.push('🔊 تم إزالة الميوت الذاتي');
      if (!oldState.selfDeaf && newState.selfDeaf) actions.push('🙉 تم دفن ذاتي');
      if (oldState.selfDeaf && !newState.selfDeaf) actions.push('👂 تم إزالة الدفن الذاتي');
      if (actions.length) sendLog(newState.guild, 'voiceStateChange', e('Orange', '🎙️ تغيير حالة الصوت للفويس').setDescription(`**العضو:** ${tag} (<@${newState.id}>)\n${actions.join('\n')}`));
    }
  });

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const guildCfg = require('../guildCfg').get(newMember.guild.id);
    if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
      if (newMember.communicationDisabledUntilTimestamp > Date.now()) {
        await sendLog(newMember.guild, 'timeoutAdd', e('DarkOrange', '⏳ تم تطبيق تايم أوت').setDescription(`**العضو:** ${newMember.user.tag} (<@${newMember.id}>)\n**ينتهي عند:** <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:R>`));
      } else {
        await sendLog(newMember.guild, 'timeoutRemove', e('Green', '✅ انتهاء التايم أوت').setDescription(`**العضو:** ${newMember.user.tag} (<@${newMember.id}>)`));
      }
    }

    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    if (addedRoles.size > 0) {
      const matched = addedRoles.find(r => (guildCfg.protectedRoles || []).includes(r.id));
      if (matched) {
        let executor = null;
        const entry = await fetchAudit(newMember.guild, 'MEMBER_ROLE_UPDATE', newMember.id);
        if (entry) executor = entry.executor;
        const bypass = (guildCfg.protectionBypassRoles || []).some(rid => executor?.roles?.cache?.has(rid));
        const isOwner = executor?.id === newMember.guild.ownerId;
        if (!(isOwner || bypass)) {
          const action = guildCfg.protectionAction || 'kick';
          if (executor) {
            if (action === 'kick') { try { await newMember.guild.members.kick(executor.id, 'أعطى رتبة محمية'); } catch {} }
            else if (action === 'ban') { try { await newMember.guild.members.ban(executor.id, { reason: 'أعطى رتبة محمية' }); } catch {} }
            else if (action === 'removeRole') { try { await newMember.roles.remove(matched.id); } catch {} }
          }
          await sendLog(newMember.guild, 'protectedRoleViolation', e('DarkRed', '⛔ محاولة إعطاء رتبة محمية - تم العقاب')
            .addFields(
              { name: 'المخالف', value: `${executor?.user?.tag || '?'} (<@${executor?.id || '?'}>)` },
              { name: 'المتأثر', value: `${newMember.user.tag} (<@${newMember.id}>)` },
              { name: 'الرتبة', value: matched.name }
            ));
        }
        return;
      }
    }

    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size > 0) await sendLog(newMember.guild, 'roleAdd', e('Green', '🎁 تم إعطاء رتبة').setDescription(`**العضو:** ${newMember.user.tag} (<@${newMember.id}>)`).addFields({ name: 'الرتب المعطاة', value: addedRoles.map(r => r.name).join(', ') }));
    if (removedRoles.size > 0) await sendLog(newMember.guild, 'roleRemove', e('Red', '❌ تم سحب رتبة').setDescription(`**العضو:** ${newMember.user.tag} (<@${newMember.id}>)`).addFields({ name: 'الرتب المسحوبة', value: removedRoles.map(r => r.name).join(', ') }));
  });

  client.on('roleCreate', role => {
    sendLog(role.guild, 'roleCreate', e('Green', '➕ تم إنشاء رتبة').setDescription(`**الرتبة:** ${role.name}`).addFields({ name: 'الترتيب', value: role.position.toString() }));
  });
  client.on('roleDelete', role => {
    sendLog(role.guild, 'roleDelete', e('DarkRed', '➖ تم حذف رتبة').setDescription(`**الرتبة:** ${role.name}`));
  });
  client.on('roleUpdate', (oldRole, newRole) => {
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`- الاسم: "${oldRole.name}" ➔ "${newRole.name}"`);
    if (oldRole.color !== newRole.color) changes.push(`- اللون: "${oldRole.color}" ➔ "${newRole.color}"`);
    if (changes.length) sendLog(newRole.guild, 'roleUpdate', e('Yellow', '🛠️ تم تعديل رتبة').setDescription(`**الرتبة:** ${newRole.name}\n${changes.join('\n')}`));
  });

  client.on('channelCreate', channel => {
    if (!channel.guild) return;
    sendLog(channel.guild, 'channelCreate', e('Green', '➕ تم إنشاء روم').setDescription(`**اسم الروم:** ${channel.name}\n**النوع:** ${channel.type}`));
  });
  client.on('channelDelete', channel => {
    if (!channel.guild) return;
    sendLog(channel.guild, 'channelDelete', e('DarkRed', '🧹 تم حذف روم').setDescription(`**اسم الروم:** ${channel.name}\n**النوع:** ${channel.type}`));
  });
  client.on('channelUpdate', (oldChannel, newChannel) => {
    if (!oldChannel.guild) return;
    if (oldChannel.name !== newChannel.name) {
      sendLog(newChannel.guild, 'channelUpdate', e('Yellow', '🛠️ تم تعديل روم').setDescription(`- الاسم: "${oldChannel.name}" ➔ "${newChannel.name}"`));
    }
  });

  client.on('guildBanAdd', async ban => {
    const entry = await fetchAudit(ban.guild, 'MEMBER_BAN_ADD', ban.user.id);
    sendLog(ban.guild, 'banAdd', e('DarkRed', '⛔ تم باند عضو').setDescription(`**العضو:** ${ban.user.tag} (<@${ban.user.id}>)\n${entry ? `**تم بواسطة:** ${entry.executor?.tag}` : ''}`));
  });
  client.on('guildBanRemove', async ban => {
    const entry = await fetchAudit(ban.guild, 'MEMBER_BAN_REMOVE', ban.user.id);
    sendLog(ban.guild, 'banRemove', e('Green', '✅ تم إلغاء باند عضو').setDescription(`**العضو:** ${ban.user.tag} (<@${ban.user.id}>)\n${entry ? `**تم بواسطة:** ${entry.executor?.tag}` : ''}`));
  });

  log.ok('📋 نظام اللوقات مفعّل (لكل سيرفر)');
};
