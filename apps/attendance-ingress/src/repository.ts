import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import argon2 from 'argon2';
import type { ClockAction } from '../../../packages/contracts/src/attendance.ts';
import type { AttendanceIngressRepository, AuthenticatedEmployee, EnrolledDevice, ReconcileClockResult, RecordClockResult, StoredClockDirection } from '../../../packages/attendance-domain/src/ports.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stored = (action: ClockAction): StoredClockDirection => action === 'CLOCK_IN' ? 'IN' : 'OUT';
export type CommitFault = { beforeCommit?(): void | Promise<void>; afterCommit?(): void | Promise<void> };

export class PgAttendanceIngressRepository implements AttendanceIngressRepository {
  private readonly dummyHash = argon2.hash('ingress-dummy-not-a-secret', { type: argon2.argon2id });
  constructor(private readonly pool: Pool, private readonly now: () => Date = () => new Date(), private readonly fault: CommitFault = {}) {}
  async readiness(): Promise<boolean> { await this.pool.query('SELECT 1'); return true; }
  async authenticateDevice(token: string): Promise<EnrolledDevice | null> {
    const row = (await this.pool.query<{ id: string; organization_id: string; workplace_id: string; session_id: string }>('SELECT id,organization_id,workplace_id,session_id FROM kiosk_devices WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2', [hash(token), this.now()])).rows[0];
    return row ? { deviceId: row.id, organizationId: row.organization_id, workplaceId: row.workplace_id, sessionId: row.session_id } : null;
  }
  async authenticateEmployee(input: { deviceId: string; employeeCode: string; pin: string }): Promise<AuthenticatedEmployee | null> {
    const now = this.now(), key = hash(`rate:${input.deviceId}:${input.employeeCode}`);
    const deviceRate = await this.pool.query<{failure_count:number}>(`INSERT INTO kiosk_rate_limits(key_hash,failure_count,updated_at) VALUES($1,1,$2)
      ON CONFLICT(key_hash) DO UPDATE SET failure_count=CASE WHEN kiosk_rate_limits.updated_at<$3 THEN 1 ELSE LEAST(kiosk_rate_limits.failure_count+1,21) END,updated_at=CASE WHEN kiosk_rate_limits.updated_at<$3 THEN $2 ELSE kiosk_rate_limits.updated_at END RETURNING failure_count`,[hash(`device-rate:${input.deviceId}`),now,new Date(now.getTime()-60000)]);
    if(deviceRate.rows[0]!.failure_count>20)return null;
    await this.pool.query('INSERT INTO kiosk_rate_limits(key_hash,updated_at) VALUES($1,$2) ON CONFLICT DO NOTHING', [key, now]);
    const limit = (await this.pool.query<{ locked_until: Date | null }>('SELECT locked_until FROM kiosk_rate_limits WHERE key_hash=$1', [key])).rows[0];
    const row = (await this.pool.query<{ employee_id: string; organization_id: string; workplace_id: string; pin_hash: string }>("SELECT p.employee_id,p.organization_id,e.workplace_id,p.pin_hash FROM kiosk_employee_pins p JOIN employees e ON e.id=p.employee_id AND e.organization_id=p.organization_id WHERE p.device_id=$1 AND p.employee_code=$2 AND p.revoked_at IS NULL AND e.status='active'", [input.deviceId, input.employeeCode])).rows[0];
    const verified = await argon2.verify(row?.pin_hash ?? await this.dummyHash, input.pin).catch(() => false);
    if (!row || !verified || (limit?.locked_until && limit.locked_until > now)) { await this.pool.query('UPDATE kiosk_rate_limits SET failure_count=failure_count+1,locked_until=CASE WHEN failure_count+1>=5 THEN $2 ELSE locked_until END,updated_at=$3 WHERE key_hash=$1', [key, new Date(now.getTime() + 15 * 60_000), now]); return null; }
    await this.pool.query('UPDATE kiosk_rate_limits SET failure_count=0,locked_until=NULL,updated_at=$2 WHERE key_hash=$1', [key, now]);
    return { employeeId: row.employee_id, organizationId: row.organization_id, workplaceId: row.workplace_id };
  }
  async recordClock(input: { idempotencyKey: string; action: ClockAction; occurredAtUtcMs: number; requestId?: string; employeeId: string; deviceId: string; sessionId: string }): Promise<RecordClockResult> {
    if (!UUID.test(input.idempotencyKey)) return { kind: 'not_recorded' };
    const client = await this.pool.connect(); let committed = false, commitAttempted = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [input.deviceId]);
      const device = (await client.query<{ organization_id: string; workplace_id: string }>('SELECT organization_id,workplace_id FROM kiosk_devices WHERE id=$1 AND session_id=$2 AND revoked_at IS NULL AND expires_at>$3', [input.deviceId, input.sessionId, this.now()])).rows[0];
      const employee = (await client.query<{ organization_id: string; workplace_id: string }>("SELECT organization_id,workplace_id FROM employees WHERE id=$1 AND status='active'", [input.employeeId])).rows[0];
      if (!device || !employee || device.organization_id !== employee.organization_id || device.workplace_id !== employee.workplace_id) { await client.query('ROLLBACK'); return { kind: 'not_recorded' }; }
      const state = (await client.query<{ last_direction: StoredClockDirection | null }>('SELECT last_direction FROM kiosk_employee_states WHERE employee_id=$1 FOR UPDATE', [input.employeeId])).rows[0];
      if (!state) { await client.query('ROLLBACK'); return { kind: 'not_recorded' }; }
      const prior = (await client.query<{ id: string; direction: StoredClockDirection; occurred_at: Date }>('SELECT id,direction,occurred_at FROM clock_events WHERE employee_id=$1 AND idempotency_key=$2', [input.employeeId, input.idempotencyKey])).rows[0];
      if (prior) { commitAttempted = true; await client.query('COMMIT'); committed = true; return prior.direction === stored(input.action) ? { kind: 'recorded', replayed: true, event: { id: prior.id, direction: prior.direction, occurredAtUtcMs: prior.occurred_at.getTime() } } : { kind: 'conflict' }; }
      if ((state.last_direction === null && stored(input.action) === 'OUT') || state.last_direction === stored(input.action)) { await client.query('ROLLBACK'); return { kind: 'invalid_state' }; }
      const id = randomUUID(), at = new Date(input.occurredAtUtcMs);
      await client.query('INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, device.organization_id, device.workplace_id, input.employeeId, input.idempotencyKey, stored(input.action), at, hash(JSON.stringify([input.employeeId, stored(input.action), input.idempotencyKey]))]);
      await client.query('UPDATE kiosk_employee_states SET last_direction=$2,revision=revision+1,updated_at=$3 WHERE employee_id=$1', [input.employeeId, stored(input.action), this.now()]);
      await client.query('INSERT INTO kiosk_command_proofs(id,idempotency_key_hash,device_id,session_id,employee_id,event_id,direction,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), hash(input.idempotencyKey), input.deviceId, input.sessionId, input.employeeId, id, stored(input.action), new Date(this.now().getTime() + 10 * 60_000)]);
      await client.query("INSERT INTO kiosk_audit_events(id,organization_id,device_id,employee_id,action,outcome,created_at) VALUES($1,$2,$3,$4,'clock','recorded',$5)", [input.requestId ?? randomUUID(), device.organization_id, input.deviceId, input.employeeId, this.now()]);
      await this.fault.beforeCommit?.(); commitAttempted = true; await client.query('COMMIT'); committed = true; await this.fault.afterCommit?.();
      return { kind: 'recorded', replayed: false, event: { id, direction: stored(input.action), occurredAtUtcMs: at.getTime() } };
    } catch { if (!committed && !commitAttempted) { try { await client.query('ROLLBACK'); } catch {} return { kind: 'not_recorded' }; } return { kind: 'pending_confirmation' }; } finally { client.release(commitAttempted && !committed); }
  }
  async reconcile(input: { idempotencyKey: string; deviceId: string; sessionId: string; employeeCode: string }): Promise<ReconcileClockResult> {
    const row = (await this.pool.query<{ event_id: string; direction: StoredClockDirection; occurred_at: Date }>('SELECT p.event_id,p.direction,c.occurred_at FROM kiosk_command_proofs p JOIN kiosk_employee_pins pin ON pin.employee_id=p.employee_id AND pin.device_id=p.device_id JOIN clock_events c ON c.id=p.event_id WHERE p.idempotency_key_hash=$1 AND p.device_id=$2 AND p.session_id=$3 AND pin.employee_code=$4 AND pin.revoked_at IS NULL AND p.expires_at>$5', [hash(input.idempotencyKey), input.deviceId, input.sessionId, input.employeeCode, this.now()])).rows[0];
    return row ? { kind: 'recorded', event: { id: row.event_id, direction: row.direction, occurredAtUtcMs: row.occurred_at.getTime() } } : { kind: 'pending_confirmation' };
  }
}
export function createPgAttendanceIngressRepository(databaseUrl: string): PgAttendanceIngressRepository { return new PgAttendanceIngressRepository(new Pool({ connectionString: databaseUrl, max: 8, statement_timeout: 10_000 })); }
