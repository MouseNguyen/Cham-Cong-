import type { AttendanceReviewRepository } from '../../db/repositories/attendance-review';
export function listAttendanceExceptions(repository:AttendanceReviewRepository, sessionToken:string, input:{employeeId:string;workplaceId:string;month:`${number}${number}${number}${number}-${number}${number}`}) { return repository.list(sessionToken,input); }
