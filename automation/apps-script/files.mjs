import { bytes, sha256, ScriptFault } from './security.mjs';
const required = ['Code', 'MuseumApprovals', 'CloudflareBridge'];
export function normalizeFiles(content) {
  if (!Array.isArray(content?.files) || content.files.length < 4 || content.files.length > 200) throw new ScriptFault('COMPLETE_PROJECT_CONTENT_REQUIRED', 422);
  let size = 0; const seen = new Set();
  const files = content.files.map(file => {
    if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 128 || /[\u0000-\u001f/\\]/.test(file.name) || !['SERVER_JS', 'HTML', 'JSON'].includes(file.type) || typeof file.source !== 'string') throw new ScriptFault('INVALID_PROJECT_FILE', 422);
    const key = file.type + ':' + file.name;
    if (seen.has(key)) throw new ScriptFault('DUPLICATE_PROJECT_FILE', 422); seen.add(key);
    size += bytes(file.source).length; if (size > 2 * 1024 * 1024) throw new ScriptFault('PROJECT_CONTENT_TOO_LARGE', 413);
    return { name: file.name, type: file.type, source: file.source };
  });
  if (required.some(name => !seen.has('SERVER_JS:' + name)) || !seen.has('JSON:appsscript')) throw new ScriptFault('PROTECTED_PROJECT_FILES_MISSING', 422);
  try { const manifest = JSON.parse(files.find(f => f.name === 'appsscript' && f.type === 'JSON').source); if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(); }
  catch { throw new ScriptFault('INVALID_APPS_SCRIPT_MANIFEST', 422); }
  return files;
}
export async function contentHash(project, files) {
  const sorted = [...files].sort((a, b) => {
    const x = a.type + ':' + a.name; const y = b.type + ':' + b.name; return x < y ? -1 : x > y ? 1 : 0;
  });
  return sha256(JSON.stringify({ project, files: sorted.map(f => ({ name: f.name, type: f.type, source: f.source })) }));
}
export function applyChanges(files, changes) {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 10) throw new ScriptFault('BOUNDED_CHANGES_REQUIRED', 422);
  const result = files.map(file => ({ ...file })); const seen = new Set();
  for (const change of changes) {
    if (!change || Object.keys(change).some(key => !['name', 'source', 'create'].includes(key)) || typeof change.name !== 'string' || typeof change.source !== 'string' || !change.source.trim()) throw new ScriptFault('INVALID_CODE_CHANGE', 422);
    const name = change.name.endsWith('.gs') ? change.name.slice(0, -3) : change.name;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) || name === 'appsscript' || seen.has(name)) throw new ScriptFault('UNAPPROVED_FILE_CHANGE', 422);
    seen.add(name);
    const index = result.findIndex(file => file.name === name && file.type === 'SERVER_JS');
    if (index < 0) {
      if (change.create !== true) throw new ScriptFault('EXPLICIT_FILE_CREATION_REQUIRED', 422);
      result.push({ name, type: 'SERVER_JS', source: change.source });
    } else {
      if (change.create === true) throw new ScriptFault('FILE_ALREADY_EXISTS');
      result[index] = { name, type: 'SERVER_JS', source: change.source };
    }
  }
  return normalizeFiles({ files: result });
}
