import type { WeeklySchedule } from '../../../../../../packages/attendance-domain/src/schedule';
import { SchedulesRepository, type ScheduleCredentials } from '../../db/repositories/schedules';

export function saveWeeklySchedule(
  repository: SchedulesRepository,
  credentials: ScheduleCredentials,
  input: { employeeId: string; workplaceId: string; expectedAssignmentId: string | null; effectiveFrom: string; weekly: WeeklySchedule },
) {
  return repository.saveWeeklySchedule(credentials, input);
}

export function saveOpeningHours(
  repository: SchedulesRepository,
  credentials: ScheduleCredentials,
  input: { workplaceId: string; expectedVersionId: string | null; effectiveFrom: string; weekly: WeeklySchedule },
) {
  return repository.saveOpeningHours(credentials, input);
}
