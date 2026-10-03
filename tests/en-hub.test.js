// 英語の入口 /seido-keisan/en/: 6 本の計算機への一覧。文は各ページの title・description から機械的に取る（新しい英語の文を書かない）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SLUGS = ['take-home-pay', 'residence-tax', 'pension-refund', 'childcare-leave', 'high-cost-medical', 'moving-checklist'];
const JA = 'https://yorozu-craft.com/seido-keisan/';
const EN = JA + 'en/';

test('一覧の 1 項目ごとに、各ページの title がそのまま入っている（description は長いので本文に出さない）', () => {
  const hub = read('en/index.html');
  for (const s of SLUGS) {
    const h = read('en/' + s + '/index.html');
    const title = h.match(/<title>(.*?)<\/title>/)[1].replace(/\s*\|\s*yorozu-craft$/, '');
    assert.ok(hub.includes('href="./' + s + '/"'), s + ' link');
    assert.ok(hub.includes('<span class="name">' + esc(title) + '</span>'), s + ' title');
  }
  assert.equal((hub.match(/<li>\s*<a href="\.\/[a-z-]+\/"/g) || []).length, SLUGS.length);
});

test('hreflang は日本語の seido-keisan トップと対（入口とトップの両方に書く）', () => {
  for (const f of ['en/index.html', 'index.html']) {
    const h = read(f);
    assert.ok(h.includes('hreflang="ja" href="' + JA + '"'), f + ' ja');
    assert.ok(h.includes('hreflang="en" href="' + EN + '"'), f + ' en');
    assert.ok(h.includes('hreflang="x-default" href="' + JA + '"'), f + ' x-default');
  }
  assert.ok(read('en/index.html').includes('rel="canonical" href="' + EN + '"'));
});

test('sitemap に入口があり、トップから入口へのリンクがある', () => {
  assert.ok(read('sitemap.xml').includes('<loc>' + EN + '</loc>'));
  assert.ok(read('index.html').includes('<a href="./en/" hreflang="en" lang="en">In English</a>'));
});

test('入口の内部リンクが実在する', () => {
  const hub = read('en/index.html');
  for (const m of hub.matchAll(/href="(\.\/[^"#]*)"/g)) {
    const p = path.join(root, 'en', m[1]);
    assert.ok(fs.existsSync(p.endsWith('/') ? p + 'index.html' : p), m[1]);
  }
});
