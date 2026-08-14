const path = require('path');
const fs = require('fs');
const log = require('./logger');
const { config } = require('../config');

const LOGO_PATH = path.join(__dirname, '..', '..', 'logo2.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);
const LOGO_NAME = 'logo2.png';
const LOGO_ATTACH = `attachment://${LOGO_NAME}`;

// إنشاء إيموجي من اللوقو لاستخدام رابطه كصورة دائمة (لا يخضع لتقييد رفع الملفات)
async function ensureEmojiLogo(client, guild) {
  const existing = guild.emojis.cache.find((e) => e.name === 'nsrlogo');
  if (existing) {
    const url = existing.imageURL({ size: 256, extension: 'png' });
    if (url) setLogoUrl(null, url);
    return true;
  }
  try {
    const emoji = await guild.emojis.create({ attachment: LOGO_PATH, name: 'nsrlogo' });
    const url = emoji.imageURL({ size: 256, extension: 'png' });
    if (url) setLogoUrl(null, url);
    return true;
  } catch (err) {
    log.warn('تعذر إنشاء إيموجي اللوقو: ' + err.message);
    return false;
  }
}

// رفع اللوقو مرة واحدة إلى صورة ديسكورد دائمة (CDN) ثم حذف الرسالة
async function ensureLogoUrl(client) {
  if (!HAS_LOGO) return;
  if (config.logoUrl) return;
  const guild = client.guilds.cache.first();
  if (!guild) return;
  try {
    const { PermissionsBitField } = require('discord.js');
    const need = PermissionsBitField.Flags.SendMessages | PermissionsBitField.Flags.AttachFiles;
    const canAttach = (c) => c && c.type === 0 && c.permissionsFor(guild.members.me)?.has(need);
    const memberJoinChannel = require('../guildCfg').get(guild.id).logChannels?.memberJoin;
    let channel = canAttach(guild.channels.cache.get(memberJoinChannel))
      ? guild.channels.cache.get(memberJoinChannel) : null;
    if (!channel && canAttach(guild.systemChannel)) channel = guild.systemChannel;
    if (!channel) channel = guild.channels.cache.find(canAttach);
    if (!channel) { await ensureEmojiLogo(client, guild); return; }
    const msg = await channel.send({ files: [{ attachment: LOGO_PATH, name: LOGO_NAME }] });
    const url = msg.attachments.first()?.url;
    if (url) setLogoUrl(null, url);
    msg.delete().catch(() => {});
  } catch (err) {
    await ensureEmojiLogo(client, guild);
  }
}

// رفع صورة من رابط خارجي إلى CDN ديسكورد (يضمن ظهورها دائماً في الثمبنيل)
async function uploadLogoFromUrl(client, url, guildId) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf || buf.length === 0) throw new Error('صورة فارغة');
  const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
  if (!guild) throw new Error('لا يوجد سيرفر');
  const canAttach = (c) => c && c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages') && c.permissionsFor(guild.members.me)?.has('AttachFiles');
  const memberJoinChannel = require('../guildCfg').get(guild.id).logChannels?.memberJoin;
  let channel = canAttach(guild.channels.cache.get(memberJoinChannel))
    ? guild.channels.cache.get(memberJoinChannel) : null;
  if (!channel && canAttach(guild.systemChannel)) channel = guild.systemChannel;
  if (!channel) channel = guild.channels.cache.find(canAttach);
  if (!channel) throw new Error('لا يوجد روم يمكن رفع الصورة فيه');
  const msg = await channel.send({ files: [{ attachment: buf, name: LOGO_NAME }] });
  const cdn = msg.attachments.first()?.url;
  msg.delete().catch(() => {});
  if (!cdn) throw new Error('تعذر الحصول على رابط الصورة');
  return cdn;
}

// رابط اللوقو للسيرفر المحدد، أو اللوقو الافتراضي إن لم يحدده السيرفر نفسه
function getLogoUrl(guildId) {
  if (guildId) {
    try {
      const g = require('../guildCfg').get(guildId);
      if (g.logoUrl) return g.logoUrl;
    } catch (err) {
      log.warn('فشل قراءة لوقو السيرفر: ' + err.message);
    }
  }
  return config.logoUrl || '';
}

