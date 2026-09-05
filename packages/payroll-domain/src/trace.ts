import { createHash } from 'node:crypto';
export function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) => {
    if(typeof child==='bigint')return child.toString(10);
    if(child!==null && typeof child==='object' && !Array.isArray(child))return Object.fromEntries(Object.entries(child).sort(([a],[b])=>a<b?-1:a>b?1:0));
    return child;
  });
}
export function sha256(value:string):string{return createHash('sha256').update(value,'utf8').digest('hex');}
