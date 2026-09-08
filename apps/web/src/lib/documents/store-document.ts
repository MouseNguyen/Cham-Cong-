import { spawnSync } from 'node:child_process';
import { mkdir, lstat, readFile, writeFile, rename, unlink, rmdir } from 'node:fs/promises';
import { join, isAbsolute, relative, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { WindowsSecretProtector } from '../secrets/windows-dpapi';
import { encryptPdf } from './encrypt-pdf';
export const digest=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
/** Trusted bootstrap directory only: project-private, never web/public or a junction. */
export async function privateDirectory(projectRoot:string,dir:string):Promise<void> {
  const rel=relative(projectRoot,dir);
  if(!isAbsolute(projectRoot)||!isAbsolute(dir)||!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||rel.split(sep).includes('public'))throw Error('INVALID_DOCUMENT_STORAGE');
  let cursor=projectRoot;
  for(const part of rel.split(sep)){
    cursor=join(cursor,part);
    await mkdir(cursor).catch((error:NodeJS.ErrnoException)=>{if(error.code!=='EEXIST')throw error;});
    const stat=await lstat(cursor);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('INVALID_DOCUMENT_STORAGE');
  }
  // Limit ACL changes to this exact owned directory. Children inherit this ACL.
  const command='[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value';
  const identity=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000,encoding:'utf8'});
  const sid=identity.stdout.trim();
  if(identity.status!==0||!/^S-1-\d+(?:-\d+)+$/.test(sid))throw Error('DOCUMENT_ACL_FAILED');
  const acl=spawnSync('icacls.exe',[dir,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F'],{windowsHide:true,timeout:10000,stdio:'pipe'});
  if(acl.status!==0)throw Error('DOCUMENT_ACL_FAILED');
}
export async function removeOwnedFile(path:string):Promise<void> {await unlink(path).catch((error:NodeJS.ErrnoException)=>{if(error.code!=='ENOENT')throw error;});}
export async function storeDocument(options:{projectRoot:string;storageRoot:string;id:string;pdf:Buffer;password:string;ownerPassword:string;qpdfPath:string;protector:WindowsSecretProtector}):Promise<{sha256:string;bytes:number;relativePath:string}> {
  await privateDirectory(options.projectRoot,options.storageRoot);
  const workRoot=join(options.storageRoot,'work');await mkdir(workRoot,{recursive:true});
  const work=join(workRoot,randomUUID());await mkdir(work);
  const plain=join(work,'input.pdf'),cipher=join(work,'encrypted.pdf'),secret=join(work,'password.secret');
  const target=join(options.storageRoot,`${options.id}.pdf`),targetSecret=join(options.storageRoot,`${options.id}.secret`);
  let promotedPdf=false,promotedSecret=false;
  try {
    await writeFile(plain,options.pdf,{flag:'wx'});
    encryptPdf({executable:options.qpdfPath,input:plain,output:cipher,password:options.password,ownerPassword:options.ownerPassword});
    const encrypted=await readFile(cipher),sha256=digest(encrypted);
    const payload=Buffer.from(JSON.stringify({password:options.password,artifactId:options.id,sha256}));
    let protectedValue:Buffer;
    try {protectedValue=await options.protector.protect(payload,`payslip:${options.id}`);}finally{payload.fill(0);}
    await writeFile(secret,protectedValue,{flag:'wx'});protectedValue.fill(0);
    await rename(cipher,target);promotedPdf=true;
    await rename(secret,targetSecret);promotedSecret=true;
    return {sha256,bytes:encrypted.length,relativePath:`${options.id}.pdf`};
  } catch {
    if(promotedPdf)await removeOwnedFile(target);
    if(promotedSecret)await removeOwnedFile(targetSecret);
    throw Error('DOCUMENT_STORE_FAILED');
  } finally {
    options.pdf.fill(0);
    for(const file of [plain,cipher,secret])await removeOwnedFile(file);
    await rmdir(work);
  }
}
