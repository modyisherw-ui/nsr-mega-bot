const db = require('./db');
const { config } = require('./config');
const fs = require('fs');
const path = require('path');
const log = require('./utils/logger');

const CFG_PATH = path.join(__dirname, '..', 'config.json');

// إعدادات افتراضية لكل سيرفر جديد
const DEFAULTS = {
  logChannels: {},
  protectedRoles: [],
  protectionBypassRoles: [],
  protectionAction: 'kick',
  staffRoles: [],
  autoRoles: { memberRoleId: null, botRoleId: null },
  suggestions: { channelId: '' },
  commands: {},
  logoUrl: '',
  embedColor: '',
  rating: { reviewsChannelId: '', products: [] },
  ticket: {
    categoryId: '',
    logChannelId: '',
    staffRoles: [],
    panel: { title: '🎫 Support Tickets', description: 'Select a ticket type to get support.', footer: 'NSR HUB - MoDy Dev', color: 0x57F287 },
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
  // أي سيرفر: استرجاع إعداداته المحفوظة في config.json (نجت من إعادة التشغيل السابقة)
  const saved = config.serverSettings && config.serverSettings[guildId];
  if (saved && Object.keys(saved).length) {
    const stored = db.guildSettings.get(guildId) || {};
    db.guildSettings.set(guildId, deepMerge(saved, stored));
    return;
  }
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

// كتابة إعدادات السيرفر في config.json (ملف متتبع في git) حتى تنجو من إعادة التشغيل
// لأن data/bot.db gitignored ويُفقد في كل تشغيل جديد على GitHub Actions
function persistToConfig(guildId, settings) {
  try {
    const raw = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    if (!raw.serverSettings) raw.serverSettings = {};
    const prev = raw.serverSettings[guildId] || {};
    raw.serverSettings[guildId] = deepMerge(prev, settings);
    fs.writeFileSync(CFG_PATH, JSON.stringify(raw, null, 2));
    if (!config.serverSettings) config.serverSettings = {};
    config.serverSettings[guildId] = raw.serverSettings[guildId];
  } catch (err) {
    log.warn('فشل حفظ إعدادات السيرفر في config.json: ' + err.message);
  }
}

// ذاكرة مؤقتة لإعدادات السيرفرات — نتجنب قراءة قاعدة البيانات مع كل إمبد (مهم مع آلاف السيرفرات)
const cfgCache = new Map();

function get(guildId) {
  if (!guildId) return deepMerge(DEFAULTS, {});
  const cached = cfgCache.get(guildId);
  if (cached) return cached;
  seedLegacy(guildId);
  const stored = db.guildSettings.get(guildId) || {};
  const merged = deepMerge(DEFAULTS, stored);
  cfgCache.set(guildId, merged);
  return merged;
}

function set(guildId, patch) {
  if (!guildId || !patch) return;
  const cur = db.guildSettings.get(guildId) || {};
  const merged = deepMerge(cur, patch);
  db.guildSettings.set(guildId, merged);
  cfgCache.set(guildId, deepMerge(DEFAULTS, merged));
  persistToConfig(guildId, merged);
}

module.exports = { get, set, DEFAULTS };
