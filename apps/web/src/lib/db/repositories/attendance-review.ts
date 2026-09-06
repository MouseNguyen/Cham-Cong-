import { randomUUID, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AuthRepository } from './auth';
import { authorize, type Command, type UserActor } from '../../auth/authorization';
import { hashSecret, validCsrf } from '../../auth/csrf';
import { withTransaction } from '../transaction';
import type { WindowsSecretProtector } from '../../secrets/windows-dpapi';
import { canonicalReview, hashReview, reviewPeriod, suggestedReviewSegments, validateReviewCandidate, normalizeReviewCandidate, type ReviewCandidate, type ReviewSource } from '../../../../../../packages/attendance-domain/src/review';
import { canonicalIntervals, hashWeeklySchedule, resolveScheduleContext, type WeeklySchedule } from '../../../../../../packages/attendance-domain/src/schedule';
import type { AttendanceReviewApprovalInput, AttendanceReviewCredentials, AttendanceReviewDraftInput, AttendanceReviewListResult, AttendanceReviewSnapshot, AttendanceReviewProposalState, AttendanceReviewDecisionState, AttendanceReviewBlocker } from '../../../../../../packages/contracts/src/attendance-review';

type Scope=Pick<AttendanceReviewDraftInput,'employeeId'|'workplaceId'|'month'>;
type CaseRow={id:string;version:number};
type ProposalRow={id:string;expected_version:number;source_hash:string;candidate_hash:string;canonical_payload:string;reason:string;made_by:string;made_at:Date};
type DecisionRow={id:string;proposal_id:string;expected_version:number;source_hash:string;candidate_hash:string;reason:string;approved_by:string;approved_at:Date};
type SnapshotRow={id:string;content_hash:string;canonical_payload:string;approved_by:string};
type BoundSource=ReviewSource&{scheduleEvidence:unknown[];missingScheduleLocalDates:string[]};
function fail(code:string):never{throw Object.assign(new Error(code),{code});}
function digest(payload:string){return createHash('sha256').update(payload,'utf8').digest('hex');}
const offset=7*3600000;
const dateAt=(at:number)=>new Date(at+offset).toISOString().slice(0,10);
function weekly(payload:string,hash:string){const data=JSON.parse(payload) as WeeklySchedule;if(hashWeeklySchedule(data)!==hash)fail('SOURCE_HASH_INVALID');return data;}
function proposalState(p:ProposalRow):AttendanceReviewProposalState{return {id:p.id,version:p.expected_version+1,sourceHash:p.source_hash,candidateHash:p.candidate_hash,madeBy:p.made_by,madeAtUtcMs:p.made_at.getTime(),reason:p.reason};}
function decisionState(d:DecisionRow):AttendanceReviewDecisionState{return {id:d.id,proposalId:d.proposal_id,sourceHash:d.source_hash,candidateHash:d.candidate_hash,reason:d.reason,approvedBy:d.approved_by,approvedAtUtcMs:d.approved_at.getTime()};}
function frozen(row:SnapshotRow):AttendanceReviewSnapshot{if(digest(row.canonical_payload)!==row.content_hash)fail('SNAPSHOT_HASH_INVALID');const data=JSON.parse(row.canonical_payload) as {approvedAtUtcMs:number};if(!Number.isSafeInteger(data.approvedAtUtcMs))fail('SNAPSHOT_PAYLOAD_INVALID');return {id:row.id,contentHash:row.content_hash,approvedBy:row.approved_by,approvedAtUtcMs:data.approvedAtUtcMs,canonicalPayload:row.canonical_payload};}

