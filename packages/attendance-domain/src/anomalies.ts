import { assertClockEvent, assertSafeUtcMilliseconds } from './state-machine';
import type { AttendanceException, AttendanceExceptionCode, AttendanceInterval, ClockEvent } from './types';

export interface ExceptionDetectionInput {
  readonly events:readonly ClockEvent[]; readonly shopTimeZone:'Asia/Ho_Chi_Minh';
  readonly scheduledIntervals:readonly AttendanceInterval[]; readonly publicHolidayLocalDates:readonly string[];
}
interface CompletedInterval extends AttendanceInterval {readonly inEvent:ClockEvent;readonly outEvent:ClockEvent}
function exception(code:AttendanceExceptionCode,event?:ClockEvent,interval?:AttendanceInterval):AttendanceException {
  return Object.freeze({code,blocking:true,...(event?{eventId:event.id}:{}),...(interval?{startUtcMs:interval.startUtcMs,endUtcMs:interval.endUtcMs}:{})});
}
const localFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function localParts(utcMs:number):{date:string;timeMs:number} {
  const parts=Object.fromEntries(localFormatter.formatToParts(new Date(utcMs)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:parts.year+'-'+parts.month+'-'+parts.day,timeMs:Number(parts.hour)*3600000+Number(parts.minute)*60000+Number(parts.second)*1000+((utcMs%1000)+1000)%1000};
}
function overlapsNightWork(interval:AttendanceInterval):boolean {
  const duration=BigInt(interval.endUtcMs)-BigInt(interval.startUtcMs);
  if(duration>=86_400_000n) return true;
  const start=localParts(interval.startUtcMs).timeMs;
  // For the configured shop zone, any interval beginning at night or crossing 22:00 contains night work.
  return start<6*3600000 || start>=22*3600000 || start+Number(duration)>22*3600000;
}
function isScheduled(interval:AttendanceInterval,schedules:readonly AttendanceInterval[]):boolean {
  let cursor=interval.startUtcMs;
  for(const s of [...schedules].sort((a,b)=>a.startUtcMs-b.startUtcMs)) {
    if(s.startUtcMs>cursor) break;
    if(s.endUtcMs>cursor) cursor=s.endUtcMs;
    if(cursor>=interval.endUtcMs) return true;
  }
  return false;
}
function pairsFromEvents(events:readonly ClockEvent[]):{pairs:CompletedInterval[];exceptions:AttendanceException[]} {
  const pairs:CompletedInterval[]=[];const exceptions:AttendanceException[]=[];let open:ClockEvent|undefined;
  let previousTime=-Infinity;
  for(const current of events) {
    if(current.occurredAtUtcMs<previousTime)exceptions.push(exception('NON_MONOTONIC_EVENT_TIME',current));
    previousTime=current.occurredAtUtcMs;
    if(current.direction==='IN') {if(open) exceptions.push(exception('REPEATED_IN',current));open=current;continue;}
    if(!open){exceptions.push(exception('OUT_WITHOUT_IN',current));continue;}
    const interval={startUtcMs:open.occurredAtUtcMs,endUtcMs:current.occurredAtUtcMs};
    if(interval.endUtcMs<=interval.startUtcMs){exceptions.push(exception('REVERSED_OR_ZERO_DURATION',current,interval));continue;}
    pairs.push({...interval,inEvent:open,outEvent:current});open=undefined;
  }
  if(open)exceptions.push(exception('MISSING_OUT',open));
  return {pairs,exceptions};
}
export function detectAttendanceExceptions(input:ExceptionDetectionInput):readonly AttendanceException[] {
  if(input.shopTimeZone!=='Asia/Ho_Chi_Minh') throw new Error('SHOP_TIMEZONE_UNSUPPORTED');
  if(!Array.isArray(input.scheduledIntervals)||!Array.isArray(input.publicHolidayLocalDates)) throw new Error('ATTENDANCE_CONTEXT_REQUIRED');
  for(const s of input.scheduledIntervals){assertSafeUtcMilliseconds(s.startUtcMs);assertSafeUtcMilliseconds(s.endUtcMs);if(s.endUtcMs<=s.startUtcMs)throw new Error('SCHEDULE_INTERVAL_INVALID');}
  for(const date of input.publicHolidayLocalDates) if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('HOLIDAY_DATE_INVALID');
  const groups=new Map<string,ClockEvent[]>();const ids=new Set<string>();
  for(const e of input.events) {
    assertClockEvent(e);if(ids.has(e.id))throw new Error('DUPLICATE_EVENT_ID');ids.add(e.id);
    const key=JSON.stringify([e.employeeId,e.workplaceId]);const group=groups.get(key)??[];group.push(e);groups.set(key,group);
  }
  const all:AttendanceException[]=[];
  for(const events of groups.values()) {
    const {pairs,exceptions}=pairsFromEvents(events);
    const sorted=[...pairs].sort((a,b)=>a.startUtcMs-b.startUtcMs);
    let maximumEnd=-Infinity;
    for(const pair of sorted){if(pair.startUtcMs<maximumEnd)exceptions.push(exception('OVERLAPPING_INTERVALS',pair.outEvent,pair));maximumEnd=Math.max(maximumEnd,pair.endUtcMs);}
    for(const pair of pairs) {
      if(!isScheduled(pair,input.scheduledIntervals))exceptions.push(exception('OUT_OF_SCHEDULE',pair.outEvent,pair));
      const first=localParts(pair.startUtcMs).date,last=localParts(pair.endUtcMs-1).date;
      if(input.publicHolidayLocalDates.some(d=>d>=first&&d<=last))exceptions.push(exception('PUBLIC_HOLIDAY_WORK',pair.outEvent,pair));
      if(overlapsNightWork(pair))exceptions.push(exception('NIGHT_WORK',pair.outEvent,pair));
    }
    all.push(...exceptions);
  }
  return Object.freeze(all);
}
