import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { expect, test } from 'vitest';

test('public ingress transitive local imports cannot reach private admin or payroll modules', () => {
  const root=resolve('.');const seen=new Set<string>();
  const visit=(file:string)=>{
    if(seen.has(file))return;seen.add(file);
    const name=relative(root,file).replaceAll('\\','/');
    expect(name).not.toMatch(/^apps\/web\/|packages\/(payroll|delivery|document)/);
    const source=readFileSync(file,'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\s*\(|require\s*\()['"]([^'"]+)['"]/g)){
      const spec=match[1]!;
      if(!spec.startsWith('.')){expect(spec).not.toMatch(/@pay-slip\/(web|payroll|documents)/);continue;}
      const target=resolve(dirname(file),spec);const found=[target,target+'.ts',resolve(target,'index.ts')].find(existsSync);
      expect(found,'unresolved local import '+spec).toBeTruthy();if(found)visit(found);
    }
  };
  visit(resolve('apps/attendance-ingress/src/main.ts'));
  expect(seen.size).toBeGreaterThan(3);
});
