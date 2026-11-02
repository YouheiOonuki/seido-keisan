// 保険料控除の計算のテスト: node --test tests/*.test.js
// 期待値は国税庁「令和8年分 給与所得者の保険料控除申告書」の記載例（nencho2026/pdf/307.pdf）の欄の数字から写した
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../lib/hoken.js');

const KISAIREI = { a: 80000, b: 35000, u23: true, c: 80000, d: 30000, e: 90000, jishin: 42000, kyucho: 14800 };

test('記載例の欄を 1 円まで再現する（②③⑤㋑・㋺・⑥⑦⑧㋩・Ⓑ Ⓒ）', () => {
  const c = H.calc(KISAIREI).shotoku.cols;
  assert.equal(c['②'], 50000);       // 80,000 × 1/4 ＋ 30,000（計算式Ⅱ）
  assert.equal(c['③'], 30000);       // 35,000 × 1/2 ＋ 12,500（計算式Ⅲ）
  assert.equal(c['⑤'], 60000);       // 80,000 → 最高 60,000
  assert.equal(c['㋑'], 60000);
  assert.equal(c['㋺'], 40000);       // 80,000 × 1/4 ＋ 20,000（計算式Ⅰ）
  assert.equal(c['⑥'], 25000);       // 30,000 × 1/2 ＋ 10,000
  assert.equal(c['⑦'], 47500);       // 90,000 × 1/4 ＋ 25,000
  assert.equal(c['⑧'], 40000);       // 72,500 → 最高 40,000
  assert.equal(c['㋩'], 47500);       // ⑦と⑧のいずれか大きい金額
  assert.equal(c['Ⓒ式'], 12400);     // 14,800 × 1/2 ＋ 5,000
  assert.equal('①' in c || '④' in c, false);   // 23歳未満がいるときは ① ④ を書かない
});

test('記載例の合計: 生命保険料控除 120,000（最高）・地震保険料控除 50,000（最高）', () => {
  const r = H.calc(KISAIREI).shotoku;
  assert.equal(r.seimei, 120000);
  assert.equal(r.jishin, 50000);
  assert.equal(r.total, 170000);
});

test('23 歳未満の扶養親族がいないときは ① ④ の欄（最高 4 万円）', () => {
  const c = H.calc({ a: 80000, b: 35000 }).shotoku.cols;
  assert.equal(c['①'], 40000);
  assert.equal(c['④'], 40000);
  assert.equal(c['㋑'], 40000);
  assert.equal('②' in c || '⑤' in c, false);
});

test('旧だけのほうが多いときは ③ が ㋑ になる（旧 100,000 → 50,000、新 10,000）', () => {
  const c = H.calc({ a: 10000, b: 100000 }).shotoku.cols;
  assert.equal(c['④'], 40000);
  assert.equal(c['③'], 50000);
  assert.equal(c['㋑'], 50000);
});

test('入れていない欄は出さない。空なら empty', () => {
  const r = H.calc({});
  assert.equal(r.empty, true);
  assert.deepEqual(r.shotoku.cols, {});
  assert.equal(r.shotoku.total, 0);
  assert.equal(r.jumin.total, 0);
});

test('入力の正規化: カンマ・円・負の数', () => {
  const d = H.normalizeInput({ a: '80,000円', b: '-5', c: '', u23: 1 });
  assert.deepEqual([d.a, d.b, d.c, d.u23], [80000, 0, null, true]);
});

test('ファイルの書き出しと読み込み（D31）', () => {
  const f = H.toExportFile(KISAIREI, new Date('2026-11-02T00:00:00Z'));
  const back = H.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, H.normalizeInput(KISAIREI));
  assert.equal(H.fromExportFile({ tool: 'x', version: 1, data: {} }).ok, false);
});

test('画面: 見出しに申告書の欄の名前（計算式Ⅰ・計算式Ⅱ）、年末調整の計算へのリンクが互いにある', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'nenmatsu', 'hoken', 'index.html'), 'utf8');
  assert.match(html, /計算式Ⅰ/);
  assert.match(html, /計算式Ⅱ/);
  assert.match(html, /href="\.\.\/"/);
  const nen = fs.readFileSync(path.join(root, 'nenmatsu', 'index.html'), 'utf8');
  assert.match(nen, /href="\.\/hoken\/"/);
});
