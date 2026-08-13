const fs = require('fs');
const path = require('path');
const dir = 'src/commands';
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu;
let total = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js') && x !== 'index.js')) {
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  let n = 0;
  s = s.replace(/\.setDescription\('([^']*)'\)/g, (m, inner) => {
    const clean = inner.replace(emojiRe, '').trim();
    if (clean === inner) return m;
    n++;
    return ".setDescription('" + clean + "')";
  });
  if (n) {
    fs.writeFileSync(p, s, 'utf8');
    total += n;
  }
}
fs.writeFileSync('tmp_strip_result.txt', 'cleaned descs: ' + total, 'utf8');
