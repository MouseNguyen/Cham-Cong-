import { randomUUID } from 'node:crypto';
import type { ClockRequest, ClockResponse } from '../../../packages/contracts/src/attendance.ts';
import type { AttendanceIngressRepository, EnrolledDevice } from '../../../packages/attendance-domain/src/ports.ts';
export async function recordClockEvent(repository: AttendanceIngressRepository, device: EnrolledDevice, request: ClockRequest, now: Date, requestId = randomUUID()): Promise<ClockResponse> {
 const employee=await repository.authenticateEmployee({deviceId:device.deviceId,employeeCode:request.employeeCode,pin:request.pin});
 if(!employee||employee.organizationId!==device.organizationId||employee.workplaceId!==device.workplaceId)return {recorded:false,code:'CLOCK_NOT_RECORDED',message:'Không thể ghi nhận chấm công.',nextAction:'CHECK_WITH_MANAGER',requestId};
 const result=await repository.recordClock({idempotencyKey:request.idempotencyKey,action:request.action,occurredAtUtcMs:now.getTime(),requestId,employeeId:employee.employeeId,deviceId:device.deviceId,sessionId:device.sessionId});
 if(result.kind==='recorded')return {recorded:true,eventId:result.event.id,recordedAt:new Date(result.event.occurredAtUtcMs).toISOString(),nextAllowedAction:result.event.direction==='IN'?'CLOCK_OUT':'CLOCK_IN',replayed:result.replayed,requestId};
 if(result.kind==='pending_confirmation')return {pending_confirmation:true};
 return {recorded:false,code:'CLOCK_NOT_RECORDED',message:'Không thể ghi nhận chấm công.',nextAction:result.kind==='invalid_state'?'CHECK_WITH_MANAGER':'RETRY',requestId};
}
