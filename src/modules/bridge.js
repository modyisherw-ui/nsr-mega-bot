// جسر التحكم عن بعد: يربط تطبيق سطح المكتب بالبوت عبر MQTT (broker.emqx.io)
// الأوامر تصل على nsrbot/{key}/cmd، والردود على nsrbot/{key}/state
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const log = require('../utils/logger');
const { config, isAdmin, isOwner } = require('../config');
const guildCfg = require('../guildCfg');
const db = require('../db');
const { buildTicketPanelPayload, buildSuggestionsPanelPayload, LOG_EVENTS } = require('../dashboard');
const { uploadLogoFromUrl, setLogoUrl, getLogoUrl } = require('../utils/logo');
const { sendMessageToUser } = require('./messages');
const { saveRatingConfig } = require('./ratings');

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
  const owner = isOwner(userId);
  if (owner) return { ok: true, guild, member: null, isOwner: true };
  let member;
  try { member = await guild.members.fetch(userId); } catch (_) { return { ok: false, error: 'العضو غير موجود في السيرفر' }; }
  if (!isAdmin(member)) return { ok: false, error: 'لا تملك صلاحية أدمن في هذا السيرفر' };
  return { ok: true, guild, member, isOwner: false };
}

async function handleMessage(msg, key) {
  if (msg.type === 'guilds') {
    const out = [];
    const userIsOwner = isOwner(msg.userId);
    for (const g of discordClient.guilds.cache.values()) {
      let member = g.members.cache.get(msg.userId);
      if (!member) {
        try { member = await g.members.fetch(msg.userId); } catch (_) {}
      }
      out.push({ id: g.id, name: g.name, iconUrl: g.iconURL({ size: 128 }), isAdmin: !!(member && isAdmin(member)), isOwner: userIsOwner });
    }
    reply(key, msg, { guilds: out, botClientId: discordClient.user ? discordClient.user.id : '', isOwner: userIsOwner });
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
        logoUrl: getLogoUrl(guild.id),
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
        rating: {
          reviewsChannelId: guildSettings.rating?.reviewsChannelId || config.reviewChannelId || '',
          products: guildSettings.rating?.products || [],
        },
        logChannels: guildSettings.logChannels || {},
        protection: {
          protectedRoles: guildSettings.protectedRoles || [],
          bypassRoles: guildSettings.protectionBypassRoles || [],
          action: guildSettings.protectionAction || 'kick',
          config: guildSettings.protection || {},
        },
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

    case 'setLogChannels': {
      const events = msg.events || {};
      const cur = guildSettings.logChannels || {};
      const next = { ...cur };
      for (const [evId, channelId] of Object.entries(events)) {
        if (channelId) {
          const ch = guild.channels.cache.get(String(channelId));
          if (!ch) {
            reply(key, msg, null, 'الروم غير موجود: ' + channelId);
            return;
          }
          next[evId] = String(channelId);
        } else {
          delete next[evId];
        }
      }
      const stored = db.guildSettings.get(guild.id) || {};
      stored.logChannels = next;
      db.guildSettings.set(guild.id, stored);
      guildCfg.set(guild.id, { logChannels: next });
      try {
        const cfgPath = path.join(__dirname, '../../config.json');
        const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        raw.logChannels = next;
        fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
      } catch (err) {
        log.warn('فشل حفظ logChannels في config.json: ' + err.message);
      }
      reply(key, msg, { logChannels: next });
      break;
    }

    case 'setProtection': {
      const protectedRoles = Array.isArray(msg.protectedRoles) ? msg.protectedRoles.map(String) : undefined;
      const bypassRoles = Array.isArray(msg.bypassRoles) ? msg.bypassRoles.map(String) : undefined;
      const action = ['kick', 'ban'].includes(msg.action) ? msg.action : undefined;
      const prot = (protectedRoles !== undefined) ? protectedRoles : (guildSettings.protectedRoles || []);
      const bypass = (bypassRoles !== undefined) ? bypassRoles : (guildSettings.protectionBypassRoles || []);
      const act = action !== undefined ? action : (guildSettings.protectionAction || 'kick');
      const cfgPatch = (msg.config && typeof msg.config === 'object') ? msg.config : undefined;
      const cfgMerged = cfgPatch ? { ...(guildSettings.protection || {}), ...cfgPatch } : undefined;
      guildCfg.set(guild.id, {
        protectedRoles: prot,
        protectionBypassRoles: bypass,
        protectionAction: act,
        ...(cfgMerged ? { protection: cfgMerged } : {}),
      });
      const after = guildCfg.get(guild.id);
      reply(key, msg, {
        protectedRoles: after.protectedRoles || [],
        bypassRoles: after.protectionBypassRoles || [],
        action: after.protectionAction || 'kick',
        config: after.protection || {},
      });
      break;
    }

    case 'setRatingChannel': {
      const channel = guild.channels.cache.get(String(msg.channelId || ''));
      if (!channel) {
        reply(key, msg, null, 'الروم غير موجود');
        break;
      }
      saveRatingConfig(guild.id, {
        reviewsChannelId: String(channel.id),
        products: (guildSettings.rating?.products || []),
      });
      reply(key, msg, { reviewsChannelId: String(channel.id) });
      break;
    }

    case 'addProduct': {
      const name = String(msg.name || '').trim();
      if (!name) { reply(key, msg, null, 'اسم المنتج مطلوب'); break; }
      const id = 'p' + crypto.randomBytes(4).toString('hex');
      const products = [...(guildSettings.rating?.products || []), { id, name, roleId: null }];
      saveRatingConfig(guild.id, { reviewsChannelId: guildSettings.rating?.reviewsChannelId || '', products });
      reply(key, msg, { product: { id, name } });
      break;
    }

    case 'delProduct': {
      const products = (guildSettings.rating?.products || []).filter(p => p.id !== String(msg.productId || ''));
      saveRatingConfig(guild.id, { reviewsChannelId: guildSettings.rating?.reviewsChannelId || '', products });
      reply(key, msg, { deleted: true });
      break;
    }

    case 'sendDm': {
      try {
        const { checkSwearAndNotify } = require('./security');
        const blocked = await checkSwearAndNotify(guild, String(msg.text || ''));
        if (blocked) { reply(key, msg, null, '💢 الرسالة تحتوي على كلمات غير لائقة — تم منع الإرسال وإبلاغ المالك'); break; }
        const result = await sendMessageToUser(discordClient, guild, String(msg.type || ''), msg.targetId, String(msg.text || ''));
        reply(key, msg, result);
      } catch (err) {
        reply(key, msg, null, err.message || 'فشل الإرسال');
      }
      break;
    }

    case 'getGuildInvite': {
      try {
        const invite = await guild.invites.create(guild.rulesChannelId || guild.systemChannelId || guild.channels.cache.find((c) => c.type === 0)?.id, {
          maxAge: 0,
          maxUses: 0,
          reason: 'NSR HUB owner dashboard',
        }).catch(() => null);
        if (!invite) {
          reply(key, msg, null, 'تعذر إنشاء دعوة — تأكد أن البوت يملك صلاحية Create Invite في السيرفر');
          break;
        }
        reply(key, msg, { invite: `https://discord.gg/${invite.code}` });
      } catch (err) {
        reply(key, msg, null, 'تعذر إنشاء الدعوة: ' + err.message);
      }
      break;
    }

    case 'sendTheme': {
      const channel = guild.channels.cache.get(String(msg.channelId || ''));
      if (!channel || !channel.send) {
        reply(key, msg, null, 'الروم غير موجود أو غير نصي');
        break;
      }
      const rawColor = Number(msg.color);
      const color = (Number.isInteger(rawColor) && rawColor >= 0 && rawColor <= 0xFFFFFF) ? rawColor : (config.embedColor || 0x5865F2);
      const { checkSwearAndNotify } = require('./security');
      const blocked = await checkSwearAndNotify(guild, String(msg.text || ''));
      if (blocked) { reply(key, msg, null, '💢 الثيم يحتوي على كلمات غير لائقة — تم منع الإرسال وإبلاغ المالك'); break; }
      if (msg.asMessage) {
        try {
          await channel.send({ content: String(msg.text || '').trim() });
          reply(key, msg, { channelId: channel.id, sent: true, asMessage: true });
        } catch (err) {
          reply(key, msg, null, 'تعذر إرسال الثيم: ' + err.message);
        }
        break;
      }
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(String(msg.title || '').trim() ? String(msg.title).trim() : null)
        .setDescription(String(msg.text || '').trim())
        .setImage(String(msg.imageUrl || '').trim() ? String(msg.imageUrl).trim() : null)
        .setFooter({ text: guild.name })
        .setTimestamp();
      try {
        await channel.send({ embeds: [embed] });
        reply(key, msg, { channelId: channel.id, sent: true });
      } catch (err) {
        reply(key, msg, null, 'تعذر إرسال الثيم: ' + err.message);
      }
      break;
    }

    case 'setLogo': {
      const url = String(msg.logoUrl || '').trim();
      if (!url) { reply(key, msg, null, 'رابط الصورة مطلوب'); break; }
      try {
        const finalUrl = await uploadLogoFromUrl(discordClient, url, guild.id);
        setLogoUrl(guild.id, finalUrl);
        reply(key, msg, { logoUrl: getLogoUrl(guild.id) });
      } catch (err) {
        reply(key, msg, null, 'تعذر رفع الصورة: ' + err.message);
      }
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