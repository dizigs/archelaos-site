/**
 * Archelaos museum: approval review & public export.
 * Add this file to the private Apps Script project for the admin mailbox.
 * Never publishes directly. It creates a curator-review-only JSON draft
 * in the private index folder when approved records have consent.
 */
const MUSEUM_APPROVAL = {
  sheetId: '1kiK5bhIX9SjueZGo0eOMX0h8uo55p4Xp0pEV9vl1Bzg',
  indexFolderId: '14LT-TF1t71w4BVHGHkb5c9t_hnu83n8z',
  tab: 'Συνεισφορές'
};
function museumPrepareApprovedDraft() {
  const sheet = SpreadsheetApp.openById(MUSEUM_APPROVAL.sheetId).getSheetByName(MUSEUM_APPROVAL.tab);
  if (!sheet) throw new Error('Missing contributions tab');
  const values = sheet.getDataRange().getDisplayValues();
  const entries = [];
  for (let row = 1; row < values.length; row++) {
    const v = values[row];
    const code = (v[0] || '').trim();
    const approved = (v[7] || '').trim() === 'Εγκρίθηκε';
    const consent = (v[4] || '').trim() === 'ΝΑΙ';
    if (!code || !approved || !consent) continue;
    const displayName = (v[5] || v[2] || '').trim();
    const summary = (v[6] || '').trim();
    const links = (v[12] || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean)
      .filter(s => /^https:\/\/archelaos\.club\//.test(s));
    if (!displayName || !summary || !links.length) continue;
    entries.push({
      submissionId: code,
      displayName: displayName.substring(0, 100),
      summary: summary.substring(0, 700),
      publishedLinks: links
    });
  }
  const draft = {
    version: 1,
    kind: 'curator-review-only',
    exportedAt: new Date().toISOString(),
    entries: entries
  };
  const folder = DriveApp.getFolderById(MUSEUM_APPROVAL.indexFolderId);
  const fileName = 'museum-approved-review.json';
  const it = folder.getFilesByName(fileName);
  if (it.hasNext()) it.next().setContent(JSON.stringify(draft, null, 2));
  else folder.createFile(fileName, JSON.stringify(draft, null, 2), MimeType.PLAIN_TEXT);
  return { prepared: entries.length, note: 'Private review only. Public publication requires a separate curator action.' };
}
