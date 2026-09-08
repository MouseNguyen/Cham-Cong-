import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { scenario } from '../auth/support';
import { inputFromFixture } from '../../../packages/payroll-domain/src/calculate';
import { canonicalize, sha256 } from '../../../packages/payroll-domain/src/trace';
import { canonicalizeWeeklySchedule, hashWeeklySchedule, type WeeklySchedule } from '../../../packages/attendance-domain/src/schedule';

export const ADMIN_PERIOD = {
  start: '2026-07-31T17:00:00.000Z',
  end: '2026-08-31T17:00:00.000Z',
} as const;

export function adminPool(): Pool {
  const value = process.env.PAYSLIP_TEST_DATABASE_URL;
  if (!value) throw new Error('OWNED_TEST_DATABASE_REQUIRED');
  const url = new URL(value);
  if (
    url.hostname !== '127.0.0.1'
    || url.port !== '55432'
    || url.pathname !== '/payslip_w5_02a_synthetic'
    || url.username !== 'payslip_app'
  ) {
    throw new Error('UNSAFE_TEST_DATABASE');
  }
  return new Pool({ connectionString: value, max: 4, statement_timeout: 10_000 });
}

export async function adminFixture(pool: Pool) {
  const organizationId = process.env.PAYSLIP_ORGANIZATION_ID;
  if (!organizationId) throw new Error('SYNTHETIC_ORGANIZATION_REQUIRED');
  const owner = await scenario(pool, 'owner', organizationId);
  const accountant = await scenario(pool, 'accountant', organizationId);
  const workplaceId = randomUUID();
  await pool.query(
    "INSERT INTO workplaces(id,organization_id,name) VALUES($1,$2,'Synthetic The Kay’s Gelato')",
    [workplaceId, organizationId],
  );
  return { accountant, organizationId, owner, workplaceId };
}

export type AdminFixture = Awaited<ReturnType<typeof adminFixture>>;

export function releasedSyntheticPolicy(template: unknown) {
  const input = inputFromFixture(template);
  const policy = {
    kind: 'synthetic_materialized_policy',
    id: input.ruleBinding.id,
    version: input.ruleBinding.version,
    policy: input.policy,
    funds: input.insuranceFunds
      .map((fund) => ({
        id: fund.id,
        minimumVnd: fund.minimumVnd,
        maximumVnd: fund.maximumVnd,
        employeeRateBasisPoints: fund.employeeRateBasisPoints,
        employerRateBasisPoints: fund.employerRateBasisPoints,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    pit: {
      personalDeductionVnd: input.pit.personalDeductionVnd,
      dependentDeductionVnd: input.pit.dependentDeductionVnd,
      brackets: input.pit.brackets,
    },
  };
  const canonicalPayload = canonicalize(policy);
  return { canonicalPayload, contentHash: sha256(canonicalPayload), policy };
}

function calculatorTemplate(): unknown {
  const raw = process.env.PAYSLIP_CALCULATOR_CONFIG;
  if (!raw) throw new Error('SYNTHETIC_CALCULATOR_CONFIG_REQUIRED');
  const config = JSON.parse(raw) as { inputTemplate?: unknown };
  if (!config.inputTemplate) throw new Error('SYNTHETIC_CALCULATOR_TEMPLATE_REQUIRED');
  return config.inputTemplate;
}

export async function seedReleasedRule(pool: Pool, organizationId: string) {
  const rulePackId = randomUUID();
  const template = structuredClone(calculatorTemplate()) as { ruleBinding?: { id?: string; status?: string } };
  if (!template.ruleBinding) throw new Error('SYNTHETIC_RULE_BINDING_REQUIRED');
  template.ruleBinding.id = rulePackId;
  template.ruleBinding.status = 'released';
  const policy = releasedSyntheticPolicy(template);
  const releaseEvidence = {
    accountantSignedContentHash: policy.contentHash,
    externalSpecialistSignedContentHash: policy.contentHash,
  };
  await pool.query(
    "INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode,release_evidence) VALUES($1,$2,'released',$3,$4,'synthetic',$5)",
    [rulePackId, organizationId, policy.canonicalPayload, policy.contentHash, JSON.stringify(releaseEvidence)],
  );
  return { rulePackId, rulePackHash: policy.contentHash };
}

export async function seedAttendanceEvidence(pool: Pool, fixture: AdminFixture, employeeId: string) {
  const weekly = Object.fromEntries(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [day, [{ start: '08:00', end: '18:00' }]]),
  ) as unknown as WeeklySchedule;
  const canonicalPayload = canonicalizeWeeklySchedule(weekly);
  const contentHash = hashWeeklySchedule(weekly);
  const scheduleTemplateId = randomUUID();
  await pool.query(
    'INSERT INTO opening_hour_versions(id,organization_id,workplace_id,valid_from,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(), fixture.organizationId, fixture.workplaceId, new Date('2026-07-31T17:00:00.000Z'), canonicalPayload, contentHash],
  );
  await pool.query(
    "INSERT INTO schedule_templates(id,organization_id,name,canonical_payload,content_hash) VALUES($1,$2,'Synthetic W5 weekly schedule',$3,$4)",
    [scheduleTemplateId, fixture.organizationId, canonicalPayload, contentHash],
  );
  await pool.query(
    'INSERT INTO schedule_assignments(id,organization_id,workplace_id,employee_id,template_id,valid_from) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(), fixture.organizationId, fixture.workplaceId, employeeId, scheduleTemplateId, new Date('2026-07-31T17:00:00.000Z')],
  );
  for (const [direction, occurredAt] of [['IN', '2026-08-04T01:00:00.000Z'], ['OUT', '2026-08-04T02:00:00.061Z']] as const) {
    const eventId = randomUUID();
    await pool.query(
      'INSERT INTO clock_events(id,organization_id,workplace_id,employee_id,idempotency_key,direction,occurred_at,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [eventId, fixture.organizationId, fixture.workplaceId, employeeId, eventId, direction, new Date(occurredAt), createHash('sha256').update(eventId).digest('hex')],
    );
  }
}
