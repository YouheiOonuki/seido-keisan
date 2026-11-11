// ===========================
// 家庭の書類の箱（yorozu-plans ROADMAP 7.184 の A、QUEUE Q-078）
// 1 年を通じて入れておく値を、年ごとの入れ物に分けて端末の localStorage に 1 つのキーで持つ。
// キー名と形はこのファイルだけが決める（医療費控除の明細書・医療費控除の計算・年末調整・保険料控除が同じ箱を読む約束）。
//
//   localStorage['seido-keisan_box'] = {
//     version: 1,
//     years: {
//       "2026": {                       // 医療費を支払った年・所得の年（西暦 4 桁の文字列）
//         meisai: { rows: [ { who, payee, kubun: [..], amount, hoten } ] }   // 医療費控除の明細書【内訳書】の「2 医療費の明細」
//         hikkoshi: { moveDate: 'YYYY-MM-DD'|'', kind: 'other'|'same', has: { card: true, … }, done: ['tennyu', …] }   // 引越しの手続き（年は引越しの日の年。自由な文字は入れない）
//         …ほかの区画（知らない区画は消さずにそのまま残す）
//       }
//     },
//     lifeplan: { input: { age, income, iryohi, pensionStart, mikomi, loan: {…}, children: [{ y, m }], ikukyu: 'both'|'leave'|'none' }, layers }   // 人生の数字を 1 枚に（年に属さないので years の外。計算した数は入れない）
//   }
//
// 書き出しのファイルは { tool: 'seido-keisan-box', version: 1, exportedAt, data: <上の箱> }（README「ツールを追加するとき」20）。
// DOM には触らない。localStorage は呼ぶ側が渡す（テストでは偽物を渡す）。
// ブラウザでは window.Box、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var KEY = 'seido-keisan_box';
  var TOOL_ID = 'seido-keisan-box';
  var FILE_VERSION = 1;
  var BOX_VERSION = 1;
  var MAX_ROWS = 500;          // 明細の行の上限（1 年分の領収書を 1 枚 1 行で入れても足りる数。容量はオリジン全体で約 5MB を共有）
  var MAX_TEXT = 60;           // 氏名・支払先の字数の上限

  // 明細書の「(3) 医療費の区分」。並びは様式の原文（国税庁「医療費控除の明細書【内訳書】」、左上から右下へ）
  var KUBUN = [
    { code: 'shinryo', label: '診療・治療' },
    { code: 'kaigo', label: '介護保険サービス' },
    { code: 'iyakuhin', label: '医薬品購入' },
    { code: 'sonota', label: 'その他の医療費' },
  ];
  var KUBUN_CODES = KUBUN.map(function (k) { return k.code; });

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function text(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT);
  }
  // 金額は 0 以上の整数。空欄は null（「入れていない」と 0 を分ける）
  function amount(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/[,，\s円]/g, '');
    if (s === '') return null;
    var n = Math.floor(Number(s));
    if (!isFinite(n)) return null;
    return Math.min(Math.max(0, n), 1e10);
  }
  function yearKey(y) {
    var s = String(y);
    return /^\d{4}$/.test(s) && +s >= 2000 && +s <= 2100 ? s : null;
  }

  // --- 区画: 明細書 ---
  function emptyRow() { return { who: '', payee: '', kubun: [], amount: null, hoten: null }; }
  function normalizeRow(r) {
    r = isObj(r) ? r : {};
    var k = Array.isArray(r.kubun) ? r.kubun : [];
    return {
      who: text(r.who),
      payee: text(r.payee),
      kubun: KUBUN_CODES.filter(function (c) { return k.indexOf(c) >= 0; }),   // 様式の並びにそろえ、重複と知らない値を落とす
      amount: amount(r.amount),
      hoten: amount(r.hoten),
    };
  }
  function normalizeMeisai(m) {
    m = isObj(m) ? m : {};
    var rows = Array.isArray(m.rows) ? m.rows.slice(0, MAX_ROWS).map(normalizeRow) : [];
    return { rows: rows };
  }
  // --- 区画: 引越しの手続き（項目の id と選択肢の中身は lib/hikkoshi.js が決める。ここは形と大きさだけ） ---
  var ID_RE = /^[A-Za-z][A-Za-z0-9]{0,29}$/;
  function normalizeHikkoshi(h) {
    h = isObj(h) ? h : {};
    var has = {};
    if (isObj(h.has)) Object.keys(h.has).slice(0, 20).forEach(function (k) { if (ID_RE.test(k)) has[k] = !!h.has[k]; });
    var done = Array.isArray(h.done) ? h.done.filter(function (x, i, a) { return typeof x === 'string' && ID_RE.test(x) && a.indexOf(x) === i; }).slice(0, 50) : [];
    return {
      moveDate: typeof h.moveDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.moveDate) ? h.moveDate : '',
      kind: h.kind === 'same' ? 'same' : 'other',
      has: has,
      done: done,
    };
  }
  var SECTIONS = { meisai: normalizeMeisai, hikkoshi: normalizeHikkoshi };

  // --- 箱の直下の区画: 人生の数字を 1 枚に（企画書 102 の 5.2.5）。入力の形だけを持ち、範囲の判定は lib/lifeplan.js の normalizeInput が読むときにする ---
  function n(v) { if (v === '' || v === null || v === undefined) return null; var x = Number(v); return isFinite(x) && Math.abs(x) <= 1e10 ? x : null; }
  function normalizeLifeplan(v) {
    v = isObj(v) ? v : {};
    var i = isObj(v.input) ? v.input : {};
    var l = isObj(i.loan) ? i.loan : {};
    var kids = Array.isArray(i.children) ? i.children.slice(0, 3).map(function (c) { c = isObj(c) ? c : {}; return { y: n(c.y), m: n(c.m) }; }) : [];
    var layers = Math.floor(Number(v.layers));
    return {
      input: {
        age: n(i.age), income: n(i.income), iryohi: n(i.iryohi), pensionStart: n(i.pensionStart),
        mikomi: n(i.mikomi),   // 年金の見込額（企画書 102 の 5.2.8）。欄の無い古いファイルは空（null）。端末だけに置き、used には乗せない
        loan: { principal: n(l.principal), years: n(l.years), rate: n(l.rate), startAge: n(l.startAge) },
        children: kids,
        ikukyu: ['both', 'leave', 'none'].indexOf(i.ikukyu) >= 0 ? i.ikukyu : 'both',   // 育休・産休の select（企画書 102 の 5.2.7）。欄の無い古いファイルは「産休と育休」
      },
      layers: isFinite(layers) && layers >= 0 && layers <= 20 ? layers : 0,   // 保存したときに出ていた層の数（企画書 102 の 6 章。端末だけで持ち、送らない）
    };
  }

  // --- 箱 ---
  function empty() { return { version: BOX_VERSION, years: {} }; }
  function normalizeYear(y) {
    y = isObj(y) ? y : {};
    var out = {};
    Object.keys(y).forEach(function (name) {
      if (SECTIONS[name]) out[name] = SECTIONS[name](y[name]);
      else if (isObj(y[name])) out[name] = y[name];           // 後で足す区画を、古い画面が保存し直して消さない
    });
    return out;
  }
  function normalize(raw) {
    var b = empty();
    if (!isObj(raw) || !isObj(raw.years)) return b;
    Object.keys(raw.years).forEach(function (k) {
      var key = yearKey(k);
      if (key) b.years[key] = normalizeYear(raw.years[k]);
    });
    if (isObj(raw.lifeplan)) b.lifeplan = normalizeLifeplan(raw.lifeplan);
    return b;
  }
  // 区画を読む（無ければ空の形）。箱は変えない
  function section(box, year, name) {
    var y = box && box.years && box.years[yearKey(year)];
    var v = y ? y[name] : undefined;
    return SECTIONS[name] ? SECTIONS[name](v) : (isObj(v) ? v : {});
  }
  // 区画を書く（新しい箱を返す）
  function setSection(box, year, name, value) {
    var key = yearKey(year);
    if (!key) throw new Error('year must be 2000..2100');
    var b = normalize(box);
    var y = b.years[key] || {};
    y[name] = SECTIONS[name] ? SECTIONS[name](value) : value;
    b.years[key] = y;
    return b;
  }

  // 人生の数字を 1 枚にの区画を読む（無ければ null）・書く（新しい箱を返す。years のほかの区画はそのまま）
  function lifeplan(box) { return box && isObj(box.lifeplan) ? normalizeLifeplan(box.lifeplan) : null; }
  function setLifeplan(box, value) {
    var b = normalize(box);
    b.lifeplan = normalizeLifeplan(value);
    return b;
  }

  // --- 端末への保存（読み書きはすべて try/catch。壊れた値・保存できない環境でも止まらない） ---
  function load(storage) {
    try {
      var s = storage && storage.getItem(KEY);
      if (s === null || s === undefined) return { box: empty(), broken: false };
      return { box: normalize(JSON.parse(s)), broken: false };
    } catch (e) {
      return { box: empty(), broken: true };     // 読めない値は空の箱として扱う（元の値は消さない。保存し直したときに上書きされる）
    }
  }
  function save(storage, box) {
    try { storage.setItem(KEY, JSON.stringify(normalize(box))); return true; }
    catch (e) { return false; }                 // 容量超え・プライベートモードなど
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(box, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalize(box) };
  }
  function fromExportFile(obj) {
    if (!isObj(obj)) return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'この箱（seido-keisan-box）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!isObj(obj.data)) return { ok: false, message: 'ファイルに中身がありません。' };
    return { ok: true, data: normalize(obj.data), exportedAt: obj.exportedAt };
  }
  function exportFileName(now) {
    var d = now || new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return TOOL_ID + '-backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
  }

  var api = {
    KEY: KEY, TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION, BOX_VERSION: BOX_VERSION, MAX_ROWS: MAX_ROWS, MAX_TEXT: MAX_TEXT,
    KUBUN: KUBUN, KUBUN_CODES: KUBUN_CODES,
    empty: empty, normalize: normalize, section: section, setSection: setSection, lifeplan: lifeplan, setLifeplan: setLifeplan,
    emptyRow: emptyRow, normalizeRow: normalizeRow, amount: amount,
    load: load, save: save, toExportFile: toExportFile, fromExportFile: fromExportFile, exportFileName: exportFileName,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Box = api;
})(this);
