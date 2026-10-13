// Profile photo study - Google Apps Script backend (bound to a Google Sheet). Setup: backend/SETUP.md
// Sheets (created on first use): registry (pid -> k, disclosure), rows (long-format responses), participants (one row per pid x study, upserted).
// GET  ?action=ping -> {ok, sheet}
// GET  ?action=register&study=pilot&pid=..&target=F|M  -> {ok, k, disclosure, resumed, complete}
// GET  ?action=export&token=..  -> {ok, registry, rows, participants}  (token is set only in the deployed copy)
// POST {kind:'rows', pid, rows:[...]} | {kind:'participant', participant:{...}}  (Content-Type text/plain, avoids CORS preflight)

var EXPORT_TOKEN = '__EXPORT_TOKEN__';
var REG_COLS = ['pid', 'study', 'target', 'k', 'disclosure', 'registered', 'complete'];
var ROW_COLS = ['row_id', 'pid', 'study', 'sex', 'target', 'seq_k', 'disclosure', 'block', 'target_id', 'file', 'condition',
  'axis', 'pole', 'strength', 'item', 'value', 'rt_ms', 'order', 'ts'];
var PART_COLS = ['updated', 'pid', 'study', 'src', 'seq_k', 'disclosure', 'target', 'finished', 'total_s', 'step', 'attention_pass',
  'jstar_axis', 'jstar_sign', 'flat', 'tie', 'beta_json', 'agree_json', 'profile_json', 'started', 'ua', 'screen', 'version'];
// text columns are stored as plain text so Sheets never re-parses ids, ISO timestamps or file names
var TEXT_COLS = { pid: 1, row_id: 1, study: 1, file: 1, target_id: 1, axis: 1, pole: 1, item: 1, condition: 1, ts: 1, finished: 1, started: 1,
  beta_json: 1, agree_json: 1, profile_json: 1, ua: 1, screen: 1, version: 1, src: 1, step: 1, block: 1, sex: 1, target: 1, jstar_axis: 1 };

function sheet_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(cols); sh.setFrozenRows(1);
    cols.forEach(function (c, i) { if (TEXT_COLS[c]) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
  }
  return sh;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function cell_(c, v) {  // numbers and booleans stay typed; everything else becomes bounded text
  if (v === null || v === undefined) return '';
  if (!TEXT_COLS[c] && (typeof v === 'number' || typeof v === 'boolean')) return v;
  return String(v).slice(0, 2000);
}
function table_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sh ? sh.getDataRange().getValues() : [];
}

function doGet(e) {
  var p = e.parameter || {};
  if (p.action === 'ping') return json_({ ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() });
  if (p.action === 'export') {
    if (!EXPORT_TOKEN || EXPORT_TOKEN.indexOf('__') === 0 || p.token !== EXPORT_TOKEN) return json_({ ok: false, error: 'forbidden' });
    return json_({ ok: true, registry: table_('registry'), rows: table_('rows'), participants: table_('participants') });
  }
  if (p.action !== 'register') return json_({ ok: false, error: 'unknown action' });
  var pid = String(p.pid || '').slice(0, 80), study = String(p.study || '').slice(0, 20), target = p.target === 'M' ? 'M' : 'F';
  if (!pid) return json_({ ok: false, error: 'pid required' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var reg = sheet_('registry', REG_COLS), data = reg.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === pid && String(data[i][1]) === study)
        return json_({ ok: true, k: data[i][3], disclosure: data[i][4], resumed: true, complete: data[i][6] === 1 });
    }
    var k = 0;  // arrival order within study x target gender (Latin-square row)
    for (var j = 1; j < data.length; j++) if (String(data[j][1]) === study && String(data[j][2]) === target) k++;
    var disclosure = k % 2;
    reg.appendRow([pid, study, target, k, disclosure, new Date(), 0]);
    return json_({ ok: true, k: k, disclosure: disclosure, resumed: false, complete: false });
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (body.kind === 'rows') {
      var rows = (body.rows || []).slice(0, 500).map(function (r) { return ROW_COLS.map(function (c) { return cell_(c, r[c]); }); });
      if (rows.length) { var sh = sheet_('rows', ROW_COLS); sh.getRange(sh.getLastRow() + 1, 1, rows.length, ROW_COLS.length).setValues(rows); }
      return json_({ ok: true, n: rows.length });
    }
    if (body.kind === 'participant') {
      var p = body.participant || {}, js = p.jstar || {};
      var rec = { updated: new Date(), pid: p.pid, study: p.study, src: p.src, seq_k: p.seq_k, disclosure: p.disclosure, target: p.target,
        finished: p.finished, total_s: p.total_s, step: p.step, attention_pass: p.attention_pass, jstar_axis: js.axis, jstar_sign: js.sign,
        flat: p.flat, tie: p.tie, beta_json: JSON.stringify(p.beta || null), agree_json: JSON.stringify(p.agree || null),
        profile_json: JSON.stringify(p.profile || null), started: p.started, ua: p.ua, screen: p.screen, version: p.version };
      var vals = PART_COLS.map(function (c) { return c === 'updated' ? rec.updated : cell_(c, rec[c]); });
      var ps = sheet_('participants', PART_COLS), d = ps.getDataRange().getValues(), at = -1;
      for (var i = 1; i < d.length; i++) if (String(d[i][1]) === String(p.pid) && String(d[i][2]) === String(p.study)) at = i + 1;
      if (at > 0) ps.getRange(at, 1, 1, PART_COLS.length).setValues([vals]); else ps.appendRow(vals);  // one row per pid x study
      if (p.finished) {  // mark complete in registry so the same pid cannot retake
        var reg = sheet_('registry', REG_COLS), rd = reg.getDataRange().getValues();
        for (var j = 1; j < rd.length; j++) if (String(rd[j][0]) === String(p.pid) && String(rd[j][1]) === String(p.study)) reg.getRange(j + 1, 7).setValue(1);
      }
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'unknown kind' });
  } finally { lock.releaseLock(); }
}
