require('./utils/logger').info('🚀 جاري تشغيل Mega Bot...');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { config } = require('./config');
const log = require('./utils/logger');
const db = require('./db');
const { handleDashboard, handleLogsSelect, handleLogsChannelSelect, handleLogsApply } = require('./dashboard');
const { handleRatingButton, handleRatingModal } = require('./modules/ratings');
const { handleSuggestion, handleSuggestionModal } = require('./modules/suggestions');
const { handleTicketSelect, handleTicketClose, handleTicketActions, handleTicketModal } = require('./modules/tickets');
const { handleBroadcastModal, handleBroadcastConfirm } = require('./modules/broadcast');
const security = require('./modules/security');
const giveaway = require('./modules/giveaway');
const roles = require('./modules/roles');
const registerLogs = require('./modules/logs');
const { handleAdminButton, handleAdminModal } = require('./modules/adminPanel');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
  ],
});

// حقن شعار البوت في كل إمبد (صورة صغيرة بالأعلى يمين/يسار حسب اللغة) + إزالة الإيموجي من العناوين
const { TextChannel, DMChannel, NewsChannel, ThreadChannel, Interaction, MessageComponentInteraction } = require('discord.js');
const { withLogo, ensureLogoUrl } = require('./utils/logo');
function patchProto(cls, method) {
  if (!cls || typeof cls.prototype[method] !== 'function') return;
  const orig = cls.prototype[method];
  cls.prototype[method] = function (payload, ...rest) {
    return orig.call(this, withLogo(payload), ...rest);
  };
}
[TextChannel, DMChannel, NewsChannel, ThreadChannel].forEach((c) => patchProto(c, 'send'));
patchProto(Interaction, 'reply');
patchProto(Interaction, 'editReply');
patchProto(Interaction, 'followUp');
patchProto(MessageComponentInteraction, 'update');

client.once('ready', async () => {
  log.ok(`✅ تم تسجيل الدخول باسم ${client.user.tag}`);
  log.info(`📡 متصل في ${client.guilds.cache.size} سيرفر`);

  // تسجيل كل أحداث الاتصال للدياجنوز: لو انقطع الـ gateway سنعرف السبب فوراً
  client.on('shardDisconnect', (e, id) => log.warn(`🟠 shardDisconnect id=${id}: ${e?.message || 'غالباً مهلة/إنترنت'}`));
  client.on('shardReconnecting', (id) => log.warn(`🔄 shardReconnecting id=${id} — جاري إعادة الاتصال`));
  client.on('shardResumed', (id, replayed) => log.ok(`🔁 shardResumed id=${id} (تقرير ${replayed})`));
  client.on('debug', (msg) => { if (/Reconnecting|Connection|disconnect|error/i.test(msg)) log.warn('🔧 debug: ' + msg.slice(0, 200)); });
  client.on('warn', (msg) => log.warn('⚡ warn: ' + msg));
  client.on('error', (err) => log.error('💥 error: ' + (err?.message || err)));

  await ensureLogoUrl(client);
  registerLogs(client);
  giveaway.setClient(client);

  // نبضة قلب: ملف زمني يثبت أن البوت حي (يشاركه الريبو ليتأكد أي مراقب)
  const fs = require('fs');
  const path = require('path');
  const hbFile = path.join(process.env.MEGA_BOT_DATA_DIR || path.join(__dirname, '..', 'data'), 'heartbeat.json');
  const beat = () => {
    try { fs.writeFileSync(hbFile, JSON.stringify({ at: Date.now(), user: client.user.tag })); } catch (_) {}
  };
  beat();
  setInterval(beat, 30000);

  // تسجيل الأوامر تلقائياً عند الإقلاع (آمن ومتكرر)
  try {
    const { REST, Routes } = require('discord.js');
    const { loadCommands } = require('./commands');
    const rest = new REST({ version: '10' }).setToken(config.token);
    const body = [...loadCommands.values()].map(c => c.data.toJSON());
    // مسح الأوامر العامة القديمة حتى لا تتكرر مع أوامر السيرفر
    await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
    // تسجيل فوري في كل سيرفر البوت فيه (بدل العام اللي ياخذ ساعة)
    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, guild.id), { body });
    }
    log.ok(`✅ تم تسجيل ${body.length} أوامر في ${client.guilds.cache.size} سيرفر`);
  } catch (err) {
    log.warn('تعذر تسجيل الأوامر تلقائياً: ' + err.message + ' — شغّل: node deploy.js');
  }

  client.user.setPresence({
    activities: config.activity ? [{ name: config.activity, type: 3 }] : [],
    status: config.status || 'online',
  });

  // مهام دورية
  setInterval(() => giveaway.checkExpired(), 15000);
});

