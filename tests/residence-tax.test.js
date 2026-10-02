// 住民税の計算（Japan residence tax calculator、英語ページ。K60）のテスト: node --test tests/*.test.js
// 1. 同じ入力で、日本語の住民税の計算（lib/juminzei.js）と 1 円まで一致する（ACCEPTANCE 3 章 K60: 3 件以上を突き合わせ）
// 2. 手で確かめた例（地方税法どおりの手順を、ここで別に計算して比べる）
// 3. 値を写していない。使い方ページの控えの数字が値ファイルからの計算と同じ
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../lib/residence-tax.js');
const J = require('../lib/juminzei.js');
const JV = require('../lib/juminzei-values.js');
const T = require('../lib/take-home.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('日本語の住民税の計算と同じ入力で同じ額（年税額・所得割・均等割・森林環境税・月々の額）', () => {
  // [英語ページの入力, 日本語ページ（lib/juminzei.js）に入れる入力, 年度]
  const cases = [
    // 1. 年収 500 万円・社会保険料 723,132円・単身・標準の市
    [{ salary: 5000000, si: 723132 }, { income: 5000000, shakai: 723132 }, 2027],
    // 2. 年収 680 万円・社会保険料 98 万円・iDeCo 27.6 万円・配偶者（給与 100 万円）・16 歳未満 1 人・19〜22 歳 1 人・指定都市
    [{ salary: 6800000, si: 980000, ideco: 276000, designated: true, spouse: { has: true, income: 1000000 }, kids: { u16: 1, a19: 1 } },
      { income: 6800000, shakai: 980000, shokibo: 276000, city: { shitei: true, kyuchi: 1 },
        spouse: { has: true, incomeType: 'kyuyo', amount: 1000000 },
        relatives: [{ age: 'u16', incomeType: 'kyuyo', amount: 0 }, { age: '19-22', incomeType: 'kyuyo', amount: 0 }] }, 2027],
    // 3. 年収 150 万円・社会保険料 22 万円・3 級地・今払っている年度（令和8年度＝令和7年の所得）
    [{ nendo: 2026, salary: 1500000, si: 220000, grade: 3 }, { income: 1500000, shakai: 220000, city: { kyuchi: 3 } }, 2026],
    // 4. 年収 260 万円・社会保険料 38 万円・配偶者（所得なし）・16〜18 歳 2 人（非課税限度額の近く）
    [{ salary: 2600000, si: 380000, spouse: { has: true, income: 0 }, kids: { a16: 2 } },
      { income: 2600000, shakai: 380000, spouse: { has: true, amount: 0 }, relatives: [{ age: '16-18' }, { age: '16-18' }] }, 2027],
    // 5. 年収 2,500 万円（社会保険料を入れたとき）
    [{ salary: 25000000, si: 2000000 }, { income: 25000000, shakai: 2000000 }, 2027],
  ];
  for (const [en, ja, nendo] of cases) {
    const a = R.calc(en);
    const b = J.calc(ja, nendo);
    const msg = JSON.stringify(en);
    assert.equal(a.ready, true, msg);
    assert.equal(a.j.nendo, nendo, msg);
    for (const k of ['total', 'taxable', 'kojo', 'prefWari', 'cityWari', 'prefKinto', 'cityKinto', 'shinrin', 'shotokuHikazei', 'kintoHikazei', 'shotokuLine', 'kintoLine']) {
      assert.deepEqual(a.j[k], b[k], msg + ' ' + k);
    }
    assert.deepEqual(a.j.installments, b.installments, msg + ' installments');
  }
});

