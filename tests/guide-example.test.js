// 解説 3 枚の「例:」の数が、計算の lib の結果と同じことを見る（Q-1233、D1068）。
// 例の入力を lib に渡した結果と、ページの字の数を突き合わせる。lib の数が字と違う時は、字を直さずに lib の数を確かめる
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../lib/juminzei.js');
const JV = require('../lib/juminzei-values.js');
const H = require('../lib/hoken.js');
const K = require('../lib/koko.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const exampleOf = (html) => {
  const m = html.match(/<p>例: [^<]*<\/p>/g);
  assert.equal(m && m.length, 1, '「例:」の段落は 1 つ');
  return m[0].replace(/<\/?p>/g, '');
};

test('住民税の解説の例: 収入300万円・社会保険料45万円・扶養なし（1級地）', () => {
  const r = J.calc({ income: 3000000, shakai: 450000, city: { kyuchi: 1 } }, JV.CURRENT);
  assert.equal(r.kyuyoShotoku, 2020000);
  assert.equal(r.taxable, 1140000);
  assert.equal(r.wari, 111500);
  assert.equal(r.prefKinto + r.cityKinto + r.shinrin, 5000);
  assert.equal(r.total, 116500);
  const t = exampleOf(read('juminzei/guide.html'));
  for (const s of ['収入300万円', '社会保険料45万円', '扶養なし', '1級地', '給与所得202万円', '課税総所得金額114万円', '所得割111,500円', '年116,500円']) {
    assert.ok(t.includes(s), s);
  }
});

test('保険料控除の解説の例: 新契約の一般の生命保険料 年80,000円 → 計算式Ⅰで 40,000円', () => {
  const c = H.calc({ a: 80000 }).shotoku.cols;
  assert.equal(c['①'], 40000);
  assert.equal(80000 / 4 + 20000, 40000);
  const t = exampleOf(read('nenmatsu/hoken/guide.html'));
  for (const s of ['新契約の一般の生命保険料', '年80,000円', '計算式Ⅰ', '80,000円×1/4＋20,000円＝40,000円']) {
    assert.ok(t.includes(s), s);
  }
});

test('高校無償化の解説の例: 私立の全日制 授業料 年40万円なら 40万円、年60万円なら 457,200円で自己負担 142,800円', () => {
  const calc = (fee) => K.calc({ setchi: 'shiritsu', type: 'zen', fee, shisetsu: 0, nyugaku: 0, pref: '千葉県' }).first;
  const a = calc(400000), b = calc(600000);
  assert.equal(a.kuni.amount, 400000);
  assert.equal(a.selfFee, 0);
  assert.equal(b.kuni.amount, 457200);
  assert.equal(b.pref.add, 0);
  assert.equal(b.selfFee, 142800);
  const t = exampleOf(read('koko-mushoka/guide.html'));
  for (const s of ['私立の全日制', '年40万円', '国の支援は40万円', '年60万円', '45万7,200円', '差の14万2,800円']) {
    assert.ok(t.includes(s), s);
  }
});
