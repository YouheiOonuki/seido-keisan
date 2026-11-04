// 医療費控除の明細書（iryohi/meisai/）と家庭の書類の箱（lib/box.js）のテスト: node --test tests/*.test.js
// 期待値は国税庁「医療費控除の明細書【内訳書】」（様式 PDF・記載要領・Excel 版の式）とタックスアンサー No.1120 から写した
// （出典は lib/iryohi-values.js の SOURCES の meisaiPdf・meisaiKi・meisaiXlsx・ta1119）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../lib/box.js');
const M = require('../lib/meisai.js');
const I = require('../lib/iryohi.js');
const V = require('../lib/iryohi-values.js');

const ROOT = path.join(__dirname, '..');
const row = (o) => Object.assign(B.emptyRow(), o);

// 偽の localStorage
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}

// ---------- (f) CSV の列順 ＝ 様式の原文 ----------
test('(f) CSV の見出しは様式の「2 医療費の明細」の (1)〜(5) の名前と順（2026-11-05 に PDF の版 07.11 で確認）', () => {
  assert.deepEqual(V.MEISAI.columns, [
    '医療を受けた方の氏名',
    '病院・薬局などの支払先の名称',
    '医療費の区分',
    '支払った医療費の額',
    '(4)のうち生命保険や社会保険（高額療養費など）などで補塡される金額',
  ]);
  const csv = M.toCsv([]);
  assert.equal(csv.charCodeAt(0), 0xfeff);                       // Excel で文字化けしないよう BOM
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], V.MEISAI.columns.join(','));
  assert.equal(lines[1], '2 の合計,,,0,0');
  assert.equal(lines[2], '');                                    // 末尾は CRLF
  // 出典と確認日が値と同じファイルにある
  const keys = V.SOURCES.map((s) => s.key);
  for (const k of ['meisaiPdf', 'meisaiKi', 'meisaiXlsx', 'ta1119']) assert.ok(keys.includes(k), k);
  assert.match(V.MEISAI.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(V.SOURCES.find((s) => s.key === 'meisaiPdf').url.endsWith('/yoshiki/04/pdf/ref1.pdf'));
});

test('区分は様式の 4 つを様式の並び（診療・治療 → 介護保険サービス → 医薬品購入 → その他の医療費）で、複数を「／」でつなぐ', () => {
  assert.deepEqual(B.KUBUN.map((k) => k.label), ['診療・治療', '介護保険サービス', '医薬品購入', 'その他の医療費']);
  assert.equal(M.kubunLabel(['sonota', 'shinryo']), '診療・治療／その他の医療費');
  assert.deepEqual(B.normalizeRow({ kubun: ['sonota', 'x', 'shinryo', 'shinryo'] }).kubun, ['shinryo', 'sonota']);
});

