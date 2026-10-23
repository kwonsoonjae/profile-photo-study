// VISAGE Study 2 — in-survey assignment logic (SURVEY_SPEC v0.3 §1–§4). Pure functions, no platform dependency.
// v0.3 (2026-10-14): viewer conditions O/U/A/P (U = Study 1 scorer's universal pick, replaces classic-enhance G);
// calibration repeats (test-retest of taste); beta averages within base first.
// v0.4 (2026-10-23): owner intensity ladder removed; A/P are stacked on the owner's universal edit U ("U + taste pole",
// generated in one instruction from the original, variants.ustack) unless the participant's own beta on U's axis is < 0
// (then A/P = the single taste edit on the original). Same rule in the owner block so owner and viewer judge the same files.
// Works in browser (Qualtrics JS / static page) and Node (tests). Attach to window.VisageAssign or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.VisageAssign = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CONDITIONS = ['O', 'U', 'A', 'P'];

  // FNV-1a 32-bit hash of a string -> non-negative int (deterministic tie-breaking / fallback randomization)
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h >>> 0;
  }

  // ratings: [{base:'F05', axis:'smile', pole:'neg'|'pos', value:1..5}], axes: ['smile',...]
  // returns {beta:{axis:number}, agree:{axis:boolean|null}, nBases:{axis:number}}
  function computeBeta(ratings, axes) {
    var byKey = {};
    ratings.forEach(function (r) { byKey[r.base + '|' + r.axis + '|' + r.pole] = Number(r.value); });
    var bases = {}; ratings.forEach(function (r) { bases[r.base] = true; }); bases = Object.keys(bases).sort();
    var beta = {}, agree = {}, nBases = {};
    axes.forEach(function (ax) {
      var diffs = [];
      bases.forEach(function (b) {
        var p = byKey[b + '|' + ax + '|pos'], n = byKey[b + '|' + ax + '|neg'];
        if (p !== undefined && n !== undefined) diffs.push((p - n) / 2);
      });
      nBases[ax] = diffs.length;
      beta[ax] = diffs.length ? diffs.reduce(function (s, d) { return s + d; }, 0) / diffs.length : 0;
      agree[ax] = diffs.length >= 2 ? (Math.sign(diffs[0]) === Math.sign(diffs[1]) && diffs[0] !== 0) : null;
    });
    return { beta: beta, agree: agree, nBases: nBases };
  }

  // Paired calibration (v0.2): one trial = the neg and pos version of one base x axis side by side.
  // pairs: [{base, axis, value}] where value is in -2..2 and positive = the POS pole was preferred (side already undone).
  // beta_axis = mean over bases of value (same -2..2 range as the v0.1 rating difference / 2); agree = same sign on both bases.
  // v0.3: repeated presentations of the same base x axis are averaged within the base first.
  function computeBetaPairs(pairs, axes) {
    var beta = {}, agree = {}, nBases = {};
    axes.forEach(function (ax) {
      var byBase = {};
      pairs.filter(function (p) { return p.axis === ax; }).forEach(function (p) { (byBase[p.base] = byBase[p.base] || []).push(Number(p.value)); });
      var vals = Object.keys(byBase).sort().map(function (b) { var v = byBase[b]; return v.reduce(function (s, x) { return s + x; }, 0) / v.length; });
      nBases[ax] = vals.length;
      beta[ax] = vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : 0;
      agree[ax] = vals.length >= 2 ? (Math.sign(vals[0]) === Math.sign(vals[1]) && vals[0] !== 0) : null;
    });
    return { beta: beta, agree: agree, nBases: nBases };
  }

  // Pair trials from manifest calibration items: axis order shuffled per base (seeded), bases strictly alternate,
  // and the side of the POS image is a seeded coin flip per trial (recorded as posSide 'L'|'R').
  // v0.3: nRepeat extra trials re-present distinct base x axis pairs with the sides swapped (repeat: true), placed in the
  // second half and never adjacent to their first presentation -> within-person test-retest of each judgment.
  function calibrationPairs(items, axes, pid, nRepeat) {
    var byBase = {};
    items.forEach(function (c) {
      if (axes.indexOf(c.axis) < 0) return;
      var b = byBase[c.base] = byBase[c.base] || {}; b[c.axis] = b[c.axis] || {}; b[c.axis][c.pole] = c.file;
    });
    var bases = Object.keys(byBase).sort(), seed = hash(String(pid) + ':pairs');
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var lists = bases.map(function (b) {
      var axs = axes.filter(function (ax) { return byBase[b][ax] && byBase[b][ax].pos && byBase[b][ax].neg; });
      for (var i = axs.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = axs[i]; axs[i] = axs[j]; axs[j] = t; }
      return axs.map(function (ax) { var posSide = rnd() < 0.5 ? 'L' : 'R';
        return { base: b, axis: ax, posSide: posSide, left: posSide === 'L' ? byBase[b][ax].pos : byBase[b][ax].neg, right: posSide === 'L' ? byBase[b][ax].neg : byBase[b][ax].pos }; });
    });
    var start = Math.floor(rnd() * lists.length), out = [], n = Math.max.apply(null, lists.map(function (l) { return l.length; }));
    for (var r = 0; r < n; r++) for (var q = 0; q < lists.length; q++) { var l = lists[(start + q) % lists.length]; if (l[r]) out.push(l[r]); }
    var k = Math.min(nRepeat || 0, Math.floor(out.length / 2));
    if (k > 0) {
      var firstHalf = out.slice(0, Math.ceil(out.length / 2)), picks = [];
      for (var i2 = firstHalf.length - 1; i2 > 0; i2--) { var j2 = Math.floor(rnd() * (i2 + 1)); var t2 = firstHalf[i2]; firstHalf[i2] = firstHalf[j2]; firstHalf[j2] = t2; }
      picks = firstHalf.slice(0, k);
      var n0 = out.length, half = Math.ceil(n0 / 2), after = {};   // insert repeat m after original index t_m (>= half), spread over the second half
      picks.forEach(function (p, m) {
        var t = Math.min(n0 - 1, half + Math.floor((n0 - half) * m / k));
        (after[t] = after[t] || []).push({ base: p.base, axis: p.axis, posSide: p.posSide === 'L' ? 'R' : 'L', left: p.right, right: p.left, repeat: true });
      });
      var merged = [];
      out.forEach(function (p, i) { merged.push(p); (after[i] || []).forEach(function (r) { merged.push(r); }); });
      out = merged;
    }
    return out;
  }

  // j* = argmax |beta|; ties -> agree===true first, then hash(pid) order. |beta|==0 everywhere -> flat, axis by hash.
  function pickAxis(beta, agree, axes, pid) {
    var best = -1; axes.forEach(function (ax) { best = Math.max(best, Math.abs(beta[ax] || 0)); });
    var flat = best === 0;
    var cands = axes.filter(function (ax) { return flat || Math.abs(beta[ax] || 0) === best; });
    var tie = cands.length > 1;  // a tie existed before any tie-breaking
    if (tie && !flat) {
      var agreed = cands.filter(function (ax) { return agree[ax] === true; });
      if (agreed.length) cands = agreed;
    }
    var axis = cands.length === 1 ? cands[0] : cands[hash(String(pid)) % cands.length];
    var sign = flat ? (hash(String(pid) + ':sign') % 2 ? 1 : -1) : (beta[axis] > 0 ? 1 : -1);
    return { axis: axis, sign: sign, flat: flat, tie: tie };
  }

  function poleName(sign) { return sign > 0 ? 'pos' : 'neg'; }

  // v0.4: A/P base for owner o. Stack on U only if U is an edit on another axis, the participant does not dislike U's axis
  // (beta < 0 -> opt out; beta 0 or not calibrated -> stack, the majority side) and both stacked poles exist.
  function taste(o, jstar, beta) {
    var u = o.u_pick, st = o.variants.ustack && o.variants.ustack[jstar.axis];
    var b = beta && u && typeof beta[u.axis] === 'number' ? beta[u.axis] : null;
    var stacked = !!(u && u.axis !== 'orig' && u.axis !== jstar.axis && !(b !== null && b < 0) && st && st.pos2 && st.neg2);
    var src = stacked ? st : o.variants[jstar.axis];
    return { stacked: stacked, optOut: b !== null && b < 0, pref: src[poleName(jstar.sign) + '2'], opp: src[poleName(-jstar.sign) + '2'],
             prefSingle: o.variants[jstar.axis][poleName(jstar.sign) + '2'], oppSingle: o.variants[jstar.axis][poleName(-jstar.sign) + '2'] };
  }

  // Latin square: participant sequence k (0-based within gender), owner group g (0..3) -> condition
  function conditionFor(g, k) { return CONDITIONS[(g + k) % 4]; }

  // Viewer block: manifest.owners[targetGender] (16 viewer owners with .group), k, jstar {axis, sign}
  // returns [{ownerId, condition, file, axis, pole}] in manifest order (shuffle for presentation separately)
  function viewerAssignment(manifest, targetGender, k, jstar, beta) {
    var owners = manifest.owners[targetGender].filter(function (o) { return o.role === 'viewer'; });
    return owners.map(function (o) {
      var c = conditionFor(o.group, k), file, axis = null, pole = null, stacked = false;
      if (c === 'O') file = o.file;
      else if (c === 'U') { file = o.u_pick.file; axis = o.u_pick.axis; pole = o.u_pick.pole; }
      else {
        var t = taste(o, jstar, beta); axis = jstar.axis; stacked = t.stacked;
        pole = poleName(c === 'A' ? jstar.sign : -jstar.sign); file = c === 'A' ? t.pref : t.opp;
      }
      return { ownerId: o.id, condition: c, file: file, axis: axis, pole: pole, stacked: stacked, group: o.group };
    });
  }

  // Owner block: stand-ins of the participant's own gender. A = owners[k % 16], B = owners[(k + 8) % 16]
  function ownerBlock(manifest, ownGender, k, jstar, beta) {
    var owners = manifest.owners[ownGender].filter(function (o) { return o.role === 'viewer'; });
    var A = owners[k % owners.length], B = owners[(k + Math.floor(owners.length / 2)) % owners.length];
    function variants(o) {
      var t = taste(o, jstar, beta);   // v0.4: same stacking rule as the viewer block; guessFile = the single edit (one named change)
      return [
        { kind: 'universal', file: o.u_pick.file, axis: o.u_pick.axis, pole: o.u_pick.pole, strength: 2 },
        { kind: 'axis_pref', file: t.pref, guessFile: t.prefSingle, stacked: t.stacked, axis: jstar.axis, pole: poleName(jstar.sign), strength: 2 },
        { kind: 'axis_opp', file: t.opp, guessFile: t.oppSingle, stacked: t.stacked, axis: jstar.axis, pole: poleName(-jstar.sign), strength: 2 }
      ].concat(o.variants.aiglobal ? [{ kind: 'ai_global', file: o.variants.aiglobal.pos2, axis: 'aiglobal', pole: 'pos', strength: 2 }] : [])  // v0.3.1
       .filter(function (v, i, arr) {  // one-sided axes: a pole can be the original or U itself -> show each distinct photo once
         return v.file !== o.file && arr.findIndex(function (w) { return w.file === v.file; }) === i;
       });
    }
    return {
      A: { ownerId: A.id, orig: A.file, variants: variants(A) },
      B: { ownerId: B.id, orig: B.file, variants: variants(B) }
    };
  }

  // Calibration order: shuffle with constraint that the two poles of the same base×axis are never adjacent (seeded by pid)
  function calibrationOrder(items, pid) {
    var arr = items.slice(), seed = hash(String(pid) + ':calib');
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    for (var pass = 0; pass < 10; pass++) {
      var ok = true;
      for (var q = 1; q < arr.length; q++) {
        if (arr[q].base === arr[q - 1].base && arr[q].axis === arr[q - 1].axis) {
          var swap = (q + 2) % arr.length; var s = arr[q]; arr[q] = arr[swap]; arr[swap] = s; ok = false;
        }
      }
      if (ok) break;
    }
    return arr;
  }

  function url(manifest, rel) { return manifest.base_url ? manifest.base_url + '/' + rel : rel; }

  return { hash: hash, computeBeta: computeBeta, computeBetaPairs: computeBetaPairs, calibrationPairs: calibrationPairs, pickAxis: pickAxis, conditionFor: conditionFor, viewerAssignment: viewerAssignment,
           taste: taste, ownerBlock: ownerBlock, calibrationOrder: calibrationOrder, url: url, CONDITIONS: CONDITIONS };
});
