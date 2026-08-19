// جسر التحكم عن بعد: يربط تطبيق سطح المكتب بالبوت عبر MQTT (broker.emqx.io)
// الأوامر تصل على nsrbot/{key}/cmd، والردود على nsrbot/{key}/state
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('../utils/logger');
const { config, isAdmin } = require('../config');
const guildCfg = require('../guildCfg');
const db = require('../db');
const { buildTicketPanelPayload, buildSuggestionsPanelPayload } = require('../dashboard');

const BROKER_URL = process.env.BRIDGE_BROKER || 'wss://broker.emqx.io:8084/mqtt';

function ensureKey() {
  if (config.bridgeKey) return config.bridgeKey;
  const key = crypto.randomBytes(16).toString('hex');
  const cfgPath = path.join(__dirname, '../../config.json');
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    raw.bridgeKey = key;
    fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2), 'utf8');
    config.bridgeKey = key;
    log.bot('تم توليد مفتاح جسر جديد: ' + key);
  } catch (err) {
    log.warn('تعذر حفظ مفتاح الجسر في config.json: ' + err.message);
  }
  return key;
}

let client = null;
let readyResolvers = [];
let discordClient = null;

function connect() {
  const key = ensureKey();
  log.bot('جارٍ الاتصال بالجسر MQTT...');
  client = mqtt.connect(BROKER_URL, {
    clientId: 'nsrbot-' + crypto.randomBytes(6).toString('hex'),
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on('connect', () => {
    const topic = `nsrbot/${key}/cmd`;
    client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) log.warn('فشل الاشتراك في موضوع الجسر: ' + err.message);
      else {
        log.bot('الجسر متصل — نستمع للأوامر على ' + topic);
        readyResolvers.forEach(r => r());
        readyResolvers = [];
      }
    });
  });

  client.on('reconnect', () => log.bot('إعادة محاولة اتصال الجسر...'));
  client.on('offline', () => log.warn('الجسر MQTT غير متصل'));
  client.on('error', (err) => log.warn('خطأ الجسر MQTT: ' + err.message));

  client.on('message', (topic, payload) => {
    let msg;
    try { msg = JSON.parse(payload.toString()); } catch (_) { return; }
    if (!msg || !msg.type) return;
    handleMessage(msg, key).catch(err => log.warn('خطأ في معالجة أمر الجسر: ' + err.message));
  });
}

function publishState(key, payload) {
  if (!client || !client.connected) return;
  client.publish(`nsrbot/${key}/state`, JSON.stringify(payload), { qos: 1 });
}

function reply(key, msg, data, error) {
  publishState(key, {
    requestId: msg.requestId || null,
    userId: msg.userId || null,
    guildId: msg.guildId || null,
    ok: !error,
    data: data || null,
    error: error || null,
  });
}

async function verifyAdminInGuild(clientDiscord, guildId, userId) {
  if (!guildId || !userId) return { ok: false, error: 'guildId و userId مطلوبان' };
  const guild = clientDiscord.guilds.cache.get(guildId);
  if (!guild) return { ok: false, error: 'البوت ليس في هذا السيرفر' };
  let member;
  try { member = await guild.members.fetch(userId); } catch (_) { return { ok: false, error: 'العضو غير موجود في السيرفر' }; }
  if (!isAdmin(member)) return { ok: false, error: 'لا تملك صلاحية أدمن في هذا السيرفر' };
  return { ok: true, guild, member };
}

