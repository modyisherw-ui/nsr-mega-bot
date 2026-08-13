const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');
const { config } = require('../config');

let clientRef = null;

const spamState = new Map();

async function checkProtectedRoles(member, roleId) {
  const guild = member.guild;
  const protectedRoles = config.protectedRoles || [];
  if (!protectedRoles.includes(roleId)) return false;
  const isOwner = member.id === guild.ownerId;
  const bypass = (config.protectionBypassRoles || []).some(r => member.roles.cache.has(r));
  if (isOwner || bypass) return false;
  const action = config.protectionAction || 'kick';
  if (action === 'kick') { try { await member.kick('أعطى رتبة محمية'); } catch {} }
  else if (action === 'ban') { try { await member.ban({ reason: 'أعطى رتبة محمية' }); } catch {} }
  const embed = new EmbedBuilder()
    .setTitle('🚨 محاولة إعطاء رتبة محمية!')
    .setColor('Red')
    .setDescription(`**المخالف:** ${member.user.tag} (<@${member.id}>)\n**العقوبة:** ${action}`)
    .setTimestamp();
  const logChannel = config.logChannels.protectedRoleViolation ? guild.channels.cache.get(config.logChannels.protectedRoleViolation) : null;
  if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
  log.warn(`محاولة إعطاء رتبة محمية من ${member.user.tag} — ${action}`);
  return true;
}

async function handleMessageSecurity(message) {
  if (!message.guild || message.author.bot) return;
  if (config.mainServerId && message.guild.id !== config.mainServerId) return;
  const cfg = db.securityCfg.get(message.guild.id);
  if (!cfg.spam_enabled) return;
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const state = spamState.get(key) || { count: 0, first: now };
  if (now - state.first > cfg.spam_window * 1000) { state.count = 0; state.first = now; }
  state.count++;
  spamState.set(key, state);

  if (state.count >= cfg.spam_max_messages) {
    const member = message.member;
    const isMod = (config.moderation.staffRoles || []).some(r => member.roles.cache.has(r)) || member.permissions.has('ManageMessages');
    if (isMod) { spamState.delete(key); return; }
    try {
      await message.delete().catch(() => {});
      const duration = cfg.spam_timeout * 1000;
      await member.timeout(duration, 'سبام - الحماية التلقائية');
      const embed = new EmbedBuilder()
        .setTitle('🚫 تم كتم العضو تلقائياً (سبام)')
        .setColor('Red')
        .addFields(
          { name: 'العضو', value: member.user.tag },
          { name: 'المدة', value: `${cfg.spam_timeout} دقيقة` },
        )
        .setTimestamp();
      const logChannel = config.logChannels.security ? message.guild.channels.cache.get(config.logChannels.security) : null;
      if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
      log.warn(`كتم سبام لـ ${member.user.tag}`);
    } catch (err) { log.warn('فشل كتم السبام: ' + err.message); }
    spamState.delete(key);
  }
}

async function handleBotJoin(member) {
  if (!member.user.bot) return;
  if (config.mainServerId && member.guild.id !== config.mainServerId) return;
  const isOwner = member.id === member.guild.ownerId;
  const bypass = (config.protectionBypassRoles || []).some(r => member.roles.cache.has(r));
  if (isOwner || bypass) return;
  try {
    await member.kick('دخول بوت غير مصرح');
    const embed = new EmbedBuilder()
      .setTitle('🚨 تم طرد بوت غير مصرح!')
      .setColor('Red')
      .setDescription(`**البوت:** ${member.user.tag} (<@${member.id}>)`)
      .setTimestamp();
    const logChannel = config.logChannels.security ? member.guild.channels.cache.get(config.logChannels.security) : null;
    if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});
    log.warn(`طرد بوت: ${member.user.tag}`);
  } catch (err) { log.warn('فشل طرد البوت: ' + err.message); }
}

module.exports = { handleMessageSecurity, handleBotJoin, checkProtectedRoles, spamState };