test('手で確かめた例: 年収 500 万円・社会保険料 723,132円・単身・令和9年度', () => {
  const r = R.calc({ salary: 5000000, si: 723132 }).j;
  // 給与所得 5,000,000 × 80% − 440,000 = 3,560,000（国税庁の表と同じ）
  assert.equal(r.kyuyoShotoku, 3560000);
  // 控除 723,132 ＋ 基礎控除 430,000 → 課税総所得金額 2,406,868 → 2,406,000
  assert.equal(r.kojo, 1153132);
  assert.equal(r.taxable, 2406000);
  // 道府県 4% 96,240 − 調整控除 50,000×2% 1,000 → 95,200（100円未満切り捨て）、市町村 6% 144,360 − 1,500 → 142,800
  assert.equal(r.prefWari, 95200);
  assert.equal(r.cityWari, 142800);
  // 均等割 1,000 ＋ 3,000、森林環境税 1,000 → 243,000
  assert.equal(r.total, 243000);
  // 給与から: 12 で割って 100円未満切り捨て 20,200、端数は 6 月 20,800
  assert.deepEqual(r.installments.tokubetsu, { first: 20800, rest: 20200 });
  // 自分で納める: 4 で割って 1,000円未満切り捨て 60,000、端数は 6 月 63,000
  assert.deepEqual(r.installments.futsu, { first: 63000, rest: 60000, count: 4 });
});

test('非課税: 単身・1 級地・給与だけなら、令和9年度は収入 119 万円まで、令和8年度は 110 万円まで住民税がかからない', () => {
  // 総務省の資料（令和8年度の単身 1 級地 110 万円）と、令和8年度改正の概要（119 万円）
  assert.equal(R.calc({ salary: 1190000, si: 0 }).j.total, 0);
  assert.ok(R.calc({ salary: 1190001, si: 0 }).j.total > 0);
  assert.equal(R.calc({ nendo: 2026, salary: 1100000, si: 0 }).j.total, 0);
  assert.ok(R.calc({ nendo: 2026, salary: 1100001, si: 0 }).j.total > 0);
  assert.equal(R.calc({ salary: 1190000 }).j.kintoLine, 1190000);
});

test('社会保険料を空にすると、手取りの計算（協会けんぽ東京・40歳未満・賞与なし）の年額で見積もる', () => {
  for (const salary of [1500000, 3600000, 5000000, 9000000]) {
    const r = R.calc({ salary });
    assert.equal(r.siEstimated, true);
    assert.equal(r.si, T.calc({ period: 'year', amount: salary, bonus: 0 }).year.si, String(salary));
  }
  assert.equal(R.calc({ salary: 5000000 }).si, 723132);   // 企画書 48 の手取りの例と同じ
  // 0 円と入れたら見積もらない
  const z = R.calc({ salary: 5000000, si: '0' });
  assert.equal(z.siEstimated, false);
  assert.equal(z.si, 0);
  // 2,000 万円を超えると見積もれないので、入力を求める
  assert.equal(R.calc({ salary: 25000000 }).error, 'needSi');
  assert.equal(R.calc({ salary: 25000000 }).ready, false);
  assert.equal(R.calc({}).ready, false);
});

