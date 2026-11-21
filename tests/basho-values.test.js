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
  assert.deepEqual(B.classify([247, 245, 169, 255], V.SHINSUI), { status: 'hit', label: '0.5m未満' });
  assert.deepEqual(B.classify([255, 216, 192, 255], V.SHINSUI), { status: 'hit', label: '0.5〜3m' });
});

test('表に無い色は unreadable（詳細版の段の値が無い 3〜5m・5〜10m の色、詳細版だけの色、1 だけずれた色）', () => {
  for (const rgb of [[255, 183, 183], [255, 145, 145], [248, 225, 166], [247, 245, 170], [0, 0, 0]]) {
    assert.deepEqual(B.classify([...rgb, 255], V.SHINSUI), { status: 'unreadable' }, rgb.join(','));
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