// ═══════════ الأوامر النصية ═══════════
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  try {
    await roles.handleJoinRole(message);
    await security.handleMessageSecurity(message);
  } catch (err) {
    log.warn('خطأ في معالجة رسالة: ' + err.message);
  }
});

// ═══════════ الأزرار ═══════════
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isCommand()) {
      const { loadCommands } = require('./commands');
      const cmd = loadCommands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('admn_')) return handleAdminButton(interaction);
      if (id === 'bd_logs_apply') return handleLogsApply(interaction);
      if (id.startsWith('bd_')) return handleDashboard(interaction, client);
      if (id.startsWith('rate_')) return handleRatingButton(interaction);
      if (id === 'ticket_close_btn') return handleTicketClose(interaction);
      if (id === 'ticket_add_btn' || id === 'ticket_remove_btn') return handleTicketActions(interaction, id.replace('ticket_', '').replace('_btn', ''));
      if (id === 'bc_confirm') return handleBroadcastConfirm(interaction);
      if (id === 'bc_cancel') return interaction.update({ content: '⛔ تم الإلغاء.', embeds: [], components: [] });
      if (id === 'open_suggestion_modal') return handleSuggestion(interaction);
      if (id.startsWith('role_')) return roles.handleRoleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id.startsWith('admn_')) return handleAdminModal(interaction);
      if (id.startsWith('rating_modal_')) return handleRatingModal(interaction);
      if (id === 'suggestion_modal') return handleSuggestionModal(interaction);
      if (id === 'broadcast_modal') return handleBroadcastModal(interaction);
      if (id === 'ticket_add_modal' || id === 'ticket_remove_modal') return handleTicketModal(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket_type_select') return handleTicketSelect(interaction);
      if (interaction.customId === 'bd_logs_evt') return handleLogsSelect(interaction);
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      if (interaction.customId === 'bd_logs_channel') return handleLogsChannelSelect(interaction);
      return;
    }
  } catch (err) {
    log.error('خطأ في التفاعل: ' + err.message);
    if (interaction.isRepliable && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: '❌ حدث خطأ، حاول مجدداً.', ephemeral: true }).catch(() => {});
    }
  }
});

client.on('guildMemberAdd', async member => {
  if (config.mainServerId && member.guild.id !== config.mainServerId) return;
  await security.handleBotJoin(member);
});

client.on('messageReactionAdd', async (reaction, user) => {
  await giveaway.handleReaction(reaction, user);
});

client.login(config.token).catch(err => {
  log.error('فشل تسجيل الدخول: ' + err.message);
  process.exit(1);
});

// ═══════════ التقاط الانهيارات الصامتة (سبب الموت المتكرر) ═══════════
// unhandledRejection: لا ننهي العملية — نسجّل فقط ونستمر (البوت حي ومتصل)
process.on('unhandledRejection', (reason, promise) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  log.error('⚠️ unhandledRejection (تم الاحتفاظ بالتشغيل): ' + msg.slice(0, 500));
});
// uncaughtException: خطأ متزامن — نسجل ونخرج ليُعيد الحارس التشغيل
process.on('uncaughtException', (err) => {
  log.error('❌ uncaughtException: ' + (err.stack || err.message).slice(0, 800));
  log.toFile('EXIT_MARKER uncaughtException: ' + (err.stack || err.message).slice(0, 800));
  process.exit(1);
});

// كم عاشت العملية قبل أن تموت (لمعرفة إن كان الموت دورياً أم استثناءً)
const STARTED_AT = Date.now();
process.on('exit', (code) => {
  log.toFile(`EXIT_MARKER code=${code} uptime_sec=${Math.round((Date.now() - STARTED_AT) / 1000)} battery_alive=${client.ws && client.ws.ping >= 0}`);
});
['SIGTERM', 'SIGINT', 'SIGHUP'].forEach((sig) => {
  process.on(sig, () => {
    log.toFile(`EXIT_MARKER signal=${sig} uptime_sec=${Math.round((Date.now() - STARTED_AT) / 1000)}`);
    process.exit(0);
  });
});
