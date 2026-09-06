import type { AttendanceReviewApprovalInput, AttendanceReviewCredentials } from '../../../../../../packages/contracts/src/attendance-review';
import type { AttendanceReviewRepository } from '../../db/repositories/attendance-review';
export function finalizeAttendanceSnapshot(repository:AttendanceReviewRepository, credentials:AttendanceReviewCredentials, input:AttendanceReviewApprovalInput) { return repository.finalize(credentials,input); }
