// 医療費控除の表（lib/iryohi-values.js の sokusan）と、所得税の速算表の正本（lib/sokusan.js）とで、所得税の額が同じ事の突き合わせ（Q-1296、D1157）
// iryohi の表は「1,950,000円以下」、正本は No.2260 の「1,949,000円まで」の書き方で、上限の字が 1,000 円ずれる。
// 境目ちょうどでは画面の「（税率 N%）」の字だけが変わり得るので、ここでは税率の字は比べず、税額で比べる（iryohi の表は寄せない）
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../lib/iryohi.js');
const V = require('../lib/iryohi-values.js');
const S = require('../lib/sokusan.js');

// 各段の境目（両方の表の上限）の 1,000 円前・ちょうど・1,000 円後と、段の中の 1 点ずつ
function points() {
  const set = new Set();
  const limits = [];
  for (const row of S.TABLE) if (isFinite(row[0])) limits.push(row[0]);
  for (const row of V.sokusan) if (isFinite(row[0])) limits.push(row[0]);
  for (const b of limits) for (const d of [-1000, 0, 1000]) set.add(b + d);
  // 段の中: 各段の下端と上端の真ん中、最後の段は 5,000 万円
  const ups = Array.from(new Set(limits)).sort((a, b) => a - b);
  let lo = 0;
  for (const u of ups) { set.add(Math.floor((lo + u) / 2 / 1000) * 1000); lo = u; }
  set.add(50000000);
  return Array.from(set).filter((x) => x >= 0).sort((a, b) => a - b);
}

test('iryohi の表から出した所得税（基準所得税額）は、正本から出した所得税と同じ（境目の前後と段の中）', () => {
  const pts = points();
  assert.equal(pts.length, 31, '点の数');   // 境目 12 の前後 ×3（重なりを除く）と段の中 7 点
  for (const x of pts) assert.equal(I.shinkokuTax(x).kijun, S.tax(x), String(x));
});

test('境目の 1 円前後と、1,000 円未満の端数がある額でも同じ（切り捨ては両方とも 1,000 円単位）', () => {
  const limits = [];
  for (const row of S.TABLE) if (isFinite(row[0])) limits.push(row[0]);
  for (const row of V.sokusan) if (isFinite(row[0])) limits.push(row[0]);
  for (const b of limits) for (const d of [-1, 1, 999]) assert.equal(I.shinkokuTax(b + d).kijun, S.tax(b + d), String(b + d));
});

test('段の数・税率・控除額は同じ（上限の字だけ 1,000 円ずれる）', () => {
  assert.equal(V.sokusan.length, S.TABLE.length);
  assert.deepEqual(V.sokusan.map((r) => [r[1], r[2]]), S.TABLE.map((r) => [r[1], r[2]]));
  for (let i = 0; i < S.TABLE.length - 1; i++) assert.equal(V.sokusan[i][0] - S.UNIT, S.TABLE[i][0], `${i + 1} 段目の上限`);
});
