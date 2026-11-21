// この場所の 1 枚の芯（lib/basho.js。K246、Q-768）のテスト: node --test tests/*.test.js
// 色の表は作った物（公式の凡例の値ではない。公式の値は Q-767・Q-789 の後に入る）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../lib/basho.js');

// ---------- (a) 位置 → タイルと画素 ----------
// 期待値は手計算（xf = (経度 + 180) / 360 × 2^z、yf = (1 − ln(tan φ + sec φ) / π) / 2 × 2^z、画素は端数 × 256 の切り捨て）
test('東京駅（35.681236, 139.767125）の z15 は 15/29105/12903 の画素 (234, 81)', () => {
  assert.deepEqual(B.tileOf(35.681236, 139.767125, 15), { z: 15, x: 29105, y: 12903, px: 234, py: 81 });
});

test('那覇（26.212401, 127.680932）の z15 は 15/28005/13910 の画素 (205, 56)', () => {
  assert.deepEqual(B.tileOf(26.212401, 127.680932, 15), { z: 15, x: 28005, y: 13910, px: 205, py: 56 });
});

test('タイルの端: 境目ちょうどの点は右・下のタイルの画素 0、わずかに手前は前のタイルの画素 255', () => {
  assert.deepEqual(B.tileOf(0, 0, 1), { z: 1, x: 1, y: 1, px: 0, py: 0 });
  const before = B.tileOf(1e-9, -1e-9, 1);
  assert.equal(before.x, 0); assert.equal(before.px, 255);
  assert.equal(before.y, 0); assert.equal(before.py, 255);
  // 左上の角と、経度 180（−180 と同じ所に回る）
  assert.deepEqual(B.tileOf(B.MAX_LAT, -180, 3), { z: 3, x: 0, y: 0, px: 0, py: 0 });
  assert.equal(B.tileOf(0, 180, 3).x, 0);
  // 極に近い点は端に寄せ、タイルの外へ出さない
  assert.deepEqual(B.tileOf(-90, 179.9999999, 2), { z: 2, x: 3, y: 3, px: 255, py: 255 });
  assert.deepEqual(B.tileOf(90, 0, 2), { z: 2, x: 2, y: 0, px: 0, py: 0 });
});

test('z0 は 1 枚だけ。範囲の外の緯度・経度・ズームは受けない', () => {
  assert.deepEqual(B.tileOf(0, 0, 0), { z: 0, x: 0, y: 0, px: 128, py: 128 });
  assert.throws(() => B.tileOf(91, 0, 10), RangeError);
  assert.throws(() => B.tileOf(0, -181, 10), RangeError);
  assert.throws(() => B.tileOf(0, 0, 15.5), RangeError);
  assert.throws(() => B.tileOf(NaN, 0, 10), RangeError);
  assert.throws(() => B.tileOf('35', 139, 10), RangeError);
});

// ---------- (b) 色 → 区分 ----------
const TABLE = [
  { rgb: [10, 20, 30], label: '区分あ' },
  { rgb: [200, 100, 50], label: '区分い' },
  { rgb: [200, 100, 50], label: '区分い' } // 同じ色・同じ区分の重ねは受ける
];

test('表に在る色はその区分。半透明でも RGB がそのまま在れば引く', () => {
  assert.deepEqual(B.classify([10, 20, 30, 255], TABLE), { status: 'hit', label: '区分あ' });
  assert.deepEqual(B.classify([200, 100, 50, 128], TABLE), { status: 'hit', label: '区分い' });
});

test('透明は「色なし」（RGB が表に在っても）', () => {
  assert.deepEqual(B.classify([0, 0, 0, 0], TABLE), { status: 'none' });
  assert.deepEqual(B.classify([10, 20, 30, 0], TABLE), { status: 'none' });
});

test('表に無い色は「読めない」。1 だけ違う色も近い区分に寄せない', () => {
  assert.deepEqual(B.classify([10, 20, 31, 255], TABLE), { status: 'unreadable' });
  assert.deepEqual(B.classify([255, 255, 255, 255], TABLE), { status: 'unreadable' });
  assert.deepEqual(B.classify([10, 20, 30, 255], []), { status: 'unreadable' });
});

test('色と表の形が違えば受けない。同じ色に区分が 2 つの表も受けない', () => {
  assert.throws(() => B.classify([10, 20, 30], TABLE), TypeError);
  assert.throws(() => B.classify([10, 20, 30, 256], TABLE), TypeError);
  assert.throws(() => B.classify([10, 20, 30, 255], [{ rgb: [1, 2], label: 'x' }]), TypeError);
  assert.throws(() => B.classify([10, 20, 30, 255], [{ rgb: [1, 2, 3], label: '' }]), TypeError);
  assert.throws(() => B.classify([10, 20, 30, 255], [{ rgb: [1, 2, 3], label: 'x' }, { rgb: [1, 2, 3], label: 'y' }]), /区分が 2 つ/);
});

// ---------- (c) 断面 ----------
const TOKYO = { lat: 35.681236, lng: 139.767125 };
const NAHA = { lat: 26.212401, lng: 127.680932 };