export class AttendanceReviewRepository{
 private readonly auth:AuthRepository;private readonly org:string;private readonly now:()=>Date;
 constructor(private readonly pool:Pool,protector:WindowsSecretProtector,options:{organizationId:string;now?:()=>Date}){this.auth=new AuthRepository(pool,protector,options);this.org=options.organizationId;this.now=options.now??(()=>new Date());}
 private async actor(tx:PoolClient,c:AttendanceReviewCredentials,permission:Command){
  const initial=await this.auth.checkCsrf(c.sessionToken,c.csrfToken);
  const row=(await tx.query<{role:UserActor['role'];active:boolean;revoked_at:Date|null;expires_at:Date;mfa_satisfied_at:Date|null;csrf_hash:string|null}>(`SELECT u.role,u.active,s.revoked_at,s.expires_at,s.mfa_satisfied_at,s.csrf_hash FROM users u JOIN sessions s ON s.user_id=u.id AND s.organization_id=u.organization_id WHERE u.id=$1 AND u.organization_id=$2 AND s.id=$3 AND s.token_hash=$4 FOR UPDATE`,[initial.userId,this.org,initial.sessionId,hashSecret(c.sessionToken)])).rows[0];
  if(!row?.active||row.revoked_at||row.expires_at<=this.now()||!row.mfa_satisfied_at)fail('UNAUTHENTICATED');if(!validCsrf(row.csrf_hash??'',c.csrfToken))fail('CSRF');
  const actor={...initial,role:row.role,mfaSatisfiedAt:row.mfa_satisfied_at};authorize(actor,permission,this.now(),{organizationId:this.org});return actor;
 }
 private async lock(tx:PoolClient,input:Scope){
  reviewPeriod(input.month);
  if(!(await tx.query('SELECT id FROM workplaces WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.workplaceId,this.org])).rowCount)fail('WORKPLACE_NOT_FOUND');
  if(!(await tx.query('SELECT id FROM employees WHERE id=$1 AND organization_id=$2 AND workplace_id=$3 FOR UPDATE',[input.employeeId,this.org,input.workplaceId])).rowCount)fail('EMPLOYEE_NOT_FOUND');
 }
 private async source(tx:PoolClient,input:Scope):Promise<BoundSource>{
  const {employeeId,workplaceId,month}=input,period=reviewPeriod(month);const args=[this.org,workplaceId,employeeId];
  type EventRow={id:string;direction:'IN'|'OUT';occurred_at:Date};
  const rows=(await tx.query<EventRow>('SELECT id,direction,occurred_at FROM clock_events WHERE organization_id=$1 AND workplace_id=$2 AND employee_id=$3 AND occurred_at>=$4 AND occurred_at<$5 ORDER BY occurred_at,id',[...args,period.start,period.end])).rows;
  const before=(await tx.query<EventRow>('SELECT id,direction,occurred_at FROM clock_events WHERE organization_id=$1 AND workplace_id=$2 AND employee_id=$3 AND occurred_at<$4 ORDER BY occurred_at DESC,id DESC LIMIT 1',[...args,period.start])).rows[0];
  const relevant=before?.direction==='IN'?[before,...rows]:[...rows];
  if(relevant.at(-1)?.direction==='IN'){const after=(await tx.query<EventRow>('SELECT id,direction,occurred_at FROM clock_events WHERE organization_id=$1 AND workplace_id=$2 AND employee_id=$3 AND occurred_at>=$4 ORDER BY occurred_at,id LIMIT 1',[...args,period.end])).rows[0];if(after)relevant.push(after);}
  const rawEvents=relevant.map(e=>({id:e.id,direction:e.direction,occurredAtUtcMs:e.occurred_at.getTime(),insidePeriod:e.occurred_at>=period.start&&e.occurred_at<period.end}));
  // Holiday records are mutable inputs; keep them stable for this candidate transaction.
  await tx.query('LOCK TABLE public_holidays IN SHARE MODE');
  const holidays=(await tx.query<{id:string;holiday_date:string;name:string;source_ref:string}>('SELECT id,holiday_date::text,name,source_ref FROM public_holidays WHERE organization_id=$1 AND holiday_date >= $2::date AND holiday_date < $3::date ORDER BY holiday_date,id',[this.org,month+'-01',dateAt(period.endUtcMs)])).rows;
  const scheduleEvidence:unknown[]=[{holidays}],missingScheduleLocalDates:string[]=[],scheduledIntervals:BoundSource['scheduledIntervals'][number][]=[];
  for(let at=period.startUtcMs;at<period.endUtcMs;at+=86400000){
   const date=dateAt(at);
   type Version={id:string;canonical_payload:string;content_hash:string;valid_from:Date;effective_to:Date|null};
   const openings=(await tx.query<Version>(`SELECT v.id,v.canonical_payload,v.content_hash,v.valid_from,LEAST(v.valid_to,c.effective_to) effective_to FROM opening_hour_versions v LEFT JOIN opening_hour_closures c ON c.version_id=v.id WHERE v.organization_id=$1 AND v.workplace_id=$2 AND v.valid_from<=$3 AND (LEAST(v.valid_to,c.effective_to) IS NULL OR LEAST(v.valid_to,c.effective_to)>$3)`,[this.org,workplaceId,new Date(at)])).rows;
   const assignments=(await tx.query<Version>(`SELECT a.id,t.canonical_payload,t.content_hash,a.valid_from,LEAST(a.valid_to,c.effective_to) effective_to FROM schedule_assignments a JOIN schedule_templates t ON t.id=a.template_id AND t.organization_id=a.organization_id LEFT JOIN schedule_assignment_closures c ON c.assignment_id=a.id WHERE a.organization_id=$1 AND a.workplace_id=$2 AND a.employee_id=$3 AND a.valid_from<=$4 AND (LEAST(a.valid_to,c.effective_to) IS NULL OR LEAST(a.valid_to,c.effective_to)>$4)`,[this.org,workplaceId,employeeId,new Date(at)])).rows;
   if(openings.length>1||assignments.length>1)fail('SCHEDULE_AMBIGUOUS');const opening=openings[0],assignment=assignments[0];
   const exceptions=(await tx.query<{id:string;kind:'date'|'public_holiday';canonical_payload:string;content_hash:string}>(`SELECT id,kind,canonical_payload,content_hash FROM schedule_exceptions e WHERE e.organization_id=$1 AND e.workplace_id=$2 AND e.employee_id=$3 AND e.local_date=$4 AND NOT EXISTS(SELECT 1 FROM schedule_exception_supersessions s WHERE s.prior_exception_id=e.id) ORDER BY id`,[this.org,workplaceId,employeeId,date])).rows;
   const bound=(v:Version|undefined)=>v?{id:v.id,payload:v.canonical_payload,hash:v.content_hash,validFrom:v.valid_from.toISOString(),effectiveTo:v.effective_to?.toISOString()??null}:null;
   scheduleEvidence.push({date,opening:bound(opening),assignment:bound(assignment),exceptions});
   if(!opening){missingScheduleLocalDates.push(date);continue;}
   const parsedExceptions=exceptions.map(e=>{const parsed=JSON.parse(e.canonical_payload) as {intervals:never};if(digest(e.canonical_payload)!==e.content_hash)fail('SOURCE_HASH_INVALID');return {id:e.id,kind:e.kind,localDate:date,intervals:parsed.intervals};});
   const context=resolveScheduleContext({localDate:date,openingHours:weekly(opening.canonical_payload,opening.content_hash),employeeWeekly:assignment?weekly(assignment.canonical_payload,assignment.content_hash):null,exceptions:parsedExceptions,publicHolidayLocalDates:holidays.map(h=>h.holiday_date)});
   if(context.employeeSource==='none')missingScheduleLocalDates.push(date);
   const ref=hashReview({date,opening:bound(opening),assignment:bound(assignment),exceptions});
   for(const interval of canonicalIntervals(context.employeeIntervals))scheduledIntervals.push({startUtcMs:Date.parse(date+'T'+interval.start+':00+07:00'),endUtcMs:Date.parse(date+'T'+interval.end+':00+07:00'),scheduleRef:ref});
  }
  return {rawEvents,scheduledIntervals,holidayLocalDates:holidays.map(h=>h.holiday_date),scheduleEvidence,missingScheduleLocalDates};
 }
 private async caseRow(tx:PoolClient,input:Scope,create=false):Promise<CaseRow|null>{
  let row=(await tx.query<CaseRow>('SELECT id,version FROM attendance_review_cases WHERE organization_id=$1 AND workplace_id=$2 AND employee_id=$3 AND month=$4',[this.org,input.workplaceId,input.employeeId,input.month])).rows[0];
  if(!row&&create){row={id:randomUUID(),version:0};await tx.query('INSERT INTO attendance_review_cases(id,organization_id,workplace_id,employee_id,month,created_at) VALUES($1,$2,$3,$4,$5,$6)',[row.id,this.org,input.workplaceId,input.employeeId,input.month,this.now()]);}return row??null;
 }
 private async latest(tx:PoolClient,row:CaseRow|null){
  const proposal=row?(await tx.query<ProposalRow>('SELECT * FROM attendance_review_proposals WHERE case_id=$1 ORDER BY expected_version DESC,id LIMIT 1',[row.id])).rows[0]??null:null;
  const decision=proposal?(await tx.query<DecisionRow>('SELECT * FROM attendance_review_decisions WHERE proposal_id=$1',[proposal.id])).rows[0]??null:null;
  if(proposal&&digest(proposal.canonical_payload)!==proposal.candidate_hash)fail('CANDIDATE_HASH_INVALID');
  return {proposal,decision,candidate:proposal?normalizeReviewCandidate(JSON.parse(proposal.canonical_payload) as ReviewCandidate):null};
 }
 private async snapshot(tx:PoolClient,input:Scope){const period=reviewPeriod(input.month);return (await tx.query<SnapshotRow>('SELECT id,content_hash,canonical_payload,approved_by FROM attendance_snapshots WHERE organization_id=$1 AND workplace_id=$2 AND employee_id=$3 AND period_start=$4 AND period_end=$5 AND review_case_id IS NOT NULL',[this.org,input.workplaceId,input.employeeId,period.start,period.end])).rows[0]??null;}
 private async audit(tx:PoolClient,row:CaseRow,actor:UserActor,action:string,reason:string,sourceHash:string,candidateHash:string){await tx.query('INSERT INTO attendance_review_audits(id,case_id,organization_id,actor_id,action,expected_version,reason,source_hash,candidate_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),row.id,this.org,actor.userId,action,row.version,reason,sourceHash,candidateHash,this.now()]);await tx.query('INSERT INTO audit_events(id,organization_id,actor_id,action,aggregate_id,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),this.org,actor.userId,action,row.id,this.now()]);}
 async list(token:string,input:Scope):Promise<AttendanceReviewListResult>{
  const actor=await this.auth.actor(token);authorize(actor,'ATTENDANCE_DRAFT',this.now(),{organizationId:this.org});
  return withTransaction(this.pool,async tx=>{await this.lock(tx,input);const snap=await this.snapshot(tx,input);const source:BoundSource=snap?(JSON.parse(frozen(snap).canonicalPayload) as {source:BoundSource}).source:await this.source(tx,input),sourceHash=hashReview(source),row=await this.caseRow(tx,input),current=await this.latest(tx,row);
   const suggestions=suggestedReviewSegments(input.month,source),candidate=current.candidate;const validation=current.proposal&&current.proposal.source_hash!==sourceHash?{blockers:[]}:validateReviewCandidate(input.month,source,candidate??{segments:suggestions,exclusions:[],reason:'Preview'});
   const blockers:AttendanceReviewBlocker[]=[...validation.blockers];if(current.proposal&&current.proposal.source_hash!==sourceHash)blockers.push({code:'SOURCE_HASH_STALE',eventIds:[],message:'Dữ liệu nguồn đã thay đổi.',nextAction:'Lập và duyệt đề xuất mới.'});
   const approved=!!current.proposal&&!!current.decision&&current.decision.source_hash===sourceHash&&current.decision.candidate_hash===current.proposal.candidate_hash;
   const fresh=this.now().getTime()-actor.mfaSatisfiedAt.getTime()<=600000;
   return {role:actor.role,canDraft:actor.role==='accountant'&&!snap,canApprove:actor.role==='owner'&&fresh&&!!current.proposal&&!approved&&!blockers.length&&!snap&&current.proposal.made_by!==actor.userId,canFinalize:actor.role==='owner'&&fresh&&approved&&!blockers.length&&!snap,version:row?.version??0,sourceHash,candidateHash:current.proposal?.candidate_hash??null,rawEvents:source.rawEvents,scheduledIntervals:source.scheduledIntervals,suggestedSegments:suggestions,blockers,proposal:current.proposal?proposalState(current.proposal):null,decision:approved&&current.decision?decisionState(current.decision):null,candidate,frozenSnapshot:snap?frozen(snap):null};
  });
 }
 async draft(c:AttendanceReviewCredentials,input:AttendanceReviewDraftInput){
  const candidate=normalizeReviewCandidate(input);return withTransaction(this.pool,async tx=>{const actor=await this.actor(tx,c,'ATTENDANCE_DRAFT');if(actor.role!=='accountant')fail('FORBIDDEN');await this.lock(tx,input);if(await this.snapshot(tx,input))fail('PERIOD_FINALIZED');const source=await this.source(tx,input),sourceHash=hashReview(source);if(sourceHash!==input.sourceHash)fail('SOURCE_HASH_STALE');const row=(await this.caseRow(tx,input,true))!;if(row.version!==input.expectedVersion)fail('STALE_VERSION');const validation=validateReviewCandidate(input.month,source,candidate);
   const payload=canonicalReview({canonicalizationVersion:'attendance-review/v1',month:input.month,sourceHash,...candidate});if(digest(payload)!==validation.candidateHash)fail('CANDIDATE_HASH_INVALID');
   const proposal:ProposalRow={id:randomUUID(),expected_version:row.version,source_hash:sourceHash,candidate_hash:validation.candidateHash,canonical_payload:payload,reason:candidate.reason,made_by:actor.userId,made_at:this.now()};
   await tx.query('INSERT INTO attendance_review_proposals(id,case_id,organization_id,workplace_id,employee_id,expected_version,source_hash,candidate_hash,canonical_payload,reason,made_by,made_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[proposal.id,row.id,this.org,input.workplaceId,input.employeeId,row.version,sourceHash,proposal.candidate_hash,payload,proposal.reason,actor.userId,proposal.made_at]);await tx.query('UPDATE attendance_review_cases SET version=version+1 WHERE id=$1',[row.id]);await this.audit(tx,row,actor,'attendance.review.proposed',candidate.reason,sourceHash,proposal.candidate_hash);return {proposal:proposalState(proposal),version:row.version+1,candidateHash:proposal.candidate_hash};
  });
 }
 async approve(c:AttendanceReviewCredentials,input:AttendanceReviewApprovalInput){
  if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)fail('REVIEW_REASON_REQUIRED');
  return withTransaction(this.pool,async tx=>{const actor=await this.actor(tx,c,'ATTENDANCE_APPROVE');await this.lock(tx,input);if(await this.snapshot(tx,input))fail('PERIOD_FINALIZED');const row=await this.caseRow(tx,input);if(!row||row.version!==input.expectedVersion)fail('STALE_VERSION');const {proposal,candidate,decision}=await this.latest(tx,row);if(!proposal||proposal.candidate_hash!==input.candidateHash)fail('CANDIDATE_HASH_STALE');if(proposal.made_by===actor.userId)fail('MAKER_CHECKER_REQUIRED');if(decision)fail('ALREADY_APPROVED');const source=await this.source(tx,input),sourceHash=hashReview(source);if(sourceHash!==proposal.source_hash)fail('SOURCE_HASH_STALE');const validation=validateReviewCandidate(input.month,source,candidate!);if(validation.candidateHash!==input.candidateHash||validation.blockers.length)fail('REVIEW_BLOCKED');
   const d:DecisionRow={id:randomUUID(),proposal_id:proposal.id,expected_version:row.version,source_hash:sourceHash,candidate_hash:input.candidateHash,reason:input.reason.trim(),approved_by:actor.userId,approved_at:this.now()};
   await tx.query('INSERT INTO attendance_review_decisions(id,proposal_id,case_id,organization_id,expected_version,source_hash,candidate_hash,reason,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[d.id,proposal.id,row.id,this.org,row.version,sourceHash,input.candidateHash,d.reason,actor.userId,d.approved_at]);await tx.query('UPDATE attendance_review_cases SET version=version+1 WHERE id=$1',[row.id]);await this.audit(tx,row,actor,'attendance.review.approved',d.reason,sourceHash,input.candidateHash);return {decision:decisionState(d),version:row.version+1};
  });
 }
 async finalize(c:AttendanceReviewCredentials,input:Omit<AttendanceReviewApprovalInput,'reason'>&{reason?:string}){
  return withTransaction(this.pool,async tx=>{const actor=await this.actor(tx,c,'ATTENDANCE_APPROVE');await this.lock(tx,input);const row=await this.caseRow(tx,input);if(!row||row.version!==input.expectedVersion)fail('STALE_VERSION');const existing=await this.snapshot(tx,input);if(existing){const stored=frozen(existing);if((JSON.parse(stored.canonicalPayload) as {candidateHash:string}).candidateHash!==input.candidateHash)fail('CANDIDATE_HASH_STALE');return {snapshot:stored,replayed:true};}
   const {proposal,candidate,decision}=await this.latest(tx,row);if(!proposal||proposal.candidate_hash!==input.candidateHash)fail('CANDIDATE_HASH_STALE');if(!decision)fail('APPROVAL_REQUIRED');if(proposal.made_by===actor.userId)fail('MAKER_CHECKER_REQUIRED');const source=await this.source(tx,input),sourceHash=hashReview(source);if(sourceHash!==decision.source_hash)fail('SOURCE_HASH_STALE');const validation=validateReviewCandidate(input.month,source,candidate!);if(validation.candidateHash!==input.candidateHash||validation.blockers.length)fail('REVIEW_BLOCKED');
   const at=this.now().getTime(),period=reviewPeriod(input.month);const payload=canonicalReview({canonicalizationVersion:'attendance-review/v1',schemaVersion:'1',organizationId:this.org,employeeId:input.employeeId,workplaceId:input.workplaceId,month:input.month,period:{startUtcMs:period.startUtcMs,endUtcMs:period.endUtcMs},sourceHash,source,candidateHash:input.candidateHash,proposal:proposalState(proposal),decision:decisionState(decision),approvedBy:actor.userId,approvedAtUtcMs:at,segments:candidate!.segments.map(s=>({...s,durationMs:(BigInt(s.endUtcMs)-BigInt(s.startUtcMs)).toString()})),exclusions:candidate!.exclusions,totalPayableDurationMs:validation.totalPayableDurationMs});
   const record:SnapshotRow={id:randomUUID(),content_hash:digest(payload),canonical_payload:payload,approved_by:actor.userId};await tx.query("INSERT INTO attendance_snapshots(id,organization_id,workplace_id,employee_id,period_start,period_end,canonical_payload,content_hash,status,approved_by,review_case_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,$10)",[record.id,this.org,input.workplaceId,input.employeeId,period.start,period.end,payload,record.content_hash,actor.userId,row.id]);await this.audit(tx,row,actor,'attendance.review.finalized','Chốt theo đề xuất đã duyệt',sourceHash,input.candidateHash);return {snapshot:frozen(record),replayed:false};
  });
 }
}
