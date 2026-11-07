// Internal filesystem primitives only; no provider, credentials or task journal.
import {closeSync,constants,fstatSync,mkdirSync,openSync,readSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function requireSafeFilesystem() {
  if (process.platform!=='linux' ||
      ![constants.O_NOFOLLOW,constants.O_NONBLOCK,constants.O_DIRECTORY].every(n=>Number.isInteger(n)&&n>0)) {
    throw new Error('FILESYSTEM_SAFETY_UNAVAILABLE');
  }
}
export function heldPath(directory,leaf) {
  if (!Number.isInteger(directory) || !['.private','activity.lock','activity.jsonl'].includes(leaf)) throw new Error('PRIVATE_PATH_INVALID');
  assertDescriptorDirectory(directory);
  return '/proc/self/fd/'+directory+'/'+leaf;
}
export function assertDescriptorDirectory(directory) {
  let probe;
  try {
    const expected=fstatSync(directory,{bigint:true});
    // Follow ONLY this kernel self-descriptor magic link, never a private leaf.
    // Compare opened inode identity before interpreting any child ENOENT as empty.
    probe=openSync('/proc/self/fd/'+directory,constants.O_RDONLY|constants.O_DIRECTORY);
    const actual=fstatSync(probe,{bigint:true});
    if(!expected.isDirectory()||!actual.isDirectory()||expected.dev!==actual.dev||expected.ino!==actual.ino)
      throw new Error('DESCRIPTOR_PATHS_UNAVAILABLE');
  }catch{throw new Error('DESCRIPTOR_PATHS_UNAVAILABLE');}
  finally{if(probe!==undefined)closeSync(probe);}
}
export function assertRegularDescriptor(fd,maxBytes,privateOwner=false) {
  const stat=fstatSync(fd,{bigint:true});
  if (!stat.isFile()) throw new Error('NOT_REGULAR_FILE');
  if (stat.nlink!==1n) throw new Error('FILE_HAS_MULTIPLE_LINKS');
  if (stat.size>BigInt(maxBytes)) throw new Error('FILE_TOO_LARGE');
  if (privateOwner && (stat.uid!==BigInt(process.getuid()) || (stat.mode&0o077n)!==0n))
    throw new Error('PRIVATE_FILE_PERMISSIONS_UNSAFE');
  return stat;
}
export function readBoundedDescriptor(fd,maxBytes,privateOwner=false) {
  const before=assertRegularDescriptor(fd,maxBytes,privateOwner),buffer=Buffer.alloc(maxBytes+1);
  let count=0;
  while(count<buffer.length) {
    const read=readSync(fd,buffer,count,buffer.length-count,count);
    if (read===0) break;
    count+=read;
  }
  const after=assertRegularDescriptor(fd,maxBytes,privateOwner);
  if (count>maxBytes) throw new Error('FILE_TOO_LARGE');
  if (['dev','ino','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]) || BigInt(count)!==after.size)
    throw new Error('FILE_CHANGED_DURING_READ');
  try {return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,count));}
  catch {throw new Error('FILE_UTF8_INVALID');}
}
export function readBoundedFile(filename,maxBytes) {
  requireSafeFilesystem();
  const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {return readBoundedDescriptor(fd,maxBytes);}
  finally {closeSync(fd);}
}
export function withPrivateDirectory(here,create,operation) {
  requireSafeFilesystem();
  const root=openSync(here,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  let directory;
  try {
    // Directory-relative access through a held Linux descriptor. Never follow
    // .private or re-resolve its parent pathname between validation and use.
    const path=heldPath(root,'.private');
    if (create) {
      try {mkdirSync(path,{mode:0o700});}
      catch(error){if(error.code!=='EEXIST')throw error;}
    }
    try {directory=openSync(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);}
    catch(error){
      if(!create&&error.code==='ENOENT'){
        assertDescriptorDirectory(root);
        return operation(undefined);
      }
      throw error;
    }
    const stat=fstatSync(directory,{bigint:true});
    if (!stat.isDirectory() || stat.uid!==BigInt(process.getuid()) || (stat.mode&0o077n)!==0n)
      throw new Error('PRIVATE_DIRECTORY_PERMISSIONS_UNSAFE');
    return operation(directory);
  } finally {
    if(directory!==undefined)closeSync(directory);
    closeSync(root);
  }
}
export function isMainModule(metaUrl,argument=process.argv[1]) {
  if (!argument) return false;
  try {return realpathSync(argument)===realpathSync(fileURLToPath(metaUrl));}
  catch {return false;}
}
