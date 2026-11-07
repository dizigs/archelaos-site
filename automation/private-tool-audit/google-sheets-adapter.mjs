// SOURCE ONLY. No credentials, HTTP handler, Worker binding, cron, or live Sheets calls.
// This adapter requires a caller-owned OAuth Google Sheets v4 client. Treat all
// provider responses as untrusted; the caller must separately supply a durable,
// cross-process fenced writer and SQLite checkpoint.
const EVENT_KEY = /^[a-z][a-z0-9-]{1,47}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const SHEET_TITLE = 'LOG';
const HEADER_H = 'EVENT_ID (immutable)';
const HEADER_N = 'EVIDENCE / SHA / PROVIDER_ID';
const READ_PAGE = 1000;
const MAX_ROWS = 50000;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]*$/;
const MAX_FIELD = 1000;

export class SheetsAdapterFault extends Error {
  constructor(code) { super(code); this.name = 'SheetsAdapterFault'; this.code = code; }
}
function requireResponse(result) {
  if (!result || !result.data || typeof result.data !== 'object') {
    throw new SheetsAdapterFault('PROVIDER_RESPONSE_INVALID');
  }
  return result.data;
}
function validateKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 100 ||
      keys.some(key => typeof key !== 'string' || !EVENT_KEY.test(key)) ||
      new Set(keys).size !== keys.length) {
    throw new SheetsAdapterFault('INVALID_EVENT_KEYS');
  }
}
function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw new SheetsAdapterFault('INVALID_ROWS');
  }
  const keys = new Set();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 18 || !EVENT_KEY.test(row[7] ?? '') ||
        !HASH.test(row[13] ?? '') || keys.has(row[7]) ||
        row.some(x => typeof x !== 'string' || x.length > MAX_FIELD ||
          !SAFE_TEXT.test(x) || /^[=+\-@]/.test(x))) {
      throw new SheetsAdapterFault('INVALID_ROWS');
    }
    keys.add(row[7]);
  }
}

// Requires Google's official spreadsheets.values.{get,append} and spreadsheets.get
// methods. The caller owns token retrieval and MUST scope it to this private sheet.
export function createGoogleSheetsLogAdapter({ client, spreadsheetId, logSheetId = 1005 }) {
  if (!client || typeof client.spreadsheets?.get !== 'function' ||
      typeof client.spreadsheets?.values?.get !== 'function' ||
      typeof client.spreadsheets?.values?.append !== 'function' ||
      typeof spreadsheetId !== 'string' || !/^[a-zA-Z0-9_-]{20,120}$/.test(spreadsheetId) ||
      !Number.isSafeInteger(logSheetId) || logSheetId < 0) {
    throw new SheetsAdapterFault('TRUSTED_CLIENT_REQUIRED');
  }
  const params = { spreadsheetId };

  async function verifyTarget() {
    const metadata = requireResponse(await client.spreadsheets.get({
      ...params, fields: 'sheets(properties(sheetId,title,gridProperties(rowCount)))',
    }));
    if (!Array.isArray(metadata.sheets)) throw new SheetsAdapterFault('PROVIDER_RESPONSE_INVALID');
    const matches = metadata.sheets.filter(s => s?.properties?.title === SHEET_TITLE);
    if (matches.length !== 1 || matches[0].properties.sheetId !== logSheetId) {
      throw new SheetsAdapterFault('SHEET_TARGET_CHANGED');
    }
    const count = matches[0].properties?.gridProperties?.rowCount;
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ROWS) {
      throw new SheetsAdapterFault('SHEET_BOUNDS_UNKNOWN');
    }
    const header = requireResponse(await client.spreadsheets.values.get({
      ...params, range: "'LOG'!H1:N1", valueRenderOption: 'FORMATTED_VALUE',
    }));
    if (!Array.isArray(header.values) || header.values.length !== 1 ||
        !Array.isArray(header.values[0]) ||
        header.values[0][0] !== HEADER_H || header.values[0][6] !== HEADER_N) {
      throw new SheetsAdapterFault('SHEET_SCHEMA_MISMATCH');
    }
    return count;
  }
  async function findByEventKeys(keys) {
    validateKeys(keys);
    const rowCount = await verifyTarget();
    const wanted = new Set(keys);
    const result = [];
    // Bounded complete scan. Never infer absence from a single truncated page.
    for (let first = 2; first <= rowCount; first += READ_PAGE) {
      const end = Math.min(first + READ_PAGE - 1, rowCount);
      const data = requireResponse(await client.spreadsheets.values.get({
        ...params, range: "'LOG'!H" + first + ':N' + end,
        valueRenderOption: 'FORMATTED_VALUE',
      }));
      if (!Array.isArray(data.values) || data.values.length > end - first + 1) {
        throw new SheetsAdapterFault('PROVIDER_RESPONSE_INVALID');
      }
      for (const row of data.values) {
        if (!Array.isArray(row)) throw new SheetsAdapterFault('PROVIDER_RESPONSE_INVALID');
        if (!wanted.has(row[0])) continue;
        result.push({ eventKey: row[0], receiptHash: row[6] ?? '' });
      }
    }
    return result; // duplicates intentionally preserved for projector detection
  }
  async function appendRows(rows) {
    validateRows(rows);
    await verifyTarget();
    // An append timeout can follow a committed write. Throw without cursor ACK:
    // the projecter's next invocation must re-read the entire H/N key space.
    const data = requireResponse(await client.spreadsheets.values.append({
      ...params, range: "'LOG'!A:R",
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    }));
    if (data?.updates?.updatedRows !== rows.length) {
      throw new SheetsAdapterFault('PROVIDER_APPEND_UNCONFIRMED');
    }
  }
  return Object.freeze({ findByEventKeys, appendRows });
}
