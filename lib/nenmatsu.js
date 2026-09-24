// ===========================
// 年末調整の計算（画面から切り離した純粋関数）
// 手順は国税庁「年末調整のしかた」の「年税額の計算」のとおり:
//   給与所得控除後の給与等の金額（表）→ 所得控除の合計 → 課税給与所得金額（1,000 円未満切り捨て）
//   → 算出所得税額（速算表）→ 住宅借入金等特別控除 → 年調所得税額 × 102.1%（100 円未満切り捨て）= 年調年税額
//   → 源泉徴収された税額との差（還付・不足）
// 値は lib/tax2026.js（年ごと）にだけ置く。DOM や localStorage には触らない。
// ブラウザでは window.Nenmatsu、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var TAX = (typeof module !== 'undefined' && module.exports) ? require('./tax2026.js') : root.TaxValues;

  var TOOL_ID = 'seido-keisan-nenmatsu';
  var FILE_VERSION = 1;

  function yen(n) { return Number(n).toLocaleString('ja-JP') + '円'; }
  function man(n) { return (n / 10000).toLocaleString('ja-JP') + '万円'; }

  // --- 給与所得控除後の給与等の金額（PDF から取り出した表で引く） ---
  // 戻り値 { value, rule } 。表の範囲（2,000 万円）を超えたら null
  function kyuyoShotoku(income, year) {
    var t = TAX.years[year].kyuyoTable;
    var x = Math.floor(Math.max(0, Number(income) || 0));
    if (x > t.max) return null;
    if (x === t.exact[0]) return { value: t.exact[1], rule: yen(t.exact[0]) + 'の行' };
    if (x < t.zeroBelow) return { value: 0, rule: yen(t.zeroBelow) + '未満は 0' };
    var f = findFormula(t.formulasBelow, x) || findFormula(t.formulasAbove, x);
    if (f) {
      var pct = Math.round(f.rate * 100);
      var v = Math.floor(x * pct / 100) - f.minus;
      return {
        value: v,
        rule: yen(f.from) + '以上' + yen(f.to) + '未満は' + (pct === 100 ? '' : '給与の' + pct + '%から') + yen(f.minus) + 'を引いた金額（表の式）',
      };
    }
    // 表の行を二分探索（rows は以上の昇順で、すきまなくつながっている）
    var rows = t.rows, lo = 0, hi = rows.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, r = rows[mid];
      if (x < r[0]) hi = mid - 1;
      else if (x >= r[1]) lo = mid + 1;
      else return { value: r[2], rule: '表の ' + yen(r[0]) + '以上' + yen(r[1]) + '未満の行' };
    }
    return null;
  }
  function findFormula(list, x) {
    for (var i = 0; i < list.length; i++) if (x >= list[i].from && x < list[i].to) return list[i];
    return null;
  }

  // 家族の「合計所得金額」を求める（給与の収入で入れたときは、その年の表で給与所得にする）
  function relativeShotoku(p, year) {
    var amount = Math.max(0, Number(p && p.amount) || 0);
    if (p && p.incomeType === 'shotoku') return amount;
    var k = kyuyoShotoku(Math.min(amount, TAX.years[year].kyuyoTable.max), year);
    return amount > TAX.years[year].kyuyoTable.max ? amount - 1950000 : k.value;
  }

  // --- 各控除 ---
  // 表の段階から引く: bands = [[この額以下, 値], ...]。超えたら fallback
  function band(bands, x, fallback) {
    for (var i = 0; i < bands.length; i++) if (x <= bands[i][0]) return bands[i][1];
    return fallback;
  }

  function kisoKojo(goukei, year) {
    return band(TAX.years[year].kiso, goukei, 0);
  }

  // 生命保険料の計算式（1 円未満切り上げ）
  function shiki(amount, s) {
    var a = Math.max(0, Math.floor(Number(amount) || 0));
    if (a === 0) return 0;
    for (var i = 0; i < s.bands.length; i++) {
      if (a <= s.bands[i][0]) return Math.ceil(a * s.bands[i][1] + s.bands[i][2]);
    }
    return s.cap;
  }

  /**
   * 生命保険料控除
   * @param {object} p { newIppan, oldIppan, kaigo, newNenkin, oldNenkin }
   * @param {boolean} hasU23 年齢 23 歳未満の扶養親族がいるか
   */
  function seimeiKojo(p, hasU23, year) {
    var s = TAX.years[year].seimei;
    var u23 = hasU23 && s.u23Special;
    var n = shiki(p.newIppan, u23 ? s.shiki2 : s.shiki1);
    var o = shiki(p.oldIppan, s.shiki3);
    var both = (n > 0 && o > 0) ? Math.min(n + o, u23 ? s.bothCapU23 : s.bothCap) : 0;
    var ippan = Math.max(n, o, both);
    var kaigo = shiki(p.kaigo, s.shiki1);
    var nn = shiki(p.newNenkin, s.shiki1);
    var on = shiki(p.oldNenkin, s.shiki3);
    var nb = (nn > 0 && on > 0) ? Math.min(nn + on, s.bothCap) : 0;
    var nenkin = Math.max(nn, on, nb);
    return { ippan: ippan, kaigo: kaigo, nenkin: nenkin, total: Math.min(ippan + kaigo + nenkin, s.total), u23: u23 };
  }

  // 地震保険料控除（1 円未満切り上げ）
  function jishinKojo(p, year) {
    var j = TAX.years[year].jishin;
    var a = Math.min(Math.max(0, Math.floor(Number(p.jishin) || 0)), j.cap);
    var b = shiki(p.oldLong, j.oldLong);
    return Math.min(a + b, j.total);
  }

  // 配偶者控除・配偶者特別控除。戻り値 { kind: 'haigusha'|'tokubetsu'|null, amount, note }
  function haigushaKojo(honnin, spouse, year) {
    var y = TAX.years[year];
    if (!spouse || !spouse.has) return { kind: null, amount: 0, note: '' };
    var s = relativeShotoku(spouse, year);
    var col = -1;
    for (var i = 0; i < y.haigushaHonnin.length; i++) if (honnin <= y.haigushaHonnin[i]) { col = i; break; }
    if (col < 0) return { kind: null, amount: 0, note: '本人の合計所得金額が1,000万円を超えるため対象外', spouseShotoku: s };
    if (s <= y.fuyoLimit) {
      var amt = (spouse.over70 ? y.haigushaRojin : y.haigusha)[col];
      return { kind: 'haigusha', amount: amt, spouseShotoku: s, note: '配偶者の合計所得金額 ' + yen(s) + '（' + man(y.fuyoLimit) + '以下）' + (spouse.over70 ? '・70歳以上' : '') };
    }
    var row = band(y.haigushaTokubetsu, s, null);
    if (!row) return { kind: null, amount: 0, spouseShotoku: s, note: '配偶者の合計所得金額 ' + yen(s) + '（133万円超は対象外）' };
    return { kind: 'tokubetsu', amount: row[col], spouseShotoku: s, note: '配偶者の合計所得金額 ' + yen(s) + '（' + man(y.fuyoLimit) + '超133万円以下）' };
  }

  var AGE_LABEL = {
    'u16': '16歳未満', '16-18': '16〜18歳', '19-22': '19〜22歳', '23-69': '23〜69歳', '70': '70歳以上', '70dokyo': '70歳以上（同居老親等）',
  };

  /**
   * 扶養親族・特定親族を 1 人ずつ判定する
   * 戻り値 { fuyo, tokutei, shogai, hasU23, lines: [{label, fuyo, tokutei, shogai, note}] }
   */
  function relativesKojo(list, year) {
    var y = TAX.years[year];
    var out = { fuyo: 0, tokutei: 0, shogai: 0, hasU23: false, lines: [] };
    (list || []).forEach(function (p, i) {
      var s = relativeShotoku(p, year);
      var line = { label: (i + 1) + '人目（' + (AGE_LABEL[p.age] || '') + '）', shotoku: s, fuyo: 0, tokutei: 0, shogai: 0, note: '' };
      if (s <= y.fuyoLimit) {
        // 扶養親族（16 歳未満は扶養控除なし。障害者控除と 23 歳未満の判定には入る）
        line.fuyo = p.age === '16-18' || p.age === '23-69' ? y.fuyo.ippan
          : p.age === '19-22' ? y.fuyo.tokutei
            : p.age === '70' ? y.fuyo.rojin
              : p.age === '70dokyo' ? y.fuyo.dokyoRoshin : 0;
        line.note = p.age === 'u16' ? '16歳未満（扶養控除なし）'
          : p.age === '19-22' ? '特定扶養親族' : (p.age === '70' || p.age === '70dokyo') ? '老人扶養親族' : '一般の控除対象扶養親族';
        line.shogai = shogaiAmount(p.shogai, y);
        if (p.age === 'u16' || p.age === '16-18' || p.age === '19-22') out.hasU23 = true;
      } else if (p.age === '19-22') {
        var t = band(y.tokuteiShinzoku, s, 0);
        line.tokutei = t;
        line.note = t > 0 ? '特定親族（所得 ' + man(y.fuyoLimit) + '超123万円以下）' : '所得が123万円を超えるため対象外';
      } else {
        line.note = '所得が' + man(y.fuyoLimit) + 'を超えるため扶養親族にならない';
      }
      out.fuyo += line.fuyo; out.tokutei += line.tokutei; out.shogai += line.shogai;
      out.lines.push(line);
    });
    return out;
  }

  function shogaiAmount(kind, y) {
    return kind === 'ippan' ? y.shogai.ippan : kind === 'tokubetsu' ? y.shogai.tokubetsu : kind === 'dokyo' ? y.shogai.dokyoTokubetsu : 0;
  }

  function sokusan(taxable, year) {
    var t = TAX.years[year].sokusan;
    for (var i = 0; i < t.length; i++) {
      if (taxable <= t[i][0]) return { value: Math.floor(taxable * t[i][1] / 100) - t[i][2], pct: t[i][1], minus: t[i][2] };
    }
    return null;
  }

  // 所得金額調整控除（画面では使わない。国税庁の設例を再現するテスト用）
  function choseiKojo(income, year) {
    var c = TAX.years[year].chosei;
    if (income <= c.from) return 0;
    return Math.ceil((Math.min(income, c.capIncome) - c.from) * c.pct / 100);
  }

  /**
   * 年末調整を計算する
   * @param {object} input normalizeInput() を通した入力
   * @param {number} year 2026（令和8年分）/ 2025（令和7年分）
   * @param {object} [opt] { chosei: true } で所得金額調整控除を入れる（設例の再現用）
   * @returns {object} { ok, error?, steps: [{key,label,amount,rule,sub?}], ... }
   */
  function calc(input, year, opt) {
    var y = TAX.years[year];
    var d = normalizeInput(input);
    opt = opt || {};
    var steps = [];
    var push = function (key, label, amount, rule, sub) { steps.push({ key: key, label: label, amount: amount, rule: rule || '', sub: !!sub }); };

    if (d.income > y.maxIncome) {
      return { ok: false, error: 'income', message: '給与の収入金額が2,000万円を超える人は年末調整の対象外です（確定申告で精算します）。' };
    }

    var k = kyuyoShotoku(d.income, year);
    push('income', '給与の収入金額', d.income, '入力した金額');
    push('kyuyo', '給与所得控除後の給与等の金額', k.value, y.label + 'の「給与所得控除後の給与等の金額の表」: ' + k.rule);
    var shotoku = k.value;
    if (opt.chosei) {
      var ch = choseiKojo(d.income, year);
      shotoku = k.value - ch;
      push('chosei', '所得金額調整控除', ch, '（給与の総額 − 850万円）× 10%');
    }
    var goukei = shotoku;   // 給与のほかに所得がない前提で、本人の合計所得金額 = 給与所得

    // 所得控除
    var rel = relativesKojo(d.relatives, year);
    var sei = seimeiKojo(d.seimei, rel.hasU23, year);
    var ji = jishinKojo(d.jishin, year);
    var hai = haigushaKojo(goukei, d.spouse, year);
    var spouseShogai = 0;
    if (d.spouse.has && hai.spouseShotoku !== undefined && hai.spouseShotoku <= y.fuyoLimit) spouseShogai = shogaiAmount(d.spouse.shogai, y);
    var selfShogai = shogaiAmount(d.self.shogai, y);
    var kafu = 0, kafuNote = '';
    if (d.self.kafu !== 'none') {
      if (goukei <= y.kafuIncomeLimit) kafu = d.self.kafu === 'hitorioya' ? y.hitorioya : y.kafu;
      else kafuNote = '本人の合計所得金額が500万円を超えるため対象外';
    }
    var kinro = 0, kinroNote = '';
    if (d.self.kinro) {
      if (goukei <= y.kinroLimit) kinro = y.kinro;
      else kinroNote = '本人の合計所得金額が' + man(y.kinroLimit) + 'を超えるため対象外';
    }
    var kiso = kisoKojo(goukei, year);
    var shogaiTotal = selfShogai + spouseShogai + rel.shogai;

    var items = [
      ['shakai', '社会保険料控除', d.shakai, '入力した金額（全額）'],
      ['shokibo', '小規模企業共済等掛金控除', d.shokibo, '入力した金額（全額）'],
      ['seimei', '生命保険料控除', sei.total,
        '一般 ' + yen(sei.ippan) + '・介護医療 ' + yen(sei.kaigo) + '・個人年金 ' + yen(sei.nenkin) + '（合計12万円まで）' +
        (sei.u23 ? '。23歳未満の扶養親族がいるので新生命保険料は計算式Ⅱ・新旧合計6万円まで' : '')],
      ['jishin', '地震保険料控除', ji, '地震保険料は5万円まで、旧長期損害保険料は1万5千円まで、合計5万円まで'],
      ['haigusha', hai.kind === 'tokubetsu' ? '配偶者特別控除' : '配偶者控除', hai.amount,
        d.spouse.has ? hai.note + '。本人の合計所得金額 ' + yen(goukei) : '配偶者なし'],
      ['tokutei', '特定親族特別控除', rel.tokutei, '19〜22歳で所得が' + man(y.fuyoLimit) + '超123万円以下の親族 1人ごと'],
      ['fuyo', '扶養控除', rel.fuyo, '一般38万・特定63万・老人48万・同居老親等58万（1人ごと）'],
      ['shogai', '障害者控除', shogaiTotal, '一般27万・特別40万・同居特別75万（本人・同一生計配偶者・扶養親族 1人ごと）'],
      ['kafu', d.self.kafu === 'hitorioya' ? 'ひとり親控除' : '寡婦控除', kafu, kafuNote || (d.self.kafu === 'none' ? '該当なし' : '本人の合計所得金額500万円以下')],
      ['kinro', '勤労学生控除', kinro, kinroNote || (d.self.kinro ? '本人の合計所得金額' + man(y.kinroLimit) + '以下' : '該当なし')],
      ['kiso', '基礎控除', kiso, '本人の合計所得金額 ' + yen(goukei) + ' の段階'],
    ];
    var kojo = 0;
    items.forEach(function (it) { kojo += it[2]; push(it[0], it[1], it[2], it[3], true); });
    push('kojo', '所得控除の合計', kojo, '上の控除の合計');

    var taxable = Math.max(0, Math.floor((shotoku - kojo) / 1000) * 1000);
    push('taxable', '課税給与所得金額', taxable, '給与所得控除後の金額 − 所得控除の合計（1,000円未満切り捨て）');
    if (taxable > y.maxTaxable) {
      return { ok: false, error: 'taxable', message: '課税給与所得金額が1,805万円を超える人は年末調整の対象外です（確定申告で精算します）。', steps: steps };
    }
    var st = sokusan(taxable, year);
    push('sanshutsu', '算出所得税額', st.value, '速算表: 課税給与所得金額 × ' + st.pct + '%' + (st.minus ? ' − ' + yen(st.minus) : ''));
    var jutaku = Math.min(d.jutaku, st.value);
    push('jutaku', '住宅借入金等特別控除額', jutaku, d.jutaku > st.value ? '入力した ' + yen(d.jutaku) + ' のうち、算出所得税額までを控除（残りは切り捨て）' : '入力した金額（証明書・申告書の金額）');
    var nencho = st.value - jutaku;
    push('nencho', '年調所得税額', nencho, '算出所得税額 − 住宅借入金等特別控除額');
    var nenzei = Math.floor(nencho * y.fukkou / 100000) * 100;
    push('nenzei', '年調年税額', nenzei, '年調所得税額 × 102.1%（復興特別所得税を含む。100円未満切り捨て）');
    push('withheld', '源泉徴収された税額の合計', d.withheld, '入力した金額');
    var diff = d.withheld - nenzei;

    return {
      ok: true, year: year, label: y.label,
      steps: steps,
      kyuyoShotoku: k.value, shotoku: shotoku, goukei: goukei,
      seimei: sei, jishin: ji, haigusha: hai, relatives: rel,
      kojo: kojo, taxable: taxable, sanshutsu: st.value, jutaku: jutaku, jutakuLeft: d.jutaku - jutaku,
      nencho: nencho, nenzei: nenzei, withheld: d.withheld,
      diff: diff,   // プラスなら戻る（還付）、マイナスなら足りない（不足）
      choseiMaybe: d.income > y.chosei.from && (rel.hasU23 || d.self.shogai === 'tokubetsu' || d.spouse.shogai === 'tokubetsu' || d.spouse.shogai === 'dokyo' ||
        (d.relatives || []).some(function (p) { return p.shogai === 'tokubetsu' || p.shogai === 'dokyo'; })),
    };
  }

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す） ---
  function num(v, max) {
    var n = Math.floor(Number(String(v === undefined || v === null ? '' : v).replace(/[,，\s円]/g, '')));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max || 1e10);
  }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  var SHOGAI = ['none', 'ippan', 'tokubetsu', 'dokyo'];
  var AGES = ['u16', '16-18', '19-22', '23-69', '70', '70dokyo'];
  var INCOME_TYPES = ['kyuyo', 'shotoku'];

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var se = r.seimei || {}, ji = r.jishin || {}, sp = r.spouse || {}, sf = r.self || {};
    return {
      income: num(r.income), withheld: num(r.withheld),
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
      self: { shogai: pick(sf.shogai, ['none', 'ippan', 'tokubetsu'], 'none'), kafu: pick(sf.kafu, ['none', 'kafu', 'hitorioya'], 'none'), kinro: !!sf.kinro },
      jutaku: num(r.jutaku),
    };
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  // 読み込んだ JSON を確かめる。戻り値 { ok, data } または { ok:false, message }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（年末調整の計算）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    kyuyoShotoku: kyuyoShotoku, relativeShotoku: relativeShotoku,
    kisoKojo: kisoKojo, seimeiKojo: seimeiKojo, jishinKojo: jishinKojo, haigushaKojo: haigushaKojo,
    relativesKojo: relativesKojo, sokusan: sokusan, choseiKojo: choseiKojo,
    calc: calc, normalizeInput: normalizeInput, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Nenmatsu = api;
})(this);