test('CSV の行: 記載要領の記入例（国税 太郎・○△病院 12,000円・JR、○○バス 1,560円）', () => {
  const rows = [
    row({ who: '国税 太郎', payee: '○△病院', kubun: ['shinryo'], amount: 12000 }),
    row({ who: '国税 太郎', payee: 'JR、○○バス', kubun: ['sonota'], amount: 1560 }),
    row(),                                                        // 空の行は出さない
  ];
  const lines = M.toCsv(rows).slice(1).split('\r\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[1], '国税 太郎,○△病院,診療・治療,12000,');
  assert.equal(lines[2], '国税 太郎,JR、○○バス,その他の医療費,1560,');
  assert.equal(lines[3], '2 の合計,,,13560,0');
});

test('CSV の書き方: カンマ・引用符・改行は囲む、式に見える値は先頭に \'', () => {
  const lines = M.toCsv([row({ who: '=SUM(A1)', payee: 'A,"B"', amount: 1 }), row({ who: '-1', payee: '@x', amount: 2 })]).slice(1).split('\r\n');
  assert.equal(lines[1], '\'=SUM(A1),"A,""B""",,1,');
  assert.equal(lines[2], '\'-1,\'@x,,2,');
});

// ---------- 合計と補塡の上限 ----------
test('補塡される金額は行ごとに支払った額が上限で、ほかの行からは引かない（No.1120・Excel 版の (5) の式）', () => {
  const t = M.totals([row({ amount: 100000, hoten: 150000 }), row({ amount: 200000, hoten: 30000 })]);
  assert.equal(t.a, 300000);
  assert.equal(t.b, 130000);          // 100,000（上限）＋ 30,000。150,000 ＋ 30,000 ではない
  assert.equal(t.c, 170000);
  assert.deepEqual(t.over, [0]);
  const csv = M.toCsv([row({ amount: 100000, hoten: 150000 })]).slice(1).split('\r\n');
  assert.equal(csv[1], ',,,100000,100000');                      // 明細書に書く (5) は上限の後の額
});

test('C は A − B（マイナスは 0）、所得なしの「10万円を超えた分」は最高 200 万円', () => {
  assert.equal(M.totals([row({ amount: 50000, hoten: 50000 })]).c, 0);
  assert.equal(M.overFloor(M.totals([row({ amount: 99999 })])).value, 0);
  assert.equal(M.overFloor(M.totals([row({ amount: 100001 })])).value, 1);
  assert.equal(M.overFloor(M.totals([row({ amount: 2100000 })])).value, 2000000);
  assert.deepEqual([M.overFloor(M.totals([row({ amount: 2100001 })])).value, M.overFloor(M.totals([row({ amount: 2100001 })])).capped], [2000000, true]);
  // 所得 200 万円以上の人の控除額と同じ
  assert.equal(M.overFloor(M.totals([row({ amount: 345678, hoten: 12345 })])).value, I.iryohiKojo(345678, 12345, 5000000).kojo);
});

test('空の行・金額だけ空の行: 空の行は数えず、名前だけの行は 0 円で数える', () => {
  const t = M.totals([row(), row({ who: '花子' }), row({ amount: '1,234円' })]);
  assert.equal(t.count, 2);
  assert.equal(t.a, 1234);
});

// ---------- (e) 控除の見込み ＝ iryohi.calc ----------
test('(e) 国税庁の記載例（医療費 50万円・補てん 20万円・給与 714万円・所得控除 3,269,196円）: 控除 20万円・還付 15,552円で iryohi.calc と 1 円まで一致', () => {
  const rows = [row({ who: '本人', payee: 'A病院', kubun: ['shinryo'], amount: 300000, hoten: 200000 }), row({ who: '妻', payee: 'B薬局', kubun: ['iyakuhin'], amount: 200000 })];
  const t = M.totals(rows);
  const r = M.estimate(t, 7140000, 3269196);
  const want = I.calc({ hiyo: 500000, hoten: 200000, mode: 'kyuyo', income: 7140000, kojo: 3269196 });
  assert.deepEqual(r, want);
  assert.equal(r.kojo, 200000);
  assert.equal(r.tax.refund, 15552);
  assert.equal(r.total, 35552);
});

test('(e) いろいろな入力で、明細の合計を iryohi.calc に入れた結果と同じ', () => {
  const cases = [
    [[row({ amount: 150000 })], 2971999, 1000000],
    [[row({ amount: 150000 })], 2972000, 1000000],
    [[row({ amount: 80000, hoten: 0 }), row({ amount: 70000, hoten: 90000 })], 4500000, 1500000],
    [[row({ amount: 2500000 })], 12000000, 2000000],
  ];
  for (const [rows, income, kojo] of cases) {
    const t = M.totals(rows);
    assert.deepEqual(M.estimate(t, income, kojo), I.calc({ hiyo: t.a, hoten: t.b, mode: 'kyuyo', income, kojo }));
  }
});

// ---------- 箱（lib/box.js） ----------
test('箱のキーと形: seido-keisan_box、years["2026"].meisai.rows', () => {
  assert.equal(B.KEY, 'seido-keisan_box');
  assert.ok(B.KEY.startsWith('seido-keisan_'));                  // README「ツールを追加するとき」12
  const b = B.setSection(B.empty(), 2026, 'meisai', { rows: [{ who: '太郎', amount: '5000' }] });
  assert.deepEqual(b, { version: 1, years: { 2026: { meisai: { rows: [{ who: '太郎', payee: '', kubun: [], amount: 5000, hoten: null }] } } } });
  assert.deepEqual(B.section(b, '2026', 'meisai').rows.length, 1);
  assert.deepEqual(B.section(b, 2027, 'meisai'), { rows: [] });  // 年ごとの入れ物（別の年は空）
  assert.throws(() => B.setSection(B.empty(), 'abc', 'meisai', {}));
});

test('保存の壊れ: 壊れた JSON・違う型・無い値は空の箱で始まり、例外を投げない', () => {
  for (const v of ['{', 'null', '[]', '"x"', '42', '{"years":[]}', '{"years":{"abcd":{},"1999":{},"2026":"x"}}']) {
    const r = B.load(fakeStorage({ 'seido-keisan_box': v }));
    assert.equal(r.box.version, 1, v);
    assert.equal(B.section(r.box, 2026, 'meisai').rows.length, 0, v);
  }
  assert.equal(B.load(fakeStorage({ 'seido-keisan_box': '{' })).broken, true);
  assert.equal(B.load(fakeStorage()).broken, false);
  assert.equal(B.load(null).box.version, 1);                     // localStorage が使えない環境
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(B.load(throwing).broken, true);
  assert.equal(B.save(throwing, B.empty()), false);              // 容量超え・プライベートモードでも止まらない
});

test('保存の壊れ: 行の中身の型が違っても正規化して読む（文字は 60 字・制御文字なし、金額は 0 以上の整数）', () => {
  const raw = { version: 1, years: { 2026: { meisai: { rows: [
    { who: 123, payee: 'あ'.repeat(80), kubun: 'shinryo', amount: -5, hoten: 'abc' },
    'x', null,
    { who: ' 花子\n', amount: 12.9, hoten: '3,000' },
  ] } } } };
  const rows = B.section(B.normalize(raw), 2026, 'meisai').rows;
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { who: '', payee: 'あ'.repeat(60), kubun: [], amount: 0, hoten: null });
  assert.deepEqual(rows[1], B.emptyRow());
  assert.deepEqual(rows[3], { who: '花子', payee: '', kubun: [], amount: 12, hoten: 3000 });
  const many = { years: { 2026: { meisai: { rows: Array.from({ length: B.MAX_ROWS + 10 }, () => ({ amount: 1 })) } } } };
  assert.equal(B.section(B.normalize(many), 2026, 'meisai').rows.length, B.MAX_ROWS);
});

