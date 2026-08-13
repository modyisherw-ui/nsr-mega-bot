const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const ts = () => new Date().toLocaleTimeString('ar-EG', { hour12: false });

// نسخة من الوغات داخل مجلد البيانات ليشاركها الريبو (تشخيص حي على GitHub Actions)
let logFp = path.join(process.env.MEGA_BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'bot.log');
let logStreamActive = false;
function ensureStream() {
  if (logStreamActive) return true;
  try {
    fs.mkdirSync(path.dirname(logFp), { recursive: true });
    logFp = logFp.replace(/\.[^.]+$/, '-') + `${process.pid}.txt`;
    logStreamActive = true;
    return true;
  } catch (_) { return false; }
}
function toFile(msg) {
  if (!ensureStream()) return;
  try { fs.appendFileSync(logFp, `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {}
}

const log = {
  info: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.cyan('[INFO]')} ${msg}`); },
  ok: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.green('[✓]')} ${msg}`); },
  warn: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.yellow('[⚠]')} ${msg}`); },
  error: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.red('[✖]')} ${msg}`); },
  cmd: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.magenta('[CMD]')} ${msg}`); },
  bot: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.greenBright('[BOT]')} ${msg}`); },
  rating: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[⭐]')} ${msg}`); },
  ticket: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[🎫]')} ${msg}`); },
  streak: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[🔥]')} ${msg}`); },
  security: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.redBright('[🛡️]')} ${msg}`); },
  giveaway: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.yellow('[🎁]')} ${msg}`); },
  games: (msg) => { toFile(msg); console.log(`${chalk.gray('[' + ts() + ']')} ${chalk.blue('[🎮]')} ${msg}`); },
  toFile,
};

module.exports = log;
