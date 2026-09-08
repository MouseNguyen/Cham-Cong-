import {test,expect} from 'vitest';
import {snapshotPayableTime,materializeHoliday} from '../../../apps/web/src/lib/db/repositories/pay-runs';
import {payslipViewModel,type PayslipSource} from '../../../packages/document-domain/src/payslip-view-model';
import {canonicalize,sha256} from '../../../packages/payroll-domain/src/trace';
const segment=(classification:string,startUtcMs:number,endUtcMs:number)=>({classification,startUtcMs,endUtcMs,durationMs:String(endUtcMs-startUtcMs)});
test('ordinary, holiday and mixed immutable segments determine exact time',()=>{
 expect(snapshotPayableTime({totalPayableDurationMs:'3600000',segments:[segment('ordinary',0,3600000)]},0,10800000)).toEqual({payable:'3600000',holiday:'0'});
 expect(snapshotPayableTime({totalPayableDurationMs:'7200000',segments:[segment('holiday_daytime',0,7200000)]},0,10800000)).toEqual({payable:'7200000',holiday:'7200000'});
 expect(snapshotPayableTime({totalPayableDurationMs:'10800000',segments:[segment('ordinary',0,3600000),segment('holiday_daytime',3600000,10800000)]},0,10800000)).toEqual({payable:'10800000',holiday:'7200000'});
});

function documentSource(snapshot:Record<string,unknown>,term:Record<string,unknown>={monthlySalaryVnd:'8000000'}):PayslipSource {
 const rulePayload=canonicalize({id:'synthetic-rule'}),compensation=canonicalize(term),snapshotPayload=canonicalize(snapshot),artifact='a'.repeat(64);
 const input=canonicalize({mode:'synthetic_preview',employment:{kind:'full_time',monthlySalaryVnd:'8000000'},attendance:{payableMilliseconds:'7200000'},ruleBinding:{id:'synthetic-rule',version:'synthetic-1'},calculator:{version:'0.1.0',sourceArtifactSha256:artifact,canonicalizationVersion:'1'}});
 const result=canonicalize({inputHash:sha256(input),rulePackHash:sha256(rulePayload),rulePackId:'synthetic-rule',calculatorVersion:'0.1.0',calculatorArtifactHash:artifact,canonicalizationVersion:'1',resultSchemaVersion:'1',status:'synthetic_preview',gross:'8600000',net:'7760000',employeeInsuranceTotal:'840000',employerInsuranceTotal:'1720000',lines:[{code:'holiday.daytime_premium',labelVi:'Synthetic holiday premium',amountVnd:'600000'}]});
 return {canonical_input:input,input_hash:sha256(input),canonical_result:result,result_hash:sha256(result),snapshot_payload:snapshotPayload,snapshot_hash:sha256(snapshotPayload),compensation_payload:compensation,compensation_hash:sha256(compensation),rule_payload:rulePayload,rule_pack_hash:sha256(rulePayload),rule_pack_id:'synthetic-rule',calculator_version:'0.1.0',calculator_artifact_hash:artifact,canonicalization_version:'1',result_schema_version:'1',company_name:'Synthetic',employee_name:'Synthetic employee',period_start:new Date('2026-07-31T17:00:00Z'),period_end:new Date('2026-08-31T17:00:00Z'),timezone:'Asia/Ho_Chi_Minh'};
}
test('PDF reads current and legacy snapshot durations with identical presentation',()=>{
 const render=(snapshot:Record<string,unknown>)=>payslipViewModel(documentSource(snapshot),'synthetic-slip',new Date('2026-09-01T00:00:00Z'));
 const legacy=render({approvedPayableMilliseconds:'7200000'});
 expect(render({totalPayableDurationMs:'7200000'})).toEqual(legacy);
 expect(render({totalPayableDurationMs:'7200000',approvedPayableMilliseconds:'7200000'})).toEqual(legacy);
});
test('PDF rejects conflicting, absent, mismatched and tampered snapshot duration sources',()=>{
 for(const snapshot of [{totalPayableDurationMs:'1',approvedPayableMilliseconds:'7200000'},{totalPayableDurationMs:'7200000',approvedPayableMilliseconds:'1'},{},{totalPayableDurationMs:'1'}])expect(()=>payslipViewModel(documentSource(snapshot),'synthetic-slip',new Date())).toThrow('DOCUMENT_SOURCE_BINDING_MISMATCH');
 const source=documentSource({totalPayableDurationMs:'7200000'});source.snapshot_payload='{}';expect(()=>payslipViewModel(source,'synthetic-slip',new Date())).toThrow('DOCUMENT_SOURCE_HASH_MISMATCH');
});
test('unsupported classifications, inconsistent durations, overlaps and bounds fail closed',()=>{
 for(const classification of ['night_work','out_of_schedule','unknown'])expect(()=>snapshotPayableTime({totalPayableDurationMs:'1000',segments:[segment(classification,0,1000)]},0,2000)).toThrow();
 for(const value of [
  {totalPayableDurationMs:'999',segments:[segment('ordinary',0,1000)]},
  {totalPayableDurationMs:'1000',segments:[{...segment('ordinary',0,1000),durationMs:'999'}]},
  {totalPayableDurationMs:'2000',segments:[segment('ordinary',0,1000),segment('holiday_daytime',500,1500)]},
  {totalPayableDurationMs:'1000',segments:[segment('ordinary',-1,999)]},
  {totalPayableDurationMs:'1000',segments:[null]},
 ])expect(()=>snapshotPayableTime(value,0,2000)).toThrow();
});
test('holiday time never comes from configuration and missing policy blocks',()=>{
 const policy={holidayPremiumBasisPoints:30000,holidayEntitlementTreatment:'included_in_monthly'};
 const template={ordinaryHourlyDivisorHours:'80',paidEntitlementVnd:'0',payableMilliseconds:'999999',daytimePremiumBasisPoints:40000};
 expect(materializeHoliday(template,'7200000',policy)).toMatchObject({payableMilliseconds:'7200000',ordinaryHourlyDivisorHours:'80',daytimePremiumBasisPoints:30000});
 expect(materializeHoliday(template,'0',policy)).toBeNull();
 expect(()=>materializeHoliday(null,'7200000',policy)).toThrow('HOLIDAY_POLICY_REQUIRED');
 expect(()=>materializeHoliday({...template,ordinaryHourlyDivisorHours:'0'},'7200000',policy)).toThrow('HOLIDAY_POLICY_REQUIRED');
});

test('PDF binds versioned compensation and rejects conflicting or unsupported sources',()=>{
 const render=(term:Record<string,unknown>)=>payslipViewModel(documentSource({totalPayableDurationMs:'7200000'},term),'synthetic-slip',new Date('2026-09-01T00:00:00Z'));
 const current={schema:'compensation-v1',compensation:{basis:'monthly_salary',monthlySalaryVnd:'8000000'}};
 expect(render(current)).toEqual(render({monthlySalaryVnd:'8000000'}));
 for(const term of [
  {...current,monthlySalaryVnd:'1'},
  {...current,schema:'compensation-v2'},
  {...current,compensation:{basis:'hourly_rate',monthlySalaryVnd:'8000000'}},
  {...current,compensation:{basis:'monthly_salary',monthlySalaryVnd:'1'}},
 ])expect(()=>render(term)).toThrow();
});
