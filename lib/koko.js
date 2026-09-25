// ===========================
// 高校の授業料の自己負担の計算（画面から切り離した純粋関数）
//   自己負担（年額）＝ 授業料 − 国の就学支援金 − 都道府県の上乗せ
// 国の就学支援金は 授業料と支給限度額の少ないほう（法 5条1項）。単位制は 1 単位あたりの限度額 × 単位数（年 30・通算 74 単位まで）。
// 支給は 36 月（定時制・通信制は 48 月）まで。上乗せは東京都・大阪府・神奈川県・埼玉県・愛知県・兵庫県の私立だけ（lib/koko-values.js の PREF）。
// 埼玉県は施設費等、埼玉県・愛知県・兵庫県は入学金（1年目）の補助もある（入れたときだけ引く）。
// 同じ授業料が毎年続く前提で、学年ごとに計算して合計する。DOM や localStorage には触らない。
// ブラウザでは window.Koko、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var V = NODE ? require('./koko-values.js') : root.KokoValues;

  var TOOL_ID = 'seido-keisan-koko';
  var FILE_VERSION = 1;

  var SETCHI = ['shiritsu', 'koritsu', 'kokuritsu'];
  var TYPES = ['zen', 'tei', 'tsu', 'toku', 'kosen', 'senshu', 'senshu_tsu'];
  var UNIT_TYPES = ['zen', 'tei', 'tsu', 'senshu', 'senshu_tsu'];   // 単位制の限度額の表があるもの
  var TYPE_LABEL = {
    zen: '高校（全日制）', tei: '高校（定時制）', tsu: '高校（通信制）', toku: '特別支援学校（高等部）',
    kosen: '高専（1〜3年）', senshu: '専修学校（高等課程）', senshu_tsu: '専修学校（高等課程・通信制）',
  };
  var SETCHI_LABEL = { shiritsu: '私立', koritsu: '公立', kokuritsu: '国立' };

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(String(v).replace(/[,，\s円]/g, ''));
    return isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  // --- 入力の正規化（保存・読み込みも同じ形） ---
  function normalizeInput(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var g = raw.gai && typeof raw.gai === 'object' ? raw.gai : {};
    var type = pick(raw.type, TYPES, 'zen');
    var d = {
      setchi: pick(raw.setchi, SETCHI, 'shiritsu'),
      type: type,
      feeMode: UNIT_TYPES.indexOf(type) >= 0 ? pick(raw.feeMode, ['year', 'unit'], 'year') : 'year',
      fee: num(raw.fee),
      unitFee: num(raw.unitFee),
      units: num(raw.units),
      pref: V.PREFS.indexOf(raw.pref) >= 0 ? raw.pref : '',
      osakaSuishin: raw.osakaSuishin === undefined ? true : !!raw.osakaSuishin,
      kanagawaIn: raw.kanagawaIn === undefined ? true : !!raw.kanagawaIn,
      saitamaIn: raw.saitamaIn === undefined ? true : !!raw.saitamaIn,
      saitamaKubun: pick(raw.saitamaKubun, ['none', 'k2', 'k1', 'hogo'], 'none'),
      aichiIn: raw.aichiIn === undefined ? true : !!raw.aichiIn,
      hyogoIn: raw.hyogoIn === undefined ? true : !!raw.hyogoIn,
      hyogoHikazei: !!raw.hyogoHikazei,
      status: pick(raw.status, ['shin', 'gai'], 'shin'),
      gai: { kubun: pick(g.kubun, ['c', 'b', 'a'], 'b'), zaiko: !!g.zaiko, ryugaku: !!g.ryugaku },
      shisetsu: num(raw.shisetsu),
      nyugaku: num(raw.nyugaku),
      years: pick(Number(raw.years), [3, 4], 3),
    };
    return d;
  }

  function supportYears(type) { return V.MONTHS[type] / 12; }

  // 1 年分の授業料（年額か、1 単位あたり × 単位数）
  function annualFee(d) {
    if (d.feeMode === 'unit') return d.unitFee === null || d.units === null ? null : d.unitFee * d.units;
    return d.fee;
  }

  // --- 国の就学支援金（1 年分）。units は その年に支給の対象になる単位数（単位制のとき） ---
  // 戻り値 { amount, cap, rule } または { amount: null, why }（計算しない場合）
  function kuni(d, fee, units) {
    if (d.status === 'gai') {
      if (d.feeMode === 'unit') return { amount: null, why: '新制度の対象外で単位制の授業料の場合は計算しません。' };
      if (!d.gai.zaiko && d.gai.ryugaku) return { amount: 0, cap: 0, rule: '在留資格「留学」の新入生は国の支援の対象外' };
      var k = d.gai.kubun;
      var table = V.OLD[d.setchi][k === 'c' ? 'c' : 'b'];
      var cap = table[d.type];
      if (cap === undefined) return { amount: null, why: 'この学校の種類の旧制度の額は確かめていないので計算しません。' };
      if (k === 'a') {
        if (!d.gai.zaiko) return { amount: 0, cap: 0, rule: '年収約910万円以上の新入生は国の支援の対象外（新修学支援金は910万円未満）' };
        // 910万円以上の在校生: 高校生等・新修学支援金 上限 11万8,800円（国公私立共通。旧制度の基礎額）
        return { amount: Math.min(fee, cap), cap: cap, rule: '新制度の対象外・在校生（年収目安910万円以上）: 上限 ' + yen(cap) };
      }
      var label = k === 'c' ? '年収目安590万円未満' : '年収目安590万〜910万円';
      var who = d.gai.zaiko ? '在校生（経過措置）' : '新入生（高校生等・新修学支援金）';
      return { amount: Math.min(fee, cap), cap: cap, rule: '新制度の対象外・' + who + '・' + label + ': 上限 ' + yen(cap) };
    }
    if (d.feeMode === 'unit') {
      var per = V.PER_UNIT[d.setchi][d.type];
      var perAmt = Math.min(d.unitFee, per);
      return { amount: perAmt * units, cap: per * units, per: per, rule: '1単位 ' + yen(perAmt) + '（授業料と限度額 ' + yen(per) + ' の少ないほう）× ' + units + '単位' };
    }
    var capY = V.MONTHLY[d.setchi][d.type] * 12;
    return { amount: Math.min(fee, capY), cap: capY, rule: '授業料と支給限度額 ' + yen(capY) + '（月 ' + yen(V.MONTHLY[d.setchi][d.type]) + ' × 12）の少ないほう' };
  }

  // --- 都道府県の上乗せ（1 年分） ---
  // 戻り値 { status, add, school, covered, rule }。status: ok / none（未選択）/ other（未対応の道府県）/ public / notype / notcalc / nosuishin / outside
  function pref(d, fee, nat, units, supported) {
    var key = V.PREF_KEY[d.pref];
    if (!d.pref) return { status: 'none', add: 0, school: 0 };
    if (!key) return { status: 'other', add: 0, school: 0 };
    var P = V.PREF[key];
    if (d.setchi !== 'shiritsu') return { status: 'public', add: 0, school: 0, name: P.name };
    if (P.types.indexOf(d.type) < 0) return { status: 'notype', add: 0, school: 0, name: P.name, key: key };
    if (!supported) return { status: 'ok', add: 0, school: 0, name: P.name, key: key, rule: '就学支援金の支給期間の外' };
    if (nat === null) return { status: 'notcalc', add: 0, school: 0, name: P.name, key: key };

    if (key === 'tokyo') {
      var room = Math.max(0, Math.min(fee, P.total) - nat);
      if (d.status === 'gai') {
        var g = d.gai, capG;
        if (!g.zaiko && g.ryugaku) capG = P.gai.ryugakuNew;
        else if (g.kubun === 'a') capG = g.zaiko ? P.gai.aOld : P.gai.aNew;
        else capG = P.gai[g.kubun];
        return { status: 'ok', add: Math.min(capG, room), school: 0, name: P.name, key: key,
          rule: '国の支援と合わせて ' + yen(P.total) + ' と授業料の少ないほうまで（この区分の助成の上限 ' + yen(capG) + '）' };
      }
      return { status: 'ok', add: Math.min(P.add, room), school: 0, name: P.name, key: key,
        rule: '国の支援と合わせて ' + yen(P.total) + ' と授業料の少ないほうまで（助成の上限 ' + yen(P.add) + '）' };
    }
    if (key === 'osaka') {
      if (d.status === 'gai') return { status: 'notcalc', add: 0, school: 0, name: P.name, key: key };
      if (!d.osakaSuishin) return { status: 'nosuishin', add: 0, school: 0, name: P.name, key: key };
      if (d.type === 'tsu') {
        if (d.feeMode !== 'unit') return { status: 'notcalc', add: 0, school: 0, name: P.name, key: key };
        var coveredU = Math.min(d.unitFee, P.standardUnit) * units;
        var schoolU = Math.max(0, d.unitFee - P.standardUnit) * units;
        return { status: 'ok', add: Math.max(0, coveredU - nat), school: schoolU, covered: coveredU, name: P.name, key: key,
          rule: '国と府で 1単位 ' + yen(P.standardUnit) + '（標準授業料）まで。超える分は学校が負担' };
      }
      var base = fee + (d.shisetsu || 0);
      var covered = Math.min(base, P.standard);
      return { status: 'ok', add: Math.max(0, covered - nat), school: Math.max(0, base - P.standard), covered: covered, withShisetsu: true, name: P.name, key: key,
        rule: '授業料＋施設整備費等を、国と府で ' + yen(P.standard) + '（標準授業料）まで。超える分は学校が負担' };
    }
    if (key === 'kanagawa') {
      if (d.status === 'gai') return { status: 'notcalc', add: 0, school: 0, name: P.name, key: key };
      if (!d.kanagawaIn) return { status: 'outside', add: 0, school: 0, name: P.name, key: key };
      var capK = d.type === 'tsu' ? P.addTsu : P.add;
      return { status: 'ok', add: Math.min(capK, Math.max(0, fee - nat)), school: 0, name: P.name, key: key,
        rule: '授業料補助 上限 ' + yen(capK) + '（授業料の残りまで）' };
    }
    if (key === 'saitama') {
      if (d.status === 'gai') return { status: 'notcalc', add: 0, school: 0, name: P.name, key: key };
      if (!d.saitamaIn) return { status: 'outside', add: 0, school: 0, name: P.name, key: key };
      var kb = P.kubun[d.saitamaKubun];
      var sh = d.shisetsu || 0;
      var shAid = kb.shisetsu === 'all' ? sh : Math.min(sh, kb.shisetsu);
      if (kb.tuitionAll) {
        return { status: 'ok', add: Math.max(0, fee - nat), school: 0, name: P.name, key: key, shisetsuAid: shAid, nyugakuCap: kb.nyugaku,
          rule: kb.label + ': 授業料と施設費等の全額（入学金は ' + yen(kb.nyugaku) + ' まで）' };
      }
      return { status: 'ok', add: 0, school: 0, name: P.name, key: key, shisetsuAid: shAid, nyugakuCap: kb.nyugaku,
        rule: kb.label + ': 授業料の上乗せなし' + (kb.shisetsu ? '・施設費等 ' + yen(kb.shisetsu) + ' まで' : '') + (kb.nyugaku ? '・入学金 ' + yen(kb.nyugaku) + ' まで' : '') };
    }
    if (key === 'aichi') {
      if (d.status === 'gai') return { status: 'notcalc', add: 0, school: 0, name: P.name, key: key };
      if (!d.aichiIn) return { status: 'outside', add: 0, school: 0, name: P.name, key: key };
      return { status: 'ok', add: 0, school: 0, name: P.name, key: key, nyugakuCap: P.nyugaku[d.type],
        rule: '授業料の補助の上限 ' + yen(P.tuitionCap[d.type]) + ' は国の就学支援金と同じ（入学納付金は ' + yen(P.nyugaku[d.type]) + ' まで）' };
    }
    if (key === 'hyogo') {
      if (d.status === 'gai') return { status: 'notcalc', add: 0, school: 0, name: P.name, key: key };
      if (!d.hyogoIn) return { status: 'outside', add: 0, school: 0, name: P.name, key: key };
      var capH = d.hyogoHikazei ? P.nyugaku[d.type] : 0;
      return { status: 'ok', add: 0, school: 0, name: P.name, key: key, nyugakuCap: capH,
        rule: '授業料は国の就学支援金だけ' + (capH ? '（入学金支援 ' + yen(capH) + ' まで）' : '') };
    }
    return { status: 'other', add: 0, school: 0 };
  }

  // --- 計算の本体 ---
  function calc(raw) {
    var d = normalizeInput(raw);
    var res = { input: d, missing: [], ready: false, years: [], notes: [] };
    var fee = annualFee(d);
    if (d.feeMode === 'unit') {
      if (d.unitFee === null) res.missing.push('unitFee');
      if (d.units === null) res.missing.push('units');
    } else if (d.fee === null) res.missing.push('fee');
    if (fee === null) return res;

    var supYears = supportYears(d.type);
    var usedUnits = 0;
    var shisetsu = d.shisetsu || 0;
    var sum = { fee: 0, kuni: 0, pref: 0, school: 0, selfFee: 0, shisetsu: 0, selfShisetsu: 0 };
    var first = null;
    for (var y = 1; y <= d.years; y++) {
      var supported = y <= supYears;
      var units = 0;
      if (d.feeMode === 'unit' && supported) {
        units = Math.max(0, Math.min(d.units, V.UNITS_YEAR, V.UNITS_TOTAL - usedUnits));
        usedUnits += units;
        if (units === 0) supported = false;
      }
      var k = supported ? kuni(d, fee, units) : { amount: 0, cap: 0, rule: '支給期間（' + V.MONTHS[d.type] + '月）の外' };
      var nat = k.amount;
      // 単位制は、上乗せも支援の対象の単位（年 30・通算 74 まで）の授業料の範囲で計算する（それを超える扱いは確かめていない）
      var p = pref(d, d.feeMode === 'unit' ? d.unitFee * units : fee, nat, units, supported);
      var row = { year: y, supported: supported, units: units, fee: fee, kuni: k, pref: p };
      if (nat === null) {
        row.selfFee = null;
      } else if (p.withShisetsu) {
        // 大阪府: 授業料＋施設整備費等をまとめて国と府で標準授業料まで、超える分は学校が負担 → 保護者の負担は 0
        //（国 ＋ 府 ＝ min(授業料＋施設費, 63万円)、学校の負担 ＝ 残り。合計はちょうど 授業料＋施設費）
        row.selfFee = 0;
        row.selfShisetsu = 0;
      } else if (p.key === 'osaka' && p.status === 'ok' && d.feeMode === 'unit') {
        // 大阪府の通信制（単位制）: 支給の対象の単位は 0。30 単位を超える分は授業料どおり
        var unsupported = (d.units - units) * d.unitFee;
        row.selfFee = Math.max(0, unsupported);
        row.selfShisetsu = shisetsu;
      } else {
        row.selfFee = Math.max(0, fee - nat - p.add - p.school);
        row.selfShisetsu = shisetsu - (p.shisetsuAid || 0);   // 埼玉県の施設費等の補助（ほかは 0）
      }
      if (row.selfFee !== null) {
        sum.fee += fee; sum.kuni += nat; sum.pref += p.add; sum.school += p.school;
        sum.selfFee += row.selfFee; sum.shisetsu += shisetsu; sum.selfShisetsu += row.selfShisetsu;
      }
      res.years.push(row);
      if (!first) first = row;
    }
    res.first = first;
    res.ready = first.selfFee !== null;
    res.why = first.kuni.why || '';
    res.sum = sum;
    res.nyugaku = d.nyugaku || 0;
    // 入学金の補助（埼玉県・愛知県・兵庫県。1年目の条件で、入学金の額まで）
    res.nyugakuAid = first.pref && first.pref.status === 'ok' && first.pref.nyugakuCap ? Math.min(res.nyugaku, first.pref.nyugakuCap) : 0;
    res.total = sum.selfFee + sum.selfShisetsu + res.nyugaku - res.nyugakuAid;   // 卒業までの自己負担（授業料＋入れた施設費など＋入学金）
    res.supportYears = supYears;
    res.feeLabel = d.feeMode === 'unit' ? '1単位 ' + yen(d.unitFee) + ' × ' + d.units + '単位' : '年額';
    return res;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（高校の授業料の計算）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION, TYPES: TYPES, UNIT_TYPES: UNIT_TYPES, TYPE_LABEL: TYPE_LABEL, SETCHI_LABEL: SETCHI_LABEL,
    normalizeInput: normalizeInput, annualFee: annualFee, kuni: kuni, pref: pref, calc: calc,
    toExportFile: toExportFile, fromExportFile: fromExportFile, yen: yen,
  };
  if (NODE) module.exports = api;
  else root.Koko = api;
})(this);
