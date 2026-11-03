// 源泉徴収票の見方と手取りのテスト: node --test tests/*.test.js
// 記載例の再現は acceptance.test.js（ACCEPTANCE 2.7）。ここは内訳の写し方・出さない条件・保存
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../lib/gensen.js');
const J = require('../lib/juminzei.js');
const JV = require('../lib/juminzei-values.js');

const KISAI2 = { shiharai: 5870000, kyuyoGo: 4254400, kojoGoukei: 2636110, gensen: 82500, shakai: 836110, spouseKojo: 380000, spouseShotoku: 0, other: 1 };

test('手取りは住民税の月額 × 12 も引く', () => {
  const r = G.calc(Object.assign({ juminMonth: 15000 }, KISAI2));
  assert.equal(r.juminYear, 180000);
  assert.equal(r.tedori, 5870000 - 82500 - 836110 - 180000);
});

test('課税される所得は ② − ③ の 1,000 円未満切り捨て、税率は速算表から', () => {
  const r = G.calc(KISAI2);
  assert.equal(r.taxable, 1618000);
  assert.equal(r.rate, 5);
});

test('上限の目安は住民税の計算（令和9年度）と同じ値', () => {
  const r = G.calc(KISAI2);
  const ci = G.toCalcInput(G.normalizeInput(KISAI2));
  assert.equal(r.furusato.limit, J.calc(ci, JV.CURRENT).furusato.limit);
  assert.equal(r.furusato.limit, 56255);
});

test('内訳が空なら上限の目安を出さず「票の内訳を入れると出ます。」', () => {
  const r = G.calc({ shiharai: 5870000, kyuyoGo: 4254400, kojoGoukei: 2636110, gensen: 82500, shakai: 836110 });
  assert.equal(r.furusato, null);
  assert.equal(r.check.message, '票の内訳を入れると出ます。');
});

test('「内訳の欄はどれも空欄」なら、空のまま突き合わせる', () => {
  const r = G.calc({ shiharai: 5000000, kyuyoGo: 3560000, kojoGoukei: 1790000, gensen: 90300, shakai: 750000, blank: true });
  assert.equal(r.check.status, 'ok');
  assert.ok(r.furusato.limit > 0);
});

test('票と合わなければ出さず、どの欄が合わないかを返す', () => {
  const r = G.calc(Object.assign({}, KISAI2, { other: 0 }));
  assert.equal(r.check.status, 'mismatch');
  assert.equal(r.furusato, null);
  const row = r.check.rows.find((x) => x.label === '所得控除の額の合計額');
  assert.equal(row.hyo, 2636110);
  assert.notEqual(row.calc, 2636110);
});

test('年末調整をしていない票・特定親族 2 人以上・障害者が多すぎるときは出さない', () => {
  assert.equal(G.calc(Object.assign({ mitei: true }, KISAI2)).check.status, 'need');
  assert.equal(G.calc(Object.assign({ tokushin: 2, tokushinKojo: 1020000 }, KISAI2)).check.status, 'error');
  assert.equal(G.calc(Object.assign({ shogaiIppan: 5 }, KISAI2)).check.status, 'error');
});

test('地震保険料: 控除額から旧長期損害保険料の分を引いて戻す（44,800 − 14,800 → 30,000）', () => {
  const ci = G.toCalcInput(G.normalizeInput({ shiharai: 1, jishinKojo: 44800, oldLong: 19600 }));
  assert.deepEqual(ci.jishin, { jishin: 30000, oldLong: 19600 });
});

test('住民税の計算に所得金額調整控除を入れると、合計所得が 11 万 2 千円下がる（記載例 1 の給与）', () => {
  const a = J.calc({ income: 9620000 }, JV.CURRENT), b = J.calc({ income: 9620000, chosei: true }, JV.CURRENT);
  assert.equal(a.goukei - b.goukei, 112000);
});

test('入力の正規化と書き出し・読み込み', () => {
  const d = G.normalizeInput({ shiharai: '5,870,000', rojin: 1, rojinDokyo: 3, self: 'x', other: -1 });
  assert.equal(d.shiharai, 5870000);
  assert.equal(d.rojinDokyo, 1);
  assert.equal(d.self, 'none');
  assert.equal(d.other, 0);
  const back = G.fromExportFile(JSON.parse(JSON.stringify(G.toExportFile(KISAI2, new Date('2026-11-03T00:00:00Z')))));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, G.normalizeInput(KISAI2));
  assert.equal(G.fromExportFile({ tool: 'seido-keisan-shobyo', version: 1, data: {} }).ok, false);
});

test('画面と使い方: 図（SVG に title）・FAQ の「いつもらえる」・行き来のリンク・審査中は画面に広告の script なし', () => {
  const root = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'gensen/index.html'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'gensen/guide.html'), 'utf8');
  assert.match(page, /<svg class="hyo"[^>]*role="img"[^>]*aria-labelledby="zu-t">\s*<title id="zu-t">/);
  assert.ok(guide.includes('いつもらえますか'));
  assert.ok(guide.includes('翌年1月31日'));
  assert.ok(page.includes('href="./guide.html'));
  assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('href="./gensen/"'));
  assert.ok(!/pagead2/.test(page));
  // 給与所得の表は require では読めても、画面では script で読まないと計算が落ちる（2026-11-03 に一度落とした）
  assert.ok(page.indexOf('../lib/kyuyo-table-2026.js') < page.indexOf('../lib/tax2026.js'));
});
