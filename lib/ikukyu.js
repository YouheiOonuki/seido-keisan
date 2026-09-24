// ===========================
// 育休・産休の給付の計算（画面から切り離した純粋関数）
// 会社員（健康保険・厚生年金・雇用保険に入っている人）本人の、次の目安を出す:
//   出産手当金（健康保険法 102条・99条2項）、出産育児一時金（同 101条・施行令 36条）、
//   出生時育児休業給付金（雇用保険法 61条の8）、育児休業給付金（61条の7）、
//   出生後休業支援給付金（61条の10）、育児時短就業給付金（61条の12）、
//   産休・育休中の社会保険料の免除（健康保険法 159条・159条の3、厚生年金保険法 81条の2・81条の2の2）
// 値は lib/ikukyu-values.js にだけ置く。日付は 'YYYY-MM-DD' の文字列で受け取り、中では「1970-01-01 からの日数」で数える
// ブラウザでは window.Ikukyu、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var IV = isNode ? require('./ikukyu-values.js') : root.IkukyuValues;

  var TOOL_ID = 'seido-keisan-ikukyu';
  var FILE_VERSION = 1;
  var DAY = 86400000;

  function yen(n) { return Math.round(Number(n)).toLocaleString('ja-JP') + '円'; }

  // --- 日付（UTC の日数で数える。タイムゾーンで 1 日ずれないように） ---
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    if (y < 2000 || y > 2100) return null;
    return Math.round(t / DAY);
  }
  function parts(n) { var d = new Date(n * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(n) { var p = parts(n); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function jp(n) { var p = parts(n); return p.y + '年' + p.m + '月' + p.d + '日'; }
  function monthIndex(n) { var p = parts(n); return p.y * 12 + (p.m - 1); }
  function monthLabel(mi) { return Math.floor(mi / 12) + '年' + (mi % 12 + 1) + '月'; }
  function monthKey(mi) { return Math.floor(mi / 12) + '-' + pad(mi % 12 + 1); }
  function dayOf(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / DAY); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  // 開始日から k か月後の応当日（その日がない月は月末。雇用保険法 61条の7 第5項）
  function ouDate(start, k) {
    var p = parts(start);
    var mm = p.m - 1 + k;
    var y = p.y + Math.floor(mm / 12), m = (mm % 12 + 12) % 12 + 1;
    return dayOf(y, m, Math.min(p.d, daysInMonth(y, m)));
  }
  // 1 歳の誕生日（2月29日生まれは翌年の3月1日。「1歳に達する日」はその前日＝2月28日）
  function firstBirthday(birth) { var p = parts(birth); return dayOf(p.y + 1, p.m, p.d); }
  function overlap(a1, a2, b1, b2) { var s = Math.max(a1, b1), e = Math.min(a2, b2); return e >= s ? e - s + 1 : 0; }

  // --- 端数 ---
  // 99条2項: 30分の1の額は 5円未満切り捨て・5円以上切り上げ（10円単位）、2/3 は 50銭未満切り捨て・50銭以上切り上げ
  function roundTo10(x) { return Math.floor(x / 10 + 0.5 + 1e-9) * 10; }
  function roundYen(x) { return Math.floor(x + 0.5 + 1e-9); }
  // 給与から引く保険料の被保険者負担分: 50銭以下切り捨て、50銭を超えたら切り上げ（保険料額表の注）
  function premiumRound(x) { var f = Math.floor(x + 1e-9); return x - f > 0.5 + 1e-9 ? f + 1 : f; }
  // 割合（百分率）を整数で掛けて切り捨て（小数の誤差で 1 円ずれないように）
  function pctFloor(amount, pct) { return Math.floor(amount * pct / 100 + 1e-9); }

  // --- 標準報酬月額（健康保険）: 報酬月額から等級の額を引く ---
  function hyojunFromSalary(salary) {
    var s = Math.max(0, Math.floor(Number(salary) || 0));
    var t = IV.hoken.hyojunKenpo;
    for (var i = 0; i < t.length; i++) if (s < t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
  function hyojunKounen(hyojun) { return Math.min(IV.hoken.kounenMax, Math.max(IV.hoken.kounenMin, hyojun)); }

  // --- 出産手当金の 1 日あたりの額（99条2項。102条2項で準用） ---
  function teateDaily(avg, under12) {
    var k = IV.kenpo;
    var base = under12 ? Math.min(avg, k.under12.amount) : avg;
    var per30 = roundTo10(base / 30);
    var daily = roundYen(per30 * k.rate[0] / k.rate[1]);
    return {
      base: base, per30: per30, daily: daily,
      rule: (under12 && avg > k.under12.amount ? '加入12か月未満のため ' + yen(k.under12.amount) + '（協会けんぽの全被保険者の平均）を使う。' : '') +
        yen(base) + ' ÷ 30 ＝ ' + yen(per30) + '（10円未満四捨五入）× 2/3 ＝ ' + yen(daily) + '（1円未満四捨五入）',
    };
  }

  // --- 出産手当金の期間（102条1項） ---
  // 出産の日（予定日より遅れたときは予定日）以前 42 日（多胎 98 日）から、出産の日の翌日以後 56 日目まで。出産日は産前に入る
  function teatePeriod(due, birth, multi) {
    var k = IV.kenpo;
    var base = birth <= due ? birth : due;
    var start = base - (multi ? k.sanzenTatai : k.sanzen) + 1;
    var end = birth + k.sango;
    var late = Math.max(0, birth - due);
    return { start: start, end: end, days: end - start + 1, sanzen: birth - start + 1, sango: k.sango, late: late };
  }

  // --- 休業開始時賃金日額（雇用保険法 17条。6か月の賃金 ÷ 180、1円未満切り捨て。上限・下限あり） ---
  function wageDaily(wage6) {
    var k = IV.koyo;
    var raw = Math.floor(Math.max(0, Number(wage6) || 0) / k.wageDivisor);
    var daily = Math.min(k.dailyMax, Math.max(k.dailyMin, raw));
    return { raw: raw, daily: daily, capped: raw > k.dailyMax ? 'max' : raw < k.dailyMin ? 'min' : '' };
  }

  // --- 育児休業給付金の支給単位期間（61条の7 第5・6項） ---
  // start〜end（どちらも含む）を 1 か月ごとに区切る。終了日を含む期間は実際の日数、それ以外は 30 日。
  // usedDays: それまでに 67% で支給された日数（出生時育児休業給付金の日数を通算する）
  function ikukyuPeriods(start, end, daily, usedDays) {
    var k = IV.koyo;
    var out = [], cum = usedDays || 0;
    for (var i = 0; i < 40; i++) {
      var ps = ouDate(start, i);
      if (ps > end) break;
      var next = ouDate(start, i + 1);
      var last = next - 1 >= end;
      var pe = last ? end : next - 1;
      var days = last ? pe - ps + 1 : k.unitDays;
      var d67 = Math.max(0, Math.min(days, k.highDays - cum));
      var d50 = days - d67;
      var amount = Math.floor((daily * d67 * k.rateHigh + daily * d50 * k.rateLow) / 100 + 1e-9);
      out.push({ no: i + 1, start: ps, end: pe, days: days, d67: d67, d50: d50, amount: amount, cumBefore: cum });
      cum += days;
    }
    return out;
  }

  // --- 育児時短就業給付金（61条の12 第6項・第8項。厚労省リーフレットの支給率の式） ---
  // baseMonthly: 育児時短就業開始時賃金月額（賃金日額 × 30。上限・下限あり）、wage: その月に支払われた賃金
  function jitanAmount(baseMonthly, wage) {
    var j = IV.koyo.jitan;
    var w = Math.max(0, Math.floor(Number(wage) || 0));
    if (!w || !baseMonthly) return { amount: 0, pct: 0, reason: '時短後の月給を入れると計算します。' };
    if (w >= baseMonthly) return { amount: 0, pct: 0, reason: '時短後の賃金が時短前の賃金月額（' + yen(baseMonthly) + '）以上のため、支給されません。' };
    if (w >= j.limit) return { amount: 0, pct: 0, reason: '時短後の賃金が支給限度額（' + yen(j.limit) + '）以上のため、支給されません。' };
    var pct100, rule;   // 支給率 × 100（整数。例 6.43% → 643）
    if (w * 100 <= baseMonthly * j.band) {
      pct100 = j.rate * 100;
      rule = '時短前の賃金月額の90%以下なので、賃金 × 10%';
    } else {
      var x = Math.round(w / baseMonthly * 10000) / 100;           // 賃金率（小数第3位を四捨五入）
      pct100 = Math.round((9000 / x - 90) * 100);                   // 支給率（同）
      rule = '賃金率 ' + x.toFixed(2) + '%（90%超〜100%未満）なので、支給率 ＝ 9,000 ÷ ' + x.toFixed(2) + ' − 90 ＝ ' + (pct100 / 100).toFixed(2) + '%';
    }
    var amount = Math.floor(w * pct100 / 10000 + 1e-9);
    if (w + amount > j.limit) { amount = j.limit - w; rule += '。賃金との合計が支給限度額 ' + yen(j.limit) + ' を超えるので、限度額 − 賃金'; }
    if (amount <= j.minPay) return { amount: 0, pct: pct100 / 100, reason: '計算した額が最低限度額（' + yen(j.minPay) + '）以下のため、支給されません。', rule: rule };
    return { amount: amount, pct: pct100 / 100, rule: rule, reason: '' };
  }

  // --- 社会保険料が免除になる月（健康保険法 159条・159条の3、厚生年金保険法 81条の2・81条の2の2） ---
  // segments: [{ s, e, iku: 育児休業等か }]。続いている休業は 1 つとみなす（159条2項）
  function exemptMonths(segments) {
    var segs = segments.filter(function (x) { return x && x.e >= x.s; }).slice().sort(function (a, b) { return a.s - b.s; });
    var merged = [];
    segs.forEach(function (x) {
      var last = merged[merged.length - 1];
      if (last && x.s <= last.e + 1) { last.e = Math.max(last.e, x.e); last.iku = last.iku || x.iku; }
      else merged.push({ s: x.s, e: x.e, iku: x.iku });
    });
    var months = {};
    merged.forEach(function (x) {
      var m1 = monthIndex(x.s), m2 = monthIndex(x.e + 1);
      if (m1 !== m2) { for (var m = m1; m < m2; m++) months[m] = 'end'; }
      else if (x.iku && x.e - x.s + 1 >= 14) months[m1] = '14';   // 同じ月の中で 14 日以上（令和4年10月から）
    });
    return months;
  }

  function monthlyPremium(hyojun, mi, input) {
    var h = IV.hoken;
    var rate = input.pref === 'custom' ? input.customRate : (h.kyokai[input.pref] || h.kyokai.tokyo)[1];
    var shien = monthKey(mi) >= h.shienFrom ? h.shienRate : 0;
    var kaigo = input.over40 ? h.kaigoRate : 0;
    var kenpo = premiumRound(hyojun * (rate + kaigo) / 100 / 2);
    var sh = premiumRound(hyojun * shien / 100 / 2);
    var nen = premiumRound(hyojunKounen(hyojun) * h.kounenRate / 100 / 2);
    return { kenpo: kenpo, shien: sh, kounen: nen, total: kenpo + sh + nen, rate: rate, kaigo: kaigo, shienRate: shien };
  }

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す） ---
  function num(v, max) {
    var n = Math.floor(Number(String(v === undefined || v === null ? '' : v).replace(/[,，\s円]/g, '')));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max || 1e9);
  }
  function dateStr(v) { var n = parseDate(v); return n === null ? '' : fmt(n); }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  function rate(v, def) {
    var t = String(v === undefined || v === null ? '' : v).replace(/[%％\s]/g, '');
    var n = Number(t);
    if (t === '' || !isFinite(n) || n < 0) return def;
    return Math.min(Math.round(n * 1000) / 1000, 20);
  }
  var PREFS = Object.keys(IV.hoken.kyokai);
  var SPOUSE = ['leave14', 'notEmployee', 'none', 'noLeave'];

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var pa = r.papa || {}, ji = r.jitan || {};
    return {
      role: pick(r.role, ['mother', 'father'], 'mother'),
      salary: num(r.salary, 10000000),
      hyojun: num(r.hyojun, 10000000),
      wage6: num(r.wage6, 60000000),
      under12: !!r.under12,
      dueDate: dateStr(r.dueDate),
      birthDate: dateStr(r.birthDate),
      babies: pick(Number(r.babies), [1, 2, 3], 1),
      sanka: r.sanka === undefined ? true : !!r.sanka,
      leaveStart: dateStr(r.leaveStart),
      leaveEnd: dateStr(r.leaveEnd),
      papa: { use: !!pa.use, start: dateStr(pa.start), end: dateStr(pa.end) },
      spouse: pick(r.spouse, SPOUSE, 'leave14'),
      pref: pick(r.pref, PREFS.concat(['custom']), 'tokyo'),
      customRate: rate(r.customRate, 10),
      over40: !!r.over40,
      juminzei: num(r.juminzei, 1000000),
      tedori: num(r.tedori, 10000000),
      jitan: { use: !!ji.use, salary: num(ji.salary, 10000000) },
    };
  }

  // --- 本体 ---
  function calc(raw) {
    var d = normalizeInput(raw);
    var k = IV.koyo, kp = IV.kenpo;
    var res = { ok: false, input: d, messages: [], notes: [], steps: [] };
    var due = parseDate(d.dueDate);
    if (due === null) { res.need = 'due'; return res; }
    if (!d.salary && !d.hyojun && !d.wage6) { res.need = 'salary'; return res; }
    var birth = parseDate(d.birthDate);
    var born = birth !== null;
    if (!born) birth = due;
    var early = Math.min(birth, due), late = Math.max(birth, due);
    var mother = d.role === 'mother';
    var multi = d.babies > 1;
    res.ok = true;
    res.due = due; res.birth = birth; res.born = born; res.mother = mother;

    // 標準報酬月額と休業開始時賃金日額
    var hyojun = d.hyojun ? hyojunFromSalary(d.hyojun) : hyojunFromSalary(d.salary);
    var hyojunRule = d.hyojun ? '入力した標準報酬月額' : '月給 ' + yen(d.salary) + ' を健康保険の等級表に当てはめた額';
    var wage6 = d.wage6 || (d.salary || d.hyojun) * 6;
    var wd = wageDaily(wage6);
    res.hyojun = hyojun;
    res.wage6 = wage6;
    res.wage = wd;
    res.steps.push({ label: '標準報酬月額（健康保険）', amount: hyojun, rule: hyojunRule + '（協会けんぽの保険料額表）' });
    res.steps.push({ label: '休業開始前6か月の賃金', amount: wage6, rule: d.wage6 ? '入力した額（賞与を除く）' : (d.salary ? '月給' : '標準報酬月額') + ' × 6（賞与を除く）' });
    res.steps.push({
      label: '休業開始時賃金日額', amount: wd.daily,
      rule: yen(wage6) + ' ÷ 180 ＝ ' + yen(wd.raw) + '（1円未満切り捨て）' +
        (wd.capped === 'max' ? '。上限 ' + yen(k.dailyMax) + ' を使う' : wd.capped === 'min' ? '。下限 ' + yen(k.dailyMin) + ' を使う' : ''),
    });
    if (wd.capped === 'max') res.notes.push('賃金日額が上限（' + yen(k.dailyMax) + '）を超えるため、育児休業給付金は上限の額になります（67%の期間は月 ' + yen(pctFloor(k.dailyMax * 30, k.rateHigh)) + '）。');

    var bday1 = firstBirthday(birth);
    var tatsu = bday1 - 1;          // 1歳に達する日（誕生日の前日）
    var payLimit = bday1 - 2;       // 給付は「1歳に達する日の前日」＝誕生日の前々日まで
    res.bday1 = bday1; res.payLimit = payLimit;

    // 出産手当金・産前産後休業（本人が出産する場合だけ）
    var segments = [];
    var leaveStart, leaveEnd;
    if (mother) {
      var tp = teatePeriod(due, birth, multi);
      var td = teateDaily(hyojun, d.under12);
      res.teate = { period: tp, daily: td, total: td.daily * tp.days };
      res.steps.push({ label: '出産手当金の1日あたり', amount: td.daily, rule: td.rule + '（健康保険法99条2項・102条）' });
      res.steps.push({
        label: '出産手当金の日数', amount: null, days: tp.days,
        rule: jp(tp.start) + '〜' + jp(tp.end) + '：産前 ' + (multi ? kp.sanzenTatai : kp.sanzen) + '日' + (tp.late ? '＋予定日より遅れた ' + tp.late + '日' : '') + '＋産後 ' + tp.sango + '日＝' + tp.days + '日',
      });
      res.steps.push({ label: '出産手当金', amount: res.teate.total, rule: yen(td.daily) + ' × ' + tp.days + '日' });
      segments.push({ s: tp.start, e: tp.end, iku: false, label: '産休' });
      leaveStart = birth + k.maternityLeaveDays + 1;
      leaveEnd = parseDate(d.leaveEnd);
      if (leaveEnd === null) leaveEnd = tatsu;
    } else {
      res.teate = null;
      // 産後パパ育休（出生時育児休業）
      if (d.papa.use) {
        var ps = parseDate(d.papa.start), pe = parseDate(d.papa.end);
        var winS = early, winE = late + k.papaWindowDays;
        if (ps === null || pe === null || pe < ps) {
          res.messages.push('産後パパ育休の開始日と終了日を入れてください。');
        } else if (ps < winS || pe > winE) {
          res.messages.push('産後パパ育休は、' + jp(winS) + '〜' + jp(winE) + '（出生日・予定日から8週間）の中で取る休みです。日付を確かめてください。');
        } else {
          var total = pe - ps + 1;
          var paid = Math.min(total, k.papaMaxDays);
          res.papa = { start: ps, end: pe, days: total, paidDays: paid, paidEnd: ps + paid - 1, amount: pctFloor(wd.daily * paid, k.rateHigh) };
          if (total > k.papaMaxDays) res.messages.push('産後パパ育休は28日までです。29日目からは給付の対象になりません（会社と合意すれば育児休業に振り替えられます）。');
          res.steps.push({ label: '出生時育児休業給付金', amount: res.papa.amount, rule: yen(wd.daily) + ' × ' + paid + '日 × 67%（1円未満切り捨て。雇用保険法61条の8）' });
          segments.push({ s: ps, e: pe, iku: true, label: '産後パパ育休' });
        }
      }
      leaveStart = parseDate(d.leaveStart);
      if (leaveStart === null) leaveStart = res.papa ? res.papa.end + 1 : birth;
      leaveEnd = parseDate(d.leaveEnd);
      if (leaveEnd === null) leaveEnd = tatsu;
      if (res.papa && leaveStart <= res.papa.end) {
        res.messages.push('育児休業の開始日が産後パパ育休と重なっています。育児休業は産後パパ育休の翌日以降にしてください。');
        leaveStart = res.papa.end + 1;
      }
    }

    // 育児休業給付金
    res.leave = null;
    if (leaveEnd < leaveStart) {
      if (d.leaveEnd) res.messages.push('育児休業の終了日が開始日より前です（' + jp(leaveStart) + '〜' + jp(leaveEnd) + '）。');
    } else {
      var payEnd = Math.min(leaveEnd, payLimit);
      if (leaveEnd > tatsu) res.messages.push('子が1歳になった後の育児休業（保育所に入れないときの延長など）は、この計算の対象外です。1歳の誕生日の前々日までで計算しています。');
      var used = res.papa ? res.papa.paidDays : 0;
      var periods = payEnd >= leaveStart ? ikukyuPeriods(leaveStart, payEnd, wd.daily, used) : [];
      var sum = periods.reduce(function (a, p) { return a + p.amount; }, 0);
      res.leave = { start: leaveStart, end: leaveEnd, payEnd: payEnd, periods: periods, total: sum };
      segments.push({ s: leaveStart, e: leaveEnd, iku: true, label: '育休' });
      var hi = pctFloor(wd.daily * k.unitDays, k.rateHigh), lo = pctFloor(wd.daily * k.unitDays, k.rateLow);
      res.leave.monthlyHigh = hi; res.leave.monthlyLow = lo;
      res.steps.push({ label: '育児休業給付金（1か月・67%）', amount: hi, rule: yen(wd.daily) + ' × 30日 × 67%（休業開始から180日目まで。' + (used ? '産後パパ育休の ' + used + '日を通算。' : '') + '雇用保険法61条の7）' });
      res.steps.push({ label: '育児休業給付金（1か月・50%）', amount: lo, rule: yen(wd.daily) + ' × 30日 × 50%（181日目から）' });
      res.steps.push({ label: '育児休業給付金の合計', amount: sum, rule: jp(leaveStart) + '〜' + jp(payEnd) + '、支給単位期間 ' + periods.length + '回分' });
      if (payEnd > parseDate(k.validTo)) res.notes.push(jp(parseDate(k.validTo)) + 'より後の期間は、賃金日額の上限・下限が毎年8月1日に改定されるため、実際の額は少し変わることがあります（計算は2026年8月1日からの額）。');
    }

    // 出生後休業支援給付金（61条の10）
    var winEnd = late + (mother ? k.shien.motherWindowDays : k.shien.fatherWindowDays);
    var inWin = 0;
    if (res.papa) inWin += overlap(res.papa.start, res.papa.paidEnd, early, winEnd);
    if (res.leave && res.leave.periods.length) inWin += overlap(res.leave.start, res.leave.payEnd, early, winEnd);
    var spouseOk, spouseWhy;
    if (!mother) {
      spouseOk = true;
      spouseWhy = '配偶者（出産した人）は子の出生日の翌日に産後休業中か、雇用される労働者でないため、配偶者の育休は要件になりません。';
    } else if (d.spouse === 'leave14') {
      spouseOk = true; spouseWhy = '配偶者が出生後8週間の間に通算14日以上の育休（産後パパ育休を含む）を取る予定です。';
    } else if (d.spouse === 'notEmployee') {
      spouseOk = true; spouseWhy = '配偶者が雇用される労働者でない（専業主婦・主夫、自営業、フリーランスなど）ため、配偶者の育休は要件になりません。';
    } else if (d.spouse === 'none') {
      spouseOk = true; spouseWhy = '配偶者がいない（ひとり親など）ため、配偶者の育休は要件になりません。';
    } else {
      spouseOk = false; spouseWhy = '配偶者が会社員で、出生後8週間の間に14日以上の育休を取らないため、要件を満たしません。';
    }
    var created = parseDate('2025-04-01');
    var daysOk = inWin >= k.shien.minDays;
    var ok = daysOk && spouseOk && winEnd >= created;
    var shienDays = Math.min(k.shien.maxDays, inWin);
    res.shien = {
      windowStart: early, windowEnd: winEnd, daysInWindow: inWin, daysOk: daysOk, spouseOk: spouseOk, ok: ok,
      days: ok ? shienDays : 0, amount: ok ? pctFloor(wd.daily * shienDays, k.shien.rate) : 0,
      whyDays: '対象期間（' + jp(early) + '〜' + jp(winEnd) + '）の育休は ' + inWin + '日' + (daysOk ? '（14日以上）。' : '。14日以上必要です。'),
      whySpouse: spouseWhy,
    };
    if (ok) res.steps.push({ label: '出生後休業支援給付金', amount: res.shien.amount, rule: yen(wd.daily) + ' × ' + shienDays + '日 × 13%（28日まで。雇用保険法61条の10）' });

    // 出産育児一時金（本人が出産する場合は本人の健康保険から。父の場合は配偶者か自分の健康保険の家族出産育児一時金として）
    var per = d.sanka ? kp.ichiji.sanka : kp.ichiji.other;
    res.ichiji = { per: per, babies: d.babies, total: per * d.babies };

    // 社会保険料の免除
    var ex = exemptMonths(segments);
    var monthsAll = Object.keys(ex).map(Number).sort(function (a, b) { return a - b; });
    var exTotal = 0;
    res.exempt = monthsAll.map(function (mi) {
      var p = monthlyPremium(hyojun, mi, d);
      exTotal += p.total;
      return { mi: mi, label: monthLabel(mi), why: ex[mi], premium: p };
    });
    res.exemptTotal = exTotal;
    res.premiumNow = monthlyPremium(hyojun, monthIndex(Math.max(early, parseDate('2026-04-01'))), d);

    // 合計
    res.total = (res.teate ? res.teate.total : 0) + (res.papa ? res.papa.amount : 0) + (res.leave ? res.leave.total : 0) + res.shien.amount;
    res.totalWithIchiji = res.total + res.ichiji.total;

    // 休業中の手取りの目安（給付は非課税・社会保険料は免除・住民税は前年の所得にかかる）
    var benefitHigh = res.leave ? res.leave.monthlyHigh : 0;
    res.tedori = {
      high: benefitHigh - d.juminzei,
      low: (res.leave ? res.leave.monthlyLow : 0) - d.juminzei,
      withShien: benefitHigh + (ok ? pctFloor(wd.daily * 30, k.shien.rate) : 0),
      before: d.tedori,
      ratio: d.tedori ? Math.round((benefitHigh - d.juminzei) / d.tedori * 1000) / 10 : null,
    };

    // 育児時短就業給付金（育休から続けて時短で復帰する場合）
    if (d.jitan.use) {
      var base = wd.daily * 30;
      var jr = jitanAmount(base, d.jitan.salary);
      res.jitan = { base: base, salary: d.jitan.salary, amount: jr.amount, pct: jr.pct, rule: jr.rule || '', reason: jr.reason, until: bday1 + 365 - 1 };
    }

    // 受け取りの目安（申請の時期で前後する。断定しない）
    var pays = [];
    pays.push({ mi: monthIndex(birth), name: '出産育児一時金', amount: res.ichiji.total, note: '直接支払制度なら健康保険から病院へ直接支払われ、窓口では差額だけ払います' });
    if (res.teate) pays.push({ mi: monthIndex(res.teate.period.end + 30), name: '出産手当金', amount: res.teate.total, note: '産後休業が終わってからまとめて申請した場合。受付から10営業日以内（協会けんぽ）' });
    var shienPaid = false;
    if (res.papa) {
      pays.push({ mi: monthIndex(Math.max(res.papa.end, late + k.papaWindowDays) + 30), name: '出生時育児休業給付金', amount: res.papa.amount, note: '出生から8週間たった後に申請。支給決定から約1週間で振込' });
      if (ok && overlap(res.papa.start, res.papa.paidEnd, early, winEnd) >= k.shien.minDays) {
        pays.push({ mi: monthIndex(Math.max(res.papa.end, late + k.papaWindowDays) + 30), name: '出生後休業支援給付金', amount: res.shien.amount, note: '産後パパ育休の給付金と一緒に申請' });
        shienPaid = true;
      }
    }
    if (res.leave) {
      var ps2 = res.leave.periods;
      for (var i = 0; i < ps2.length; i += 2) {
        var grp = ps2.slice(i, i + 2);
        var amt = grp.reduce(function (a, p) { return a + p.amount; }, 0);
        var gEnd = grp[grp.length - 1].end;
        pays.push({ mi: monthIndex(gEnd + 30), name: '育児休業給付金（' + grp.map(function (p) { return p.no; }).join('・') + '回目の期間）', amount: amt, note: jp(grp[0].start) + '〜' + jp(gEnd) + ' の分。期間が終わってから会社が申請し、支給決定から約1週間で振込' });
        if (i === 0 && ok && !shienPaid) {
          pays.push({ mi: monthIndex(gEnd + 30), name: '出生後休業支援給付金', amount: res.shien.amount, note: '初回の育児休業給付金と一緒に申請' });
          shienPaid = true;
        }
      }
    }
    res.payments = pays;

    // 月ごとの表（休業の状態・社会保険料・住民税・受け取りの目安）
    var firstM = Math.min.apply(null, segments.map(function (x) { return monthIndex(x.s); }).concat([monthIndex(birth)]));
    var lastM = Math.max.apply(null, segments.map(function (x) { return monthIndex(x.e); }).concat(pays.map(function (p) { return p.mi; })));
    var rows = [];
    for (var mi = firstM; mi <= lastM && rows.length < 36; mi++) {
      var y = Math.floor(mi / 12), m = mi % 12 + 1;
      var ms = dayOf(y, m, 1), me = dayOf(y, m, daysInMonth(y, m));
      var st = segments.filter(function (x) { return overlap(x.s, x.e, ms, me) > 0; }).map(function (x) { return x.label; });
      var rc = pays.filter(function (p) { return p.mi === mi; });
      rows.push({
        mi: mi, label: monthLabel(mi), state: st.length ? st.join('・') : '仕事（休業なし）',
        exempt: !!ex[mi], premium: monthlyPremium(hyojun, mi, d).total, juminzei: d.juminzei,
        receipts: rc, receiptTotal: rc.reduce(function (a, p) { return a + p.amount; }, 0),
      });
    }
    res.months = rows;
    return res;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（育休・産休の計算）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    parseDate: parseDate, fmt: fmt, jp: jp, monthLabel: monthLabel, ouDate: ouDate, firstBirthday: firstBirthday,
    hyojunFromSalary: hyojunFromSalary, hyojunKounen: hyojunKounen,
    teateDaily: teateDaily, teatePeriod: teatePeriod, wageDaily: wageDaily, ikukyuPeriods: ikukyuPeriods,
    jitanAmount: jitanAmount, exemptMonths: exemptMonths, monthlyPremium: monthlyPremium,
    calc: calc, normalizeInput: normalizeInput, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (isNode) module.exports = api;
  else root.Ikukyu = api;
})(this);
