import { spawnSync } from 'node:child_process';
/** qpdf reads arguments from stdin; passwords never enter argv or diagnostics. */
function run(executable:string,args:string[]):Buffer {
  if(args.some(arg=>/[\r\n]/.test(arg)))throw Error('INVALID_QPDF_ARGUMENT');
  const input=Buffer.from(args.join('\n')+'\n');
  try {
    const result=spawnSync(executable,['@-'],{input,windowsHide:true,timeout:15000,maxBuffer:20*1024*1024});
    result.stderr?.fill(0);
    if(result.error||result.status!==0){result.stdout?.fill(0);throw Error('PDF_ENCRYPTION_VERIFICATION_FAILED');}
    return result.stdout;
  } finally {input.fill(0);}
}
export function encryptPdf(options:{executable:string;input:string;output:string;password:string;ownerPassword:string}):void {
  if(options.password===options.ownerPassword||options.password.length<32||options.ownerPassword.length<32)throw Error('PDF_PASSWORD_INVALID');
  run(options.executable,['--encrypt',options.password,options.ownerPassword,'256','--',options.input,options.output]).fill(0);
  run(options.executable,[options.output,`--password=${options.password}`,'--check']).fill(0);
  const info=run(options.executable,[options.output,`--password=${options.password}`,'--show-encryption']);
  try {if(!info.includes(Buffer.from('AESv3')))throw Error('PDF_AES256_REQUIRED');}finally{info.fill(0);}
}
