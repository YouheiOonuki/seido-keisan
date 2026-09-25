// ===========================
// 制度の計算機 — 年金の繰上げ・繰下げの計算（純粋関数）
// 値は lib/kuriage-values.js にだけ置く。月は「65歳に達した月」（65歳の誕生日の前日の月）を 0 として数える。
//   繰上げ: 請求した月（0 より前）の翌月分から、減額率 ＝ 0.4%（昭和37年4月1日以前生まれは0.5%）× 月数
//   繰下げ: 申出をした月（12〜120）の翌月分から、増額率 ＝ 0.7% × 月数。在職で止まる分は増額しない（平均支給率）
//   65歳から: 65歳に達した月の翌月分から
// 累計は「その月の分まで」の合計（振込は偶数月に前2か月分だが、ここでは月の分で数える）。
// ブラウザでは window.Kuriage、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var V = (typeof module !== 'undefined' && module.exports) ? require('./kuriage-values.js') : root.KuriageValues;

  var TOOL_ID = 'seido-keisan-kuriage';
  var EPS = 0.01;   // 累計の比較の誤差（円）。月の額は年額 ÷ 12 の小数なので、ちょうど同じ額を「追いついた」とみなす

  function num(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }
  function int(v, lo, hi, def) { var n = Math.floor(Number(v)); if (!isFinite(n) || String(v) === '') return def; return Math.min(hi, Math.max(lo, n)); }
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number), dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return dt.getUTCFullYear() === p[0] && dt.getUTCMonth() === p[1] - 1 && dt.getUTCDate() === p[2] && p[0] >= 1900;
  }

  function normalizeInput(raw) {
    raw = raw || {};
    return {
      birth: validDate(raw.birth) ? raw.birth : '',
      kiso: num(raw.kiso),               // 65歳からの老齢基礎年金（年額）
      kosei: num(raw.kosei),             // 65歳からの老齢厚生年金（年額。加給年金額を除く）
      age: int(raw.age, 60, 75, 65),     // 受け取り始める年齢（請求・申出をする月の年齢）
      mon: int(raw.mon, 0, 11, 0),       //   と、その年齢に達した月から何か月目か
      sep: !!raw.sep,                    // 厚生年金だけ別の年齢で繰下げる
      kAge: int(raw.kAge, 65, 75, 65),
      kMon: int(raw.kMon, 0, 11, 0),
      wage: num(raw.wage),               // 65歳以降も会社で働くときの総報酬月額相当額（月）
      workTo: int(raw.workTo, 66, 80, 70), // 何歳まで働くか（その年齢に達した月の前月まで）
    };
  }

  // 年齢に達した日（誕生日の前日。年齢計算ニ関スル法律）の年・月 → 月の通し番号
  function reachIndex(birth, age) {
    var p = birth.split('-').map(Number);
    var dt = new Date(Date.UTC(p[0] + age, p[1] - 1, p[2]) - 86400000);
    return dt.getUTCFullYear() * 12 + dt.getUTCMonth();
  }
  function ymIndex(ym) { var p = ym.split('-').map(Number); return p[0] * 12 + p[1] - 1; }
  function indexYm(i) { var y = Math.floor(i / 12), m = i - y * 12 + 1; return y + '-' + (m < 10 ? '0' : '') + m; }

  function kuriageRate(birth) { return birth <= V.kuriageOldBornBy ? V.kuriageRateOld : V.kuriageRate; }
  function kurisageMax(birth) { return birth <= V.kurisageOldBornBy ? V.kurisageMaxOld : V.kurisageMax; }

  // 増減の千分率（整数）: 繰上げ −4 × 月数（または −5）、繰下げ ＋7 × 月数
  function permille(k, birth) {
    if (k < 0) return -Math.round(kuriageRate(birth) * 1000) * -k;
    return Math.round(V.kurisageRate * 1000) * k;
  }

  // 特別支給の老齢厚生年金の受給開始年齢（該当しなければ null）
  function tokubetsuAge(birth, sex) {
    var t = V.TOKUBETSU[sex];
    if (!t || birth < '1953-04-02' && sex === 'male' || birth < '1958-04-02' && sex === 'female') return null;
    for (var i = 0; i < t.length; i++) if (birth <= t[i][0]) return t[i][1];
    return null;
  }

  // 在職の支給停止額（月）。基本月額は65歳からの老齢厚生年金の月額（報酬比例部分として扱う）
  function zairoStop(koseiYear, wage) {
    var kihon = koseiYear / 12;
    if (!wage || !kihon) return 0;
    var stop = (kihon + wage - V.zairo.base) / 2;
    return Math.max(0, Math.min(kihon, stop));
  }

  // 1つの受け取り方（基礎は k1 か月、厚生は k2 か月。負は繰上げ）の年額と、月ごとの受け取り
  function plan(d, k1, k2) {
    var workMonths = d.wage ? (d.workTo - 65) * 12 : 0;      // 65歳に達した月から、働く月数
    var stop = d.wage ? zairoStop(d.kosei, d.wage) : 0;
    var supply = d.kosei && d.wage ? 1 - stop / (d.kosei / 12) : 1;
    var kiso = Math.round(d.kiso * (1000 + permille(k1, d.birth)) / 1000);
    var koseiBase = k2 < 0 ? Math.round(d.kosei * (1000 + permille(k2, d.birth)) / 1000) : d.kosei;
    var avg = 1;
    if (k2 > 0 && workMonths > 0) {
      var w = Math.min(k2, workMonths);
      avg = (w * supply + (k2 - w)) / k2;                    // 平均支給率（待機の月のうち働いた月は支給率、ほかは1）
    }
    var add = k2 > 0 ? d.kosei * permille(k2, d.birth) / 1000 * avg : 0;
    var kosei = k2 > 0 ? Math.round(d.kosei + add) : koseiBase;
    // 月 t（65歳に達した月が 0）の受け取り（年額 ÷ 12）
    function month(t) {
      var m = 0;
      if (t >= k1 + 1) m += kiso / 12;
      if (t >= k2 + 1) {
        var base = koseiBase / 12;
        if (t >= 0 && t < workMonths && k2 >= 0) base = Math.max(0, d.kosei / 12 - stop);   // 在職で止まる（繰下げの加算額は止まらない）
        m += base + (kosei - koseiBase) / 12;
      }
      return m;
    }
    return { k1: k1, k2: k2, kiso: kiso, kosei: kosei, total: kiso + kosei, avg: avg, month: month };
  }

  // 累計が逆転する月（65歳に達した月からの月数）。繰下げは「追いつく」、繰上げは「65歳からに追い越される」
  function breakEven(opt, base, limitT) {
    var late = Math.max(opt.k1, opt.k2) > 0, early = Math.min(opt.k1, opt.k2) < 0;
    if (!late && !early) return null;
    var co = 0, cb = 0, from = Math.min(opt.k1, opt.k2, 0) + 1;
    for (var t = from; t <= limitT; t++) {
      co += opt.month(t); cb += base.month(t);
      if (late && t > Math.max(opt.k1, opt.k2) && co >= cb - EPS) return t;
      if (early && t >= 1 && cb >= co - EPS) return t;
    }
    return -1;   // 100歳までに逆転しない
  }
  function cumulativeTo(p, fromT, toT) {
    var s = 0;
    for (var t = fromT; t <= toT; t++) s += p.month(t);
    return s;
  }
  function ageOf(t) { var a = 780 + t; return { y: Math.floor(a / 12), m: a % 12 }; }

  function calc(raw, todayYm) {
    var d = normalizeInput(raw);
    var r = { input: d, ready: false, msgs: [] };
    if (!d.birth || !(d.kiso || d.kosei)) return r;

    var max = kurisageMax(d.birth);
    var k1 = (d.age - 65) * 12 + d.mon;
    var k2 = d.sep && k1 >= 0 ? (d.kAge - 65) * 12 + d.kMon : k1;
    if (d.sep && k1 < 0) r.msgs.push('together');                         // 繰上げは基礎と厚生を同時に
    [['k1', k1], ['k2', k2]].forEach(function (x) {
      if (x[1] > 0 && x[1] < V.kurisageMin) r.msgs.push('gap');            // 65歳1か月〜65歳11か月は選べない
      if (x[1] > max) r.msgs.push('max');
      if (x[1] < -V.kuriageMax) r.msgs.push('min');
    });
    function fix(k) { if (k > 0 && k < V.kurisageMin) return 0; return Math.max(-V.kuriageMax, Math.min(max, k)); }
    k1 = fix(k1); k2 = fix(k2);
    if (d.wage && Math.min(k1, k2) < 0) r.msgs.push('workEarly');         // 65歳前に働く分の調整は入れない

    var noWork = {};
    for (var key in d) noWork[key] = d[key];
    noWork.wage = 0;
    var dd = Math.min(k1, k2) < 0 ? noWork : d;   // 繰上げのときは在職を入れない
    var opt = plan(dd, k1, k2);
    var base = plan(dd, 0, 0);
    var limitT = (100 - 65) * 12;
    var be = breakEven(opt, base, limitT);

    var m65 = reachIndex(d.birth, 65);
    r.ready = true;
    r.k1 = k1; r.k2 = k2;
    r.pct1 = permille(k1, d.birth) / 10;        // ％
    r.pct2 = permille(k2, d.birth) / 10;
    r.kiso = opt.kiso; r.kosei = opt.kosei; r.total = opt.total;
    r.baseTotal = base.total;
    r.avg = opt.avg;
    r.stop = d.wage ? zairoStop(d.kosei, d.wage) : 0;
    r.startYm = indexYm(m65 + Math.min(k1, k2) + 1);           // 最初に受け取る月の分
    r.requestYm = indexYm(m65 + k1);                           // 請求・申出をする月
    r.reach65Ym = indexYm(m65);
    r.kuriageRate = kuriageRate(d.birth);
    r.maxK = max;
    if (be !== null) r.breakEven = be < 0 ? { never: true } : { t: be, age: ageOf(be), ym: indexYm(m65 + be) };
    if (todayYm && m65 + Math.min(k1, k2) < ymIndex(todayYm) && (k1 !== 0 || k2 !== 0)) r.msgs.push('past');

    // 累計の表（その年齢に達した月の分まで）
    var fromT = Math.min(k1, k2, 0) + 1;
    r.totals = V.TOTAL_AGES.map(function (a) {
      var t = (a - 65) * 12;
      var o = cumulativeTo(opt, fromT, t), b = cumulativeTo(base, fromT, t);
      return { age: a, opt: Math.round(o), base: Math.round(b), diff: Math.round(o) - Math.round(b) };
    });
    // 同じ額で年齢だけ変えた表（基礎と厚生を同じ年齢で）
    r.compare = V.COMPARE_AGES.filter(function (a) { return (a - 65) * 12 <= max; }).map(function (a) {
      var k = (a - 65) * 12;
      var p = plan(k < 0 ? noWork : d, k, k);
      var b0 = plan(k < 0 ? noWork : d, 0, 0);
      var e = breakEven(p, b0, limitT);
      return { age: a, k: k, pct: permille(k, d.birth) / 10, total: p.total, breakEven: e === null ? null : e < 0 ? { never: true } : { t: e, age: ageOf(e) } };
    });
    // 特別支給の老齢厚生年金（厚生年金に1年以上入っていた人）
    r.tokubetsu = { male: tokubetsuAge(d.birth, 'male'), female: tokubetsuAge(d.birth, 'female') };
    if (Math.min(k1, k2) < 0 && d.kosei && (r.tokubetsu.male || r.tokubetsu.female)) r.msgs.push('tokubetsu');
    r.msgs = r.msgs.filter(function (m, i) { return r.msgs.indexOf(m) === i; });
    return r;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(state) {
    return { tool: TOOL_ID, version: 1, exportedAt: new Date().toISOString(), data: normalizeInput(state) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object' || obj.tool !== TOOL_ID) return { ok: false, message: 'このツールで書き出したファイルではありません。' };
    if (obj.version !== 1) return { ok: false, message: 'ファイルの版が違います（version ' + obj.version + '）。' };
    return { ok: true, data: normalizeInput(obj.data) };
  }

  var api = {
    TOOL_ID: TOOL_ID, normalizeInput: normalizeInput, validDate: validDate, reachIndex: reachIndex, indexYm: indexYm, ymIndex: ymIndex,
    kuriageRate: kuriageRate, kurisageMax: kurisageMax, permille: permille, tokubetsuAge: tokubetsuAge, zairoStop: zairoStop,
    plan: plan, breakEven: breakEven, ageOf: ageOf, calc: calc,
    toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Kuriage = api;
})(this);
