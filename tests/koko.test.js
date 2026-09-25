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
  // 埼玉県は D97（2026-09-25）で計算の対象にしたので、上乗せを計算しない県の例を千葉県にした
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 480000, pref: '千葉県' });
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

// ---- 埼玉県・愛知県・兵庫県（D97、2026-09-25 追加）。額は各県の令和8年度の案内（lib/koko-values.js の SOURCES）から ----
const base = { setchi: 'shiritsu', type: 'zen', fee: 480000, shisetsu: 250000, nyugaku: 250000 };

test('埼玉県・区分を選ばない（国のみ）: 授業料の上乗せ 0 で自己負担は上乗せなしの県と同じ（年 22,800円）', () => {
  const r = K.calc({ ...base, pref: '埼玉県' });
  const other = K.calc({ ...base, pref: '千葉県' });
  assert.equal(r.first.pref.status, 'ok');
  assert.equal(r.first.pref.add, 0);
  assert.equal(r.first.selfFee, other.first.selfFee);
  assert.equal(r.sum.selfFee, 68400);
  assert.equal(r.nyugakuAid, 0);
  assert.equal(r.total, other.total);
});

test('埼玉県・基準①: 施設費等 年 200,000円・入学金 223,000円（1年生のみ）。施設費 25万・入学金 25万 → 3年で 68,400＋150,000＋27,000', () => {
  const r = K.calc({ ...base, pref: '埼玉県', saitamaKubun: 'k1' });
  assert.equal(r.first.selfFee, 22800);
  assert.equal(r.first.selfShisetsu, 50000);
  assert.equal(r.nyugakuAid, 223000);
  assert.equal(r.total, 68400 + 150000 + 27000);
});

test('埼玉県・基準②: 入学金 100,000円だけ。生活保護・家計急変: 授業料・施設費等 全額と入学金 223,000円', () => {
  const r2 = K.calc({ ...base, pref: '埼玉県', saitamaKubun: 'k2' });
  assert.equal(r2.first.selfShisetsu, 250000);
  assert.equal(r2.nyugakuAid, 100000);
  const h = K.calc({ ...base, pref: '埼玉県', saitamaKubun: 'hogo' });
  assert.equal(h.first.pref.add, 22800);
  assert.equal(h.first.selfFee, 0);
  assert.equal(h.first.selfShisetsu, 0);
  assert.equal(h.total, 27000);
});

test('埼玉県: リーフレットの合計（基準① 1年生 880,200円・2年生から 657,200円）と、授業料 457,200円・施設費 20万・入学金 22.3万で合う', () => {
  const r = K.calc({ setchi: 'shiritsu', type: 'zen', fee: 457200, shisetsu: 200000, nyugaku: 223000, pref: '埼玉県', saitamaKubun: 'k1' });
  const aid1 = r.first.kuni.amount + r.first.pref.add + (200000 - r.first.selfShisetsu) + r.nyugakuAid;
  assert.equal(aid1, 880200);
  assert.equal(aid1 - r.nyugakuAid, 657200);
  assert.equal(r.total, 0);
});

test('埼玉県: 県外の学校・通信制・公立・新制度の対象外は計算しない', () => {
  assert.equal(K.calc({ ...base, pref: '埼玉県', saitamaKubun: 'k1', saitamaIn: false }).first.pref.status, 'outside');
  assert.equal(K.calc({ ...base, pref: '埼玉県', type: 'tsu' }).first.pref.status, 'notype');
  assert.equal(K.calc({ ...base, pref: '埼玉県', setchi: 'koritsu', fee: 118800 }).first.pref.status, 'public');
  assert.equal(K.calc({ ...base, pref: '埼玉県', status: 'gai' }).first.pref.status, 'notcalc');
  assert.equal(K.calc({ ...base, pref: '埼玉県', saitamaIn: false, saitamaKubun: 'k1' }).nyugakuAid, 0);
});

test('愛知県: 授業料の上乗せ 0（上限 457,200円は国と同じ）、入学納付金 全日制 200,000円・通信制 34,000円・専修 170,000円', () => {
  const r = K.calc({ ...base, pref: '愛知県' });
  assert.equal(r.first.pref.status, 'ok');
  assert.equal(r.first.pref.add, 0);
  assert.equal(r.first.selfFee, 22800);
  assert.equal(r.nyugakuAid, 200000);
  assert.equal(r.total, 68400 + 750000 + 50000);
  assert.equal(K.calc({ ...base, pref: '愛知県', type: 'tsu', fee: 300000 }).nyugakuAid, 34000);
  assert.equal(K.calc({ ...base, pref: '愛知県', type: 'senshu' }).nyugakuAid, 170000);
  assert.equal(K.calc({ ...base, pref: '愛知県', nyugaku: 150000 }).nyugakuAid, 150000);   // 実際の額が低ければその額
  assert.equal(V.PREF.aichi.tuitionCap.zen, V.MONTHLY.shiritsu.zen * 12);
  assert.equal(V.PREF.aichi.tuitionCap.tsu, V.MONTHLY.shiritsu.tsu * 12);
});

test('愛知県: 県外の学校・定時制は計算しない', () => {
  assert.equal(K.calc({ ...base, pref: '愛知県', aichiIn: false }).first.pref.status, 'outside');
  assert.equal(K.calc({ ...base, pref: '愛知県', aichiIn: false }).nyugakuAid, 0);
  assert.equal(K.calc({ ...base, pref: '愛知県', type: 'tei' }).first.pref.status, 'notype');
});

test('兵庫県: 授業料の上乗せ 0。入学金支援は生活保護（生業扶助）・所得割 0円の世帯だけ 全日制 50,000円・専修 25,000円', () => {
  const r = K.calc({ ...base, pref: '兵庫県' });
  assert.equal(r.first.pref.status, 'ok');
  assert.equal(r.first.pref.add, 0);
  assert.equal(r.first.selfFee, 22800);
  assert.equal(r.nyugakuAid, 0);
  assert.equal(K.calc({ ...base, pref: '兵庫県', hyogoHikazei: true }).nyugakuAid, 50000);
  assert.equal(K.calc({ ...base, pref: '兵庫県', hyogoHikazei: true, type: 'senshu' }).nyugakuAid, 25000);
  assert.equal(K.calc({ ...base, pref: '兵庫県', hyogoHikazei: true, type: 'tsu' }).first.pref.status, 'notype');
  assert.equal(K.calc({ ...base, pref: '兵庫県', hyogoHikazei: true, hyogoIn: false }).nyugakuAid, 0);
});

test('新しい項目の既定値と、読み込みでの正規化', () => {
  const d = K.normalizeInput({});
  assert.equal(d.saitamaIn, true);
  assert.equal(d.saitamaKubun, 'none');
  assert.equal(d.aichiIn, true);
  assert.equal(d.hyogoIn, true);
  assert.equal(d.hyogoHikazei, false);
  assert.equal(K.normalizeInput({ saitamaKubun: 'x' }).saitamaKubun, 'none');
  assert.deepEqual(Object.keys(V.PREF_KEY).sort(), ['大阪府', '兵庫県', '埼玉県', '愛知県', '東京都', '神奈川県'].sort());
});