test('入力の正規化とファイルの書き出し・読み込み', () => {
  const d = R.normalizeInput({ nendo: '2026', salary: '5,000,000', si: '', grade: '9', kids: { u16: 99 } });
  assert.equal(d.nendo, 2026);
  assert.equal(d.salary, 5000000);
  assert.equal(d.si, null);
  assert.equal(d.grade, 1);
  assert.equal(d.kids.u16, 10);
  assert.equal(R.normalizeInput({ nendo: 2030 }).nendo, JV.CURRENT);
  const f = R.toExportFile({ salary: 1 }, new Date('2026-10-02T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-residence-tax');
  assert.deepEqual(R.fromExportFile(f), { ok: true, data: R.normalizeInput({ salary: 1 }) });
  assert.equal(R.fromExportFile({ tool: 'other' }).code, 'otherTool');
  assert.equal(R.fromExportFile({ tool: f.tool, version: 99, data: {} }).code, 'newer');
  assert.equal(R.fromExportFile(null).code, 'notJson');
});

test('値を写していない: 率・控除額・均等割を数字で持たず、lib/juminzei-values.js を読む', () => {
  const strip = (s) => s.replace(/\/\/.*$/gm, '');
  for (const f of ['lib/residence-tax.js', 'en/residence-tax/app.js', 'en/residence-tax/guide.js']) {
    const src = strip(read(f));
    for (const v of ['430000', '43000', '350000', '320000', '210000', '1190000', '1100000', '4000', '3000', '0.04', '0.06']) {
      assert.ok(!src.includes(v), f + ' に ' + v + ' がある');
    }
  }
  for (const f of ['en/residence-tax/index.html', 'en/residence-tax/guide.html']) {
    const html = read(f);
    for (const lib of ['juminzei-values.js', 'juminzei.js', 'residence-tax.js']) assert.ok(html.includes('../../lib/' + lib), f + ' ' + lib);
  }
});

test('使い方ページの控えの数字（JS が動かないとき・FAQ の JSON-LD）は、値ファイルからの計算と同じ', () => {
  const html = read('en/residence-tax/guide.html');
  const cur = JV.nendo[JV.CURRENT];
  const n = (x) => Number(x).toLocaleString('en-US');
  const line = (nd) => J.incomeLine(J.kintowariLimit(0, 1, nd), nd);
  const ex = R.calc({ salary: 5000000 });
  const want = {
    kiso: n(cur.kiso[0][1]), kinto: n(cur.kinto.pref + cur.kinto.city), shinrin: n(cur.shinrin),
    fixed: n(cur.kinto.pref + cur.kinto.city + cur.shinrin),
    pref: String(cur.rate.normal.pref), city: String(cur.rate.normal.city),
    prefS: String(cur.rate.shitei.pref), cityS: String(cur.rate.shitei.city),
    line: n(line(JV.CURRENT)), line0: n(line(JV.PREVIOUS)), exSi: n(ex.si), exTax: n(ex.j.total),
    nendo: String(JV.CURRENT),
  };
  for (const [k, v] of Object.entries(want)) {
    const re = new RegExp('data-v="' + k + '">([^<]*)<', 'g');
    const got = [...html.matchAll(re)].map((m) => m[1]);
    assert.ok(got.length > 0, k);
    for (const g of got) assert.equal(g, v, k);
  }
  // FAQ の JSON-LD と本文の例
  assert.ok(html.includes('¥' + want.exSi + ' of social insurance'));
  assert.ok(html.includes('it is ¥' + want.exTax + ' for June ' + JV.CURRENT));
  assert.ok(html.includes('plus ¥' + want.fixed + ' a year'));
  assert.ok(html.includes('the basic deduction is ¥' + want.kiso));
});

test('英語ページと日本語の住民税のページは hreflang で互いを指す', () => {
  const B = 'https://yorozu-craft.com/seido-keisan/';
  const pairs = [
    ['en/residence-tax/index.html', 'juminzei/index.html', B + 'en/residence-tax/', B + 'juminzei/'],
    ['en/residence-tax/guide.html', 'juminzei/guide.html', B + 'en/residence-tax/guide.html', B + 'juminzei/guide.html'],
  ];
  for (const [en, ja, enUrl, jaUrl] of pairs) {
    for (const f of [en, ja]) {
      const h = read(f);
      assert.ok(h.includes('hreflang="en" href="' + enUrl + '"'), f + ' en');
      assert.ok(h.includes('hreflang="ja" href="' + jaUrl + '"'), f + ' ja');
      assert.ok(h.includes('hreflang="x-default" href="' + jaUrl + '"'), f + ' x-default');
    }
  }
  const sm = read('sitemap.xml');
  assert.ok(sm.includes('<loc>' + B + 'en/residence-tax/</loc>'));
  assert.ok(sm.includes('<loc>' + B + 'en/residence-tax/guide.html</loc>'));
});

test('英語の言い方: residence tax を使い、resident tax・inhabitant tax は各ページの本文に 1 回ずつ', () => {
  for (const f of ['en/residence-tax/index.html', 'en/residence-tax/guide.html']) {
    const body = read(f).split('<main')[1].split('</main>')[0].replace(/<[^>]+>/g, ' ');
    assert.equal((body.match(/resident tax/gi) || []).length, 1, f + ' resident tax');
    assert.equal((body.match(/inhabitant tax/gi) || []).length, 1, f + ' inhabitant tax');
    assert.equal((body.match(/juminzei/gi) || []).length, 1, f + ' juminzei');
    assert.ok((body.match(/residence tax/gi) || []).length >= 2, f + ' residence tax');
  }
});
