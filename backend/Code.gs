// VISAGE Study 2 - Google Apps Script backend (bound to a Google Sheet). Setup: backend/SETUP.md
// Sheets (created on first use): registry (pid -> k, disclosure), rows (long-format responses), participants (one row per update).
// GET  ?action=ping -> {ok, sheet}
// GET  ?action=register&study=pilot&pid=..&target=F|M  -> {ok, k, disclosure, resumed, complete}
// POST {kind:'rows', pid, rows:[...]} | {kind:'participant', participant:{...}}  (Content-Type text/plain, avoids CORS preflight)

var ROW_COLS = ['row_id', 'pid', 'study', 'sex', 'target', 'seq_k', 'disclosure', 'block', 'target_id', 'file', 'condition',
  'axis', 'pole', 'strength', 'item', 'value', 'rt_ms', 'order', 'ts'];
var PART_COLS = ['received', 'pid', 'study', 'src', 'seq_k', 'disclosure', 'target', 'finished', 'total_s', 'step', 'attention_pass',
  'jstar_axis', 'jstar_sign', 'flat', 'tie', 'beta_json', 'agree_json', 'profile_json', 'started', 'ua', 'screen', 'version'];

function sheet_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(cols); sh.setFrozenRows(1); }
  return sh;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean_(s, n) { return String(s == null ? '' : s).slice(0, n || 200); }

function doGet(e) {
  var p = e.parameter || {};
  if (p.action === 'ping') return json_({ ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName() });
  if (p.action !== 'register') return json_({ ok: false, error: 'unknown action' });
  var pid = clean_(p.pid, 80), study = clean_(p.study, 20), target = p.target === 'M' ? 'M' : 'F';
  if (!pid) return json_({ ok: false, error: 'pid required' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var reg = sheet_('registry', ['pid', 'study', 'target', 'k', 'disclosure', 'registered', 'complete']);
    var data = reg.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === pid && data[i][1] === study)
        return json_({ ok: true, k: data[i][3], disclosure: data[i][4], resumed: true, complete: data[i][6] === 1 });
    }
    var k = 0;  // arrival order within study x target gender (Latin-square row)
    for (var j = 1; j < data.length; j++) if (data[j][1] === study && data[j][2] === target) k++;
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
      var rows = (body.rows || []).slice(0, 500).map(function (r) { return ROW_COLS.map(function (c) { return clean_(r[c], 300); }); });
      if (rows.length) { var sh = sheet_('rows', ROW_COLS); sh.getRange(sh.getLastRow() + 1, 1, rows.length, ROW_COLS.length).setValues(rows); }
      return json_({ ok: true, n: rows.length });
    }
    if (body.kind === 'participant') {
      var p = body.participant || {}, js = p.jstar || {};
      sheet_('participants', PART_COLS).appendRow([new Date(), clean_(p.pid, 80), clean_(p.study, 20), clean_(p.src, 20), p.seq_k, p.disclosure,
        clean_(p.target, 2), clean_(p.finished, 40), p.total_s, clean_(p.step, 30), p.attention_pass, clean_(js.axis, 20), js.sign, p.flat, p.tie,
        clean_(JSON.stringify(p.beta), 1000), clean_(JSON.stringify(p.agree), 1000), clean_(JSON.stringify(p.profile), 2000),
        clean_(p.started, 40), clean_(p.ua, 300), clean_(p.screen, 20), clean_(p.version, 40)]);
      if (p.finished) {  // mark complete in registry so the same pid cannot retake
        var reg = sheet_('registry', ['pid', 'study', 'target', 'k', 'disclosure', 'registered', 'complete']), d = reg.getDataRange().getValues();
        for (var i = 1; i < d.length; i++) if (d[i][0] === p.pid && d[i][1] === p.study) reg.getRange(i + 1, 7).setValue(1);
      }
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'unknown kind' });
  } finally { lock.releaseLock(); }
}