async function handleMessage(msg, key) {
  if (msg.type === 'guilds') {
    const out = [];
    for (const g of discordClient.guilds.cache.values()) {
      let member = g.members.cache.get(msg.userId);
      if (!member) {
        try { member = await g.members.fetch(msg.userId); } catch (_) {}
      }
      out.push({ id: g.id, name: g.name, iconUrl: g.iconURL({ size: 128 }), isAdmin: !!(member && isAdmin(member)) });
    }
    reply(key, msg, { guilds: out, botClientId: discordClient.user ? discordClient.user.id : '' });
    return;
  }

  const ctx = await verifyAdminInGuild(discordClient, msg.guildId, msg.userId);
  if (!ctx.ok) {
    reply(key, msg, null, ctx.error);
    return;
  }

  const guild = ctx.guild;
  const guildSettings = guildCfg.get(guild.id);
  const tcfg = guildSettings.ticket || {};

  switch (msg.type) {
    case 'state': {
      reply(key, msg, {
        guild: { id: guild.id, name: guild.name, iconUrl: guild.iconURL({ size: 256 }) },
        logoUrl: config.logoUrl || '',
        color: config.embedColor || 0x5865F2,
        welcome: guildSettings.welcome || {},
        ticket: {
          panel: tcfg.panel || {},
          ticketTypes: tcfg.ticketTypes || [],
        },
        suggestions: {
          channelId: guildSettings.suggestions?.channelId || '',
        },
        staffRoles: guildSettings.staffRoles || config.adminRoles || [],
        autoRoles: guildSettings.autoRoles || config.autoRoles || {},
        rating: { reviewsChannelId: config.reviewChannelId || '' },
        channels: Array.from(guild.channels.cache.values())
          .filter(c => c.isTextBased && c.isTextBased())
          .map(c => ({ id: c.id, name: c.name }))
          .slice(0, 100),
        roles: Array.from(guild.roles.cache.values())
          .filter(r => r.name !== '@everyone')
          .map(r => ({ id: r.id, name: r.name }))
          .slice(0, 100),
      });
      break;
    }

    case 'sendTicketPanel': {
      const channel = guild.channels.cache.get(msg.channelId);
      if (!channel || !channel.send) {
        reply(key, msg, null, 'الروم غير موجود أو غير نصي');
        break;
      }
      const types = (tcfg.ticketTypes || []).filter(tp => tp.enabled !== false);
      if (!types.length) {
        reply(key, msg, null, 'لا توجد أنواع تذاكر مفعّلة — فعّل واحداً على الأقل من التطبيق');
        break;
      }
      await channel.send(buildTicketPanelPayload(guild, tcfg));
      reply(key, msg, { channelId: channel.id, sent: true });
      break;
    }

    case 'sendSuggestionsPanel': {
      const channel = guild.channels.cache.get(msg.channelId);
      if (!channel || !channel.send) {
        reply(key, msg, null, 'الروم غير موجود أو غير نصي');
        break;
      }
      await channel.send(buildSuggestionsPanelPayload());
      reply(key, msg, { channelId: channel.id, sent: true });
      break;
    }

    case 'setWelcome': {
      const w = msg.welcome || {};
      guildCfg.set(guild.id, { welcome: { ...(guildSettings.welcome || {}), ...w } });
      reply(key, msg, { welcome: guildCfg.get(guild.id).welcome });
      break;
    }

    case 'setSuggestionsChannel': {
      const channel = guild.channels.cache.get(msg.channelId);
      if (!channel) {
        reply(key, msg, null, 'الروم غير موجود');
        break;
      }
      guildCfg.set(guild.id, { suggestions: { channelId: msg.channelId } });
      reply(key, msg, { channelId: msg.channelId });
      break;
    }

    case 'setColor': {
      const color = Number(msg.color);
      if (isNaN(color) || color < 0 || color > 0xFFFFFF) { reply(key, msg, null, 'لون غير صالح (يجب أن يكون بين 0 و 16777215)'); break; }
      guildCfg.set(guild.id, { embedColor: color });
      reply(key, msg, { color });
      break;
    }

    case 'setStaffRoles': {
      const roleIds = (msg.roleIds || []).map(String);
      guildCfg.set(guild.id, { staffRoles: roleIds });
      reply(key, msg, { staffRoles: roleIds });
      break;
    }

    case 'setAutoRoles': {
      const ar = msg.autoRoles || {};
      guildCfg.set(guild.id, { autoRoles: { ...(guildSettings.autoRoles || {}), ...ar } });
      reply(key, msg, { autoRoles: guildCfg.get(guild.id).autoRoles });
      break;
    }

    case 'setTicketPanel': {
      const p = msg.panel || {};
      const rawColor = Number(p.color);
      const color = (Number.isInteger(rawColor) && rawColor >= 0 && rawColor <= 0xFFFFFF) ? rawColor : (tcfg.panel?.color || 0x5865F2);
      const panel = {
        title: p.title || tcfg.panel?.title || '🎫 Support Tickets',
        description: p.description || tcfg.panel?.description || '',
        footer: p.footer || tcfg.panel?.footer || 'NSR HUB - MoDy Dev',
        color,
      };
      guildCfg.set(guild.id, { ticket: { ...tcfg, panel } });
      reply(key, msg, { panel });
      break;
    }

    case 'setTicketTypeEnabled': {
      const id = String(msg.typeId || '');
      const enabled = !!msg.enabled;
      const types = (tcfg.ticketTypes || []).map(tp => tp.id === id ? { ...tp, enabled } : tp);
      if (!types.some(tp => tp.id === id)) {
        reply(key, msg, null, 'نوع التذكرة غير موجود: ' + id);
        break;
      }
      guildCfg.set(guild.id, { ticket: { ...tcfg, ticketTypes: types } });
      reply(key, msg, { typeId: id, enabled });
      break;
    }

    case 'addTicketType': {
      const label = String(msg.label || '').trim();
      if (!label) { reply(key, msg, null, 'الاسم مطلوب'); break; }
      const newType = {
        id: 'c' + crypto.randomBytes(4).toString('hex'),
        label,
        description: String(msg.description || '').trim() || 'Support',
        emoji: String(msg.emoji || '').trim() || '🔹',
        color: 0x5865F2,
        enabled: true,
      };
      const types = [...(tcfg.ticketTypes || []), newType];
      guildCfg.set(guild.id, { ticket: { ...tcfg, ticketTypes: types } });
      reply(key, msg, { ticketType: newType });
      break;
    }

    case 'delTicketType': {
      const id = String(msg.typeId || '');
      if (!id.startsWith('c')) { reply(key, msg, null, 'لا يمكن حذف نوع أساسي — الأنواع الأساسية محمية'); break; }
      const types = (tcfg.ticketTypes || []).filter(tp => tp.id !== id);
      guildCfg.set(guild.id, { ticket: { ...tcfg, ticketTypes: types } });
      reply(key, msg, { typeId: id, deleted: true });
      break;
    }

    default:
      reply(key, msg, null, 'أمر غير معروف: ' + msg.type);
  }
}

function start(discordBotClient) {
  if (!discordBotClient) return;
  discordClient = discordBotClient;
  connect();
  return {
    isConnected: () => !!(client && client.connected),
    getKey: () => config.bridgeKey,
    publish: (payload) => publishState(config.bridgeKey, payload),
  };
}

module.exports = { start, connect, ensureKey };