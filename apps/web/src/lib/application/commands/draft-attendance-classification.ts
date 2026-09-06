import type { AttendanceReviewCredentials, AttendanceReviewDraftInput } from '../../../../../../packages/contracts/src/attendance-review';
import type { AttendanceReviewRepository } from '../../db/repositories/attendance-review';
export function draftAttendanceClassification(repository:AttendanceReviewRepository, credentials:AttendanceReviewCredentials, input:AttendanceReviewDraftInput) { return repository.draft(credentials,input); }
