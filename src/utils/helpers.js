const { isAdmin } = require('../config');

function parseDuration(str) {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(String(str || '').trim());
  if (!m) return null;
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return parseInt(m[1]) * mult[m[2].toLowerCase()];
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} ثانية`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ساعة`;
  return `${Math.floor(h / 24)} يوم`;
}

function starsToEmoji(stars, max = 5) {
  return '⭐'.repeat(stars) + '☆'.repeat(Math.max(0, max - stars));
}

function starsToLabel(stars) {
  return ({ 1: '😡 سيء جداً', 2: '😕 سيء', 3: '😐 مقبول', 4: '😊 جيد', 5: '🤩 ممتاز' })[stars] || `${stars} نجوم`;
}

function progressBar(value, total, length = 10) {
  if (!total) return '░'.repeat(length) + ' 0%';
  const filled = Math.round((value / total) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled) + ` ${Math.round((value / total) * 100)}%`;
}

function truncate(text, max = 100) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { parseDuration, formatDuration, starsToEmoji, starsToLabel, progressBar, truncate, chunk, sleep, isAdmin };
