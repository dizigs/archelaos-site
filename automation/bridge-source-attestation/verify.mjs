/** Offline, read-only integrity gate for a PRIVATE Cloudflare Worker source export.
 * Never prints or uploads module contents. Does not talk to GitHub/Cloudflare.
 */
import {readFile, open, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, relative, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE = /^[a-zA-Z0-9._/-]+$/;
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function checkedName(name) {
  if (typeof name !== 'string' || !SAFE.test(name) || name.startsWith('/') ||
      name.split('/').some(part => part === '..' || part === '.' || part === '')) {
    throw new Error('UNSAFE_MANIFEST_PATH');
  }
  return name;
}
async function safeBytes(root, name) {
  checkedName(name);
  // Offline owner tool runs on Linux. Refuse unsafe platform fallbacks.
  if (process.platform !== 'linux' || typeof constants.O_NOFOLLOW !== 'number')
    throw new Error('SECURE_LOCAL_READ_NOT_SUPPORTED');
  const base = await realpath(root);
  const candidate = resolve(base, name);
  if (relative(base, candidate).startsWith('..' + sep) || candidate === base)
    throw new Error('OUTSIDE_PRIVATE_SOURCE_ROOT');
  let handle;
  try {
    // O_NOFOLLOW prevents final symlink; the file handle pins the opened inode.
    handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    // Resolve the *opened descriptor*, not a raceable pathname. Also detects
    // intermediate directory symlinks (and rename/unlink races) on Linux.
    const actual = await realpath('/proc/self/fd/' + handle.fd);
    if (actual !== candidate) throw new Error('SYMLINK_FORBIDDEN');
    // Bounded read: never trust a pre-read stat size or allocate arbitrarily.
    const cap = 262145;
    const bytes = Buffer.allocUnsafe(cap);
    let length = 0;
    while (length < cap) {
      const {bytesRead} = await handle.read(bytes, length, cap - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length === cap) throw new Error('INVALID_MODULE_FILE');
    return bytes.subarray(0, length);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error('SYMLINK_FORBIDDEN');
    throw error;
  } finally {
    await handle?.close();
  }
}
export function validateManifest(manifest) {
  if (manifest?.schema !== 'archelaos.bridge.deployed-source.v1' ||
      !Array.isArray(manifest.modules) || manifest.modules.length < 1) {
    throw new Error('INVALID_MANIFEST');
  }
  const names = new Set();
  for (const item of manifest.modules) {
    checkedName(item.name);
    if (names.has(item.name) || !SHA1.test(item.git_blob_sha1) ||
        !SHA256.test(item.sha256) || !Number.isSafeInteger(item.bytes) ||
        item.bytes < 1 || item.bytes > 262144) throw new Error('INVALID_MANIFEST_ENTRY');
    names.add(item.name);
    if (item.repo_path !== null) checkedName(item.repo_path);
    if (item.repo_blob_sha1 !== null && !SHA1.test(item.repo_blob_sha1))
      throw new Error('INVALID_REPO_BLOB');
    if ((item.repo_path === null) !== (item.repo_blob_sha1 === null) ||
        (item.repo_path === null) !== (item.repo_sha256 === null) ||
        (item.repo_sha256 !== null && !SHA256.test(item.repo_sha256)))
      throw new Error('INCOMPLETE_REPO_MAPPING');
  }
  return manifest;
}
export async function verifyPrivate(root, manifest) {
  validateManifest(manifest);
  const records = [];
  for (const item of manifest.modules) {
    let status;
    try {
      const bytes = await safeBytes(root, item.name);
      // SHA-256 controls all security decisions; Git object SHA-1 is metadata.
      status = (bytes.length === item.bytes && sha256(bytes) === item.sha256)
        ? 'MATCH' : 'CONTENT_MISMATCH';
    } catch (e) {
      status = e.code === 'ENOENT' ? 'MISSING' : (e.message || 'READ_FAILURE');
    }
    records.push({name:item.name,status});
  }
  return {status:records.every(r => r.status === 'MATCH') ? 'ATTESTED_PRIVATE_COPY' : 'BLOCKED', records};
}
export async function verifyRepo(root, manifest) {
  validateManifest(manifest);
  const records=[];
  for (const item of manifest.modules) {
    if (item.repo_path === null) {
      records.push({name:item.name,status:'NO_PUBLIC_REPO_COUNTERPART'});
      continue;
    }
    let status;
    try {
      const bytes = await safeBytes(root, item.repo_path);
      const hash = sha256(bytes);
      status = hash !== item.repo_sha256 ? 'REPO_BASELINE_CHANGED' :
        (hash === item.sha256 && bytes.length === item.bytes)
          ? 'EXACT_DEPLOYED_MATCH' : 'EXPECTED_DEPLOYED_DRIFT';
    } catch(e) {
      status = e.code === 'ENOENT' ? 'REPO_FILE_MISSING' : (e.message || 'READ_FAILURE');
    }
    records.push({name:item.name,status});
  }
  const unexpected=records.some(r => !['EXACT_DEPLOYED_MATCH','EXPECTED_DEPLOYED_DRIFT','NO_PUBLIC_REPO_COUNTERPART'].includes(r.status));
  const recovered=records.every(r=>r.status==='EXACT_DEPLOYED_MATCH');
  return {status:unexpected?'UNEXPECTED_REPO_DRIFT':recovered?'MATCH':'SOURCE_RECOVERY_BLOCKED',records};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode,root='.',file=new URL('./manifest.json',import.meta.url).pathname] = process.argv.slice(2);
  if (!['repo','private'].includes(mode)) {
    console.error('Usage: node verify.mjs repo|private <repo-root|private-export-root> [manifest.json]');
    process.exitCode=64;
  } else {
    try {
      const manifest=JSON.parse(await readFile(file,'utf8'));
      const result=mode==='repo'?await verifyRepo(root,manifest):await verifyPrivate(root,manifest);
      for(const row of result.records) console.log(row.name+': '+row.status);
      console.log('RESULT: '+result.status);
      if (result.status === 'UNEXPECTED_REPO_DRIFT') process.exitCode=3;
      else if (!['ATTESTED_PRIVATE_COPY','MATCH'].includes(result.status)) process.exitCode=2;
    } catch(e) {console.error('ATTESTATION_FAILED:',e.message);process.exitCode=3;}
  }
}
