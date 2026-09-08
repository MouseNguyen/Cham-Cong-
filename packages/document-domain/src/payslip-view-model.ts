import { canonicalize, sha256 } from '../../payroll-domain/src/trace';
export interface PayslipSource {
  canonical_input:string; input_hash:string; canonical_result:string; result_hash:string;
  snapshot_payload:string; snapshot_hash:string; compensation_payload:string; compensation_hash:string;
  rule_payload:string; rule_pack_hash:string; rule_pack_id:string; calculator_version:string;
  calculator_artifact_hash:string; canonicalization_version:string; result_schema_version:string;
  company_name:string; employee_name:string; period_start:Date; period_end:Date; timezone:string;
}
export interface PayslipViewModel {
  company:string; employee:string; period:string; payslipId:string; issuedAt:string;
  salary:string; duration:string; ruleVersion:string;
  earnings:{label:string;amount:string}[]; deductions:{label:string;amount:string}[];
  employer:{label:string;amount:string}[]; gross:string; net:string; employeeTotal:string; employerTotal:string;
}
type RecordValue = Record<string, unknown>;
function object(value:unknown):RecordValue {
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('DOCUMENT_SOURCE_INVALID');
  return value as RecordValue;
}
function text(value:unknown):string {if(typeof value!=='string'||value.length===0)throw Error('DOCUMENT_SOURCE_INVALID');return value;}
function integer(value:unknown):bigint {const s=text(value);if(!/^-?\d+$/.test(s))throw Error('DOCUMENT_AMOUNT_INVALID');return BigInt(s);}
export function money(value:unknown):string {return new Intl.NumberFormat('vi-VN').format(integer(value));}
const funds:Record<string,string>={SI_SICKNESS_MATERNITY:'BHXH · Ốm đau, thai sản',SI_RETIREMENT_SURVIVORSHIP:'BHXH · Hưu trí, tử tuất',HEALTH_INSURANCE:'Bảo hiểm y tế',UNEMPLOYMENT_INSURANCE:'Bảo hiểm thất nghiệp',OCCUPATIONAL_ACCIDENT_DISEASE:'Bảo hiểm tai nạn lao động'};
/** Copies only presentation fields from sealed results; never invokes the calculator. */
export function payslipViewModel(source:PayslipSource,payslipId:string,issuedAt:Date):PayslipViewModel {
  for(const [payload,hash] of [[source.canonical_input,source.input_hash],[source.canonical_result,source.result_hash],[source.snapshot_payload,source.snapshot_hash],[source.compensation_payload,source.compensation_hash],[source.rule_payload,source.rule_pack_hash]]){
    if(!payload || !hash || sha256(payload)!==hash)throw Error('DOCUMENT_SOURCE_HASH_MISMATCH');
  }
  const input=object(JSON.parse(source.canonical_input)),result=object(JSON.parse(source.canonical_result));
  if(canonicalize(input)!==source.canonical_input||canonicalize(result)!==source.canonical_result)throw Error('DOCUMENT_CANONICAL_MISMATCH');
  const employment=object(input.employment),attendance=object(input.attendance),rule=object(input.ruleBinding),calculator=object(input.calculator);
  const snapshot=object(JSON.parse(source.snapshot_payload)),compensation=object(JSON.parse(source.compensation_payload));
  const bindings: [unknown,unknown][] = [[result.inputHash,source.input_hash],[result.rulePackHash,source.rule_pack_hash],[result.rulePackId,source.rule_pack_id],[rule.id,source.rule_pack_id],[result.calculatorVersion,source.calculator_version],[calculator.version,source.calculator_version],[result.calculatorArtifactHash,source.calculator_artifact_hash],[calculator.sourceArtifactSha256,source.calculator_artifact_hash],[result.canonicalizationVersion,source.canonicalization_version],[calculator.canonicalizationVersion,source.canonicalization_version],[result.resultSchemaVersion,source.result_schema_version],[employment.monthlySalaryVnd,compensation.monthlySalaryVnd],[attendance.payableMilliseconds,snapshot.approvedPayableMilliseconds]];
  if(bindings.some(([a,b])=>a!==b))throw Error('DOCUMENT_SOURCE_BINDING_MISMATCH');
  if(input.mode!=='synthetic_preview'||result.status!=='synthetic_preview'||employment.kind!=='full_time'||source.result_schema_version!=='1'||source.canonicalization_version!=='1')throw Error('DOCUMENT_SCOPE_UNSUPPORTED');
  const duration=integer(attendance.payableMilliseconds);
  if(duration<0n)throw Error('DOCUMENT_DURATION_INVALID');
  const earnings:PayslipViewModel['earnings']=[],deductions:PayslipViewModel['deductions']=[],employer:PayslipViewModel['employer']=[];
  if(!Array.isArray(result.lines)||result.lines.length===0||result.lines.length>500)throw Error('DOCUMENT_LINES_INVALID');
  for(const raw of result.lines){
    const line=object(raw),code=text(line.code),amount=money(line.amountVnd);
    if(code.startsWith('insurance.employee.'))deductions.push({label:funds[code.slice(19)]??text(line.labelVi),amount});
    else if(code.startsWith('insurance.employer.'))employer.push({label:funds[code.slice(19)]??text(line.labelVi),amount});
    else if(code==='pit.withholding')deductions.push({label:'Thuế thu nhập cá nhân',amount});
    else if(code.startsWith('ordinary.')||code.startsWith('holiday.'))earnings.push({label:text(line.labelVi),amount});
    else throw Error('DOCUMENT_LINE_UNSUPPORTED');
  }
  const month=new Intl.DateTimeFormat('vi-VN',{timeZone:source.timezone,month:'2-digit',year:'numeric'}).format(source.period_start);
  const date=new Intl.DateTimeFormat('vi-VN',{timeZone:source.timezone,day:'2-digit',month:'2-digit',year:'numeric'});
  return {company:source.company_name,employee:source.employee_name,period:`${month} · ${date.format(source.period_start)} – ${date.format(new Date(source.period_end.getTime()-1))}`,payslipId,
    issuedAt:new Intl.DateTimeFormat('vi-VN',{timeZone:source.timezone,dateStyle:'short',timeStyle:'short'}).format(issuedAt),
    salary:money(employment.monthlySalaryVnd),duration:`${duration/3600000n} giờ ${(duration%3600000n)/60000n} phút ${duration%60000n} ms`,ruleVersion:text(rule.version),
    earnings,deductions,employer,gross:money(result.gross),net:money(result.net),employeeTotal:money(result.employeeInsuranceTotal),employerTotal:money(result.employerInsuranceTotal)};
}
