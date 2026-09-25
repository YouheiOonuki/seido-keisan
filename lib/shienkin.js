// ===========================
// 制度の計算機 — 子ども・子育て支援金（いくら引かれる）の計算（純粋関数）
// 値は lib/shienkin-values.js（率・上限・出典）と lib/ikukyu-values.js（標準報酬月額の等級表）にだけ置く。
// 金額は「銭」の整数で計算する（協会けんぽの保険料額表は全額・折半額を 0.1円単位で載せている）。
// 標準報酬月額・標準賞与額は 1,000円単位なので、× 0.23% の全額も折半額も銭で割り切れる。
// ブラウザでは window.Shienkin、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var SV = (typeof module !== 'undefined' && module.exports) ? require('./shienkin-values.js') : root.ShienkinValues;
  var IV = (typeof module !== 'undefined' && module.exports) ? require('./ikukyu-values.js') : root.IkukyuValues;

  var TOOL_ID = 'seido-keisan-shienkin';
  var KINDS = ['kaisha', 'ninkei', 'kokuho', 'kouki'];   // 会社員・公務員／任意継続／国保／後期高齢者医療
  var MODES = ['salary', 'hyojun'];                      // 月給から等級を引く／標準報酬月額をそのまま使う

  function num(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }

  function normalizeInput(raw) {
    raw = raw || {};
    return {
      kind: KINDS.indexOf(raw.kind) >= 0 ? raw.kind : 'kaisha',
      mode: MODES.indexOf(raw.mode) >= 0 ? raw.mode : 'salary',
      amount: num(raw.amount),
      bonus: num(raw.bonus),
    };
  }

  // 標準報酬月額（健康保険）: 報酬月額から等級の額を引く（協会けんぽの保険料額表の「報酬月額」欄）
  function hyojunFromSalary(salary) {
    var s = num(salary), t = IV.hoken.hyojunKenpo;
    for (var i = 0; i < t.length; i++) if (s < t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
  // 入れた「標準報酬月額」が等級表の額か（違えば、月給として等級を引き直す）
  function isGrade(v) { return IV.hoken.hyojunKenpo.some(function (r) { return r[1] === v; }); }

  // 率（%）× 額（円）→ 銭。率は 0.01% 単位（0.23 → 23）で整数にして掛ける
  function rateSen(yen, ratePct) { return Math.round(yen * Math.round(ratePct * 100) / 100); }
  // 給与から引く本人負担分: 50銭以下切り捨て、50銭を超えたら切り上げ（保険料額表の注①）
  function deductYen(sen) { var y = Math.floor(sen / 100), r = sen - y * 100; return r > 50 ? y + 1 : y; }

  function calc(raw) {
    var d = normalizeInput(raw);
    var r = { input: d, kind: d.kind, ready: false, rate: SV.rate };
    if (d.kind === 'kokuho' || d.kind === 'kouki') {
      // 市町村・広域連合の条例で決まるので、個人の額は出さない（国のモデル試算を表で出す）
      r.municipal = true;
      r.model = SV.MODEL8[d.kind];
      return r;
    }
    if (!d.amount) return r;

    var hyojun, regraded = false;
    if (d.mode === 'hyojun' && isGrade(d.amount)) hyojun = d.amount;
    else { hyojun = hyojunFromSalary(d.amount); regraded = d.mode === 'hyojun'; }
    var capped = false;
    if (d.kind === 'ninkei' && hyojun > SV.ninkeiMax) { hyojun = SV.ninkeiMax; capped = true; }

    var fullSen = rateSen(hyojun, SV.rate);                         // 全額（労使の合計）
    var selfSen = d.kind === 'ninkei' ? fullSen : fullSen / 2;       // 本人負担（任意継続は全額。161条）
    var bonus = d.kind === 'ninkei' ? 0 : Math.min(Math.floor(d.bonus / SV.bonusUnit) * SV.bonusUnit, SV.bonusCapYear);
    var bonusFullSen = rateSen(bonus, SV.rate);
    var bonusSelfSen = bonusFullSen / 2;
    var months2026 = SV.monthsIn2026[d.kind];

    r.ready = true;
    r.hyojun = hyojun;
    r.regraded = regraded;               // 標準報酬月額の欄に等級に無い額が入っていた
    r.capped = capped;                   // 任意継続の上限で頭打ち
    r.bonusStd = bonus;                  // 標準賞与額（1,000円未満切り捨て・年度573万円まで）
    r.bonusCapped = d.kind !== 'ninkei' && Math.floor(d.bonus / SV.bonusUnit) * SV.bonusUnit > SV.bonusCapYear;
    r.fullSen = fullSen;
    r.selfSen = selfSen;
    r.employerSen = d.kind === 'ninkei' ? 0 : fullSen - selfSen;
    r.deductYen = deductYen(selfSen);    // 支援金だけを給与から引くとした場合の円（端数は健康保険料と合わせて処理されることがある）
    r.bonusSelfSen = bonusSelfSen;
    r.yearSen = selfSen * 12 + bonusSelfSen;                  // 1年分（4月分〜翌年3月分の12か月＋賞与）
    r.months2026 = months2026;
    r.y2026Sen = selfSen * months2026 + bonusSelfSen;         // 令和8年（2026年）に引かれる分（賞与は4〜12月に出るものとして）
    // 参考: 令和10年度について国が示した機械的な計算（本人0.2%）。確定した率ではない
    var refPct = SV.MIKOMI.refRate2028;
    var refFull = rateSen(hyojun, refPct);
    r.ref2028Sen = d.kind === 'ninkei' ? refFull : refFull / 2;
    return r;
  }

  // 表示用: 銭 → 「172.5円」（0.1円単位。協会けんぽの額表と同じ）
  function yenStr(sen, decimals) {
    var y = sen / 100;
    var s = decimals === 0 ? Math.round(y).toLocaleString('ja-JP') : (Math.round(y * 10) / 10).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return s + '円';
  }
  // 端数が無ければ小数を付けない（690.0円 → 690円）
  function yenAuto(sen) { return sen % 100 === 0 ? yenStr(sen, 0) : yenStr(sen, 1); }

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
    TOOL_ID: TOOL_ID, normalizeInput: normalizeInput, hyojunFromSalary: hyojunFromSalary, isGrade: isGrade,
    rateSen: rateSen, deductYen: deductYen, calc: calc, yenStr: yenStr, yenAuto: yenAuto,
    toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shienkin = api;
})(this);
