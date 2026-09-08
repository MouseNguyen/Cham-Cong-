import {test,afterAll,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {deliveryPool,seedDelivery,seedIds} from './delivery-fixtures';
import {scenario,login,protector} from '../auth/support';
import {createDocumentsHandler} from '../../../apps/web/src/lib/admin/documents-http';
import {registerDeliveryTools,type DeliveryToolHost} from '../../../apps/web/src/lib/admin/delivery-tools';
import {hashSecret} from '../../../apps/web/src/lib/auth/csrf';
const pool=deliveryPool();afterAll(()=>pool.end());
test('seed finalized synthetic delivery boundary',async()=>{if(process.env.PAYSLIP_DELIVERY_SEED==='1')await seedDelivery(pool);},60000);
const active=process.env.PAYSLIP_DELIVERY_SEED!=='1';
const origin='http://127.0.0.1:46217';
function deps(){return {pool,protector,organizationId:seedIds().organizationId,origin,projectRoot:process.cwd(),storageRoot:process.env.PAYSLIP_DOCUMENT_STORAGE!,qpdfPath:process.env.PAYSLIP_QPDF_PATH!,chromiumPath:process.env.PAYSLIP_CHROMIUM_PATH!,now:()=>new Date()};}
async function authenticated(role:'owner'|'accountant'='owner',foreign=false){const a=await scenario(pool,role,foreign?undefined:seedIds().organizationId);return login(a);}
function request(session:Awaited<ReturnType<typeof authenticated>>,query:string,input?:Record<string,unknown>){return new Request(origin+'/api/documents'+query,{method:input?'POST':'GET',headers:{host:new URL(origin).host,origin,cookie:`pay_slip_session=${session.token}`,'x-csrf-token':session.csrfToken,'content-type':'application/json'},...(input?{body:JSON.stringify(input)}:{})});}
test.skipIf(!active)('HTTP private PDF is org/employee-bound, immutable and no-store',async()=>{
 const d=deps(),handle=createDocumentsHandler(d),s=await authenticated(),ids=seedIds();
 const a=(await pool.query('SELECT * FROM document_artifacts WHERE organization_id=$1',[ids.organizationId])).rows[0];expect(!!a).toBe(true);
 const query=`?view=download&artifactId=${a.id}&employeeId=${ids.employeeId}`;
 const good=await handle(request(s,query));expect(good.status).toBe(200);expect(good.headers.get('cache-control')).toContain('no-store');expect(good.headers.get('content-type')).toBe('application/pdf');expect((await good.arrayBuffer()).byteLength).toBe(Number(a.size_bytes));
 expect((await handle(new Request(origin+'/api/documents'+query,{headers:{host:new URL(origin).host}}))).status).toBe(401);
 expect((await handle(request(await authenticated('accountant'),query))).status).not.toBe(200);
 expect((await handle(request(await authenticated('owner',true),query))).status).not.toBe(200);
 expect((await handle(request(s,query.replace(ids.employeeId,randomUUID())))).status).toBe(404);
 const file=join(d.storageRoot,a.relative_path),bytes=await readFile(file);try{await writeFile(file,Buffer.from('corrupt synthetic'));expect((await handle(request(s,query))).status).not.toBe(200);}finally{await writeFile(file,bytes);}
});
test.skipIf(!active)('HTTP confirmation, CSRF, stale preview and owner enforcement reject without effects',async()=>{
 const handle=createDocumentsHandler(deps()),s=await authenticated(),ids=seedIds();
 const p=(await pool.query('SELECT * FROM payslip_release_previews WHERE organization_id=$1 ORDER BY created_at LIMIT 1',[ids.organizationId])).rows[0];
 const input={action:'release',previewId:p.id,hash:p.binding_hash};
 expect((await (await handle(request(s,'',input))).json()).code).toBe('CONFIRMATION_REQUIRED');
 expect((await (await handle(request(s,'',{...input,confirmed:true,hash:'0'.repeat(64)}))).json()).code).toBe('PREVIEW_MISMATCH');
 const csrf=request(s,'',{...input,confirmed:true});csrf.headers.set('x-csrf-token','invalid');expect((await (await handle(csrf)).json()).code).toBe('CSRF');
 expect((await (await handle(request(await authenticated('accountant'),'',{...input,confirmed:true}))).json()).code).toBe('OWNER_REQUIRED');
 expect((await (await handle(request(s,'',{action:'generate',confirmed:true,payRunEmployeeId:ids.payRunEmployeeId,employeeId:randomUUID()}))).json()).code).toBe('NOT_FOUND');
 await pool.query('UPDATE employee_email_verifications SET invalidated_at=now() WHERE destination_id=$1',[ids.destinationId]);
 try{expect((await (await handle(request(s,'',{...input,confirmed:true}))).json()).code).toBe('RELEASE_BINDING_MISMATCH');}finally{await pool.query('UPDATE employee_email_verifications SET invalidated_at=NULL WHERE destination_id=$1',[ids.destinationId]);}
 expect((await pool.query("SELECT count(*)::int n FROM payslip_release_receipts WHERE organization_id=$1 AND kind='queued_fake'",[ids.organizationId])).rows[0].n).toBe(1);
 const later=new Date(Date.now()+11*60000);await pool.query('UPDATE sessions SET mfa_satisfied_at=$2 WHERE token_hash=$1',[hashSecret(s.token),later]);
 const expired=createDocumentsHandler({...deps(),now:()=>later});expect((await (await expired(request(s,'',{...input,confirmed:true}))).json()).code).toBe('PREVIEW_EXPIRED');
});
test.skipIf(!active)('page tool contract invalidates stale calls and never executes effects',()=>{
 const host:DeliveryToolHost={};let opens=0;const close=registerDeliveryTools(host,{status:'draft'},{release:()=>{opens++;}}),tools=host.paySlipDeliveryTools!;
 expect(tools[0]!.readOnly).toBe(true);expect(tools[1]!.execute({})).toEqual({status:'human_confirmation_required'});expect(opens).toBe(1);
 expect(()=>tools[1]!.execute({confirmed:true})).toThrow('INVALID_INPUT');close();expect(host.paySlipDeliveryTools).toBeUndefined();expect(()=>tools[0]!.execute({})).toThrow('STALE_TOOL');
});
test.skipIf(!active)('manual HTTP receipt and separate password handoff persist without fake send',async()=>{
 const ids=await seedDelivery(pool,false),d={...deps(),organizationId:ids.organizationId},handle=createDocumentsHandler(d),s=await login(await scenario(pool,'owner',ids.organizationId));
 const post=async(input:Record<string,unknown>)=>{const response=await handle(request(s,'',{confirmed:true,...input}));expect(response.status).toBe(200);return response.json();};
 const artifact=await post({action:'generate',employeeId:ids.employeeId,payRunEmployeeId:ids.payRunEmployeeId});
 const p=await post({action:'preview',employeeId:ids.employeeId,artifactId:artifact.id,destinationId:ids.destinationId}),input={previewId:p.id,hash:p.hash};
 const other=await post({action:'preview',employeeId:ids.employeeId,artifactId:artifact.id,destinationId:ids.destinationId});
 expect((await (await handle(request(s,'',{...input,confirmed:true,action:'password'}))).json()).code).toBe('DELIVERY_CONFIRMATION_REQUIRED');
 expect((await post({...input,action:'manual'})).status).toBe('operator_confirmed_manual');
 expect((await (await handle(request(s,'',{action:'release',confirmed:true,previewId:other.id,hash:other.hash}))).json()).code).toBe('DELIVERY_ALREADY_RECORDED');
 const secret=await post({...input,action:'password'});expect(typeof secret.password==='string'&&secret.password.length>15).toBe(true);secret.password=null;
 expect((await post({...input,action:'handoff',channel:'phone'})).status).toBe('password_handoff_confirmed');
 const loaded=await (await handle(request(s,`?payRunId=${ids.payRunId}`))).json();const settled=loaded.rows[0].previews.find((v:{status:string})=>v.status==='operator_confirmed_manual');expect(settled.receipts).toHaveLength(2);
 const later=new Date(Date.now()+11*60000);await pool.query('UPDATE sessions SET mfa_satisfied_at=$2 WHERE token_hash=$1',[hashSecret(s.token),later]);
 const afterExpiry=createDocumentsHandler({...d,now:()=>later});const lateSecret=await afterExpiry(request(s,'',{...input,action:'password',confirmed:true}));expect(lateSecret.status).toBe(200);await lateSecret.body?.cancel();
 expect((await pool.query("SELECT count(*)::int n FROM payslip_release_receipts WHERE organization_id=$1 AND kind='queued_fake'",[ids.organizationId])).rows[0].n).toBe(0);
},60000);
