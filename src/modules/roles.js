const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const log = require('../utils/logger');

let clientRef = null;

async function handleRoleButton(interaction) {
  const roleId = interaction.customId.replace('role_', '');
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({ content: '❌ الرتبة غير موجودة.', ephemeral: true });
    return;
  }
  const member = interaction.member;
  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId);
    await interaction.reply({ content: `✅ تمت إزالة رتبة ${role.name}.`, ephemeral: true });
  } else {
    await member.roles.add(roleId);
    await interaction.reply({ content: `✅ تمت إضافة رتبة ${role.name}.`, ephemeral: true });
  }
}

async function handleJoinRole(message) {
  if (message.author.bot) return;
  const cfg = db.rolesCfg.get(message.guild.id);
  if (!cfg.enabled || !cfg.join_channel_id) return;
  if (message.channel.id !== cfg.join_channel_id) return;
  if (!/^ا[iي]$/i.test(message.content.trim())) return;
  if (!cfg.role_ids.length) return;
  const role = message.guild.roles.cache.get(cfg.role_ids[0]);
  if (!role) return;
  try {
    await message.member.roles.add(role);
    await message.reply(`✅ تم إعطاؤك رتبة **${role.name}**!`).catch(() => {});
  } catch (err) {
    log.warn('فشل إعطاء رتبة دخول: ' + err.message);
  }
}

module.exports = { handleRoleButton, handleJoinRole };
