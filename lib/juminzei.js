// ===========================
// 住民税（個人住民税）の計算・非課税判定（画面から切り離した純粋関数）
// 手順は地方税法のとおり:
//   給与所得（所得税の表をそのまま使う）→ 所得控除（住民税の額）→ 課税総所得金額（1,000 円未満切り捨て）
//   → 非課税の判定（生活保護・135 万円以下の障害者等・所得割の非課税限度額・均等割の非課税限度額）
//   → 所得割（道府県民税・市町村民税ごとに 税率を掛けて 1 円未満切り捨て → 調整控除 → 住宅ローン控除
//     → 非課税限度額のすぐ上の人の減額 → 100 円未満切り捨て）
//   → 均等割・森林環境税 → 年税額 → 納め方（特別徴収 12 回・普通徴収 4 回）
// 値は lib/juminzei-values.js にだけ置く。給与所得の表と所得税の計算は lib/nenmatsu.js を使い回す。
// ブラウザでは window.Juminzei、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var JV = isNode ? require('./juminzei-values.js') : root.JuminzeiValues;
  var N = isNode ? require('./nenmatsu.js') : root.Nenmatsu;

  var TOOL_ID = 'seido-keisan-juminzei';
  var FILE_VERSION = 1;
  var MAX_INCOME = 100000000;   // 給与の収入 1 億円まで（表の外は 収入 − 195 万円）

  function yen(n) { return Math.round(Number(n)).toLocaleString('ja-JP') + '円'; }
  function man(n) { return (n / 10000).toLocaleString('ja-JP') + '万円'; }
  function pctStr(p) { return String(Math.round(p * 1000) / 1000) + '%'; }

  // --- 給与所得（給与所得控除後の金額）: 年末調整の表（所得税の計算の例による） ---
  function kyuyoShotoku(income, nendo) {
    var y = JV.nendo[nendo];
    var x = Math.floor(Math.max(0, Number(income) || 0));
    var r = N.kyuyoShotoku(x, y.taxYear);   // 表の範囲（2,000 万円）を超えると null
    if (r) return r;
    return { value: x - 1950000, rule: '850万円以上は 収入 − 195万円（表の式）' };
  }

  // 家族の合計所得金額（給与の収入で入れたときは、その年の表で給与所得にする）
  function relativeShotoku(p, nendo) {
    var amount = Math.max(0, Number(p && p.amount) || 0);
    if (p && p.incomeType === 'shotoku') return amount;
    return kyuyoShotoku(amount, nendo).value;
  }

  // 表の段階から引く: bands = [[この額以下, 値], ...]。超えたら fallback
  function band(bands, x, fallback) {
    for (var i = 0; i < bands.length; i++) if (x <= bands[i][0]) return bands[i][1];
    return fallback;
  }

  // 生命保険料・地震保険料の計算式（1 円未満は切り上げ。所得税と同じ扱い）
  function shiki(amount, s) {
    var a = Math.max(0, Math.floor(Number(amount) || 0));
    if (a === 0) return 0;
    for (var i = 0; i < s.bands.length; i++) {
      if (a <= s.bands[i][0]) return Math.ceil(a * s.bands[i][1] + s.bands[i][2]);
    }
    return s.cap;
  }

  // 生命保険料控除（314条の2 第1項5号）。新旧の両方を払ったときは「合計（2 万 8 千円まで）」と「旧だけ」の多いほう
  function seimeiKojo(p, nendo) {
    var s = JV.nendo[nendo].seimei;
    function pair(newAmt, oldAmt) {
      var n = shiki(newAmt, s.shinki), o = shiki(oldAmt, s.kyuki);
      var both = (n > 0 && o > 0) ? Math.min(n + o, s.bothCap) : 0;
      return Math.max(n, o, both);
    }
    var ippan = pair(p.newIppan, p.oldIppan);
    var kaigo = shiki(p.kaigo, s.shinki);
    var nenkin = pair(p.newNenkin, p.oldNenkin);
    return { ippan: ippan, kaigo: kaigo, nenkin: nenkin, total: Math.min(ippan + kaigo + nenkin, s.total) };
  }

  // 地震保険料控除（314条の2 第1項5号の3）
  function jishinKojo(p, nendo) {
    var j = JV.nendo[nendo].jishin;
    var a = Math.min(Math.ceil(Math.max(0, Math.floor(Number(p.jishin) || 0)) * j.rate), j.cap);
    var b = shiki(p.oldLong, j.oldLong);
    return Math.min(a + b, j.total);
  }

  function colOf(honnin, y) {
    for (var i = 0; i < y.haigushaHonnin.length; i++) if (honnin <= y.haigushaHonnin[i]) return i;
    return -1;
  }

  // 配偶者特別控除の額（314条の2 第1項10号の2）。col: 0=900 万以下, 1=950 万以下, 2=1,000 万以下
  function haigushaTokubetsuAmount(s, col) {
    var base;
    if (s <= 1000000) base = 330000;
    else if (s <= 1300000) {
      // 38 万円 −（93 万 1 円を超える部分。5 万円の整数倍 − 3 万円 の形でなければ、その形で超えない最も多い額）
      var e = s - 930001;
      base = 380000 - (Math.floor((e + 30000) / 50000) * 50000 - 30000);
    } else base = 30000;
    if (col === 1) return Math.ceil(base * 2 / 3 / 10000) * 10000;   // 3 分の 2（1 万円未満切り上げ）
    if (col === 2) return Math.ceil(base / 3 / 10000) * 10000;       // 3 分の 1（同）
    return base;
  }

  // 特定親族特別控除の額（314条の2 第1項12号）
  function tokuteiShinzokuAmount(s) {
    if (s <= 950000) return 450000;
    if (s <= 1150000) {
      // 63 万円 − 2 ×（84 万 1 円を超える部分）（10 万円の整数倍 − 8 万円 の形でなければ、その形で超えない最も多い額）
      var t = 2 * (s - 840001);
      return 630000 - (Math.floor((t + 80000) / 100000) * 100000 - 80000);
    }
    if (s <= 1200000) return 60000;
    if (s <= 1230000) return 30000;
    return 0;
  }

  // 配偶者。戻り値 { kind, amount, note, spouseShotoku, dokyo（同一生計配偶者か）, chosei（人的控除の差） }
  function haigushaKojo(honnin, spouse, nendo) {
    var y = JV.nendo[nendo];
    if (!spouse || !spouse.has) return { kind: null, amount: 0, note: '配偶者なし', dokyo: false, chosei: 0 };
    var s = relativeShotoku(spouse, nendo);
    var col = colOf(honnin, y);
    var out = { kind: null, amount: 0, spouseShotoku: s, dokyo: s <= y.fuyoLimit, chosei: 0, note: '' };
    if (s <= y.fuyoLimit) {
      if (col < 0) { out.note = '配偶者の合計所得金額 ' + yen(s) + '。本人の合計所得金額が1,000万円を超えるため配偶者控除はなし（非課税の人数には入る）'; return out; }
      out.kind = 'haigusha';
      out.amount = (spouse.over70 ? y.haigushaRojin : y.haigusha)[col];
      out.chosei = (spouse.over70 ? y.chosei.diff.haigushaRojin : y.chosei.diff.haigusha)[col];
      out.note = '配偶者の合計所得金額 ' + yen(s) + '（' + man(y.fuyoLimit) + '以下）' + (spouse.over70 ? '・70歳以上' : '');
      return out;
    }
    if (s > y.haigushaTokubetsuMax || col < 0) {
      out.note = '配偶者の合計所得金額 ' + yen(s) + (col < 0 ? '。本人の合計所得金額が1,000万円を超えるため対象外' : '（133万円超は対象外）');
      return out;
    }
    out.kind = 'tokubetsu';
    out.amount = haigushaTokubetsuAmount(s, col);
    out.note = '配偶者の合計所得金額 ' + yen(s) + '（' + man(y.fuyoLimit) + '超133万円以下）';
    return out;
  }

  var AGE_LABEL = { 'u16': '16歳未満', '16-18': '16〜18歳', '19-22': '19〜22歳', '23-69': '23〜69歳', '70': '70歳以上', '70dokyo': '70歳以上（同居老親等）' };

  function shogaiAmount(kind, y) {
    return kind === 'ippan' ? y.shogai.ippan : kind === 'tokubetsu' ? y.shogai.tokubetsu : kind === 'dokyo' ? y.shogai.dokyoTokubetsu : 0;
  }
  function shogaiDiff(kind, y) {
    var d = y.chosei.diff;
    return kind === 'ippan' ? d.shogai : kind === 'tokubetsu' ? d.tokubetsuShogai : kind === 'dokyo' ? d.dokyoTokubetsu : 0;
  }

  // 扶養親族・特定親族を 1 人ずつ判定する
  function relativesKojo(list, nendo) {
    var y = JV.nendo[nendo];
    var out = { fuyo: 0, tokutei: 0, shogai: 0, chosei: 0, count: 0, lines: [] };
    (list || []).forEach(function (p, i) {
      var s = relativeShotoku(p, nendo);
      var line = { label: (i + 1) + '人目（' + (AGE_LABEL[p.age] || '') + '）', shotoku: s, fuyo: 0, tokutei: 0, shogai: 0, chosei: 0, counted: false, note: '' };
      if (s <= y.fuyoLimit) {
        // 扶養親族（16 歳未満は扶養控除なし。非課税の人数・障害者控除には入る）
        line.counted = true;
        var k = p.age === '16-18' || p.age === '23-69' ? 'ippan' : p.age === '19-22' ? 'tokutei' : p.age === '70' ? 'rojin' : p.age === '70dokyo' ? 'dokyoRoshin' : null;
        line.fuyo = k ? y.fuyo[k] : 0;
        line.chosei = k ? y.chosei.diff.fuyo[k] : 0;
        line.note = p.age === 'u16' ? '16歳未満（扶養控除なし・非課税の人数には入る）'
          : p.age === '19-22' ? '特定扶養親族' : (p.age === '70' || p.age === '70dokyo') ? '老人扶養親族' : '一般の控除対象扶養親族';
        line.shogai = shogaiAmount(p.shogai, y);
        line.chosei += shogaiDiff(p.shogai, y);
      } else if (p.age === '19-22') {
        line.tokutei = tokuteiShinzokuAmount(s);
        line.note = line.tokutei > 0 ? '特定親族（所得 ' + man(y.fuyoLimit) + '超123万円以下）' : '所得が123万円を超えるため対象外';
      } else {
        line.note = '所得が' + man(y.fuyoLimit) + 'を超えるため扶養親族にならない';
      }
      out.fuyo += line.fuyo; out.tokutei += line.tokutei; out.shogai += line.shogai; out.chosei += line.chosei;
      if (line.counted) out.count++;
      out.lines.push(line);
    });
    return out;
  }

  // --- 非課税限度額 ---
  // n = 同一生計配偶者＋扶養親族（16 歳未満を含む）の人数
  function shotokuwariLimit(n, nendo) {
    var h = JV.nendo[nendo].hikazei.shotokuwari;
    return h.base * (n + 1) + h.add + (n > 0 ? h.fuyoAdd : 0);
  }
  function kintowariLimit(n, kyuchi, nendo) {
    var h = JV.nendo[nendo].hikazei;
    var r = h.kyuchi[kyuchi] || 1;
    return Math.round(h.kintowari.base * r) * (n + 1) + h.kintowari.add + (n > 0 ? Math.round(h.kintowari.fuyoAdd * r) : 0);
  }
  // 合計所得金額 limit 以下になる給与の収入の上限（給与だけの人の目安）
  function incomeLine(limit, nendo) {
    if (kyuyoShotoku(0, nendo).value > limit) return -1;
    var lo = 0, hi = MAX_INCOME;
    while (lo < hi) {
      var mid = Math.floor((lo + hi + 1) / 2);
      if (kyuyoShotoku(mid, nendo).value <= limit) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // --- 税率など（標準か、自分で直した値か） ---
  function rates(d, nendo) {
    var y = JV.nendo[nendo];
    var kind = d.city.shitei ? 'shitei' : 'normal';
    var std = y.rate[kind];
    var custom = d.city.custom;
    return {
      kind: kind,
      pref: custom ? d.city.prefRate : std.pref,
      city: custom ? d.city.cityRate : std.city,
      prefKinto: custom ? d.city.prefKinto : y.kinto.pref,
      cityKinto: custom ? d.city.cityKinto : y.kinto.city,
      custom: custom,
    };
  }
  // 課税所得 × 税率（%。小数 3 桁まで）を 1 円未満切り捨て
  function mulRate(taxable, pct) {
    return Math.floor(taxable * Math.round(pct * 1000) / 100000);
  }

  // 月々の納め方
  // 特別徴収（給与から引く）: 年税額の 12 分の 1 を 6 月〜翌年 5 月。100 円未満の端数は 6 月（地方税法 321条の5・20条の4の2 第6項・第8項）
  // 普通徴収（自分で納める）: 6・8・10・1 月の 4 回。1,000 円未満の端数は 6 月（320条・20条の4の2 第6項）。均等割だけのときは 6 月の 1 回
  function installments(total, kintoOnly) {
    var m = Math.floor(total / 12 / 100) * 100;
    var q = Math.floor(total / 4 / 1000) * 1000;
    return {
      tokubetsu: { first: total - m * 11, rest: m },
      futsu: kintoOnly ? { first: total, rest: 0, count: 1 } : { first: total - q * 3, rest: q, count: 4 },
    };
  }

  /**
   * 住民税を計算する
   * @param {object} input normalizeInput() を通した入力
   * @param {number} nendo 2027（令和9年度）/ 2026（令和8年度）
   */
  function calc(input, nendo) {
    var y = JV.nendo[nendo];
    var d = normalizeInput(input);
    var steps = [];
    var push = function (key, label, amount, rule, sub) { steps.push({ key: key, label: label, amount: amount, rule: rule || '', sub: !!sub }); };
    var R = rates(d, nendo);

    var k = kyuyoShotoku(d.income, nendo);
    push('income', '給与の収入金額（' + y.incomeLabel + '）', d.income, '入力した金額');
    push('kyuyo', '給与所得', k.value, y.incomeLabel + '分の「給与所得控除後の給与等の金額の表」（国税庁）: ' + k.rule);
    var goukei = k.value;   // 給与のほかに所得がない前提で、合計所得金額 = 総所得金額 = 給与所得

    // --- 所得控除 ---
    var rel = relativesKojo(d.relatives, nendo);
    var sei = seimeiKojo(d.seimei, nendo);
    var ji = jishinKojo(d.jishin, nendo);
    var hai = haigushaKojo(goukei, d.spouse, nendo);
    var spouseShogai = 0, spouseShogaiDiff = 0;
    if (hai.dokyo) { spouseShogai = shogaiAmount(d.spouse.shogai, y); spouseShogaiDiff = shogaiDiff(d.spouse.shogai, y); }
    var selfShogai = shogaiAmount(d.self.shogai, y);
    var kafu = 0, kafuNote = '', kafuDiff = 0;
    var kafuOk = d.self.kafu !== 'none' && goukei <= y.kafuIncomeLimit;
    if (d.self.kafu !== 'none') {
      if (kafuOk) {
        kafu = d.self.kafu === 'hitorioya' ? y.hitorioya : y.kafu;
        kafuDiff = d.self.kafu === 'hitorioya' ? (d.self.parent === 'father' ? y.chosei.diff.hitorioyaFather : y.chosei.diff.hitorioyaMother) : y.chosei.diff.kafu;
      } else kafuNote = '本人の合計所得金額が500万円を超えるため対象外';
    }
    var kinro = 0, kinroNote = '';
    if (d.self.kinro) {
      if (goukei <= y.kinroLimit) kinro = y.kinro;
      else kinroNote = '本人の合計所得金額が' + man(y.kinroLimit) + 'を超えるため対象外';
    }
    var kiso = band(y.kiso, goukei, 0);
    var shogaiTotal = selfShogai + spouseShogai + rel.shogai;

    var items = [
      ['shakai', '社会保険料控除', d.shakai, '入力した金額（全額）'],
      ['shokibo', '小規模企業共済等掛金控除', d.shokibo, '入力した金額（全額）'],
      ['seimei', '生命保険料控除', sei.total, '一般 ' + yen(sei.ippan) + '・介護医療 ' + yen(sei.kaigo) + '・個人年金 ' + yen(sei.nenkin) + '（各2万8千円（旧だけなら3万5千円）まで、合計7万円まで）'],
      ['jishin', '地震保険料控除', ji, '地震保険料の2分の1（2万5千円まで）、旧長期損害保険料は1万円まで、合計2万5千円まで'],
      ['haigusha', hai.kind === 'tokubetsu' ? '配偶者特別控除' : '配偶者控除', hai.amount, hai.note + (d.spouse.has ? '。本人の合計所得金額 ' + yen(goukei) : '')],
      ['tokutei', '特定親族特別控除', rel.tokutei, '19〜22歳で所得が' + man(y.fuyoLimit) + '超123万円以下の親族 1人ごと（45万円〜3万円）'],
      ['fuyo', '扶養控除', rel.fuyo, '一般33万・特定45万・老人38万・同居老親等45万（1人ごと）'],
      ['shogai', '障害者控除', shogaiTotal, '一般26万・特別30万・同居特別53万（本人・同一生計配偶者・扶養親族 1人ごと）'],
      ['kafu', d.self.kafu === 'hitorioya' ? 'ひとり親控除' : '寡婦控除', kafu, kafuNote || (d.self.kafu === 'none' ? '該当なし' : '本人の合計所得金額500万円以下（寡婦26万・ひとり親' + man(y.hitorioya) + '）')],
      ['kinro', '勤労学生控除', kinro, kinroNote || (d.self.kinro ? '本人の合計所得金額' + man(y.kinroLimit) + '以下' : '該当なし')],
      ['kiso', '基礎控除', kiso, '本人の合計所得金額 2,400万円以下は43万円'],
    ];
    var kojo = 0;
    items.forEach(function (it) { kojo += it[2]; push(it[0], it[1], it[2], it[3], true); });
    push('kojo', '所得控除の合計', kojo, '上の控除の合計（住民税の額）');

    var taxable = Math.max(0, Math.floor((goukei - kojo) / 1000) * 1000);
    push('taxable', '課税総所得金額', taxable, '給与所得 − 所得控除の合計（1,000円未満切り捨て）');

    // --- 非課税の判定 ---
    var n = (hai.dokyo ? 1 : 0) + rel.count;          // 同一生計配偶者＋扶養親族（16 歳未満を含む）
    var sLimit = shotokuwariLimit(n, nendo);
    var kLimit = kintowariLimit(n, d.city.kyuchi, nendo);
    var special = null;
    if (d.self.seikatsuhogo) special = '生活保護法による生活扶助を受けている';
    else if (goukei <= y.hikazei.tokubetsu && (d.self.shogai !== 'none' || d.self.minor || kafuOk)) {
      var who = d.self.shogai !== 'none' ? '障害者' : d.self.minor ? '未成年者' : d.self.kafu === 'hitorioya' ? 'ひとり親' : '寡婦';
      special = who + 'で、合計所得金額が135万円以下（' + yen(goukei) + '）';
    }

    // --- 所得割 ---
    var prefRaw = mulRate(taxable, R.pref), cityRaw = mulRate(taxable, R.city);
    var ck = y.chosei, cpct = ck.pct[R.kind];
    var diffSum = ck.base + hai.chosei + rel.chosei + spouseShogaiDiff + shogaiDiff(d.self.shogai, y) + kafuDiff + (kinro ? ck.diff.kinro : 0);
    var choseiBase = 0;
    if (goukei <= ck.honninLimit && taxable > 0) {
      choseiBase = taxable <= ck.line ? Math.min(diffSum, taxable) : Math.max(diffSum - (taxable - ck.line), ck.base);
    }
    var choseiPref = Math.min(Math.floor(choseiBase * cpct.pref / 100), prefRaw);
    var choseiCity = Math.min(Math.floor(choseiBase * cpct.city / 100), cityRaw);
    var prefA = prefRaw - choseiPref, cityA = cityRaw - choseiCity;   // 調整控除後（ふるさと納税の上限に使う）

    // 住宅借入金等特別税額控除（所得税から引ききれなかった分）
    var jutaku = { pref: 0, city: 0, left: 0, note: '' };
    var nen = null;
    if (d.jutaku.amount > 0 || nendo === JV.CURRENT) {
      nen = N.calc(nenmatsuInput(d), y.taxYear);
    }
    if (d.jutaku.amount > 0) {
      if (!nen || !nen.ok) {
        jutaku.note = '給与の収入が2,000万円を超えるため、所得税の額を計算できず住宅ローン控除は入れていません';
      } else {
        jutaku.left = Math.max(0, d.jutaku.amount - nen.sanshutsu);
        var tok = d.jutaku.tokutei && (d.jutaku.year === 'h26_27' || d.jutaku.year === 'h28_r3');
        var base = nen.taxable;
        if (d.jutaku.year === 'h28_r3' || d.jutaku.year === 'r4_r7') base += Math.max(0, N.kisoKojo(goukei, y.taxYear) - y.jutaku.kisoMinus);
        var caps = (tok ? y.jutaku.tokutei : y.jutaku.normal)[R.kind];
        var share = y.jutaku.share[R.kind];
        var capP = Math.min(Math.floor(base * caps.pref[0] / 100), caps.pref[1]);
        var capC = Math.min(Math.floor(base * caps.city[0] / 100), caps.city[1]);
        jutaku.pref = Math.min(Math.floor(jutaku.left * share.pref / 5), capP, prefA);
        jutaku.city = Math.min(Math.floor(jutaku.left * share.city / 5), capC, cityA);
        jutaku.cap = capP + capC;
        jutaku.note = '所得税で引ききれなかった ' + yen(jutaku.left) + '（控除額 ' + yen(d.jutaku.amount) + ' − ' + nen.label + 'の算出所得税額 ' + yen(nen.sanshutsu) + '）のうち、上限 ' + yen(capP + capC) +
          '（所得税の課税総所得金額等' + (base !== nen.taxable ? '＋基礎控除の調整' : '') + ' ' + yen(base) + ' × ' + (tok ? '7' : '5') + '%、' + (tok ? '13万6,500円' : '9万7,500円') + 'まで）まで';
      }
    }
    var prefB = prefA - jutaku.pref, cityB = cityA - jutaku.city;

    // 所得割の非課税と、限度額のすぐ上の人の減額（附則3条の3）
    var shotokuHikazei = !!special || goukei <= sLimit;
    var genKei = 0;
    if (!shotokuHikazei && prefB + cityB > 0) {
      var over = sLimit - (goukei - (prefB + cityB));
      if (over > 0) {
        genKei = over;
        var gp = over * prefB / (prefB + cityB);
        prefB = prefB - gp; cityB = cityB - (over - gp);
      }
    }
    var prefWari = shotokuHikazei ? 0 : Math.floor(Math.max(0, prefB) / 100) * 100;
    var cityWari = shotokuHikazei ? 0 : Math.floor(Math.max(0, cityB) / 100) * 100;
    var wari = prefWari + cityWari;

    // --- 均等割・森林環境税 ---
    var kintoHikazei = !!special || (wari === 0 && goukei <= kLimit);
    var prefKinto = kintoHikazei ? 0 : R.prefKinto;
    var cityKinto = kintoHikazei ? 0 : R.cityKinto;
    var shinrin = kintoHikazei ? 0 : y.shinrin;
    var total = wari + prefKinto + cityKinto + shinrin;

    // 途中の計算（所得割）
    push('prefRaw', '道府県民税の所得割（調整控除の前）', prefRaw, '課税総所得金額 × ' + pctStr(R.pref) + '（1円未満切り捨て）', true);
    push('cityRaw', '市町村民税の所得割（調整控除の前）', cityRaw, '課税総所得金額 × ' + pctStr(R.city) + '（1円未満切り捨て）', true);
    push('chosei', '調整控除', choseiPref + choseiCity,
      taxable === 0 ? '課税総所得金額が0円のためなし'
        : goukei > ck.honninLimit ? '合計所得金額が2,500万円を超えるためなし'
          : '人的控除の差 ' + yen(diffSum) + (taxable <= ck.line ? ' と課税総所得金額の少ないほう' : ' −（課税総所得金額 − 200万円）（5万円が下限）') + ' = ' + yen(choseiBase) +
            ' × ' + (cpct.pref + cpct.city) + '%（道府県 ' + cpct.pref + '%・市町村 ' + cpct.city + '%）', true);
    if (d.jutaku.amount > 0) push('jutaku', '住宅借入金等特別税額控除', jutaku.pref + jutaku.city, jutaku.note, true);
    if (genKei > 0) push('gen', '非課税限度額に近い人の減額', Math.round(genKei), '所得割の非課税限度額 ' + yen(sLimit) + ' を、所得から所得割を引いた額が下回らないように減らす（地方税法附則3条の3）', true);
    push('wari', '所得割（道府県民税 ' + yen(prefWari) + '・市町村民税 ' + yen(cityWari) + '）', wari,
      shotokuHikazei ? '非課税' : '道府県民税・市町村民税それぞれ100円未満切り捨て');
    push('kinto', '均等割（道府県民税 ' + yen(prefKinto) + '・市町村民税 ' + yen(cityKinto) + '）', prefKinto + cityKinto, kintoHikazei ? '非課税' : (R.custom ? '入力した金額' : '標準の税率'));
    push('shinrin', '森林環境税（国税）', shinrin, kintoHikazei ? '非課税' : '均等割と一緒に納める（1,000円）');
    push('total', '年税額（' + y.label + '）', total, '所得割 ＋ 均等割 ＋ 森林環境税');

    // 非課税の理由
    var kLine = incomeLine(kLimit, nendo), sLine = incomeLine(sLimit, nendo);
    var reasons = {
      shotoku: special ? special + 'ため非課税'
        : shotokuHikazei ? '合計所得金額 ' + yen(goukei) + ' が所得割の非課税限度額 ' + yen(sLimit) + ' 以下のため非課税'
          : '合計所得金額 ' + yen(goukei) + ' が所得割の非課税限度額 ' + yen(sLimit) + ' を超えるため課税' + (wari === 0 ? '（ただし控除で所得割は0円）' : ''),
      kinto: special ? special + 'ため非課税'
        : kintoHikazei ? '合計所得金額 ' + yen(goukei) + ' が均等割の非課税限度額 ' + yen(kLimit) + '（' + d.city.kyuchi + '級地の基準）以下のため非課税'
          : wari > 0 ? '所得割がかかるため課税' : '合計所得金額 ' + yen(goukei) + ' が均等割の非課税限度額 ' + yen(kLimit) + '（' + d.city.kyuchi + '級地の基準）を超えるため課税',
    };

    // ふるさと納税の上限の目安（今の年度だけ。自己負担 2,000 円で済む寄附額）
    var furusato = null;
    if (nendo === JV.CURRENT && prefA + cityA > 0 && nen && nen.ok && !special && !shotokuHikazei) {
      var f = y.furusato;
      var shotokuKiso = N.kisoKojo(goukei, y.taxYear);
      var adj = diffSum + Math.max(0, shotokuKiso - f.kisoMinus);
      var rest = taxable - adj;
      var ratio = rest < 0 ? f.below0 : band(f.table, rest, f.table[f.table.length - 1][1]);
      var share2 = y.jutaku.share[R.kind];
      var lp = prefA * f.capPct / 100 / (ratio / 100 * share2.pref / 5);
      var lc = cityA * f.capPct / 100 / (ratio / 100 * share2.city / 5);
      var limit = Math.floor(Math.min(lp, lc)) + f.jiko;
      furusato = {
        limit: limit, ratio: ratio, adj: adj, rest: rest, base: prefA + cityA,
        rule: '所得割（調整控除後）' + yen(prefA + cityA) + ' × 20% ÷ 特例控除の割合 ' + ratio + '%（課税総所得金額 − 人的控除差調整額 ' + yen(adj) +
          (rest < 0 ? ' が0円を下回るので 90%' : ' = ' + yen(rest) + ' で決まる割合') + '）＋ 2,000円',
      };
    }

    var inst = installments(total, wari === 0);

    return {
      ok: true, nendo: nendo, label: y.label, incomeLabel: y.incomeLabel, y: y,
      steps: steps, rates: R,
      kyuyoShotoku: k.value, goukei: goukei, kojo: kojo, taxable: taxable,
      haigusha: hai, relatives: rel, seimei: sei, jishin: ji, kiso: kiso,
      count: n, shotokuLimit: sLimit, kintoLimit: kLimit, shotokuLine: sLine, kintoLine: kLine,
      special: special, shotokuHikazei: shotokuHikazei, kintoHikazei: kintoHikazei, reasons: reasons,
      prefRaw: prefRaw, cityRaw: cityRaw, choseiBase: choseiBase, choseiPref: choseiPref, choseiCity: choseiCity, diffSum: diffSum,
      prefAfterChosei: prefA, cityAfterChosei: cityA, jutaku: jutaku, genKei: genKei,
      prefWari: prefWari, cityWari: cityWari, wari: wari,
      prefKinto: prefKinto, cityKinto: cityKinto, shinrin: shinrin, total: total,
      installments: inst, furusato: furusato,
      pref: prefWari + prefKinto, city: cityWari + cityKinto,
      choseiMaybe: d.income > 8500000 && (rel.lines.some(function (l, i) { var a = d.relatives[i].age; return l.counted && (a === 'u16' || a === '16-18' || a === '19-22'); }) ||
        d.self.shogai === 'tokubetsu' || d.spouse.shogai === 'tokubetsu' || d.spouse.shogai === 'dokyo' || d.relatives.some(function (p) { return p.shogai === 'tokubetsu' || p.shogai === 'dokyo'; })),
    };
  }

  // 年末調整（所得税）の計算に渡す形に直す（住宅ローン控除・ふるさと納税の上限に使う）
  function nenmatsuInput(d) {
    return {
      income: Math.min(d.income, 20000000), withheld: 0, shakai: d.shakai, shokibo: d.shokibo,
      seimei: d.seimei, jishin: d.jishin, spouse: d.spouse, relatives: d.relatives,
      self: { shogai: d.self.shogai, kafu: d.self.kafu, kinro: d.self.kinro }, jutaku: 0,
    };
  }

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す） ---
  function num(v, max) {
    var n = Math.floor(Number(String(v === undefined || v === null ? '' : v).replace(/[,，\s円]/g, '')));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max || 1e10);
  }
  function pct(v, def) {
    var t = String(v === undefined || v === null ? '' : v).replace(/[%％\s]/g, '');
    var n = Number(t);
    if (t === '' || !isFinite(n) || n < 0) return def;
    return Math.min(Math.round(n * 1000) / 1000, 20);
  }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  var SHOGAI = ['none', 'ippan', 'tokubetsu', 'dokyo'];
  var AGES = ['u16', '16-18', '19-22', '23-69', '70', '70dokyo'];
  var INCOME_TYPES = ['kyuyo', 'shotoku'];
  var JUTAKU_YEARS = ['h26_27', 'h28_r3', 'r4_r7', 'r8'];

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var se = r.seimei || {}, ji = r.jishin || {}, sp = r.spouse || {}, sf = r.self || {}, ju = r.jutaku || {}, ct = r.city || {};
    var shitei = !!ct.shitei;
    var std = JV.nendo[JV.CURRENT];
    var sr = std.rate[shitei ? 'shitei' : 'normal'];
    return {
      income: num(r.income, MAX_INCOME),
      shakai: num(r.shakai), shokibo: num(r.shokibo),
      seimei: { newIppan: num(se.newIppan), oldIppan: num(se.oldIppan), kaigo: num(se.kaigo), newNenkin: num(se.newNenkin), oldNenkin: num(se.oldNenkin) },
      jishin: { jishin: num(ji.jishin), oldLong: num(ji.oldLong) },
      spouse: {
        has: !!sp.has, incomeType: pick(sp.incomeType, INCOME_TYPES, 'kyuyo'), amount: num(sp.amount),
        over70: !!sp.over70, shogai: pick(sp.shogai, SHOGAI, 'none'),
      },
      relatives: (Array.isArray(r.relatives) ? r.relatives : []).slice(0, 20).map(function (p) {
        p = p && typeof p === 'object' ? p : {};
        return { age: pick(p.age, AGES, '23-69'), incomeType: pick(p.incomeType, INCOME_TYPES, 'kyuyo'), amount: num(p.amount), shogai: pick(p.shogai, SHOGAI, 'none') };
      }),
      self: {
        shogai: pick(sf.shogai, ['none', 'ippan', 'tokubetsu'], 'none'),
        kafu: pick(sf.kafu, ['none', 'kafu', 'hitorioya'], 'none'),
        parent: pick(sf.parent, ['mother', 'father'], 'mother'),
        kinro: !!sf.kinro, minor: !!sf.minor, seikatsuhogo: !!sf.seikatsuhogo,
      },
      jutaku: { amount: num(ju.amount), year: pick(ju.year, JUTAKU_YEARS, 'r4_r7'), tokutei: !!ju.tokutei },
      city: {
        shitei: shitei,
        kyuchi: pick(Number(ct.kyuchi), [1, 2, 3], 1),
        custom: !!ct.custom,
        prefRate: pct(ct.prefRate, sr.pref), cityRate: pct(ct.cityRate, sr.city),
        prefKinto: ct.prefKinto === undefined || ct.prefKinto === '' ? std.kinto.pref : num(ct.prefKinto, 100000),
        cityKinto: ct.cityKinto === undefined || ct.cityKinto === '' ? std.kinto.city : num(ct.cityKinto, 100000),
      },
    };
  }

  // 年末調整の計算（seido-keisan_nenmatsu_draft）の入力を、この計算の入力に写す（市区町村の設定は今のまま）
  function fromNenmatsu(nen, current) {
    var n = N.normalizeInput(nen);
    var c = normalizeInput(current);
    return normalizeInput({
      income: n.income, shakai: n.shakai, shokibo: n.shokibo, seimei: n.seimei, jishin: n.jishin,
      spouse: n.spouse, relatives: n.relatives,
      self: { shogai: n.self.shogai, kafu: n.self.kafu, kinro: n.self.kinro, parent: c.self.parent, minor: c.self.minor, seikatsuhogo: c.self.seikatsuhogo },
      jutaku: { amount: n.jutaku, year: c.jutaku.year, tokutei: c.jutaku.tokutei },
      city: c.city,
    });
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（住民税の計算）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    kyuyoShotoku: kyuyoShotoku, relativeShotoku: relativeShotoku,
    seimeiKojo: seimeiKojo, jishinKojo: jishinKojo, haigushaKojo: haigushaKojo, relativesKojo: relativesKojo,
    haigushaTokubetsuAmount: haigushaTokubetsuAmount, tokuteiShinzokuAmount: tokuteiShinzokuAmount,
    shotokuwariLimit: shotokuwariLimit, kintowariLimit: kintowariLimit, incomeLine: incomeLine,
    installments: installments, calc: calc,
    normalizeInput: normalizeInput, fromNenmatsu: fromNenmatsu, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (isNode) module.exports = api;
  else root.Juminzei = api;
})(this);
