const db = require('./db');
const { config } = require('./config');

// إعدادات افتراضية لكل سيرفر جديد
const DEFAULTS = {
  logChannels: {},
  protectedRoles: [],
  protectionBypassRoles: [],
  protectionAction: 'kick',
  staffRoles: [],
  autoRoles: { memberRoleId: null, botRoleId: null },
  rating: { reviewsChannelId: '', products: [] },
  ticket: {
    categoryId: '',
    logChannelId: '',
    staffRoles: [],
    panel: { title: '🎫 Support Tickets', description: 'Select a ticket type to get support.', footer: 'NSR BOT', color: 0x57F287 },
    ticketTypes: [
      { id: 'general', label: '💬 General Support', description: 'General questions and help', emoji: '💬', color: 0x5865F2 },
      { id: 'billing', label: '💳 Billing & Payments', description: 'Payment and billing issues', emoji: '💳', color: 0xF1C40F },
      { id: 'report', label: '🚨 Report a User', description: 'Report a user or issue', emoji: '🚨', color: 0xED4245 },
    ],
  },
};

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (patch === undefined || patch === null) return base;
  if (Array.isArray(base) || Array.isArray(patch)) return patch;
  if (!isObj(base) || !isObj(patch)) return patch;
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    out[k] = deepMerge(base[k], patch[k]);
  }
  return out;
}

// ترحيل إعدادات السيرفر الأصلي (config.json) إلى قاعدة البيانات مرة واحدة
function seedLegacy(guildId) {
  if (!config.mainServerId || String(guildId) !== String(config.mainServerId)) return;
  const stored = db.guildSettings.get(guildId);
  if (stored && Object.keys(stored).length) return;
  db.guildSettings.set(guildId, {
    logChannels: config.logChannels || {},
    protectedRoles: config.protectedRoles || [],
    protectionBypassRoles: config.protectionBypassRoles || [],
    protectionAction: config.protectionAction || 'kick',
    staffRoles: config.adminRoles || [],
    autoRoles: config.autoRoles || { memberRoleId: null, botRoleId: null },
    rating: config.rating ? { reviewsChannelId: config.rating.reviewsChannelId || '', products: config.rating.products || [] } : {},
    ticket: config.ticket || {},
  });
}

function get(guildId) {
  if (!guildId) return deepMerge(DEFAULTS, {});
  seedLegacy(guildId);
  const stored = db.guildSettings.get(guildId) || {};
  return deepMerge(DEFAULTS, stored);
}

function set(guildId, patch) {
  if (!guildId || !patch) return;
  const cur = db.guildSettings.get(guildId) || {};
  db.guildSettings.set(guildId, deepMerge(cur, patch));
}

module.exports = { get, set, DEFAULTS };
