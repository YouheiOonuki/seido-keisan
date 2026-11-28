// 所得税の速算表の正本（lib/sokusan.js）と、残す写し（lib/tax2026.js の SOKUSAN。出どころは年末調整の冊子）の突き合わせ（Q-960）
// 冊子は「1,950,000円以下」、No.2260 は「1,949,000円まで」の書き方で、上限の字が 1,000 円ずれる。課税所得は 1,000 円単位なので、税率・控除額・税額で比べる
const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/sokusan.js');
const TAX = require('../lib/tax2026.js');

test('tax2026.js の速算表の頭の 5 段は、正本の頭の 5 段と同じ（税率・控除額・その表の範囲の 1,000 円刻みの税額）', () => {
  for (const y of Object.keys(TAX.years)) {
    const t = TAX.years[y].sokusan;
    assert.deepEqual(t.slice(0, 5).map((b) => [b[1], b[2]]), S.TABLE.slice(0, 5).map((b) => [b[1], b[2]]), y);
    for (let i = 0; i < 5; i++) assert.equal(t[i][0] - S.UNIT, S.TABLE[i][0], `${y} の ${i + 1} 段目の上限`);
    for (let x = 0; x <= t[4][0]; x += S.UNIT) {
      const br = t.filter((b) => x <= b[0])[0];
      assert.equal(Math.max(0, x * br[1] / 100 - br[2]), S.tax(x), `${y} の ${x}`);
    }
  }
});
