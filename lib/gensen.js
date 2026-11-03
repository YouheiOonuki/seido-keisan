// ===========================
// 源泉徴収票の見方と手取り（画面から切り離した純粋関数。yorozu-plans ROADMAP 7.165 K208・D455）
// 票の欄の数字から 年収・手取りの目安・所得税・課税される所得と税率 を出す（足し引きだけ）。
// ふるさと納税の上限の目安は、票の内訳の欄（配偶者・扶養・障害者・生命保険料の金額の内訳など）を
// 年末調整の計算 lib/nenmatsu.js にかけ直し、③ 所得控除の額の合計額と ⑦ 源泉徴収税額が票と一致したときだけ、
// 住民税の計算 lib/juminzei.js（令和9年度）の上限の式で出す。一致しなければ、入れていない控除があるとみなして出さない。
// 控除の額・上限の式は二重に持たない（どちらも nenmatsu・juminzei が持つ）。
// DOM や localStorage には触らない。ブラウザでは window.Gensen、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var TAX = NODE ? require('./tax2026.js') : root.TaxValues;
  var JV = NODE ? require('./juminzei-values.js') : root.JuminzeiValues;
  var N = NODE ? require('./nenmatsu.js') : root.Nenmatsu;
  var J = NODE ? require('./juminzei.js') : root.Juminzei;

  var CHECKED = '2026-11-03';  // 国税庁「令和8年分 給与所得の源泉徴収票等の法定調書の作成と提出の手引」第2章を最後に原文で確かめた日
  var TOOL_ID = 'seido-keisan-gensen';
  var FILE_VERSION = 1;
  var Y = TAX.CURRENT;         // 令和8年分の票
  var NENDO = JV.CURRENT;      // 令和9年度の住民税（ふるさと納税の上限の目安）

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す）。金額の空欄は null、人数の空欄は 0 ---
  function amount(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/[,，\s円]/g, '');
    if (s === '') return null;
    var n = Math.floor(Number(s));
    if (!isFinite(n)) return null;
    return Math.min(Math.max(0, n), 1e9);
  }
  function count(v) { var n = Math.floor(Number(v) || 0); return Math.min(Math.max(0, n), 20); }
  var AMOUNTS = ['shiharai', 'kyuyoGo', 'kojoGoukei', 'gensen', 'shakai', 'juminMonth',
    'spouseKojo', 'spouseShotoku', 'tokushinKojo', 'newIppan', 'oldIppan', 'kaigo', 'newNenkin', 'oldNenkin',
    'jishinKojo', 'oldLong', 'jutaku', 'chosei'];
  var COUNTS = ['tokutei', 'rojin', 'rojinDokyo', 'other', 'u16', 'tokushin', 'shogaiTokubetsu', 'shogaiDokyo', 'shogaiIppan'];
  var SELF = ['none', 'ippan', 'tokubetsu', 'kafu', 'hitorioya', 'kinro'];
  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var d = {};
    AMOUNTS.forEach(function (k) { d[k] = amount(r[k]); });
    COUNTS.forEach(function (k) { d[k] = count(r[k]); });
    d.rojinDokyo = Math.min(d.rojinDokyo, d.rojin);
    d.shogaiDokyo = Math.min(d.shogaiDokyo, d.shogaiTokubetsu);
    d.spouseRojin = !!r.spouseRojin;
    d.self = SELF.indexOf(r.self) >= 0 ? r.self : 'none';
    d.mitei = !!r.mitei;   // 年末調整をしていない票（摘要に「年調未済」など）
    d.blank = !!r.blank;   // 票の内訳の欄はすべて空欄（配偶者・扶養・保険料などが無い）
    return d;
  }

  // 内訳の欄が 1 つでも入っているか（D455: 空なら上限の目安を出さない）
  function hasBreakdown(d) {
    return d.blank || COUNTS.some(function (k) { return d[k] > 0; }) || d.spouseRojin || d.self !== 'none' ||
      ['spouseKojo', 'spouseShotoku', 'tokushinKojo', 'newIppan', 'oldIppan', 'kaigo', 'newNenkin', 'oldNenkin', 'jishinKojo', 'oldLong', 'jutaku', 'chosei']
        .some(function (k) { return d[k] !== null; });
  }

  // 特定親族特別控除の額（所得税）から、その人の合計所得の帯の上の端を引く（1 人のときだけ。帯の中なら住民税の額も同じ）
  function tokushinShotoku(kojo) {
    var t = TAX.years[Y].tokuteiShinzoku;
    for (var i = 0; i < t.length; i++) if (t[i][1] === kojo) return t[i][0];
    return null;
  }

  // 票の内訳 → 年末調整・住民税の計算の入力（同じ形を両方に渡す）。作れなければ { error }
  function toCalcInput(d) {
    var rel = [], i;
    var add = function (n, p) { for (i = 0; i < n; i++) rel.push(Object.assign({ incomeType: 'shotoku', amount: 0, shogai: 'none' }, p)); };
    add(d.tokutei, { age: '19-22' });
    add(d.rojinDokyo, { age: '70dokyo' });
    add(d.rojin - d.rojinDokyo, { age: '70' });
    add(d.other, { age: '23-69' });
    add(d.u16, { age: 'u16' });
    if (d.tokushin > 1) return { error: '特定親族が 2 人以上のときは、1 人ずつの所得が票に無いため計算できません。' };
    if (d.tokushin === 1) {
      var s = tokushinShotoku(d.tokushinKojo);
      if (s === null) return { error: '特定親族特別控除の額が、控除の表の額（63万円〜3万円）のどれとも合いません。' };
      add(1, { age: '19-22', amount: s });
    }
    var spouse = { has: (d.spouseKojo || 0) > 0, incomeType: 'shotoku', amount: d.spouseShotoku || 0, over70: d.spouseRojin, shogai: 'none' };
    // 障害者（本人を除く）: 扶養親族から順に、足りなければ配偶者に割り当てる（控除の額は誰でも同じ）
    var marks = [];
    for (i = 0; i < d.shogaiDokyo; i++) marks.push('dokyo');
    for (i = 0; i < d.shogaiTokubetsu - d.shogaiDokyo; i++) marks.push('tokubetsu');
    for (i = 0; i < d.shogaiIppan; i++) marks.push('ippan');
    var targets = rel.concat(spouse.has ? [spouse] : []);
    if (marks.length > targets.length) return { error: '障害者の数が、配偶者と扶養親族の数より多くなっています。' };
    marks.forEach(function (m, j) { targets[j].shogai = m; });
    // 地震保険料: 票は控除額だけなので、旧長期損害保険料の分を引いて地震保険料の額に戻す（控除額が上限の 5 万円なら 5 万円とみなす）
    var old = d.oldLong || 0;
    var oldPart = N.jishinKojo({ jishin: 0, oldLong: old }, Y);
    var ji = Math.max(0, (d.jishinKojo || 0) - oldPart);
    var self = { shogai: 'none', kafu: 'none', kinro: false };
    if (d.self === 'ippan' || d.self === 'tokubetsu') self.shogai = d.self;
    if (d.self === 'kafu' || d.self === 'hitorioya') self.kafu = d.self;
    if (d.self === 'kinro') self.kinro = true;
    return {
      income: d.shiharai || 0, withheld: d.gensen || 0, shakai: d.shakai || 0, shokibo: 0,
      seimei: { newIppan: d.newIppan || 0, oldIppan: d.oldIppan || 0, kaigo: d.kaigo || 0, newNenkin: d.newNenkin || 0, oldNenkin: d.oldNenkin || 0 },
      jishin: { jishin: ji, oldLong: old },
      spouse: spouse, relatives: rel, self: self, jutaku: d.jutaku || 0, chosei: (d.chosei || 0) > 0,
    };
  }

  /**
   * @returns {object} { input, empty, nenshu, tedori, juminYear, shotokuzei, mitei, taxable, rate,
   *   furusato: { limit, rule } | null, check: { status: 'empty'|'need'|'error'|'mismatch'|'ok'|'none', message, rows: [{label, hyo, calc}] } }
   */
  function calc(raw) {
    var d = normalizeInput(raw);
    var r = { input: d, empty: d.shiharai === null, nenshu: d.shiharai, tedori: null, juminYear: null, shotokuzei: d.gensen, mitei: d.mitei, taxable: null, rate: null, furusato: null, check: null };
    if (r.empty) { r.check = { status: 'empty', message: '', rows: [] }; return r; }
    r.juminYear = d.juminMonth === null ? null : d.juminMonth * 12;
    r.tedori = d.shiharai - (d.gensen || 0) - (d.shakai || 0) - (r.juminYear || 0);
    if (d.kyuyoGo !== null && d.kojoGoukei !== null) {
      r.taxable = Math.max(0, Math.floor((d.kyuyoGo - d.kojoGoukei) / 1000) * 1000);
      r.rate = N.sokusan(r.taxable, Y).pct;
    }

    // ふるさと納税の上限の目安（D455）
    if (!hasBreakdown(d)) { r.check = { status: 'empty', message: '票の内訳を入れると出ます。', rows: [] }; return r; }
    if (d.mitei) { r.check = { status: 'need', message: '年末調整をしていない票は、所得控除が全部は入っていないため出しません。', rows: [] }; return r; }
    if (d.kojoGoukei === null || d.gensen === null) { r.check = { status: 'need', message: '所得控除の額の合計額と源泉徴収税額を入れると出ます。', rows: [] }; return r; }
    var ci = toCalcInput(d);
    if (ci.error) { r.check = { status: 'error', message: ci.error, rows: [] }; return r; }
    var nen = N.calc(ci, Y, ci.chosei ? { chosei: true } : undefined);
    if (!nen.ok) { r.check = { status: 'error', message: nen.message, rows: [] }; return r; }
    var rows = [
      { label: '所得控除の額の合計額', hyo: d.kojoGoukei, calc: nen.kojo },
      { label: '源泉徴収税額', hyo: d.gensen, calc: nen.nenzei },
    ];
    if (d.kyuyoGo !== null) rows.unshift({ label: '給与所得控除後の金額', hyo: d.kyuyoGo, calc: nen.goukei });
    var ok = rows.every(function (x) { return x.hyo === x.calc; });
    if (!ok) {
      r.check = { status: 'mismatch', message: '票の数字と、内訳からの計算が合いません。入れていない控除や欄の写し違いがあると、上限の目安は出せません。', rows: rows };
      return r;
    }
    var jr = J.calc(ci, NENDO);
    if (!jr.furusato) { r.check = { status: 'none', message: '住民税の所得割がかからないため、ふるさと納税で住民税は減りません。', rows: rows }; return r; }
    r.furusato = { limit: jr.furusato.limit, rule: jr.furusato.rule, nendo: jr.label };
    r.check = { status: 'ok', message: '', rows: rows };
    return r;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（源泉徴収票の見方と手取り）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    CHECKED: CHECKED, TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    calc: calc, normalizeInput: normalizeInput, toCalcInput: toCalcInput, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (NODE) module.exports = api;
  else root.Gensen = api;
})(this);
