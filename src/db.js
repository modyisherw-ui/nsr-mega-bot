const { CompatDatabase, driverName } = require('./utils/sqlite');
const path = require('path');
const fs = require('fs');

// مسار قاعدة البيانات — يُعرَّف من Fly عبر MEGA_BOT_DATA_DIR (قرص دائم)
const DATA_DIR = process.env.MEGA_BOT_DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new CompatDatabase(path.join(DATA_DIR, 'bot.db'));
console.log(`🗄️ محرك قاعدة البيانات: ${driverName}`);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- ⭐ التقييمات
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL, target_id TEXT NOT NULL, target_type TEXT NOT NULL DEFAULT 'user',
    rater_id TEXT NOT NULL, stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    comment TEXT, created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_rating ON ratings(guild_id, target_id, rater_id);
  CREATE INDEX IF NOT EXISTS idx_ratings_target ON ratings(guild_id, target_id);
  CREATE TABLE IF NOT EXISTS rating_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE, target_id TEXT NOT NULL, target_type TEXT NOT NULL DEFAULT 'user',
    title TEXT, description TEXT, created_by TEXT NOT NULL, created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS review_panel (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL UNIQUE, channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL, target_id TEXT NOT NULL, updated_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 🎫 التذاكر
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT UNIQUE NOT NULL, guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL, type TEXT NOT NULL, number INTEGER NOT NULL, status TEXT DEFAULT 'open',
    claimed_by TEXT DEFAULT NULL, answers TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')), closed_at INTEGER DEFAULT NULL, closed_by TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS ticket_counter (guild_id TEXT PRIMARY KEY, count INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS ticket_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, user_id TEXT NOT NULL,
    rating INTEGER NOT NULL, feedback TEXT, created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 📢 البرودكاست
  CREATE TABLE IF NOT EXISTS blocked_users (user_id TEXT PRIMARY KEY, blocked_at INTEGER DEFAULT (strftime('%s','now')));
  CREATE TABLE IF NOT EXISTS broadcast_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, sent_by TEXT NOT NULL,
    total INTEGER DEFAULT 0, success INTEGER DEFAULT 0, failed INTEGER DEFAULT 0,
    blocked INTEGER DEFAULT 0, duration REAL DEFAULT 0, created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 👮 التحذيرات
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    reason TEXT, moderator_id TEXT NOT NULL, timestamp INTEGER NOT NULL
  );

  -- 🎁 الجيفاواي
  CREATE TABLE IF NOT EXISTS giveaways (
    message_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    prize TEXT NOT NULL, description TEXT DEFAULT '', winners INTEGER DEFAULT 1,
    hosted_by TEXT, emoji TEXT DEFAULT '🎉', ends_at INTEGER NOT NULL,
    entrants TEXT DEFAULT '[]', picked_winners TEXT DEFAULT '[]', ended INTEGER DEFAULT 0
  );

  -- 🔒 السجن
  CREATE TABLE IF NOT EXISTS jails (
    user_id TEXT NOT NULL, guild_id TEXT NOT NULL, role_ids TEXT DEFAULT '[]',
    ends_at INTEGER NOT NULL, jailed_by TEXT, PRIMARY KEY (user_id, guild_id)
  );

  -- 🔥 الستريك
  CREATE TABLE IF NOT EXISTS streaks (
    user_id TEXT NOT NULL, guild_id TEXT NOT NULL, count INTEGER DEFAULT 1,
    last_date TEXT NOT NULL, best INTEGER DEFAULT 1, total_posts INTEGER DEFAULT 1,
    PRIMARY KEY (user_id, guild_id)
  );
  CREATE TABLE IF NOT EXISTS freezes (
    user_id TEXT NOT NULL, guild_id TEXT NOT NULL, count INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id)
  );

  -- 📋 الإجازات
  CREATE TABLE IF NOT EXISTS vacations (
    request_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT, name TEXT,
    reason TEXT, duration TEXT, end_at TEXT, approved INTEGER DEFAULT 0, status TEXT DEFAULT 'بانتظار الموافقة'
  );

  -- 🛡️ الأمان
  CREATE TABLE IF NOT EXISTS security_members (
    user_id TEXT PRIMARY KEY, username TEXT, warnings INTEGER DEFAULT 0,
    spam_violations INTEGER DEFAULT 0, last_violation INTEGER, is_suspicious INTEGER DEFAULT 0, notes TEXT
  );
  CREATE TABLE IF NOT EXISTS spam_tracking (user_id TEXT NOT NULL, message_id TEXT NOT NULL, content TEXT, channel_id TEXT, timestamp INTEGER, PRIMARY KEY (user_id, message_id));
  CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, actor_id TEXT, target_id TEXT,
    action TEXT, details TEXT, is_suspicious INTEGER DEFAULT 0, timestamp INTEGER DEFAULT (strftime('%s','now'))
  );

  -- 🎮 نقاط الألعاب
  CREATE TABLE IF NOT EXISTS game_points (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, points INTEGER DEFAULT 0,
    global_points INTEGER DEFAULT 0, PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS game_settings (
    guild_id TEXT PRIMARY KEY, command_channel TEXT, sm_channel TEXT,
    prefix TEXT DEFAULT '-', refresh_enabled INTEGER DEFAULT 1, kick_random INTEGER DEFAULT 1,
    here_role INTEGER DEFAULT 0, players_roulette INTEGER DEFAULT 20
  );

  -- 🎨 الخطوط (اللاين)
  CREATE TABLE IF NOT EXISTS line_configs (
    guild_id TEXT PRIMARY KEY, image_url TEXT, channels TEXT DEFAULT '[]'
  );

  -- ⚙️ إعدادات عامة لكل سيرفر
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY, settings TEXT DEFAULT '{}'
  );

  -- 📌 لوحات الإجازات
  CREATE TABLE IF NOT EXISTS panel_info (
    channel_id TEXT PRIMARY KEY, message_id TEXT NOT NULL, server_name TEXT
  );
