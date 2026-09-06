import type { LocalInterval, ScheduleExceptionKind } from '../../../../../../packages/attendance-domain/src/schedule';
import { SchedulesRepository, type ScheduleCredentials } from '../../db/repositories/schedules';

export function setScheduleException(
  repository: SchedulesRepository,
  credentials: ScheduleCredentials,
  input: { employeeId: string; workplaceId: string; expectedExceptionId: string | null; kind: ScheduleExceptionKind; localDate: string; intervals: readonly LocalInterval[] },
) {
  return repository.setScheduleException(credentials, input);
}
