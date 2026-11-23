export const MASTER_LICENSE_APPS_SCRIPT = `// Reben Station Shift — Master License Server (Option 1)
// 1. Open script.google.com -> New Project -> Paste this code
// 2. Run setupLicenseSheet() once (authorize Google Sheets access)
// 3. Deploy -> New deployment -> Web App -> Execute as: Me -> Who has access: Anyone
// 4. Copy the /exec Web App URL or Deployment ID into Seller Studio

const SHEET_NAME = 'Licenses';

function setupLicenseSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }
  if (sh.getLastRow() === 0) {
    const headers = [
      'LicenseKey',
      'StationName',
      'DeviceIDs',
      'MaxDevices',
      'Plan',
      'ExpiresAt',
      'Status',
      'Notes',
      'LastCheck',
    ];
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1e293b')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.appendRow([
      'RBN-DEMO-2026',
      'Sample Station',
      '',
      2,
      'yearly',
      '2027-12-31',
      'ACTIVE',
      'Sample key - replace or add your buyers below',
      '',
    ]);
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function parseExpiryMs(val) {
  if (!val) return 0; // empty = lifetime
  if (val instanceof Date) {
    const d = new Date(val.getTime());
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  const str = String(val).trim();
  if (!str || str.toUpperCase() === 'LIFETIME') return 0;
  const parsed = Date.parse(str.length === 10 ? str + 'T23:59:59Z' : str);
  return isNaN(parsed) ? 0 : parsed;
}

function doGet() {
  return jsonOut({ ok: true, service: 'Reben License Server' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || 'verify').toLowerCase();
    const licenseKey = String(body.licenseKey || '').trim().toUpperCase();
    const deviceId = String(body.deviceId || '').trim().toUpperCase();
    const stationInput = String(body.stationName || '').trim();

    if (!licenseKey || !deviceId) {
      return jsonOut({ ok: false, error: 'INVALID_KEY' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      return jsonOut({ ok: false, error: 'SHEET_NOT_INITIALIZED' });
    }

    const data = sh.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim().toUpperCase() === licenseKey) {
        rowIdx = i + 1; // 1-indexed sheet row
        break;
      }
    }
    if (rowIdx === -1) {
      return jsonOut({ ok: false, error: 'INVALID_KEY' });
    }

    const row = data[rowIdx - 1];
    const stationName = String(row[1] || '').trim() || stationInput;
    const rawDevices = String(row[2] || '').trim();
    const devices = rawDevices
      ? rawDevices.split(',').map(function (d) { return d.trim().toUpperCase(); }).filter(Boolean)
      : [];
    const maxDevices = Math.max(1, parseInt(row[3], 10) || 1);
    const plan = String(row[4] || 'yearly').trim().toLowerCase();
    const expiresAt = parseExpiryMs(row[5]);
    const status = String(row[6] || 'ACTIVE').trim().toUpperCase();
    const nowMs = Date.now();

    if (status !== 'ACTIVE') {
      return jsonOut({ ok: false, error: 'LICENSE_SUSPENDED' });
    }

    if (expiresAt > 0 && nowMs > expiresAt) {
      return jsonOut({ ok: false, error: 'LICENSE_EXPIRED', expiresAt: expiresAt });
    }

    const alreadyBound = devices.indexOf(deviceId) !== -1;
    if (!alreadyBound) {
      if (action === 'verify') {
        return jsonOut({ ok: false, error: 'DEVICE_NOT_BOUND' });
      }
      if (devices.length >= maxDevices) {
        return jsonOut({ ok: false, error: 'DEVICE_LIMIT_REACHED', maxDevices: maxDevices });
      }
      devices.push(deviceId);
      sh.getRange(rowIdx, 3).setValue(devices.join(', '));
      if (!String(row[1] || '').trim() && stationInput) {
        sh.getRange(rowIdx, 2).setValue(stationInput);
      }
    }

    sh.getRange(rowIdx, 9).setValue(new Date().toISOString());

    return jsonOut({
      ok: true,
      licenseKey: licenseKey,
      plan: plan,
      expiresAt: expiresAt,
      stationName: stationName,
      maxDevices: maxDevices,
      status: 'ACTIVE',
      serverTime: nowMs,
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}
`;
