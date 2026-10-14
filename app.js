// VISAGE Study 2 — static survey app (SURVEY_SPEC §1–§5). Assignment logic lives in assign.js (VisageAssign).
(function () {
  'use strict';
  var CFG = window.VISAGE_CONFIG, VA = window.VisageAssign;
  var LIVE = !!CFG.endpoint;
  var app = document.getElementById('app'), bar = document.getElementById('bar');
  var M = null, S = null;  // manifest, state
  var params = new URLSearchParams(location.search);
  var SELFKEY_BASE = 'visage_selfpid_';
  // ?test=1 records under '<study>-test' (separate arrival counter and rows), so tester runs never take pilot slots
  if (params.get('test') === '1') CFG.study = CFG.study + '-test';
  var SELFKEY = SELFKEY_BASE + CFG.study;  // site-made pids are kept per sample, so test runs never reuse a pilot pid

  // ---------- utilities ----------
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function img(file, cls) { return h('img', { src: VA.url(M, file), class: 'photo' + (cls ? ' ' + cls : ''), alt: '프로필 사진', draggable: 'false' }); }
  function preload(files) { files.forEach(function (f) { var i = new Image(); i.src = VA.url(M, f); }); }
  function shuffle(arr, seedStr) {
    var a = arr.slice(), seed = VA.hash(seedStr);
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function now() { return Date.now(); }
  function screen(kids) { app.innerHTML = ''; kids.forEach(function (k) { if (k) app.appendChild(k); }); window.scrollTo(0, 0); }

  // A rating scale. answers[key] is set on click; onChange fires after every click.
  function scale(answers, key, n, lo, hi, onChange) {
    var wrap = h('div', {}), row = h('div', { class: 'scale', role: 'group' });
    for (var v = 1; v <= n; v++) (function (v) {
      var b = h('button', { type: 'button', 'aria-pressed': answers[key] === v ? 'true' : 'false', text: String(v), onclick: function () {
        answers[key] = v; Array.prototype.forEach.call(row.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
        if (onChange) onChange(v);
      } });
      row.appendChild(b);
    })(v);
    wrap.appendChild(row);
    if (lo || hi) wrap.appendChild(h('div', { class: 'anchors' }, [h('span', { text: lo || '' }), h('span', { text: hi || '' })]));
    return wrap;
  }
  function choices(answers, key, opts, onChange) {
    var box = h('div', { class: 'choices' });
    opts.forEach(function (o) {
      var b = h('button', { type: 'button', 'aria-pressed': answers[key] === o.value ? 'true' : 'false', 'aria-label': o.aria || o.label, text: o.label, onclick: function () {
        answers[key] = o.value; Array.prototype.forEach.call(box.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
        if (onChange) onChange(o.value);
      } });
      box.appendChild(b);
    });
    return box;
  }
  function nextBtn(label, isReady, onNext) {
    var b = h('button', { type: 'button', class: 'next', text: label || '다음', onclick: function () { if (!b.disabled) { b.disabled = true; onNext(); } } });
    b.refresh = function () { b.disabled = !isReady(); }; b.refresh(); return b;
  }

  // ---------- state & data ----------
  function key() { return 'visage_' + CFG.study + '_' + S.pid; }
  function save() { try { localStorage.setItem(key(), JSON.stringify(S)); } catch (e) { /* storage full or blocked: continue in memory */ } }
  function rec(block, r) {
    S.rows.push(Object.assign({
      row_id: S.pid + ':' + S.rows.length, pid: S.pid, study: CFG.study, sex: S.profile.sex, target: S.target, seq_k: S.k,
      disclosure: S.disclosure, block: block, target_id: '', file: '', condition: '', axis: '', pole: '', strength: '',
      item: '', value: '', rt_ms: '', order: '', ts: new Date().toISOString()
    }, r));
  }
  function flush() {  // send unsent rows; resolves true when everything is stored
    var batch = S.rows.slice(S.sent);
    if (!batch.length) return Promise.resolve(true);
    if (!LIVE) { S.sent = S.rows.length; save(); return Promise.resolve(true); }
    return fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ kind: 'rows', pid: S.pid, rows: batch }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j.ok) { S.sent += batch.length; save(); return true; } return false; })
      .catch(function () { return false; });
  }
  function sendParticipant(final) {
    var p = { pid: S.pid, study: CFG.study, src: S.src, seq_k: S.k, disclosure: S.disclosure, target: S.target, profile: S.profile,
      beta: S.beta, agree: S.agree, jstar: S.jstar, flat: S.flat, tie: S.tie, attention_pass: S.attentionPass,
      started: S.started, finished: final ? new Date().toISOString() : '', total_s: Math.round((now() - S.t0) / 1000) + (S.elapsed || 0),
      step: S.step, ua: navigator.userAgent, screen: window.screen.width + 'x' + window.screen.height, version: M.version };
    if (!LIVE) { S.participant = p; save(); return Promise.resolve(true); }
    return fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ kind: 'participant', participant: p }) })
      .then(function (r) { return r.json(); }).then(function (j) { return !!j.ok; }).catch(function () { return false; });
  }
  function register() {
    if (!LIVE) {
      var ck = 'visage_counter_' + CFG.study + '_' + S.target, k = Number(localStorage.getItem(ck) || 0);
      localStorage.setItem(ck, String(k + 1));
      return Promise.resolve({ ok: true, k: k, disclosure: k % 2 });
    }
    var u = CFG.endpoint + '?action=register&study=' + encodeURIComponent(CFG.study) + '&pid=' + encodeURIComponent(S.pid) + '&target=' + S.target;
    return fetch(u).then(function (r) { return r.json(); });
  }

  // ---------- flow ----------
  var STEPS = ['consent', 'profile', 'calib_intro', 'calib', 'viewer_intro', 'viewer', 'select_intro', 'select', 'transition',
               'ownerA_rate', 'ownerA_ladder', 'ownerA_guess', 'ownerA_survey', 'ownerB_rate', 'end'];
  function go(step) {
    S.step = step; save();
    var i = STEPS.indexOf(step); bar.style.width = Math.round(100 * i / (STEPS.length - 1)) + '%';
    ({ consent: vConsent, profile: vProfile, calib_intro: vCalibIntro, calib: vCalib, viewer_intro: vViewerIntro, viewer: vViewer,
       select_intro: vSelectIntro, select: vSelect, transition: vTransition, ownerA_rate: vOwnerRate.bind(null, 'A'), ownerA_ladder: vLadder,
       ownerA_guess: vGuess, ownerA_survey: vOwnerSurvey, ownerB_rate: vOwnerRate.bind(null, 'B'), end: vEnd })[step]();
  }
  function axes() { return CFG.study.indexOf('pilot') === 0 ? M.axes.map(function (a) { return a.id; }) : CFG.mainAxes; }  // taste axes (j* candidates)
  function calibAxes() {  // v0.3: head pose is calibrated (universal-axis check) but never a j* candidate
    var has = (M.calibration[S.target] || []).some(function (c) { return c.axis === 'pose'; });
    return has ? axes().concat(['pose']) : axes();
  }
  // Participant-facing dimension names (generation vocabulary in axes.json stays as is)
  var AXIS_LABEL = { smile: '표정 (진지한 ↔ 활짝 웃는)', hair: '머리 (차분하게 정돈 ↔ 볼륨 있게)', grooming: '꾸밈 (여: 화장 / 남: 수염)',
    attire: '옷차림 (후드·티셔츠 ↔ 셔츠·블라우스)', lighting: '조명 (밝은 자연광 ↔ 따뜻한 분위기)', background: '배경 (실내 ↔ 야외)',
    gaze: '시선 (카메라 응시 ↔ 다른 곳 보기)', framing: '구도 (얼굴 가까이 ↔ 상반신)', eyewear: '안경 (안 씀 ↔ 씀)', tone: '사진 색감 (선명 ↔ 필름 톤)' };
  function axisLabel(id) { return AXIS_LABEL[id] || id; }
  function blockEnd(next) {
    var b = h('p', { class: 'muted', text: '저장 중…' }); screen([b]);
    (function attempt(n) {
      flush().then(function (ok) {
        if (ok) { if (next !== 'end') sendParticipant(false); go(next); return; }  // 'end' sends the final summary itself; avoid a late non-final overwrite
        if (n < 3) { setTimeout(function () { attempt(n + 1); }, 1500 * (n + 1)); return; }
        screen([h('div', { class: 'card' }, [h('p', { text: '응답을 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.' }),
          nextBtn('다시 시도', function () { return true; }, function () { blockEnd(next); })])]);
      });
    })(0);
  }

  // 0 consent
  function vConsent() {
    var a = {}, btn;
    var box = h('div', { class: 'card consent', html:
      '<h2>연구 참여 안내</h2>' +
      '<p>이 조사는 데이팅 앱 프로필 사진에서 받는 인상을 알아보는 연구입니다. 약 15분이 걸립니다.</p>' +
      '<p>조사는 <b>이성 상대를 만나는 데이팅 앱</b> 상황을 가정하며, 이성 교제에 관심 있는 만 ' + CFG.ageRange[0] + '–' + CFG.ageRange[1] + '세 성인을 대상으로 합니다.</p>' +
      '<p><b>화면에 나오는 얼굴은 모두 AI로 만든 가상 인물입니다.</b> 실제 사람이 아닙니다.</p>' +
      '<p>여러 사람의 사진을 보고 인상을 평가하고, 마지막에 몇 가지 의견을 묻습니다. 정답은 없으니 처음 느낌대로 답해 주세요.</p>' +
      '<p>이름·연락처 같은 개인 식별 정보는 수집하지 않습니다. 응답은 연구 목적으로만 쓰이며 통계 처리된 형태로만 발표됩니다. 언제든 창을 닫아 참여를 그만둘 수 있고, 그만두어도 불이익은 없습니다.</p>' +
      '<p class="muted">연구 책임자: 권순재 · 문의: 패널 안내 페이지의 연락처</p>' });
    var chk = h('input', { type: 'checkbox', id: 'agree', onchange: function () { a.ok = chk.checked; btn.refresh(); } });
    btn = nextBtn('동의하고 시작', function () { return !!a.ok; }, function () {
      rec('meta', { item: 'consent', value: 1 }); go('profile');
    });
    screen([h('h1', { text: '프로필 사진 인상 조사' }), box, h('label', { class: 'check', for: 'agree' }, [chk, h('span', { text: '위 내용을 읽었으며, 대상 조건에 해당하고 참여에 동의합니다.' })]), btn]);
  }

  // 1 profile
  // [key, label, options|'number', required]. Optional items carry a "답하지 않음" choice (SURVEY_SPEC v0.2 §1).
  var SKIP = '답하지 않음';
  var PROFILE = [
    ['sex', '성별', ['남성', '여성'], true],
    ['age', '나이(만)', 'number', true],
    ['dating_app', '데이팅 앱 사용 경험', ['없음', '과거에 사용', '현재 사용 중'], true],
  ];
  function vProfile() {
    var a = Object.assign({}, S.profile), btn, err = h('p', { class: 'err' });
    var fields = PROFILE.map(function (f) {
      var input;
      if (f[2] === 'number') input = h('input', { type: 'number', inputmode: 'numeric', value: a[f[0]] || '', oninput: function () { a[f[0]] = input.value ? Number(input.value) : undefined; btn.refresh(); } });
      else {
        input = h('select', { onchange: function () { a[f[0]] = input.value || undefined; btn.refresh(); } }, [h('option', { value: '', text: '선택' })].concat(f[2].map(function (o) { return h('option', { value: o, text: o }); })));
        if (a[f[0]]) input.value = a[f[0]];
      }
      return h('label', { class: 'field' }, [h('span', { text: f[1] + (f[3] ? '' : ' (선택)') }), input]);
    });
    btn = nextBtn('다음', function () { return PROFILE.every(function (f) { return !f[3] || (a[f[0]] !== undefined && a[f[0]] !== ''); }); }, function () {
      if (!(a.age >= 19 && a.age <= 99)) { err.textContent = '나이를 다시 확인해 주세요.'; btn.disabled = false; return; }
      PROFILE.forEach(function (f) { if (!f[3] && !a[f[0]]) a[f[0]] = SKIP; });
      if (a.age < CFG.ageRange[0] || a.age > CFG.ageRange[1]) { PROFILE.forEach(function (f) { rec('profile', { item: f[0], value: a[f[0]] }); }); S.profile = a; return vScreenout(); }
      S.profile = a; S.own = a.sex === '남성' ? 'M' : 'F'; S.target = S.own === 'M' ? 'F' : 'M';  // heterosexual matching context (SURVEY_SPEC v0.2 §7)
      PROFILE.forEach(function (f) { rec('profile', { item: f[0], value: a[f[0]] }); });
      screen([h('p', { class: 'muted', text: '준비 중…' })]);
      register().then(function (r) {
        if (!r.ok) throw new Error(r.error || 'register');
        if (r.complete) { S.step = 'end'; S.done = true; save(); vAlready(); return; }
        S.k = r.k; S.disclosure = r.disclosure; save(); go('calib_intro');
      }).catch(function () {
        screen([h('div', { class: 'card' }, [h('p', { text: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' }), nextBtn('다시 시도', function () { return true; }, vProfile)])]);
      });
    });
    screen([h('h1', { text: '먼저 당신에 대해 알려 주세요' }), h('p', { class: 'muted', text: '분석에 꼭 필요한 세 가지만 묻습니다.' }), h('div', { class: 'card' }, fields), err, btn]);
  }
  function vScreenout() {
    S.step = 'screenout'; S.done = true; save(); flush(); sendParticipant(true);
    var kids = [h('h1', { text: '참여 대상이 아닙니다' }), h('div', { class: 'card' }, [h('p', { text: '이 조사는 만 ' + CFG.ageRange[0] + '–' + CFG.ageRange[1] + '세를 대상으로 합니다. 관심 가져 주셔서 감사합니다.' })])];
    if (CFG.screenoutUrl) kids.push(nextBtn('패널로 돌아가기', function () { return true; }, function () { location.href = CFG.screenoutUrl.replace('{pid}', encodeURIComponent(S.pid)); }));
    screen(kids);
  }

  // 2 calibration — paired (SURVEY_SPEC v0.2 §1): neg and pos versions of one base x axis side by side, bipolar 5-point.
  var PAIR_OPTS = [{ size: 'l', aria: '왼쪽이 훨씬 매력적', value: -2 }, { size: 'm', aria: '왼쪽이 약간 매력적', value: -1 }, { size: 's', aria: '비슷하다', value: 0 }, { size: 'm', aria: '오른쪽이 약간 매력적', value: 1 }, { size: 'l', aria: '오른쪽이 훨씬 매력적', value: 2 }];
  function dots(onPick) {  // five circles sized by strength; the photos above are the anchors
    var row = h('div', { class: 'dots', role: 'radiogroup' });
    PAIR_OPTS.forEach(function (o) {
      var b = h('button', { type: 'button', class: 'dot dot-' + o.size, role: 'radio', 'aria-checked': 'false', 'aria-label': o.aria, onclick: function () {
        Array.prototype.forEach.call(row.children, function (c) { c.setAttribute('aria-checked', c === b ? 'true' : 'false'); }); onPick(o.value);
      } }, [h('span', {})]);
      row.appendChild(b);
    });
    return h('div', {}, [row, h('div', { class: 'dots-labels' }, [h('span', { text: '왼쪽' }), h('span', {}), h('span', { text: '비슷' }), h('span', {}), h('span', { text: '오른쪽' })])]);
  }
  function vCalibIntro() {
    if (!S.pairs) { S.pairs = VA.calibrationPairs(M.calibration[S.target], calibAxes(), S.pid, CFG.calibRepeats === undefined ? 4 : CFG.calibRepeats); S.calibIdx = 0; S.calib = []; save(); }
    preload([].concat.apply([], S.pairs.slice(0, 3).map(function (p) { return [p.left, p.right]; })));
    screen([h('h1', { text: '사진 비교' }), h('div', { class: 'card' }, [
      h('p', { text: '같은 사람의 프로필 사진 두 장이 나란히 나옵니다. 데이팅 앱에서 이 사람을 본다면 어느 쪽 사진이 더 매력적인지 골라 주세요.' }),
      h('p', { text: '더 매력적인 사진 쪽 동그라미를 누르세요. 차이가 크면 큰 동그라미, 조금이면 작은 동그라미, 차이가 없으면 가운데 점입니다. 누르면 다음으로 넘어갑니다.' }),
      h('p', { class: 'muted', text: '총 ' + S.pairs.length + '쌍' })]),
      nextBtn('시작', function () { return true; }, function () { go('calib'); })]);
  }
  function vCalib() {
    var i = S.calibIdx, pr = S.pairs[i], t0 = now(), a = {};
    if (!pr) return finishCalib();
    var nx = S.pairs[i + 1]; if (nx) preload([nx.left, nx.right]);
    screen([h('p', { class: 'muted', text: (i + 1) + ' / ' + S.pairs.length }), h('div', { class: 'card' }, [
      h('div', { class: 'row2' }, [img(pr.left, 'sm'), img(pr.right, 'sm')]),
      h('p', { class: 'q', text: '어느 쪽 사진이 더 매력적인가요?' }),
      dots(function (raw) {
        setTimeout(function () {
          var v = pr.posSide === 'R' ? raw : -raw;  // positive = POS pole preferred
          S.calib.push({ base: pr.base, axis: pr.axis, value: v, repeat: !!pr.repeat });
          rec('calib', { target_id: pr.base, file: pr.left + '|' + pr.right, condition: 'calib', axis: pr.axis, pole: 'pos' + pr.posSide, strength: 2, item: pr.repeat ? 'pair_repeat' : 'pair', value: v, rt_ms: now() - t0, order: i });
          S.calibIdx++; save(); vCalib();
        }, 180);
      })])]);
  }
  function finishCalib() {
    var ax = axes(), b = VA.computeBetaPairs(S.calib, calibAxes()), j = VA.pickAxis(b.beta, b.agree, ax, S.pid);
    S.beta = b.beta; S.agree = b.agree; S.jstar = { axis: j.axis, sign: j.sign }; S.flat = j.flat; S.tie = j.tie;
    S.viewerPlan = VA.viewerAssignment(M, S.target, S.k, S.jstar);
    S.viewerOrder = shuffle(S.viewerPlan.map(function (_, i) { return i; }), S.pid + ':viewer');
    S.attentionAt = 4 + VA.hash(S.pid + ':att') % 8;  // attention card inserted after this many owner cards
    S.viewerIdx = 0;
    rec('calib', { item: 'jstar', axis: j.axis, pole: j.sign > 0 ? 'pos' : 'neg', value: j.flat ? 'flat' : (j.tie ? 'tie' : 'ok') });
    calibAxes().forEach(function (x) { rec('calib', { item: 'beta', axis: x, value: b.beta[x] }); });
    blockEnd('viewer_intro');
  }

  // 3 viewer block
  function vViewerIntro() {
    preload(S.viewerPlan.slice(0, 4).map(function (v) { return v.file; }));
    var kids = [h('h1', { text: '프로필 평가' })];
    if (S.disclosure) kids.push(h('div', { class: 'banner', text: '안내: 이 앱의 일부 프로필 사진은 AI가 보는 사람의 취향에 맞춰 조정한 것입니다.' }));
    kids.push(h('div', { class: 'card' }, [
      h('p', { text: '이제 데이팅 앱에서 추천받은 상대 ' + S.viewerPlan.length + '명의 프로필을 봅니다. 각 프로필마다 세 가지 질문에 답해 주세요.' }),
      h('p', { class: 'muted', text: '모두 당신과 비슷한 나이대이고 가까운 곳에 사는 사람이라고 생각하고, 사진에서 받은 느낌대로 답하면 됩니다.' })]));
    kids.push(nextBtn('시작', function () { return true; }, function () { go('viewer'); }));
    screen(kids);
  }
  function vViewer() {
    var i = S.viewerIdx, total = S.viewerPlan.length;
    if (i === S.attentionAt && !S.attentionDone) return vAttention();
    if (i >= total) return blockEnd('select_intro');
    var v = S.viewerPlan[S.viewerOrder[i]];
    var a = {}, t0 = now(), btn;
    var nxt = S.viewerPlan[S.viewerOrder[i + 1]]; if (nxt) preload([nxt.file]);
    btn = nextBtn('다음 프로필', function () { return a.attr && a.like !== undefined && a.natural; }, function () {
      var base = { target_id: v.ownerId, file: v.file, condition: v.condition, axis: v.axis || '', pole: v.pole || '', strength: v.condition === 'O' ? '' : 2, rt_ms: now() - t0, order: i };
      rec('viewer', Object.assign({ item: 'attr', value: a.attr }, base));
      rec('viewer', Object.assign({ item: 'like', value: a.like }, base));
      rec('viewer', Object.assign({ item: 'natural', value: a.natural }, base));
      S.viewerIdx++; save(); vViewer();
    });
    var r = function () { btn.refresh(); };
    screen([h('p', { class: 'muted', text: (i + 1) + ' / ' + total }), h('div', { class: 'card' }, [
      img(v.file),
      h('p', { class: 'q', text: '이 사람은 매력적이다' }), scale(a, 'attr', 7, '전혀 아니다', '매우 그렇다', r),
      h('p', { class: 'q', text: '이 사람에게 ‘좋아요’를 보내겠습니까?' }),
      h('div', { class: 'pair-choice' }, [choices(a, 'like', [{ label: '보낸다', value: 1 }, { label: '보내지 않는다', value: 0 }], r)]),
      h('p', { class: 'q', text: '이 사진은 자연스럽다' }), scale(a, 'natural', 7, '전혀 아니다', '매우 그렇다', r)]), btn]);
  }
  function vAttention() {
    var a = {}, btn = nextBtn('다음', function () { return !!a.v; }, function () {
      S.attentionPass = a.v === CFG.attentionAnswer; S.attentionDone = true;
      rec('viewer', { item: 'attention', value: a.v, condition: 'check' }); save(); vViewer();
    });
    screen([h('div', { class: 'card' }, [h('p', { class: 'q', text: '응답 확인 문항입니다. 아래에서 ' + CFG.attentionAnswer + '을(를) 눌러 주세요.' }),
      scale(a, 'v', 7, '', '', function () { btn.refresh(); })]), btn]);
  }

  // 4 selection sub-block
  function vSelectIntro() {
    if (!S.selectPlan) {
      S.selectPlan = shuffle(VA.selectionBlock(M, S.target), S.pid + ':sel').map(function (s) { return { ownerId: s.ownerId, files: shuffle(s.files, S.pid + s.ownerId) }; });
      S.selectIdx = 0; save();
    }
    preload(S.selectPlan[0].files);
    screen([h('h1', { text: '대표 사진 고르기' }), h('div', { class: 'card' }, [
      h('p', { text: '다른 상대 ' + S.selectPlan.length + '명에 대해, 같은 사람의 사진 세 장을 함께 보여 드립니다.' }),
      h('p', { text: '데이팅 앱 대표 사진으로 어느 것이 좋은지 순서를 매겨 주세요.' })]),
      nextBtn('시작', function () { return true; }, function () { go('select'); })]);
  }
  function vSelect() {  // tap-to-rank (SURVEY_SPEC v0.2 §3): 1st, 2nd tap; the remaining photo is 3rd
    var i = S.selectIdx; if (i >= S.selectPlan.length) return blockEnd('transition');
    var s = S.selectPlan[i], ranks = {}, t0 = now(), btn, tiles = [];
    if (S.selectPlan[i + 1]) preload(S.selectPlan[i + 1].files);
    function n() { return Object.keys(ranks).length; }
    function paint() { tiles.forEach(function (t, k) { t.badge.textContent = ranks[k] ? ranks[k] + '위' : ''; t.box.classList.toggle('ranked', !!ranks[k]); }); btn.refresh(); }
    btn = nextBtn('다음', function () { return n() === s.files.length; }, function () {
      s.files.forEach(function (f, k) { rec('select', { target_id: s.ownerId, file: f, condition: 'sel', item: 'rank', value: ranks[k], rt_ms: now() - t0, order: i * 3 + k }); });
      S.selectIdx++; save(); vSelect();
    });
    s.files.forEach(function (f, k) {
      var badge = h('div', { class: 'rank-badge' }), box = h('button', { type: 'button', class: 'rank-tile', onclick: function () {
        if (ranks[k]) { ranks = {}; } else { ranks[k] = n() + 1; if (n() === s.files.length - 1) s.files.forEach(function (_, q) { if (!ranks[q]) ranks[q] = s.files.length; }); }
        paint();
      } }, [img(f, 'sm'), badge]);
      tiles.push({ box: box, badge: badge });
    });
    screen([h('p', { class: 'muted', text: (i + 1) + ' / ' + S.selectPlan.length }), h('p', { class: 'q', text: '같은 사람의 사진 세 장입니다. 데이팅 앱 대표 사진으로 가장 좋은 것부터 차례로 눌러 주세요.' }),
      h('p', { class: 'muted', text: '두 장을 고르면 남은 한 장은 자동으로 3위가 됩니다. 다시 고르려면 순위가 붙은 사진을 누르세요.' }),
      h('div', { class: 'row3' }, tiles.map(function (t) { return t.box; })), btn]);
    paint();
  }

  // 5 transition (first disclosure of editing)
  function vTransition() {
    screen([h('h1', { text: '안내' }), h('div', { class: 'card' }, [
      h('p', { html: '<b>지금까지 본 사진 중 일부는 AI가 편집한 것입니다.</b>' }),
      h('p', { text: '이 연구는 AI가 데이팅 앱 프로필 사진을 보는 사람에 맞게 조정하는 기능을 살펴봅니다. 앞에서는 자연스러운 반응을 얻기 위해 이 사실을 미리 알려 드리지 않았습니다.' }),
      h('p', { text: '이제 반대 입장에서, 당신이 프로필을 올리는 사람이라고 상상하고 몇 가지 질문에 답해 주세요.' })]),
      nextBtn('계속', function () { return true; }, function () {
        S.ownerPlan = VA.ownerBlock(M, S.own, S.k, S.jstar); save(); go('ownerA_rate');
      })]);
  }

  // 6 owner block
  var KIND_LABEL = { universal: '변형', enhance: '보정', axis_pref: '변형', axis_opp: '변형' };
  function vOwnerRate(which) {
    var P = S.ownerPlan[which], order = shuffle(P.variants.map(function (_, i) { return i; }), S.pid + ':own' + which), a = {}, t0 = now(), btn;
    var needSelf = which === 'A';
    btn = nextBtn('다음', function () { return order.every(function (i) { return a['acc' + i] && (!needSelf || a['self' + i]); }); }, function () {
      order.forEach(function (i, pos) {
        var v = P.variants[i], base = { target_id: P.ownerId, file: v.file, condition: 'owner' + which, axis: v.axis, pole: v.pole, strength: v.strength, rt_ms: now() - t0, order: pos };
        rec('owner', Object.assign({ item: 'accept', value: a['acc' + i] }, base));
        if (needSelf) rec('owner', Object.assign({ item: 'selfness', value: a['self' + i] }, base));
      });
      blockEnd(which === 'A' ? 'ownerA_ladder' : 'end');
    });
    var r = function () { btn.refresh(); };
    var intro = which === 'A'
      ? '원본 사진이 당신의 프로필 사진이라고 상상해 주세요. AI가 이 사진을 바꾼 버전 세 장을 하나씩 원본 옆에 놓았습니다.'
      : '이번에는 다른 사람의 사진입니다. 마찬가지로 원본이 당신의 프로필 사진이라고 상상하고 답해 주세요.';
    var cards = order.map(function (i, pos) {
      var v = P.variants[i], kids = [h('span', { class: 'tag', text: '버전 ' + (pos + 1) }),
        h('div', { class: 'row2' }, [h('div', {}, [img(P.orig, 'sm'), h('div', { class: 'label-under', text: '원본' })]), h('div', {}, [img(v.file, 'sm'), h('div', { class: 'label-under', text: '버전 ' + (pos + 1) })])]),
        h('p', { class: 'q', text: '이 사진이 내 프로필에 올라가도 괜찮다' }), scale(a, 'acc' + i, 7, '전혀 아니다', '매우 그렇다', r)];
      if (needSelf) kids.push(h('p', { class: 'q', text: '원본과 비교해 여전히 ‘나답다’' }), scale(a, 'self' + i, 7, '전혀 아니다', '매우 그렇다', r));
      return h('div', { class: 'card' }, kids);
    });
    screen([h('h1', { text: which === 'A' ? '내 프로필이라면' : '한 사람 더' }), h('p', { text: intro })].concat(cards).concat([btn]));
  }
  function vLadder() {
    var P = S.ownerPlan.A, a = {}, t0 = now(), btn;
    btn = nextBtn('다음', function () { return a.max !== undefined; }, function () {
      rec('owner', { target_id: P.ownerId, condition: 'ownerA', axis: P.ladderAxis || 'enhance', item: 'intensity_max', value: a.max, rt_ms: now() - t0 });
      save(); go('ownerA_guess');
    });
    var pose = P.ladderAxis === 'pose', labels = pose ? ['조금', '중간', '많이'] : ['약하게', '중간', '강하게'];
    screen([h('h1', { text: pose ? '얼굴 각도' : '보정 강도' }), h('p', { text: pose ? '같은 원본에서 AI가 얼굴 각도를 세 가지 정도로 돌렸습니다. 내 프로필이라면 어느 정도까지 허용하시겠어요?' : '같은 원본을 AI가 세 가지 강도로 보정했습니다. 내 프로필이라면 어느 강도까지 허용하시겠어요?' }),
      h('div', { class: 'row4' }, [h('div', {}, [img(P.orig), h('div', { class: 'label-under', text: '원본' })])].concat(P.ladder.map(function (f, i) {
        return h('div', {}, [img(f), h('div', { class: 'label-under', text: labels[i] })]);
      }))),
      h('div', { class: 'card' }, [choices(a, 'max', [{ label: pose ? '바꾸지 않는다' : '보정하지 않는다', value: 0 }, { label: labels[0] + '까지', value: 1 }, { label: '중간까지', value: 2 }, { label: labels[2] + '까지', value: 3 }], function () { btn.refresh(); })]), btn]);
  }
  function vGuess() {
    var P = S.ownerPlan.A, targets = P.variants.filter(function (v) { return v.kind === 'axis_pref' || v.kind === 'axis_opp'; });
    targets = shuffle(targets, S.pid + ':guess');
    var a = {}, t0 = now(), btn;
    var opts = shuffle(axes(), S.pid + ':guessopts').map(function (x) { return { label: axisLabel(x), value: x }; }).concat([{ label: '잘 모르겠다', value: 'unknown' }]);
    btn = nextBtn('다음', function () { return targets.every(function (_, i) { return a['g' + i] && a['d' + i]; }); }, function () {
      targets.forEach(function (v, i) {
        var base = { target_id: P.ownerId, file: v.file, condition: 'ownerA', axis: v.axis, pole: v.pole, strength: 2, rt_ms: now() - t0, order: i };
        rec('owner', Object.assign({ item: 'guess', value: a['g' + i] }, base));
        rec('owner', Object.assign({ item: 'guess_correct', value: a['g' + i] === v.axis ? 1 : 0 }, base));
        rec('owner', Object.assign({ item: 'describable', value: a['d' + i] }, base));
      });
      save(); go('ownerA_survey');
    });
    var r = function () { btn.refresh(); };
    screen([h('h1', { text: '무엇이 바뀌었나요?' })].concat(targets.map(function (v, i) {
      return h('div', { class: 'card' }, [h('div', { class: 'row2' }, [h('div', {}, [img(P.orig, 'sm'), h('div', { class: 'label-under', text: '원본' })]), h('div', {}, [img(v.file, 'sm'), h('div', { class: 'label-under', text: 'AI 편집' })])]),
        h('p', { class: 'q', text: '원본과 비교해 가장 크게 바뀐 것은?' }), choices(a, 'g' + i, opts, r),
        h('p', { class: 'q', text: '이 변화를 다른 사람에게 말로 설명할 수 있다' }), scale(a, 'd' + i, 7, '전혀 아니다', '매우 그렇다', r)]);
    })).concat([btn]));
  }
  var CONTROL = [['control_preview', '바뀐 사진을 올리기 전에 미리 보기'], ['control_approve', '버전마다 내가 직접 승인하기'],
    ['control_lock', '피부톤·나이·얼굴형은 바뀌지 않게 잠그기'], ['control_strength', '보정 강도 조절하기'],
    ['control_revert', '언제든 원본으로 되돌리기'], ['control_notify', '상대에게 AI 편집 사진이라는 사실 알리기']];
  function vOwnerSurvey() {
    var a = {}, t0 = now(), btn, r = function () { btn.refresh(); };
    var items = CONTROL.map(function (c) { return h('div', {}, [h('p', { class: 'q', text: c[1] }), scale(a, c[0], 5, '필요 없다', '꼭 필요하다', r)]); });
    var more = [['goal_attention', '이 기능을 쓴다면 내 목표는 더 많은 사람의 관심을 받는 것이다'], ['goal_fit', '이 기능을 쓴다면 내 목표는 나와 맞는 사람에게 정확히 보이는 것이다'],
      ['intent_use', '데이팅 앱에 이런 기능이 있다면 쓰겠다'], ['intent_disclose', '내 사진에 ‘AI 편집’ 표시가 붙어도 괜찮다']];
    btn = nextBtn('다음', function () { return CONTROL.concat(more).every(function (c) { return a[c[0]]; }); }, function () {
      CONTROL.concat(more).forEach(function (c, i) { rec('owner', { target_id: S.ownerPlan.A.ownerId, condition: 'ownerA', item: c[0], value: a[c[0]], rt_ms: now() - t0, order: i }); });
      save(); go('ownerB_rate');
    });
    screen([h('h1', { text: '이런 기능이 있다면' }), h('div', { class: 'card' }, [h('p', { text: 'AI가 보는 사람에 맞춰 내 프로필 사진을 조정해 주는 기능이 있다고 할 때, 아래 장치가 얼마나 필요하다고 보시나요?' })].concat(items)),
      h('div', { class: 'card' }, more.map(function (c) { return h('div', {}, [h('p', { class: 'q', text: c[1] }), scale(a, c[0], 7, '전혀 아니다', '매우 그렇다', r)]); })), btn]);
  }

  // 7 end
  function vEnd() {
    if (!S.done) {
      S.done = true; save();
      screen([h('p', { class: 'muted', text: '응답을 저장하는 중입니다. 창을 닫지 마세요…' })]);
      return flush().then(function (ok) { return ok && sendParticipant(true); }).then(function (ok) {
        if (!ok) { S.done = false; save(); screen([h('div', { class: 'card' }, [h('p', { text: '저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.' }), nextBtn('다시 시도', function () { return true; }, vEnd)])]); return; }
        vEnd();
      });
    }
    if (S.src === 'self' && /-test$/.test(CFG.study)) { try { localStorage.removeItem(SELFKEY); } catch (e) { /* ignore */ } }  // testers can retake from the same browser
    bar.style.width = '100%';
    var kids = [h('h1', { text: '참여해 주셔서 감사합니다' }), h('div', { class: 'card' }, [
      h('p', { text: '이 연구는 AI가 데이팅 앱 사진을 보는 사람에 맞게 조정할 때 보는 사람과 사진 주인이 각각 어떻게 반응하는지 알아보려는 것입니다.' }),
      h('p', { text: '다시 한 번 알려 드리면, 화면에 나온 얼굴은 모두 AI로 만든 가상 인물이며 실제 사람이 아닙니다.' })])];
    if (CFG.completionUrl) {
      kids.push(nextBtn('패널로 돌아가기', function () { return true; }, function () { location.href = CFG.completionUrl.replace('{pid}', encodeURIComponent(S.pid)).replace('{code}', CFG.completionCode); }));
    } else {
      kids.push(h('p', { text: '완료 코드' }), h('div', { class: 'code', text: CFG.completionCode }));
    }
    if (!LIVE) kids.push(h('div', { class: 'card' }, [h('p', { class: 'muted', text: '개발 모드: 응답이 이 브라우저에만 저장되었습니다.' }),
      nextBtn('응답 내려받기(JSON)', function () { return true; }, function () {
        var blob = new Blob([JSON.stringify({ participant: S.participant, rows: S.rows }, null, 1)], { type: 'application/json' });
        var u = URL.createObjectURL(blob), l = h('a', { href: u, download: 'visage_' + S.pid + '.json' }); document.body.appendChild(l); l.click(); l.remove();
        setTimeout(vEnd, 300);
      })]));
    screen(kids);
  }
  function vAlready() { screen([h('h1', { text: '이미 참여하셨습니다' }), h('div', { class: 'card' }, [h('p', { text: '이 조사는 한 번만 참여할 수 있습니다. 감사합니다.' })])]); }

  // ---------- boot ----------
  function boot() {
    var pid = params.get('pid') || params.get('PROLIFIC_PID') || params.get('uid');
    var src = pid ? (params.get('src') || 'panel') : 'self';
    if (!pid) {
      try { pid = localStorage.getItem(SELFKEY); } catch (e) { /* ignore */ }
      if (!pid) { pid = (LIVE ? (/-test$/.test(CFG.study) ? 't-' : 's-') : 'dev-') + Math.random().toString(36).slice(2, 10); try { localStorage.setItem(SELFKEY, pid); } catch (e) { /* ignore */ } }
    }
    var saved = null; try { saved = JSON.parse(localStorage.getItem('visage_' + CFG.study + '_' + pid)); } catch (e) { /* ignore */ }
    if (saved && saved.pid === pid) {
      S = saved; S.elapsed = (S.elapsed || 0) + Math.round(((S.lastSeen || now()) - (S.t0 || now())) / 1000); S.t0 = now();
      if (S.step === 'screenout') return vScreenout();
      if (S.done && S.step === 'end') return vEnd();
      // resume: re-enter the current step (blocks resume at the item they were on)
      return go(S.step || 'consent');
    }
    S = { pid: pid, src: src, profile: {}, rows: [], sent: 0, step: 'consent', started: new Date().toISOString(), t0: now(), elapsed: 0 };
    save(); go('consent');
  }
  window.addEventListener('beforeunload', function () { if (S) { S.lastSeen = now(); save(); } });
  fetch('stimuli.json').then(function (r) { return r.json(); }).then(function (m) { M = m; boot(); })
    .catch(function () { screen([h('p', { class: 'err', text: '자료를 불러오지 못했습니다. 새로고침해 주세요.' })]); });
})();