// حفظ اللوقو: مع guildId يُحفظ لكل سيرفر، بدون يُحفظ كافتراضي عام
function setLogoUrl(guildId, url) {
  if (guildId) {
    try {
      require('../guildCfg').set(guildId, { logoUrl: url });
    } catch (err) {
      log.warn('فشل حفظ لوقو السيرفر: ' + err.message);
    }
    return;
  }
  try {
    const fp = path.join(__dirname, '..', '..', 'config.json');
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    raw.logoUrl = url;
    fs.writeFileSync(fp, JSON.stringify(raw, null, 2));
  } catch (err) {
    log.warn('فشل حفظ رابط اللوقو: ' + err.message);
  }
  config.logoUrl = url;
}

const TITLE_EMOJI = /^\s*(\p{Extended_Pictographic}(\uFE0F)?\s*)+/u;

function stripTitleEmoji(title) {
  if (typeof title !== 'string') return title;
  const cleaned = title.replace(TITLE_EMOJI, '').replace(/^[\u200f\u200e\s]+/, '').trim();
  return cleaned ? cleaned : title;
}

// لون السيرفر المخصص (مع اللوقو) — قراءة واحدة من إعدادات السيرفر
function getGuildBrand(guildId) {
  if (!guildId) return { logoUrl: config.logoUrl || '', embedColor: 0 };
  try {
    const g = require('../guildCfg').get(guildId);
    return {
      logoUrl: g.logoUrl || config.logoUrl || '',
      embedColor: typeof g.embedColor === 'number' && g.embedColor ? g.embedColor : 0,
    };
  } catch (err) {
    log.warn('فشل قراءة إعدادات السيرفر: ' + err.message);
    return { logoUrl: config.logoUrl || '', embedColor: 0 };
  }
}

function applyLogo(embed, guildId) {
  if (!embed) return false;
  const brand = getGuildBrand(guildId);
  // تغيير اللون الأزرق الافتراضي إلى لون السيرفر المخصص (كل الإمبدات الزرقاء تتغير)
  if (brand.embedColor) {
    const cur = embed.data ? embed.data.color : embed.color;
    const curNum = (typeof cur === 'number') ? cur : null;
    if (curNum === null || curNum === 0x5865F2 || cur === 'Blurple' || cur === 'Default') {
      if (typeof embed.setColor === 'function') embed.setColor(brand.embedColor);
      else embed.color = brand.embedColor;
    }
  }
  if (typeof embed.setTitle === 'function' && typeof embed.data.title === 'string') {
    const t = stripTitleEmoji(embed.data.title);
    if (t !== embed.data.title) embed.setTitle(t);
  } else if (typeof embed.title === 'string') {
    const t = stripTitleEmoji(embed.title);
    if (t !== embed.title) embed.title = t;
  }
  const hasThumb = embed.data ? embed.data.thumbnail : embed.thumbnail;
  if (hasThumb) return false;
  const url = brand.logoUrl;
  const finalUrl = url || (HAS_LOGO ? LOGO_ATTACH : '');
  if (!finalUrl) return false;
  if (typeof embed.setThumbnail === 'function') embed.setThumbnail(finalUrl);
  else embed.thumbnail = { url: finalUrl };
  return true;
}

function withLogo(payload, guildId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Array.isArray(payload.embeds) || payload.embeds.length === 0) return payload;
  const g = getGuildBrand(guildId);
  const added = payload.embeds.some((e) => applyLogo(e, guildId));
  if (g.logoUrl || !HAS_LOGO || !added) return payload;
  const files = Array.isArray(payload.files) ? [...payload.files] : [];
  if (!files.some((f) => f && f.name === LOGO_NAME)) {
    files.push({ attachment: LOGO_PATH, name: LOGO_NAME });
    payload.files = files;
  }
  return payload;
}

module.exports = { withLogo, ensureLogoUrl, uploadLogoFromUrl, setLogoUrl, getLogoUrl, getGuildBrand, hasLogo: HAS_LOGO };
