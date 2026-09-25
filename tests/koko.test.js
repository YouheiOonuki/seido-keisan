// 高校の授業料の自己負担の計算のテスト: node --test tests/*.test.js
// 期待値は 高等学校等就学支援金の支給に関する法律・施行令（令和8年4月1日施行版）、文部科学省の概要 PDF・リーフレット、
// 東京都私学財団・大阪府・神奈川県の令和8年度の案内から写した（出典は lib/koko-values.js の SOURCES）
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../lib/koko.js');
const V = require('../lib/koko-values.js');

// --- 施行令 2条の月額 × 12 が、文部科学省の概要 PDF 3 ページの年額と一致する ---
test('支給限度額の年額が概要 PDF の表と一致する（公立 118,800・私立 457,200・私立通信制 337,200 ほか）', () => {
  const y = (s, t) => V.MONTHLY[s][t] * 12;
  assert.equal(y('koritsu', 'zen'), 118800);
  assert.equal(y('koritsu', 'tei'), 32400);
  assert.equal(y('koritsu', 'tsu'), 6240);
  assert.equal(y('koritsu', 'toku'), 4800);
  assert.equal(y('koritsu', 'kosen'), 234600);
  assert.equal(y('koritsu', 'senshu'), 457200);
  assert.equal(y('koritsu', 'senshu_tsu'), 337200);
  assert.equal(y('kokuritsu', 'zen'), 115200);
  assert.equal(y('kokuritsu', 'kosen'), 234600);
  for (const t of ['zen', 'tei', 'toku', 'kosen', 'senshu']) assert.equal(y('shiritsu', t), 457200);
  for (const t of ['tsu', 'senshu_tsu']) assert.equal(y('shiritsu', t), 337200);
  // 単位制: 通算 74 単位 × 私立の 1 単位の限度額が、政令の総額 1,371,600円を超えない
  assert.ok(V.UNITS_TOTAL * V.PER_UNIT.shiritsu.zen <= V.UNIT_TOTAL_YEN);
});

test('私立全日制・授業料 48万円・上乗せなし: 国 457,200円、自己負担 年 22,800円・3年 68,400円', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 480000, pref: '埼玉県' });
  assert.equal(r.ready, true);
  assert.equal(r.first.kuni.amount, 457200);
  assert.equal(r.first.pref.status, 'other');
  assert.equal(r.first.selfFee, 22800);
  assert.equal(r.sum.selfFee, 68400);
});

test('授業料が上限より安い私立は授業料まで（45万円 → 自己負担 0）', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 450000 });
  assert.equal(r.first.kuni.amount, 450000);
  assert.equal(r.first.selfFee, 0);
});

test('公立全日制・授業料 118,800円: 国 118,800円、自己負担 0', () => {
  const r = K.calc({ setchi: 'koritsu', type: 'zen', fee: 118800, pref: '東京都' });
  assert.equal(r.first.kuni.amount, 118800);
  assert.equal(r.first.pref.status, 'public');
  assert.equal(r.first.selfFee, 0);
});

// --- 東京都: 就学支援金 45万7,200円 ＋ 助成金 4万3,800円 ＝ 50万1,000円まで、授業料が上限 ---
test('東京都・私立全日制・授業料 60万円: 都 43,800円、自己負担 年 99,000円・3年 297,000円', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 600000, pref: '東京都' });
  assert.equal(r.first.kuni.amount, 457200);
  assert.equal(r.first.pref.add, 43800);
  assert.equal(r.first.selfFee, 99000);
  assert.equal(r.sum.selfFee, 297000);
});
test('東京都・授業料 48万円: 都は授業料の残り 22,800円まで、自己負担 0', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 480000, pref: '東京都' });
  assert.equal(r.first.pref.add, 22800);
  assert.equal(r.first.selfFee, 0);
});
test('東京都・私立通信制は都の助成なし（都認可は就学支援金の上限まで）', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'tsu', fee: 400000, pref: '東京都' });
  assert.equal(r.first.kuni.amount, 337200);
  assert.equal(r.first.pref.status, 'notype');
  assert.equal(r.first.selfFee, 62800);
});

// --- 大阪府: 授業料＋施設整備費等を国と府で 63万円まで、超える分は学校が負担（就学支援推進校） ---
test('大阪府・推進校・授業料 65万円＋施設費 10万円: 府 172,800円、学校 120,000円、保護者 0', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 650000, shisetsu: 100000, pref: '大阪府', osakaSuishin: true });
  assert.equal(r.first.kuni.amount, 457200);
  assert.equal(r.first.pref.add, 172800);
  assert.equal(r.first.pref.school, 120000);
  assert.equal(r.first.selfFee, 0);
  assert.equal(r.first.selfShisetsu, 0);
  assert.equal(r.total, 0);
});
test('大阪府・推進校でない学校は国だけ（施設費は自己負担のまま）', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 600000, shisetsu: 50000, pref: '大阪府', osakaSuishin: false });
  assert.equal(r.first.pref.status, 'nosuishin');
  assert.equal(r.first.selfFee, 142800);
  assert.equal(r.sum.selfShisetsu, 150000);
});
test('大阪府・通信制（1単位 15,000円 × 25単位）: 国 13,668円/単位、府と合わせて 12,030円/単位まで、超える分は学校', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'tsu', feeMode: 'unit', unitFee: 15000, units: 25, pref: '大阪府' });
  // 国は 1 単位 13,668円（授業料 15,000円より少ない）。標準授業料 12,030円より国が多いので府の上乗せは 0
  assert.equal(r.first.kuni.amount, 13668 * 25);
  assert.equal(r.first.pref.add, 0);
  assert.equal(r.first.pref.school, (15000 - 12030) * 25);
  assert.equal(r.first.selfFee, 0);
});

