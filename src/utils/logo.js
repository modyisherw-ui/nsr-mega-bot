const path = require('path');
const fs = require('fs');
const log = require('./logger');
const { config } = require('../config');

const LOGO_PATH = path.join(__dirname, '..', '..', 'logo2.png');
const HAS_LOGO = fs.existsSync(LOGO_PATH);
const LOGO_NAME = 'logo2.png';
const LOGO_ATTACH = `attachment://${LOGO_NAME}`;

let LOGO_URL = config.logoUrl || '';
let HAS_URL = !!LOGO_URL;

function setLogoUrl(url) {
  try {
    const fp = path.join(__dirname, '..', '..', 'config.json');
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    raw.logoUrl = url;
    fs.writeFileSync(fp, JSON.stringify(raw, null, 2));
  } catch (err) {
    log.warn('فشل حفظ رابط اللوقو: ' + err.message);
  }
  LOGO_URL = url;
  HAS_URL = true;
  config.logoUrl = url;
}

// إنشاء إيموجي من اللوقو لاستخدام رابطه كصورة دائمة (لا يخضع لتقييد رفع الملفات)
async function ensureEmojiLogo(client, guild) {
  const existing = guild.emojis.cache.find((e) => e.name === 'nsrlogo');
  if (existing) {
    const url = existing.imageURL({ size: 256, extension: 'png' });
    if (url) setLogoUrl(url);
    return true;
  }
  try {
    const emoji = await guild.emojis.create({ attachment: LOGO_PATH, name: 'nsrlogo' });
    const url = emoji.imageURL({ size: 256, extension: 'png' });
    if (url) setLogoUrl(url);
    return true;
  } catch (err) {
    log.warn('تعذر إنشاء إيموجي اللوقو: ' + err.message);
    return false;
  }
}

// رفع اللوقو مرة واحدة إلى صورة ديسكورد دائمة (CDN) ثم حذف الرسالة
async function ensureLogoUrl(client) {
  if (!HAS_LOGO) return;
  if (config.logoUrl) { LOGO_URL = config.logoUrl; HAS_URL = true; return; }
  const guild = client.guilds.cache.get(config.mainServerId || config.logServerId) || client.guilds.cache.first();
  if (!guild) return;
  try {
    const { PermissionsBitField } = require('discord.js');
    const need = PermissionsBitField.Flags.SendMessages | PermissionsBitField.Flags.AttachFiles;
    const canAttach = (c) => c && c.type === 0 && c.permissionsFor(guild.members.me)?.has(need);
    let channel = canAttach(guild.channels.cache.get(config.logChannels?.memberJoin))
      ? guild.channels.cache.get(config.logChannels?.memberJoin) : null;
    if (!channel && canAttach(guild.systemChannel)) channel = guild.systemChannel;
    if (!channel) channel = guild.channels.cache.find(canAttach);
    if (!channel) { await ensureEmojiLogo(client, guild); return; }
    const msg = await channel.send({ files: [{ attachment: LOGO_PATH, name: LOGO_NAME }] });
    const url = msg.attachments.first()?.url;
    if (url) setLogoUrl(url);
    msg.delete().catch(() => {});
  } catch (err) {
    await ensureEmojiLogo(client, guild);
  }
}

const TITLE_EMOJI = /^\s*(\p{Extended_Pictographic}(\uFE0F)?\s*)+/u;

function stripTitleEmoji(title) {
  if (typeof title !== 'string') return title;
  const cleaned = title.replace(TITLE_EMOJI, '').replace(/^[\u200f\u200e\s]+/, '').trim();
  return cleaned ? cleaned : title;
}

function applyLogo(embed) {
  if (!embed) return false;
  if (typeof embed.setTitle === 'function' && typeof embed.data.title === 'string') {
    const t = stripTitleEmoji(embed.data.title);
    if (t !== embed.data.title) embed.setTitle(t);
  } else if (typeof embed.title === 'string') {
    const t = stripTitleEmoji(embed.title);
    if (t !== embed.title) embed.title = t;
  }
  const hasThumb = embed.data ? embed.data.thumbnail : embed.thumbnail;
  if (hasThumb) return false;
  const url = HAS_URL ? LOGO_URL : LOGO_ATTACH;
  if (typeof embed.setThumbnail === 'function') embed.setThumbnail(url);
  else embed.thumbnail = { url };
  return true;
}

function withLogo(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Array.isArray(payload.embeds) || payload.embeds.length === 0) return payload;
  const added = payload.embeds.some(applyLogo);
  if (HAS_URL || !HAS_LOGO || !added) return payload;
  const files = Array.isArray(payload.files) ? [...payload.files] : [];
  if (!files.some((f) => f && f.name === LOGO_NAME)) {
    files.push({ attachment: LOGO_PATH, name: LOGO_NAME });
    payload.files = files;
  }
  return payload;
}

module.exports = { withLogo, ensureLogoUrl, hasLogo: HAS_LOGO };