`);

// ═══════════════ Ratings ═══════════════
const ratings = {
  upsert({ guildId, targetId, targetType = 'user', raterId, stars, comment = null }) {
    const existing = ratings.get(guildId, targetId, raterId);
    if (existing) {
      db.prepare(`UPDATE ratings SET stars=?, comment=?, updated_at=strftime('%s','now') WHERE guild_id=? AND target_id=? AND rater_id=?`).run(stars, comment, guildId, targetId, raterId);
      return { action: 'updated', previous: existing };
    }
    db.prepare(`INSERT INTO ratings (guild_id, target_id, target_type, rater_id, stars, comment) VALUES (?,?,?,?,?,?)`).run(guildId, targetId, targetType, raterId, stars, comment);
    return { action: 'created', previous: null };
  },
  get: (guildId, targetId, raterId) => db.prepare(`SELECT * FROM ratings WHERE guild_id=? AND target_id=? AND rater_id=?`).get(guildId, targetId, raterId) || null,
  del: (guildId, targetId, raterId) => db.prepare(`DELETE FROM ratings WHERE guild_id=? AND target_id=? AND rater_id=?`).run(guildId, targetId, raterId).changes > 0,
  stats: (guildId, targetId) => db.prepare(`
    SELECT COUNT(*) AS total, ROUND(AVG(stars),2) AS average,
      SUM(CASE WHEN stars=5 THEN 1 ELSE 0 END) AS five, SUM(CASE WHEN stars=4 THEN 1 ELSE 0 END) AS four,
      SUM(CASE WHEN stars=3 THEN 1 ELSE 0 END) AS three, SUM(CASE WHEN stars=2 THEN 1 ELSE 0 END) AS two,
      SUM(CASE WHEN stars=1 THEN 1 ELSE 0 END) AS one
    FROM ratings WHERE guild_id=? AND target_id=?`).get(guildId, targetId),
  recent: (guildId, targetId, limit = 5) => db.prepare(`SELECT * FROM ratings WHERE guild_id=? AND target_id=? ORDER BY updated_at DESC LIMIT ?`).all(guildId, targetId, limit),
  leaderboard: (guildId, limit = 10) => db.prepare(`SELECT target_id, target_type, COUNT(*) AS total, ROUND(AVG(stars),2) AS average FROM ratings WHERE guild_id=? GROUP BY target_id HAVING total >= 1 ORDER BY average DESC, total DESC LIMIT ?`).all(guildId, limit),
  byRater: (guildId, raterId, limit = 10) => db.prepare(`SELECT * FROM ratings WHERE guild_id=? AND rater_id=? ORDER BY updated_at DESC LIMIT ?`).all(guildId, raterId, limit),
  savePanel: ({ guildId, channelId, messageId, targetId, targetType, title, description, createdBy }) =>
    db.prepare(`INSERT OR REPLACE INTO rating_panels (guild_id, channel_id, message_id, target_id, target_type, title, description, created_by) VALUES (?,?,?,?,?,?,?,?)`).run(guildId, channelId, messageId, targetId, targetType, title, description, createdBy),
  getPanel: (messageId) => db.prepare(`SELECT * FROM rating_panels WHERE message_id=?`).get(messageId) || null,
  deletePanel: (messageId) => db.prepare(`DELETE FROM rating_panels WHERE message_id=?`).run(messageId).changes > 0,
  panelsByTarget: (guildId, targetId) => db.prepare(`SELECT * FROM rating_panels WHERE guild_id=? AND target_id=?`).all(guildId, targetId),
  saveReview: ({ guildId, channelId, messageId, targetId }) => db.prepare(`INSERT OR REPLACE INTO review_panel (guild_id, channel_id, message_id, target_id, updated_at) VALUES (?,?,?,?,strftime('%s','now'))`).run(guildId, channelId, messageId, targetId),
  getReview: (guildId) => db.prepare(`SELECT * FROM review_panel WHERE guild_id=?`).get(guildId) || null,
  deleteReview: (guildId) => db.prepare(`DELETE FROM review_panel WHERE guild_id=?`).run(guildId).changes > 0,
};

// ═══════════════ Tickets ═══════════════
const tickets = {
  nextNumber: (guildId) => { db.prepare(`INSERT INTO ticket_counter (guild_id, count) VALUES (?,1) ON CONFLICT(guild_id) DO UPDATE SET count = count + 1`).run(guildId); return db.prepare(`SELECT count FROM ticket_counter WHERE guild_id=?`).get(guildId).count; },
  create: ({ channelId, guildId, userId, type, number, answers }) => db.prepare(`INSERT INTO tickets (channel_id, guild_id, user_id, type, number, answers) VALUES (?,?,?,?,?,?)`).run(channelId, guildId, userId, type, number, JSON.stringify(answers)),
  get: (channelId) => db.prepare(`SELECT * FROM tickets WHERE channel_id=?`).get(channelId) || null,
  getUserOpen: (userId, guildId) => db.prepare(`SELECT * FROM tickets WHERE user_id=? AND guild_id=? AND status='open'`).all(userId, guildId),
  getOpen: (guildId) => db.prepare(`SELECT * FROM tickets WHERE guild_id=? AND status='open' ORDER BY created_at DESC`).all(guildId),
  close: (channelId, closedBy) => db.prepare(`UPDATE tickets SET status='closed', closed_at=strftime('%s','now'), closed_by=? WHERE channel_id=?`).run(closedBy, channelId),
  claim: (channelId, userId) => db.prepare(`UPDATE tickets SET claimed_by=? WHERE channel_id=?`).run(userId, channelId),
  unclaim: (channelId) => db.prepare(`UPDATE tickets SET claimed_by=NULL WHERE channel_id=?`).run(channelId),
  stats: (guildId) => {
    const q = (sql) => db.prepare(sql).get(guildId).c;
    return { total: q(`SELECT COUNT(*) c FROM tickets WHERE guild_id=?`), open: q(`SELECT COUNT(*) c FROM tickets WHERE guild_id=? AND status='open'`), closed: q(`SELECT COUNT(*) c FROM tickets WHERE guild_id=? AND status='closed'`), today: q(`SELECT COUNT(*) c FROM tickets WHERE guild_id=? AND created_at > strftime('%s','now') - 86400`) };
  },
  saveRating: (ticketId, userId, rating, feedback) => db.prepare(`INSERT OR REPLACE INTO ticket_ratings (ticket_id, user_id, rating, feedback) VALUES (?,?,?,?)`).run(ticketId, userId, rating, feedback),
  avgRating: (guildId) => db.prepare(`SELECT AVG(r.rating) AS avg, COUNT(*) AS count FROM ticket_ratings r JOIN tickets t ON r.ticket_id = t.id WHERE t.guild_id=?`).get(guildId),
};

// ═══════════════ Broadcast ═══════════════
const broadcast = {
  isBlocked: (userId) => !!db.prepare(`SELECT 1 FROM blocked_users WHERE user_id=?`).get(String(userId)),
  addBlocked: (userId) => db.prepare(`INSERT OR IGNORE INTO blocked_users (user_id) VALUES (?)`).run(String(userId)),
  clearBlocked: () => db.prepare(`DELETE FROM blocked_users`).run().changes,
  blockedCount: () => db.prepare(`SELECT COUNT(*) c FROM blocked_users`).get().c,
  log: ({ guildId, sentBy, total, success, failed, blocked, duration }) => db.prepare(`INSERT INTO broadcast_logs (guild_id, sent_by, total, success, failed, blocked, duration) VALUES (?,?,?,?,?,?,?)`).run(String(guildId), String(sentBy), total, success, failed, blocked, duration),
  lastLogs: (guildId, limit = 3) => db.prepare(`SELECT * FROM broadcast_logs WHERE guild_id=? ORDER BY created_at DESC LIMIT ?`).all(String(guildId), limit),
};

// ═══════════════ Warnings ═══════════════
const warnings = {
  add: (guildId, userId, reason, moderatorId) => db.prepare(`INSERT INTO warnings (guild_id, user_id, reason, moderator_id, timestamp) VALUES (?,?,?,?,?)`).run(guildId, userId, reason, moderatorId, Date.now()),
  list: (guildId, userId) => db.prepare(`SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY timestamp DESC`).all(guildId, userId),
  clear: (guildId, userId) => db.prepare(`DELETE FROM warnings WHERE guild_id=? AND user_id=?`).run(guildId, userId).changes,
};

// ═══════════════ Giveaways ═══════════════
const giveaways = {
  create: (g) => db.prepare(`INSERT OR REPLACE INTO giveaways (message_id, guild_id, channel_id, prize, description, winners, hosted_by, emoji, ends_at, entrants, picked_winners, ended) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`).run(g.messageId, g.guildId, g.channelId, g.prize, g.description, g.winners, g.hostedBy, g.emoji, g.endsAt, JSON.stringify(g.entrants || []), JSON.stringify(g.pickedWinners || [])),
  get: (messageId) => db.prepare(`SELECT * FROM giveaways WHERE message_id=?`).get(messageId) || null,
  all: () => db.prepare(`SELECT * FROM giveaways`).all(),
  active: (guildId) => db.prepare(`SELECT * FROM giveaways WHERE guild_id=? AND ended=0`).all(guildId),
  setEntrants: (messageId, entrants) => db.prepare(`UPDATE giveaways SET entrants=? WHERE message_id=?`).run(JSON.stringify(entrants), messageId),
  end: (messageId, winners) => db.prepare(`UPDATE giveaways SET ended=1, picked_winners=? WHERE message_id=?`).run(JSON.stringify(winners), messageId),
  parse: (g) => ({ ...g, entrants: JSON.parse(g.entrants || '[]'), pickedWinners: JSON.parse(g.picked_winners || '[]') }),
};

// ═══════════════ Jail ═══════════════
const jails = {
  add: ({ userId, guildId, roleIds, endsAt, jailedBy }) => db.prepare(`INSERT OR REPLACE INTO jails (user_id, guild_id, role_ids, ends_at, jailed_by) VALUES (?,?,?,?,?)`).run(userId, guildId, JSON.stringify(roleIds), endsAt, jailedBy),
  get: (userId, guildId) => db.prepare(`SELECT * FROM jails WHERE user_id=? AND guild_id=?`).get(userId, guildId) || null,
  all: (guildId) => db.prepare(`SELECT * FROM jails WHERE guild_id=?`).all(guildId),
  remove: (userId, guildId) => db.prepare(`DELETE FROM jails WHERE user_id=? AND guild_id=?`).run(userId, guildId),
};

// ═══════════════ Streak ═══════════════
const streak = {
  get: (userId, guildId) => db.prepare(`SELECT * FROM streaks WHERE user_id=? AND guild_id=?`).get(userId, guildId) || null,
  update(userId, guildId) {
    const today = new Date().toISOString().split('T')[0];
    const row = streak.get(userId, guildId);
    if (!row) { db.prepare(`INSERT INTO streaks (user_id, guild_id, count, last_date, best, total_posts) VALUES (?,?,1,?,1,1)`).run(userId, guildId, today); return { count: 1, isNew: true, broken: false, sameDay: false }; }
    const diffDays = Math.floor((new Date(today) - new Date(row.last_date)) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) { db.prepare(`UPDATE streaks SET total_posts = total_posts + 1 WHERE user_id=? AND guild_id=?`).run(userId, guildId); return { count: row.count, isNew: false, broken: false, sameDay: true }; }
    let newCount, broken = false;
    if (diffDays === 1) newCount = row.count + 1;
    else {
      const freeze = streak.getFreeze(userId, guildId);
      if (freeze && freeze.count > 0 && diffDays === 2) { db.prepare(`UPDATE freezes SET count = count - 1 WHERE user_id=? AND guild_id=?`).run(userId, guildId); newCount = row.count + 1; }
      else { newCount = 1; broken = true; }
    }
    db.prepare(`UPDATE streaks SET count=?, last_date=?, best=MAX(best,?), total_posts = total_posts + 1 WHERE user_id=? AND guild_id=?`).run(newCount, today, newCount, userId, guildId);
    return { count: newCount, isNew: false, broken, prevCount: row.count };
  },
  leaderboard: (guildId, limit = 10) => db.prepare(`SELECT * FROM streaks WHERE guild_id=? ORDER BY count DESC LIMIT ?`).all(guildId, limit),
  reset: (userId, guildId) => db.prepare(`DELETE FROM streaks WHERE user_id=? AND guild_id=?`).run(userId, guildId),
  getFreeze: (userId, guildId) => db.prepare(`SELECT * FROM freezes WHERE user_id=? AND guild_id=?`).get(userId, guildId) || null,
  addFreeze: (userId, guildId, amount = 1) => db.prepare(`INSERT INTO freezes (user_id, guild_id, count) VALUES (?,?,?) ON CONFLICT(user_id, guild_id) DO UPDATE SET count = count + ?`).run(userId, guildId, amount, amount),
  setConfig: (guildId, field, value) => {
    const allowed = ['streak_channels', 'reaction_emoji', 'delete_original', 'card_enabled', 'card_bg_color', 'card_accent'];
    if (!allowed.includes(field)) return;
    const row = db.prepare(`SELECT settings FROM guild_settings WHERE guild_id=?`).get(guildId);
    const s = row ? JSON.parse(row.settings) : {};
    if (field === 'streak_channels') s.streak_channels = value;
    else s['streak_' + field] = value;
    db.prepare(`INSERT INTO guild_settings (guild_id, settings) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET settings = excluded.settings`).run(guildId, JSON.stringify(s));
  },
  getConfig(guildId) {
    const row = db.prepare(`SELECT settings FROM guild_settings WHERE guild_id=?`).get(guildId);
    const s = row ? JSON.parse(row.settings) : {};
    return {
      streak_channels: s.streak_channels || [],
      reaction_emoji: s.streak_reaction_emoji || '🔥',
      delete_original: s.streak_delete_original ?? 1,
      card_enabled: s.streak_card_enabled ?? 1,
      card_bg_color: s.streak_card_bg_color || '#020205',
      card_accent: s.streak_card_accent || '#00F2FF',
    };
  },
};

// ═══════════════ Vacations ═══════════════
const vacations = {
  all: () => db.prepare(`SELECT * FROM vacations`).all(),
  getByUser: (userId) => db.prepare(`SELECT * FROM vacations WHERE user_id=?`).all(userId),
  get: (requestId) => db.prepare(`SELECT * FROM vacations WHERE request_id=?`).get(requestId) || null,
  add: (v) => db.prepare(`INSERT INTO vacations (request_id, user_id, username, name, reason, duration, end_at, approved, status) VALUES (?,?,?,?,?,?,?,?,?)`).run(v.requestId, v.userId, v.username, v.name, v.reason, v.duration, v.endAt, v.approved ? 1 : 0, v.status),
  update: (requestId, fields) => {
    const allowed = ['approved', 'status'];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) db.prepare(`UPDATE vacations SET ${k}=? WHERE request_id=?`).run(v, requestId);
    }
  },
  remove: (requestId) => db.prepare(`DELETE FROM vacations WHERE request_id=?`).run(requestId),
  savePanel: (channelId, messageId, serverName) => db.prepare(`INSERT OR REPLACE INTO panel_info (channel_id, message_id, server_name) VALUES (?,?,?)`).run(channelId, messageId, serverName),
  getPanel: (channelId) => db.prepare(`SELECT * FROM panel_info WHERE channel_id=?`).get(channelId) || null,
};

// ═══════════════ Security ═══════════════
const security = {
  trackSpam: (userId, messageId, content, channelId) => db.prepare(`INSERT OR REPLACE INTO spam_tracking (user_id, message_id, content, channel_id, timestamp) VALUES (?,?,?,?,?)`).run(userId, messageId, content, channelId, Date.now()),
  recentSpam: (userId, timeWindow) => db.prepare(`SELECT * FROM spam_tracking WHERE user_id=? AND timestamp > ? ORDER BY timestamp DESC`).all(userId, Date.now() - timeWindow),
  cleanSpam: (before) => db.prepare(`DELETE FROM spam_tracking WHERE timestamp < ?`).run(before),
  violation: (userId, type, details, action, actorId) => db.prepare(`INSERT INTO security_events (event_type, actor_id, target_id, action, details, is_suspicious) VALUES (?,?,?,?,?,1)`).run(type, actorId || 'system', userId, action, details),
  events: (limit = 20) => db.prepare(`SELECT * FROM security_events ORDER BY id DESC LIMIT ?`).all(limit),
  getMember: (userId) => db.prepare(`SELECT * FROM security_members WHERE user_id=?`).get(userId) || null,
  addWarn: (userId) => db.prepare(`INSERT INTO security_members (user_id, warnings) VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET warnings = warnings + 1`).run(userId),
  addSpamViolation: (userId) => db.prepare(`INSERT INTO security_members (user_id, spam_violations) VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET spam_violations = spam_violations + 1, last_violation = ?`).run(userId, Date.now()),
  addKick: (userId) => db.prepare(`INSERT INTO security_members (user_id, warnings) VALUES (?,0) ON CONFLICT(user_id) DO NOTHING`).run(userId),
};

// ═══════════════ Games ═══════════════
const games = {
  addPoints: (guildId, userId, n) => db.prepare(`INSERT INTO game_points (guild_id, user_id, points, global_points) VALUES (?,?,?,?) ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + ?, global_points = global_points + ?`).run(guildId, userId, n, n, n, n),
  getPoints: (guildId, userId) => db.prepare(`SELECT * FROM game_points WHERE guild_id=? AND user_id=?`).get(guildId, userId) || { points: 0, global_points: 0 },
  top: (guildId, limit = 10) => db.prepare(`SELECT user_id, global_points FROM game_points WHERE guild_id=? ORDER BY global_points DESC LIMIT ?`).all(guildId, limit),
  deleteGuild: (guildId) => db.prepare(`DELETE FROM game_points WHERE guild_id=?`).run(guildId).changes,
  setChannel: (guildId, field, value) => {
    const row = db.prepare(`SELECT * FROM game_settings WHERE guild_id=?`).get(guildId);
    if (row) db.prepare(`UPDATE game_settings SET ${field}=? WHERE guild_id=?`).run(value, guildId);
    else db.prepare(`INSERT INTO game_settings (guild_id, ${field}) VALUES (?,?)`).run(guildId, value);
  },
  settings: (guildId) => db.prepare(`SELECT * FROM game_settings WHERE guild_id=?`).get(guildId) || { command_channel: null, sm_channel: null, prefix: '-', refresh_enabled: 1, kick_random: 1, here_role: 0, players_roulette: 20 },
};

// ═══════════════ Lines ═══════════════
const lines = {
  set: (guildId, imageUrl, channels) => db.prepare(`INSERT INTO line_configs (guild_id, image_url, channels) VALUES (?,?,?) ON CONFLICT(guild_id) DO UPDATE SET image_url=excluded.image_url, channels=excluded.channels`).run(guildId, imageUrl, JSON.stringify(channels)),
  get: (guildId) => { const r = db.prepare(`SELECT * FROM line_configs WHERE guild_id=?`).get(guildId); return r ? { ...r, channels: JSON.parse(r.channels) } : null; },
  remove: (guildId) => db.prepare(`DELETE FROM line_configs WHERE guild_id=?`).run(guildId),
};

// ═══════════════ Guild settings ═══════════════
const guildSettings = {
  get(guildId) {
    const r = db.prepare(`SELECT settings FROM guild_settings WHERE guild_id=?`).get(guildId);
    return r ? JSON.parse(r.settings) : {};
  },
  set(guildId, patch) {
    const s = guildSettings.get(guildId);
    Object.assign(s, patch);
    db.prepare(`INSERT INTO guild_settings (guild_id, settings) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET settings = excluded.settings`).run(guildId, JSON.stringify(s));
  },
};

// ═══════════════ إعدادات الأمان (JSON) ═══════════════
const securityCfg = {
  get(guildId) {
    const s = guildSettings.get(guildId);
    return {
      spam_enabled: s.spam_enabled ?? true,
      spam_max_messages: s.spam_max_messages ?? 5,
      spam_window: s.spam_window ?? 3,
      spam_timeout: s.spam_timeout ?? 5,
      protected_roles: s.protected_roles || [],
    };
  },
  set(guildId, patch) { guildSettings.set(guildId, patch); },
};

// ═══════════════ إعدادات الرتب التلقائية (JSON) ═══════════════
const rolesCfg = {
  get(guildId) {
    const s = guildSettings.get(guildId);
    return { enabled: s.join_roles_enabled ?? false, join_channel_id: s.join_roles_channel_id || null, role_ids: s.join_roles_role_ids || [] };
  },
  set(guildId, patch) { guildSettings.set(guildId, patch); },
};

// ═══════════════ Snipe (ذاكرة) ═══════════════
const snipe = new Map();

// checkpoint دوري: نخلي ملف bot.db الرئيسي محدثاً دائماً (WAL)
// حتى لو انقطعت الجلسة أو انعكس نسخ في الريبو، لا نفقد بيانات
setInterval(() => {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
}, 60 * 1000);

module.exports = { db, ratings, tickets, broadcast, warnings, giveaways, jails, streak, vacations, security, games, lines, guildSettings, securityCfg, rolesCfg, snipe };