// --- 神奈川県: 授業料補助 22,800円（通信制 142,800円）、就学支援金と合わせて 480,000円 ---
test('神奈川県・私立全日制・授業料 50万円: 県 22,800円、自己負担 20,000円', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 500000, pref: '神奈川県' });
  assert.equal(r.first.pref.add, 22800);
  assert.equal(r.first.selfFee, 20000);
  assert.equal(V.PREF.kanagawa.add + 457200, V.PREF.kanagawa.total);
  assert.equal(V.PREF.kanagawa.addTsu + 337200, V.PREF.kanagawa.total);
});
test('神奈川県・県外の学校は県の補助なし', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 500000, pref: '神奈川県', kanagawaIn: false });
  assert.equal(r.first.pref.status, 'outside');
  assert.equal(r.first.selfFee, 42800);
});
test('神奈川県・私立通信制・授業料 50万円: 国 337,200円＋県 142,800円、自己負担 20,000円', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'tsu', fee: 500000, pref: '神奈川県' });
  assert.equal(r.first.kuni.amount, 337200);
  assert.equal(r.first.pref.add, 142800);
  assert.equal(r.first.selfFee, 20000);
});

// --- 支給期間: 36 月（定時制・通信制 48 月）、単位制は年 30・通算 74 単位 ---
test('全日制を 4 年で計算すると 4 年目は支援なし', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 500000, years: 4 });
  assert.equal(r.years[3].supported, false);
  assert.equal(r.years[3].selfFee, 500000);
  assert.equal(r.sum.selfFee, 42800 * 3 + 500000);
});
test('公立定時制は 4 年とも支援（48 月）', () => {
  const r = K.calc({ setchi: 'koritsu', type: 'tei', fee: 32400, years: 4 });
  assert.equal(r.years.every((y) => y.supported && y.selfFee === 0), true);
});
test('私立通信制の単位制（1単位 12,000円 × 25単位 × 4年）: 通算 74 単位まで', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'tsu', feeMode: 'unit', unitFee: 12000, units: 25, years: 4 });
  assert.deepEqual(r.years.map((y) => y.units), [25, 25, 24, 0]);
  assert.equal(r.years[0].selfFee, 0);
  assert.equal(r.years[2].selfFee, 12000);          // 25 単位のうち 1 単位は通算 74 を超える
  assert.equal(r.years[3].selfFee, 300000);
});
test('単位制で年 30 単位を超える分は支援の外', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'tsu', feeMode: 'unit', unitFee: 10000, units: 34 });
  assert.equal(r.first.units, 30);
  assert.equal(r.first.kuni.amount, 300000);
  assert.equal(r.first.selfFee, 40000);
});

// --- 新制度の対象外の生徒（旧制度と同じ水準） ---
test('対象外・新入生・590万円未満・私立全日制 50万円: 国 396,000円、東京都は 50万1,000円と授業料の範囲で 104,000円', () => {
  const base = { setchi: 'shiritsu', type: 'zen', fee: 500000, status: 'gai', gai: { kubun: 'c', zaiko: false } };
  const r = K.calc(base);
  assert.equal(r.first.kuni.amount, 396000);
  assert.equal(r.first.selfFee, 104000);
  const t = K.calc({ ...base, pref: '東京都' });
  assert.equal(t.first.pref.add, 104000);
  assert.equal(t.first.selfFee, 0);
});
test('対象外・910万円以上: 新入生は国 0、在校生は 118,800円', () => {
  const n = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 500000, status: 'gai', gai: { kubun: 'a', zaiko: false } });
  assert.equal(n.first.kuni.amount, 0);
  const z = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 500000, status: 'gai', gai: { kubun: 'a', zaiko: true } });
  assert.equal(z.first.kuni.amount, 118800);
  // 東京都の外国籍等の助成: 在校生 A は 382,200円まで
  const zt = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 520000, status: 'gai', gai: { kubun: 'a', zaiko: true }, pref: '東京都' });
  assert.equal(zt.first.pref.add, 382200);
  assert.equal(zt.first.selfFee, 520000 - 118800 - 382200);
});
test('対象外で大阪府・神奈川県の上乗せは計算しない', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 500000, status: 'gai', pref: '大阪府' });
  assert.equal(r.first.pref.status, 'notcalc');
});

// --- 入力とファイル ---
test('授業料が空なら結果を出さない', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen' });
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, ['fee']);
});
test('入学金と施設費を入れると卒業までの合計に足す', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 480000, shisetsu: 120000, nyugaku: 250000 });
  assert.equal(r.total, 22800 * 3 + 120000 * 3 + 250000);
});
test('ファイルの書き出しと読み込みで入力が戻る', () => {
  const d = { setchi: 'shiritsu', type: 'tsu', feeMode: 'unit', unitFee: 12000, units: 25, pref: '神奈川県', years: 4 };
  const f = K.toExportFile(d, new Date('2026-09-25T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-koko');
  const back = K.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, K.normalizeInput(d));
  assert.equal(K.fromExportFile({ tool: 'x', version: 1, data: {} }).ok, false);
});
test('単位制の上乗せは支援の対象の単位の範囲だけ（神奈川県・通算 74 単位を超える 1 単位は自己負担）', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'tsu', feeMode: 'unit', unitFee: 12000, units: 25, pref: '神奈川県' });
  assert.equal(r.years[2].units, 24);
  assert.equal(r.years[2].pref.add, 0);
  assert.equal(r.years[2].selfFee, 12000);
});
