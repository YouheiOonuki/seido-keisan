// 浸水深の色の表（lib/basho-values.js。K246、Q-831、D646）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../lib/basho.js');
const V = require('../lib/basho-values.js');

test('表の色は、標準の段の名前を返す', () => {
  assert.ok(V.SHINSUI.length > 0);
  for (const row of V.SHINSUI) {
    assert.deepEqual(B.classify([...row.rgb, 255], V.SHINSUI), { status: 'hit', label: row.label });
  }
  assert.deepEqual(B.classify([247, 245, 169, 255], V.SHINSUI), { status: 'hit', label: '〜 0.5m' });
  assert.deepEqual(B.classify([255, 216, 192, 255], V.SHINSUI), { status: 'hit', label: '0.5m 〜 3m' });
  assert.deepEqual(B.classify([255, 183, 183, 255], V.SHINSUI), { status: 'hit', label: '3m 〜 5m' });
  assert.deepEqual(B.classify([255, 145, 145, 255], V.SHINSUI), { status: 'hit', label: '5m 〜 10m' });
  assert.deepEqual(B.classify([242, 133, 201, 255], V.SHINSUI), { status: 'hit', label: '10m 〜 20m' });
});

test('表に無い色は unreadable（タイルを見ていない 20m 〜 の色、詳細版だけの色、1 だけずれた色）', () => {
  for (const rgb of [[220, 122, 220], [248, 225, 166], [255, 255, 179], [0, 0, 0]]) {
    assert.deepEqual(B.classify([...rgb, 255], V.SHINSUI), { status: 'unreadable' }, rgb.join(','));
  }
  for (const row of V.SHINSUI) {
    for (let i = 0; i < 3; i++) {
      for (const d of [-1, 1]) {
        const rgb = row.rgb.slice();
        rgb[i] += d;
        if (rgb[i] < 0 || rgb[i] > 255) continue;
        assert.deepEqual(B.classify([...rgb, 255], V.SHINSUI), { status: 'unreadable' }, rgb.join(','));
      }
    }
  }
});

test('段の名前はポータルの凡例の字（全角の「〜」の前後に半角の空白。D663）', () => {
  assert.deepEqual(V.SHINSUI.map((r) => r.label), ['〜 0.5m', '0.5m 〜 3m', '3m 〜 5m', '5m 〜 10m', '10m 〜 20m']);
});

test('出どころの字は図の番号と、版の確かめ方（第 1 章の表紙の版と第 3 章の取得日。Q-904）', () => {
  for (const row of V.SHINSUI) {
    assert.match(row.source.name, /第 1 章の表紙は令和 8 年 5 月版。第 3 章は 2026-11-22 に取得/, row.label);
    assert.doesNotMatch(row.source.name, /（令和 8 年 5 月版）第 3 章/, row.label);
    assert.match(row.source.name, /図 3-3/, row.label);
  }
});

test('透明は none（RGB が表の色でも）', () => {
  assert.deepEqual(B.classify([0, 0, 0, 0], V.SHINSUI), { status: 'none' });
  assert.deepEqual(B.classify([247, 245, 169, 0], V.SHINSUI), { status: 'none' });
});

test('どの行も、詳細版で同じ色に当たる段が標準の段の内に収まる（D646）', () => {
  const top = (v) => (v === null ? Infinity : v);
  for (const row of V.SHINSUI) {
    const [lo, hi] = row.range;
    const [dlo, dhi] = row.detailRange;
    assert.ok(dlo >= lo && top(dhi) <= top(hi), row.label);
  }
});

test('どの行も、出どころの資料の名前とページ・確認日を持つ', () => {
  for (const row of V.SHINSUI) {
    assert.ok(row.source && typeof row.source.name === 'string' && row.source.name.length > 0, row.label);
    assert.ok(Number.isInteger(row.source.page), row.label);
    assert.match(row.checked, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('表に「安全」「危険」の字が無い', () => {
  assert.doesNotMatch(JSON.stringify(V), /安全|危険/);
  const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'basho-values.js'), 'utf8');
  assert.doesNotMatch(code, /安全|危険/);
});
