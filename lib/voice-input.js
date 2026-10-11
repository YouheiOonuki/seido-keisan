// 声で入力（yorozu-plans ROADMAP 7.37.1 K148、企画書 85）。高額療養費・年金の繰上げ繰下げ・医療費控除の 3 ページで共通。
// 「🎤 声で入れる」を押したときだけマイクの許可を求め、話した声を 16kHz・モノラルの WAV にして yorozu-ai の /v1/listen へ送る。
// サーバーが文にして欄の値を読み、ここで欄に入れる。入れた欄は黄色にして「確かめてください」。計算はしない（利用者が確かめてから）。
// 音声・文・値はどこにも保存しない（この画面のメモリだけ）。ページのほかの入力は今までどおり端末の外に出ない。
// ブラウザでは window.VoiceInput、Node（テスト）では module.exports（toWav・plan）
(function (root) {
  'use strict';
  var API = 'https://yorozu-ai.oonuki-youhei.workers.dev/v1/listen';
  var MAX_SECONDS = 30;
  var RATE = 16000;
  var ERR = {
    tooLong: '声は30秒までにしてください。',
    noSpeech: '聞き取れませんでした。もう一度、ゆっくり話してください。',
    timeout: '時間がかかりすぎました。もう一度押してください。',
    mic: 'マイクが使えませんでした。ブラウザの設定でマイクを許可するか、手で入れてください。',
    none: '聞き取れましたが、入れられる値がありませんでした。例のように話してください。',
    other: 'うまくいきませんでした。少し待って、もう一度押してください。'
  };

  /** Float32 の音（-1〜1、16kHz・モノラル）→ WAV のバイト列 */
  function toWav(samples, rate) {
    var n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Uint8Array(buf);
  }

  var pos = function (x) { return typeof x === 'number' && isFinite(x) && x > 0 && Math.floor(x) === x; };
  var pad = function (x) { return (x < 10 ? '0' : '') + x; };

  /**
   * サーバーの値 → 欄に入れる手順 [{ id | name, value, event }]。道具ごとの欄の名前は yorozu-ai の src/listen.js の FORMS と同じ。
   * 欄の範囲の外の値（年齢 60〜75 の外など）は入れない
   */
  function plan(form, v) {
    v = v || {};
    var out = [];
    if (form === 'kogaku') {
      if (pos(v.age)) out.push({ id: 'ageplan', value: v.age < 70 ? 'u70' : v.age < 75 ? 'o70' : 'kouki', event: 'change' });
      if (pos(v.cost)) out.push({ id: 'cost0', value: String(v.cost), event: 'input' });
      if (v.place === 'in' || v.place === 'out') out.push({ name: 'place0', value: v.place, event: 'change' });
    } else if (form === 'kuriage') {
      var y = v.birth_year;
      if (pos(y)) y = y >= 1900 ? y : v.birth_era === '昭和' ? 1925 + y : v.birth_era === '平成' ? 1988 + y : null;
      if (pos(y) && pos(v.birth_month) && v.birth_month <= 12 && pos(v.birth_day) && v.birth_day <= 31 && y >= 1940 && y <= 2010) {
        out.push({ id: 'birth', value: y + '-' + pad(v.birth_month) + '-' + pad(v.birth_day), event: 'change' });
      }
      if (pos(v.kiso)) out.push({ id: 'kiso', value: String(v.kiso), event: 'input' });
      if (pos(v.kosei)) out.push({ id: 'kosei', value: String(v.kosei), event: 'input' });
      if (pos(v.start_age) && v.start_age >= 60 && v.start_age <= 75) {
        out.push({ id: 'age', value: String(v.start_age), event: 'change' });
        var m = v.start_month === 0 || (pos(v.start_month) && v.start_month <= 11) ? v.start_month : 0;
        out.push({ id: 'mon', value: String(m), event: 'change' });
      }
    } else if (form === 'iryohi') {
      if (pos(v.hiyo)) out.push({ id: 'hiyo', value: String(v.hiyo), event: 'input' });
      if (pos(v.hoten)) out.push({ id: 'hoten', value: String(v.hoten), event: 'input' });
      if (pos(v.income)) { out.push({ id: 'mode', value: 'kyuyo', event: 'change' }); out.push({ id: 'income', value: String(v.income), event: 'input' }); }
    }
    return out;
  }

  var api = { toWav: toWav, plan: plan, API: API, MAX_SECONDS: MAX_SECONDS, ERR: ERR };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ---------------------------------------------------------------
  // 画面（ブラウザだけ）
  // ---------------------------------------------------------------
  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && root.MediaRecorder && (root.AudioContext || root.webkitAudioContext) && root.OfflineAudioContext);
  }

  /** 録音（MediaRecorder の形）→ 16kHz・モノラルの Float32 */
  function decode(blob) {
    return blob.arrayBuffer().then(function (ab) {
      var AC = root.AudioContext || root.webkitAudioContext, ctx = new AC();
      return new Promise(function (ok, ng) { ctx.decodeAudioData(ab, ok, ng); }).then(function (buf) {
        ctx.close();
        var off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * RATE)), RATE);
        var src = off.createBufferSource();
        src.buffer = buf; src.connect(off.destination); src.start();
        return off.startRendering();
      });
    }).then(function (r) { return r.getChannelData(0); });
  }

  function base64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /** 欄に入れて黄色にする。入れた欄を利用者が直したら黄色を外す */
  function apply(steps) {
    var filled = [];
    steps.forEach(function (st) {
      var el = st.id ? document.getElementById(st.id) : document.querySelector('input[name="' + st.name + '"][value="' + st.value + '"]');
      if (!el) return;
      if (st.name) el.checked = true; else el.value = st.value;
      el.dispatchEvent(new Event(st.event, { bubbles: true }));
      if (st.id === 'mode') return; // 入れ方の切り替えは印を付けない
      var mark = st.name ? el.closest('label') || el : el;
      mark.classList.add('voice-filled');
      filled.push(mark);
      var off = function () { mark.classList.remove('voice-filled'); el.removeEventListener('input', off); el.removeEventListener('change', off); };
      setTimeout(function () { el.addEventListener('input', off); el.addEventListener('change', off); }, 0);
    });
    return filled;
  }

  /** <div class="voice-box" data-voice-form="kogaku"> の中のボタンを動かす。対応しないブラウザでは箱ごと出さない */
  function mount(box) {
    if (!box || !supported()) return;
    var form = box.getAttribute('data-voice-form');
    var btn = box.querySelector('.voice-btn'), status = box.querySelector('.voice-status');
    var IDLE = btn.textContent;
    var rec = null, timer = null;
    box.hidden = false;
    function say(msg, cls) { status.textContent = msg; status.className = 'voice-status' + (cls ? ' ' + cls : ''); }
    function stop() { if (rec && rec.state === 'recording') rec.stop(); }
    btn.addEventListener('click', function () {
      if (rec && rec.state === 'recording') { stop(); return; }
      // マイクの許可は押したときだけ求める
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var chunks = [];
        rec = new MediaRecorder(stream);
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          clearTimeout(timer);
          stream.getTracks().forEach(function (t) { t.stop(); });
          btn.textContent = IDLE; btn.classList.remove('is-rec'); btn.disabled = true;
          say('文字にしています…');
          decode(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
            .then(function (pcm) {
              if (pcm.length > (MAX_SECONDS + 0.5) * RATE) throw new Error('tooLong');
              return fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ form: form, audio: 'data:audio/wav;base64,' + base64(toWav(pcm, RATE)) }) });
            })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (!j.ok) { say(j.message || ERR[j.error] || ERR.other, 'error'); return; } // 混雑・枠切れの文はサーバー（yorozu-ai）が持つ
              var filled = apply(plan(form, j.values));
              say(filled.length ? '「' + j.text + '」と聞き取りました。黄色の欄は声で入れた値です。確かめてください。' : '「' + j.text + '」と聞き取りました。' + ERR.none, filled.length ? 'ok' : 'error');
              if (filled.length) filled[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            })
            .catch(function (e) { say(ERR[e && e.message] || ERR.other, 'error'); })
            .then(function () { btn.disabled = false; });
        };
        rec.start();
        btn.textContent = '■ 話し終えたら押す'; btn.classList.add('is-rec');
        say('話してください（30秒まで）。');
        timer = setTimeout(stop, MAX_SECONDS * 1000);
      }, function () { say(ERR.mic, 'error'); });
    });
  }

  root.VoiceInput = api;
  api.mount = mount;
  document.querySelectorAll('.voice-box[data-voice-form]').forEach(mount);
})(this);
