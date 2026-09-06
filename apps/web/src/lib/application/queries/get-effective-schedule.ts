import { SchedulesRepository, type ScheduleCredentials } from '../../db/repositories/schedules';

export function getEffectiveSchedule(
  repository: SchedulesRepository,
  credentials: ScheduleCredentials,
  input: { employeeId: string; workplaceId: string; localDate: string },
) {
  return repository.getEffectiveSchedule(credentials, input);
}
