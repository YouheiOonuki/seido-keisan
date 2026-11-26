// 予防接種の画面の確認日は HTML に書かず、app.js が値ファイルから書く（Q-348）。最終確認日の突き合わせの本体は guide-date.test.js（正本の写し）と guide-date.values.json
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// 予防接種の画面は確認日を HTML に書かず、app.js が値ファイルから書く（Q-348。それまでは手書きの 2026-10-03 が値の 2026-11-13 とずれていた）
test('yobosesshu/index.html は確認日を HTML に書かず、app.js が CHECKED から書く', () => {
  const h = fs.readFileSync(path.join(ROOT, 'yobosesshu/index.html'), 'utf8');
  assert.ok(h.includes('<span id="asof-date"></span>'));
  assert.ok(h.includes('<span id="about-checked"></span>'));
  assert.doesNotMatch(h, /最終確認日[^<]{0,8}\d{4}/);
  const js = fs.readFileSync(path.join(ROOT, 'yobosesshu/app.js'), 'utf8');
  assert.match(js, /\$\('asof-date'\)\.textContent = c\[0\] \+ '年'/);
  assert.match(js, /\$\('about-checked'\)\.textContent = \$\('asof-date'\)\.textContent/);
});
