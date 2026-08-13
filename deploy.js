const { REST, Routes } = require('discord.js');
const { config } = require('./config');
const { loadCommands } = require('./commands');
const log = require('./utils/logger');

const rest = new REST({ version: '10' }).setToken(config.token);

const commands = [...loadCommands.values()].map(c => c.data.toJSON());

(async () => {
  try {
    log.info(`🔄 جاري تسجيل ${commands.length} أوامر...`);
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    log.ok(`✅ تم تسجيل الأوامر بنجاح (${commands.length})`);
  } catch (err) {
    log.error('فشل تسجيل الأوامر: ' + err.message);
  }
})();
