require('dotenv').config();
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));

const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  mainServerId: process.env.LOG_SERVER_ID || raw.mainServerId || '',
  logServerId: process.env.LOG_SERVER_ID || raw.logServerId || '',
  owners: raw.owners || [],
  adminRoles: raw.adminRoles || [],
  autoRoles: raw.autoRoles || { memberRoleId: null, botRoleId: null },
  gamesChannelId: raw.gamesChannelId || '',
  gamesPrefix: raw.gamesPrefix || '-',
  jailPrefix: raw.jailPrefix || '$',
  logChannels: raw.logChannels || {},
  protectedRoles: raw.protectedRoles || [],
  protectionBypassRoles: raw.protectionBypassRoles || [],
  protectionAction: raw.protectionAction || 'kick',
  security: raw.security || {},
  jail: raw.jail || { roleId: raw.jail?.roleId || '' },
  ticket: {
    categoryId: raw.ticket?.categoryId || '',
    logChannelId: raw.ticket?.logChannelId || '',
    staffRoles: raw.ticket?.staffRoles || [],
    panel: raw.ticket?.panel || { title: '🎫 Support Tickets', description: 'Select a ticket type to get support.', footer: 'NSR BOT', color: 0x5865F2 },
    ticketTypes: raw.ticket?.ticketTypes || [
      { id: 'general', label: '💬 General Support', description: 'General questions and help', emoji: '💬', color: 0x5865F2 },
      { id: 'billing', label: '💳 Billing & Payments', description: 'Payment and billing issues', emoji: '💳', color: 0xF1C40F },
      { id: 'report', label: '🚨 Report a User', description: 'Report a user or issue', emoji: '🚨', color: 0xED4245 },
    ],
  },
  vacation: {
    logChannelId: raw.vacation?.logChannelId || '',
    staffRoles: raw.vacation?.staffRoles || [],
    vacationRoles: raw.vacation?.vacationRoles || [],
    resignRoles: raw.vacation?.resignRoles || [],
    serverName: raw.vacation?.serverName || 'Server',
  },
  suggestions: raw.suggestions || {},
  streak: raw.streak || {},
  lines: raw.lines || {},
  moderation: raw.moderation || { staffRoles: raw.adminRoles || [] },
  rating: { feedChannelId: process.env.FEED_CHANNEL_ID || raw.rating?.feedChannelId || '', reviewsChannelId: raw.rating?.reviewsChannelId || '', products: raw.rating?.products || [] },
  games: {
    minBet: raw.games?.minBet || 10,
    rouletteEnabled: raw.games?.rouletteEnabled ?? true,
    reactionGameEnabled: raw.games?.reactionGameEnabled ?? true,
    quizEnabled: raw.games?.quizEnabled ?? true,
  },
  footerText: raw.footerText || 'NSR HUB - MoDy Dev',
  logoUrl: raw.logoUrl || '',
  activity: raw.activity || '',
  status: raw.status || 'online',
  logChannelId: process.env.LOG_CHANNEL_ID || '',
  feedChannelId: process.env.FEED_CHANNEL_ID || '',
  reviewChannelId: process.env.REVIEW_CHANNEL_ID || '',
  serverSettings: raw.serverSettings || {},
  bridgeKey: raw.bridgeKey || '',
  customerRoleId: raw.customerRoleId || '',
};

function isOwner(userId) {
  return config.owners.includes(String(userId));
}

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has('Administrator')) return true;
  if (member.permissions?.has('ManageGuild')) return true;
  const guildCfg = require('./guildCfg').get(member.guild?.id);
  if ((guildCfg.staffRoles || []).some(roleId => member.roles?.cache?.has(roleId))) return true;
  return (config.adminRoles || []).some(roleId => member.roles?.cache?.has(roleId));
}

module.exports = { config, isOwner, isAdmin };
