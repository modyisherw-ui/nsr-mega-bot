const chalk = require('chalk');

const ts = () => new Date().toLocaleTimeString('ar-EG', { hour12: false });

const log = {
  info: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.cyan('[INFO]')} ${msg}`),
  ok: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.green('[✓]')} ${msg}`),
  warn: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.yellow('[⚠]')} ${msg}`),
  error: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.red('[✖]')} ${msg}`),
  cmd: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.magenta('[CMD]')} ${msg}`),
  bot: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.greenBright('[BOT]')} ${msg}`),
  rating: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[⭐]')} ${msg}`),
  ticket: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[🎫]')} ${msg}`),
  streak: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[🔥]')} ${msg}`),
  security: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.redBright('[🛡️]')} ${msg}`),
  giveaway: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.yellow('[🎁]')} ${msg}`),
  games: (msg) => console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[🎮]')} ${msg}`),
};

module.exports = log;