test('距離: 赤道上の経度 1 度は 2πR/360（約 111.2 km）。向きを入れ替えても同じ', () => {
  const d = B.distance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(d - 2 * Math.PI * B.EARTH_R / 360) < 1e-6);
  assert.ok(Math.abs(d - 111195) < 1);
  assert.equal(B.distance(TOKYO, NAHA), B.distance(NAHA, TOKYO));
});

test('等間隔の点: 両端を含めて 割る数 + 1 点、距離は始点 0 から増え、間隔はほぼそろう', () => {
  const a = { lat: 35.68, lng: 139.76 };
  const b = { lat: 35.69, lng: 139.78 };
  const pts = B.profilePoints(a, b, 4);
  assert.equal(pts.length, 5);
  assert.deepEqual([pts[0].lat, pts[0].lng, pts[0].d], [a.lat, a.lng, 0]);
  assert.deepEqual([pts[4].lat, pts[4].lng], [b.lat, b.lng]);
  assert.ok(Math.abs(pts[4].d - B.distance(a, b)) < 1e-9);
  const total = pts[4].d;
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].d > pts[i - 1].d);
    // 緯度経度の直線で割るので、大円の等分とはわずかにずれる（この 2 km ほどの断面で最大 2.4 cm）
    assert.ok(Math.abs(pts[i].d - total * i / 4) < 0.05);
  }
});

test('2 点が同じ: どの点も同じ位置で距離 0', () => {
  const pts = B.profilePoints(TOKYO, { ...TOKYO }, 3);
  assert.equal(pts.length, 4);
  for (const p of pts) assert.deepEqual(p, { lat: TOKYO.lat, lng: TOKYO.lng, d: 0 });
});

test('割る数と点の形が違えば受けない。経度 180 をまたぐ組も受けない', () => {
  assert.throws(() => B.profilePoints(TOKYO, NAHA, 0), RangeError);
  assert.throws(() => B.profilePoints(TOKYO, NAHA, 2.5), RangeError);
  assert.throws(() => B.profilePoints({ lat: 35 }, NAHA, 2), RangeError);
  assert.throws(() => B.profilePoints({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }, 2), /180/);
});

test('標高: いちばん高い点・低い点・上りと下りの合計', () => {
  const s = B.elevationSummary([3.2, 5.0, 4.1, 4.1, 8.3, 2.0]);
  assert.deepEqual(s.highest, { index: 4, value: 8.3 });
  assert.deepEqual(s.lowest, { index: 5, value: 2.0 });
  assert.equal(s.ascent, 6.0);   // 1.8 + 4.2
  assert.equal(s.descent, 7.2);  // 0.9 + 6.3
  assert.deepEqual(s.missing, []);
});

test('標高に欠けが在る: 欠けの番号を返し、欠けをまたぐ区間は上り・下りに足さない', () => {
  const s = B.elevationSummary([10, null, 20, 15, null, null, 30]);
  assert.deepEqual(s.missing, [1, 4, 5]);
  assert.deepEqual(s.highest, { index: 6, value: 30 });
  assert.deepEqual(s.lowest, { index: 0, value: 10 });
  assert.equal(s.ascent, 0);    // 10→20・15→30 は欠けをまたぐので足さない
  assert.equal(s.descent, 5);   // 20→15 だけ
});

test('標高: 全部欠け・空は高い点も低い点も null。同じ高さは先の点。数でも null でもない値は受けない', () => {
  assert.deepEqual(B.elevationSummary([null, null]), { highest: null, lowest: null, ascent: 0, descent: 0, missing: [0, 1] });
  assert.deepEqual(B.elevationSummary([]), { highest: null, lowest: null, ascent: 0, descent: 0, missing: [] });
  const s = B.elevationSummary([5, 7, 7, 5]);
  assert.deepEqual(s.highest, { index: 1, value: 7 });
  assert.deepEqual(s.lowest, { index: 0, value: 5 });
  assert.throws(() => B.elevationSummary([1, undefined]), TypeError);
  assert.throws(() => B.elevationSummary([1, '2']), TypeError);
});

// ---------- (d) 2 か所を横に並べる ----------
test('2 か所の結果を、項目の順に横に並べる。無い値は null', () => {
  const items = [{ key: 'elev', label: '標高' }, { key: 'flood', label: '浸水の想定' }, { key: 'shelter', label: '避難場所まで' }];
  const rows = B.sideBySide(items, [{ elev: 3.2, flood: '区分あ', shelter: 420 }, { flood: '色なし', elev: 12.5 }]);
  assert.deepEqual(rows, [
    { key: 'elev', label: '標高', values: [3.2, 12.5] },
    { key: 'flood', label: '浸水の想定', values: ['区分あ', '色なし'] },
    { key: 'shelter', label: '避難場所まで', values: [420, null] }
  ]);
  assert.throws(() => B.sideBySide([{ key: 'a' }, { key: 'a' }], [{}, {}]), /2 つ/);
});

// ---------- 作らないもの・出さないもの ----------
test('判定・点数・順位を出す関数は無く、どの口にも要求を出さない（D117・条件 62）', () => {
  assert.deepEqual(Object.keys(B).filter((k) => typeof B[k] === 'function').sort(),
    ['classify', 'distance', 'elevationSummary', 'profilePoints', 'sideBySide', 'tileOf']);
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'basho.js'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|sendBeacon|https?:\/\//);
  assert.doesNotMatch(code, /安全|危険|score|rank/i);
});
