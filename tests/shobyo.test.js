// 傷病手当金の計算のテスト: node --test tests/*.test.js
// 期待値は健康保険法 99 条 2 項・108 条と協会けんぽ「傷病手当金」の計算例から（ACCEPTANCE 2.6 は acceptance.test.js）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../lib/shobyo.js');

test('月の給与の総支給額を入れても等級の額に直す（305,000 → 300,000）', () => {
  const r = S.calc({ hyojun: 305000, from: '2026-11-01' });
  assert.ok(r.months.every((m) => m.hyojun === 300000));
  assert.equal(r.daily, 6667);
});

test('12 か月は支給開始日の月から 11 か月前まで、古い順に並ぶ', () => {
  const r = S.calc({ hyojun: 300000, from: '2026-11-01' });
  assert.equal(r.months.length, 12);
  assert.equal(r.months[0].label, '2025年12月');
  assert.equal(r.months[11].label, '2026年11月');
});

test('待期の 3 日が月をまたいでも、支給開始日は 4 日目（10-30 → 11-02）', () => {
  assert.equal(S.calc({ hyojun: 300000, from: '2026-10-30' }).start, '2026-11-02');
});

test('3 日以下しか休んでいなければ支給は 0 日', () => {
  const r = S.calc({ hyojun: 300000, from: '2026-11-01', to: '2026-11-03' });
  assert.equal(r.days, 3);
  assert.equal(r.paidDays, 0);
  assert.equal(r.total, 0);
});

test('加入期間の平均が全被保険者の平均より低ければ、そのまま使う', () => {
  const r = S.calc({ hyojun: 200000, months: 6, from: '2026-04-28' });
  assert.equal(r.per30, 6670);
  assert.equal(r.capPer30, 10670);
  assert.equal(r.daily, 4447);
});

test('最後の日が最初の日より前なら日数を出さない', () => {
  const r = S.calc({ hyojun: 300000, from: '2026-11-10', to: '2026-11-01' });
  assert.equal(r.days, null);
  assert.equal(r.total, null);
});

test('休み始めた日が空なら、渡した今日を支給開始日として 1 日あたりだけ出す', () => {
  const r = S.calc({ hyojun: 300000 }, '2026-11-03');
  assert.equal(r.startAssumed, true);
  assert.equal(r.start, '2026-11-03');
  assert.equal(r.daily, 6667);
  assert.equal(r.total, null);
});

test('標準報酬月額が空なら empty（月ごとの欄だけ埋めても、空の月があれば empty）', () => {
  assert.equal(S.calc({}).empty, true);
  assert.equal(S.calc({ byMonth: [300000] }).empty, true);
});

test('入力の正規化: 2024 年より前の日付・おかしな月数は捨てる', () => {
  const d = S.normalizeInput({ from: '2023-12-31', to: '2026-02-30', months: 0, hyojun: '30,0000', kyuyo: -5 });
  assert.equal(d.from, null);
  assert.equal(d.to, null);
  assert.equal(d.months, 12);
  assert.equal(d.hyojun, 300000);
  assert.equal(d.kyuyo, 0);
});

test('書き出したファイルを読み戻すと同じ入力になる・ほかのツールのファイルは断る', () => {
  const input = { hyojun: 300000, months: 6, from: '2026-11-01', to: '2026-11-14', kyuyo: 3000 };
  const f = S.toExportFile(input, new Date('2026-11-03T00:00:00Z'));
  const back = S.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, S.normalizeInput(input));
  assert.equal(S.fromExportFile({ tool: 'seido-keisan-hoken', version: 1, data: {} }).ok, false);
});

test('画面と使い方: 待期・12 か月未満・給与との差額の語、行き来のリンク', () => {
  const root = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'shobyo/index.html'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'shobyo/guide.html'), 'utf8');
  for (const w of ['待期', '12か月', '全被保険者の平均', '差額']) assert.ok(guide.includes(w), w);
  assert.ok(page.includes('href="./guide.html'));
  assert.ok(guide.includes('href="./"'));
  assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('href="./shobyo/"'));
  assert.ok(!/pagead2/.test(page), '審査中は画面に広告の script を置かない');
});
