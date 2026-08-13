const fs = require('fs');
const path = require('path');

const commands = new Map();

function loadDir(dir) {
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'index.js')) {
    const mod = require(path.join(dir, file));
    if (mod.data) {
      commands.set(mod.data.name, mod);
    } else if (mod.commands && Array.isArray(mod.commands)) {
      for (const c of mod.commands) {
        commands.set(c.data.name, c);
      }
    }
  }
}

loadDir(__dirname);

module.exports = { loadCommands: commands };