test('知らない区画（後で年末調整などが足す）は、明細書の画面が保存し直しても消えない', () => {
  const st = fakeStorage({ 'seido-keisan_box': JSON.stringify({ version: 1, years: { 2026: { gensen: { shiharai: 5000000 } }, 2025: { meisai: { rows: [{ amount: 1 }] } } } }) });
  const b = B.setSection(B.load(st).box, 2026, 'meisai', { rows: [{ amount: 10 }] });
  assert.equal(B.save(st, b), true);
  const back = JSON.parse(st._m.get('seido-keisan_box'));
  assert.deepEqual(back.years['2026'].gensen, { shiharai: 5000000 });
  assert.equal(back.years['2026'].meisai.rows[0].amount, 10);
  assert.equal(back.years['2025'].meisai.rows[0].amount, 1);
});

test('JSON の書き出し・読み込み（D31）: 往復で同じ、違うツール・新しい版・中身なしは読まない', () => {
  const b = B.setSection(B.empty(), 2026, 'meisai', { rows: [{ who: '太郎', payee: 'A', kubun: ['kaigo'], amount: 1000, hoten: 10 }] });
  const f = B.toExportFile(b, new Date('2026-11-05T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-box');
  assert.equal(f.version, 1);
  assert.equal(f.exportedAt, '2026-11-05T00:00:00.000Z');
  const r = B.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, b);
  assert.equal(B.fromExportFile(null).ok, false);
  assert.equal(B.fromExportFile({ tool: 'seido-keisan-iryohi', version: 1, data: {} }).ok, false);
  assert.equal(B.fromExportFile({ tool: 'seido-keisan-box', version: 2, data: {} }).ok, false);
  assert.equal(B.fromExportFile({ tool: 'seido-keisan-box', version: 1 }).ok, false);
  assert.equal(B.exportFileName(new Date(2026, 0, 5)), 'seido-keisan-box-backup-20260105.json');
});

test('名前の候補と並べ替え', () => {
  assert.deepEqual(M.names([row({ who: '太郎' }), row({ who: '' }), row({ who: '花子' }), row({ who: '太郎' })]), ['太郎', '花子']);
  assert.deepEqual(M.move([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(M.move([1, 2, 3], 2, -1), [1, 3, 2]);
  assert.deepEqual(M.move([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(M.move([1, 2, 3], 2, 1), [1, 2, 3]);
});

// ---------- (g) サーバーが止まっていても表と CSV が出る ----------
test('(g) 明細書の画面と lib はどこにも送信しない（fetch・sendBeacon・XMLHttpRequest が無い。写真の読み取りは枝 2）', () => {
  for (const f of ['iryohi/meisai/app.js', 'lib/meisai.js', 'lib/box.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket/, f);
  }
  const html = fs.readFileSync(path.join(ROOT, 'iryohi/meisai/index.html'), 'utf8');
  assert.doesNotMatch(html, /type="file"[^>]*accept="image|capture/);   // 写真のボタンは置かない（枝 2）
});

test('画面: 読む script が全部あり、「保存した内容をすべて消す」が箱のキーを消す', () => {
  const html = fs.readFileSync(path.join(ROOT, 'iryohi/meisai/index.html'), 'utf8');
  for (const m of html.matchAll(/<script src="(\.[^"]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, 'iryohi/meisai', m[1])), m[1]);
  assert.match(html, /data-reset-storage="seido-keisan_box"/);
  assert.match(html, /この計算は目安です。/);
  assert.match(html, /確定申告書等作成コーナー/);
  assert.match(html, /確定申告期限等から5年間は自宅等で保存/);
  const iryohi = fs.readFileSync(path.join(ROOT, 'iryohi/index.html'), 'utf8');
  assert.match(iryohi, /href="\.\/meisai\/"/);                    // 医療費控除の計算から 1 リンク
});
