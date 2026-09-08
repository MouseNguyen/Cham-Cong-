import type { Pool } from 'pg';
import type { EmployeeSourceBinding } from '../../../../../packages/contracts/src/pay-run';
import { sha256 } from '../../../../../packages/payroll-domain/src/trace';
import {snapshotPayableTime} from '../db/repositories/pay-runs';

export type CalculatorPeriod = { periodStart: string; periodEnd: string };

/** Internal read model. HTTP authenticates and binds organization before calling. */
export class AdminQueries {
  constructor(private readonly pool: Pool, private readonly organizationId: string) {}

  async workplaces() {
    return (await this.pool.query<{ id: string; name: string }>(
      'SELECT id,name FROM workplaces WHERE organization_id=$1 ORDER BY name,id', [this.organizationId],
    )).rows;
  }

  async runs() {
    return (await this.pool.query(
      'SELECT id,workplace_id AS "workplaceId",status,version,period_start AS "periodStart",period_end AS "periodEnd" FROM pay_runs WHERE organization_id=$1 ORDER BY period_start DESC,id DESC LIMIT 100',
      [this.organizationId],
    )).rows;
  }

  async calculationEvidence(payRunId: string) {
    return (await this.pool.query(
      'SELECT r.employee_id,e.display_name,r.snapshot_id,r.snapshot_hash,r.compensation_id,r.compensation_hash,r.rule_pack_id,r.rule_pack_hash,r.calculator_version,r.calculator_artifact_hash,r.canonicalization_version,r.input_hash,r.result_hash,r.canonical_input FROM pay_run_employees r JOIN pay_runs p ON p.id=r.pay_run_id AND p.organization_id=r.organization_id JOIN employees e ON e.id=r.employee_id AND e.organization_id=r.organization_id WHERE r.pay_run_id=$1 AND r.organization_id=$2 ORDER BY r.employee_id',
      [payRunId, this.organizationId],
    )).rows;
  }

  async sources(payRunId: string, period: CalculatorPeriod | null) {
    const run = (await this.pool.query<{ workplace_id: string; period_start: Date; period_end: Date; status: string }>(
      'SELECT workplace_id,period_start,period_end,status FROM pay_runs WHERE organization_id=$1 AND id=$2',
      [this.organizationId, payRunId],
    )).rows[0];
    if (!run) throw Error('NOT_FOUND');
    const blockers: string[] = [];
    const sources: (EmployeeSourceBinding & { displayName: string })[] = [];
    if (!period || run.period_start.toISOString() !== period.periodStart || run.period_end.toISOString() !== period.periodEnd) {
      return { sources, blockers: ['CALCULATOR_PERIOD_UNAVAILABLE'] };
    }
    const rules = (await this.pool.query<{ id: string; content_hash: string; canonical_payload: string }>(
      "SELECT id,content_hash,canonical_payload FROM legal_rule_packs WHERE organization_id=$1 AND status='released' AND evidence_mode='synthetic' ORDER BY id LIMIT 2",
      [this.organizationId],
    )).rows;
    if (rules.length !== 1) blockers.push(rules.length ? 'RULE_PACK_SELECTION_AMBIGUOUS' : 'RELEASED_RULE_PACK_REQUIRED');
    const rule = rules.length === 1 ? rules[0] : undefined;
    if (rule && sha256(rule.canonical_payload) !== rule.content_hash) blockers.push('RULE_PACK_HASH_INVALID');
    const employees = (await this.pool.query<{ id: string; display_name: string; status: string }>(
      'SELECT DISTINCT e.id,e.display_name,e.status FROM employees e JOIN employment_contracts c ON c.employee_id=e.id AND c.organization_id=e.organization_id WHERE e.organization_id=$1 AND e.workplace_id=$2 AND c.valid_from<$4 AND (c.valid_to IS NULL OR c.valid_to>$3) ORDER BY e.id LIMIT 201',
      [this.organizationId, run.workplace_id, run.period_start, run.period_end],
    )).rows;
    if (employees.length === 0) blockers.push('NO_EMPLOYEES_IN_PERIOD');
    if (employees.length > 200) return { sources, blockers: ['BATCH_LIMIT_EXCEEDED'] };
    for (const employee of employees) {
      if (employee.status !== 'active') { blockers.push(`EMPLOYMENT_REVIEW_REQUIRED: ${employee.display_name}`); continue; }
      const terms = (await this.pool.query<{ id: string; content_hash: string; kind: string }>(
        'SELECT t.id,t.content_hash,c.kind FROM compensation_terms t JOIN employment_contracts c ON c.id=t.contract_id AND c.organization_id=t.organization_id LEFT JOIN compensation_term_closures x ON x.term_id=t.id AND x.organization_id=t.organization_id WHERE t.organization_id=$1 AND t.employee_id=$2 AND t.valid_from<=$3 AND LEAST(t.valid_to,x.effective_to)>=$4 AND c.kind=\'full_time\' AND c.template_version=\'full_time_12_month_v1\' AND c.probation_days=6',
        [this.organizationId, employee.id, run.period_start, run.period_end],
      )).rows;
      const snapshots = (await this.pool.query<{ id: string; content_hash: string; canonical_payload: string }>(
        "SELECT id,content_hash,canonical_payload FROM attendance_snapshots WHERE organization_id=$1 AND workplace_id=$2 AND employee_id=$3 AND period_start=$4 AND period_end=$5 AND status='approved' ORDER BY id LIMIT 2",
        [this.organizationId, run.workplace_id, employee.id, run.period_start, run.period_end],
      )).rows;
      if (terms.length !== 1) blockers.push(`FULL_TIME_COMPENSATION_REQUIRED: ${employee.display_name}`);
      if (snapshots.length !== 1) blockers.push(`APPROVED_SNAPSHOT_REQUIRED: ${employee.display_name}`);
      const snapshot = snapshots.length === 1 ? snapshots[0] : undefined;
      if (snapshot) {
        if (sha256(snapshot.canonical_payload) !== snapshot.content_hash) { blockers.push(`SNAPSHOT_HASH_INVALID: ${employee.display_name}`); continue; }
        const payload = JSON.parse(snapshot.canonical_payload) as { segments?: { classification: string }[] };
        try {
          if(!Array.isArray(payload.segments))throw Error('CLASSIFIED_SNAPSHOT_REQUIRED');
          snapshotPayableTime(payload,run.period_start.getTime(),run.period_end.getTime());
        } catch {
          blockers.push(`ATTENDANCE_COMPONENT_REVIEW_REQUIRED: ${employee.display_name}`); continue;
        }
      }
      if (terms.length === 1 && snapshot && rule) sources.push({
        employeeId: employee.id, displayName: employee.display_name,
        snapshotId: snapshot.id, snapshotHash: snapshot.content_hash,
        compensationId: terms[0]!.id, compensationHash: terms[0]!.content_hash,
        rulePackId: rule.id, rulePackHash: rule.content_hash,
      });
    }
    return { sources, blockers };
  }
}
