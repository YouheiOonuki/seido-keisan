// 手取りの結果の下の「給与階級別の構成比」の図（Q-316、yorozu-plans の QUEUE 2026-11-17。K215 の 2 本目）
// 値は lib/kyuyo-bunpu-values.js の 1 か所。図の計算は lib/take-home.js の salaryBands、画面は en/take-home-pay/app.js。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KB = require('../lib/kyuyo-bunpu-values.js');
const T = require('../lib/take-home.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('値: 令和7年分 第16表の計（千人）と構成比を、表の区切りのまま写している', () => {
  assert.equal(KB.year, 2025);
  assert.match(KB.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(KB.CHECKED <= new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) /* 今日は日本時間で数える（UTC だと 0〜9 時に当日の確認日で落ちる） */);
  assert.equal(KB.source.checked, KB.CHECKED);
  assert.match(KB.source.url, /^https:\/\/www\.nta\.go\.jp\/publication\/statistics\/kokuzeicho\/minkan2025\//);
  assert.deepEqual(KB.classes.map((c) => [c.upTo, c.count, c.pct]), [
    [1000000, 3703, 7.2], [2000000, 5825, 11.3], [3000000, 6746, 13.1], [4000000, 7987, 15.5], [5000000, 7918, 15.3],
    [6000000, 6145, 11.9], [7000000, 4035, 7.8], [8000000, 2777, 5.4], [9000000, 1834, 3.6], [10000000, 1266, 2.5],
    [15000000, 2422, 4.7], [20000000, 610, 1.2], [25000000, 167, 0.3], [null, 196, 0.4],
  ]);
  assert.equal(KB.classes.reduce((s, c) => s + c.count, 0), KB.total, '人数の和が原文の合計');
});

test('構成比: 人数から出した値の合計は 100 ±0.1、小数 1 桁に丸めると原文の構成比と同じ', () => {
  const g = T.salaryBands(KB, 0);
  const sum = g.bars.reduce((s, b) => s + b.share, 0);
  assert.ok(Math.abs(sum - 100) <= 0.1, `合計 ${sum}`);
  g.bars.forEach((b, i) => assert.equal(Math.round(b.share * 10) / 10, KB.classes[i].pct, `${i} 番目`));
});

test('図の値は値のファイルと同じ（区切りの数・上の端・人数）', () => {
  const g = T.salaryBands(KB, 5000000);
  assert.equal(g.bars.length, KB.classes.length);
  g.bars.forEach((b, i) => {
    assert.equal(b.upTo, KB.classes[i].upTo);
    assert.equal(b.count, KB.classes[i].count);
    assert.equal(b.share, KB.classes[i].count / KB.total * 100);
  });
});

const cumTo = (i) => KB.classes.slice(0, i + 1).reduce((s, c) => s + c.count, 0) / KB.total * 100;

test('境: 0 円・空は印なし（棒だけ）', () => {
  for (const v of [0, undefined, null, NaN, -1]) {
    const g = T.salaryBands(KB, v);
    assert.equal(g.mark, null, String(v));
    assert.equal(g.cumShare, null);
    assert.equal(g.bars.length, 14);
  }
});

test('境: ちょうど 100 万円は「100 万円以下」、1 円超えると次の階級', () => {
  assert.equal(T.salaryBands(KB, 1000000).mark, 0);
  assert.equal(T.salaryBands(KB, 1000000).cumShare, cumTo(0));
  assert.equal(T.salaryBands(KB, 1000001).mark, 1);
  assert.equal(T.salaryBands(KB, 1).mark, 0);
});

test('境: ちょうど 2,500 万円は「2,000 万円超 2,500 万円以下」、超えると「2,500 万円超」で累計 100%', () => {
  const at = T.salaryBands(KB, 25000000);
  assert.equal(at.mark, 12);
  assert.equal(at.cumShare, cumTo(12));
  const over = T.salaryBands(KB, 25000001);
  assert.equal(over.mark, 13);
  assert.ok(Math.abs(over.cumShare - 100) < 1e-9);
});

test('累計: 入れた年収が入る階級の上の端まで（例 450 万円 → 500 万円以下までの累計）', () => {
  const g = T.salaryBands(KB, 4500000);
  assert.equal(g.mark, 4);
  assert.equal(Math.round(g.cumShare * 10) / 10, 62.3);
});

test('入口: 年で入れたときも月給から入れたときも、画面が年収に直した額（賞与を含む）で印を付ける', () => {
  const y = T.calc({ period: 'year', amount: 5000000 });
  assert.ok(y.ready);
  assert.equal(y.year.gross, 5000000);
  assert.equal(T.salaryBands(KB, y.year.gross).mark, 4);
  const m = T.calc({ period: 'month', amount: 300000, bonus: 600000, bonusCount: 2 });
  assert.equal(m.year.gross, 300000 * 12 + 600000);
  assert.equal(T.salaryBands(KB, m.year.gross).mark, 4);
  assert.equal(T.calc({ period: 'month', amount: '' }).ready, false);
});

test('画面と使い方: 値ファイルを読み込み、出典の行と確認日が値ファイルと同じ。額・割合を HTML に直書きしない', () => {
  const idx = read('en/take-home-pay/index.html');
  assert.ok(idx.indexOf('../../lib/kyuyo-bunpu-values.js') > 0 && idx.indexOf('../../lib/kyuyo-bunpu-values.js') < idx.indexOf('./app.js'));
  assert.match(idx, /<div id="bands" class="bands"><\/div>/);
  assert.match(idx, /<time id="bands-checked" datetime=""><\/time>/);
  for (const c of KB.classes) assert.ok(!idx.includes(c.pct.toFixed(1) + '%'), `${c.pct}% が index.html に直書きされている`);
  const g = read('en/take-home-pay/guide.html');
  assert.ok(g.includes('href="' + KB.source.url + '"'), 'guide に出典の URL');
  const m = g.match(/<time datetime="(\d{4}-\d{2}-\d{2})" data-v="bandsChecked">([^<]+)<\/time>/);
  assert.ok(m, 'guide に確認日');
  assert.equal(m[1], KB.CHECKED);
  const [yy, mm, dd] = KB.CHECKED.split('-').map(Number);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  assert.equal(m[2], `${MONTHS[mm - 1]} ${dd}, ${yy}`);
  assert.ok(g.indexOf('../../lib/kyuyo-bunpu-values.js') < g.indexOf('./guide.js'));
});

test('fetch 0: 図の値は埋め込みで、画面のスクリプトは外へ取りに行かない', () => {
  for (const f of ['en/take-home-pay/app.js', 'lib/take-home.js', 'lib/kyuyo-bunpu-values.js']) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(read(f)), `${f} に通信がある`);
  }
});
