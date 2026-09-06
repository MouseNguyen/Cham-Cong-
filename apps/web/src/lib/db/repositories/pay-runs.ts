import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { calculatePayroll, inputFromFixture } from "../../../../../../packages/payroll-domain/src/calculate";
import { canonicalize, sha256 } from "../../../../../../packages/payroll-domain/src/trace";
import type {
  CalculatePayRunInput,
  CreateAdjustmentRunInput,
  CreatePayRunInput,
  EmployeeSourceBinding,
  PayRunCredentials,
  PayRunStatus,
  VersionedPayRunInput,
} from "../../../../../../packages/contracts/src/pay-run";
import { authorize, type Command, type UserActor } from "../../auth/authorization";
import { conflict, withTransaction } from "../transaction";
import { enqueueDraft } from "./outbox";
import type { AuthRepository } from "./auth";

const HASH = /^[a-f0-9]{64}$/;

type Run = {
  id: string;
  organization_id: string;
  workplace_id: string;
  status: PayRunStatus;
  version: number;
  evidence_mode: "synthetic";
  period_start: Date;
  period_end: Date;
};

type DerivedCalculation = {
  canonicalInput: string;
  result: ReturnType<typeof calculatePayroll>;
};

type TrustedCalculator = {
  id: string;
  version: string;
  artifactHash: string;
  canonicalizationVersion: string;
  inputTemplate: Record<string, unknown>;
};

type PayRunContext = {
  organizationId: string;
  now: () => Date;
  calculator: TrustedCalculator;
  enqueueFinalization?: typeof enqueueDraft;
};

export class PayRunRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auth: AuthRepository,
    private readonly context: PayRunContext,
  ) {}

  private async actor(tx: PoolClient, credentials: PayRunCredentials, command: Command): Promise<UserActor> {
    const actor = await this.auth.checkCsrf(credentials.sessionToken, credentials.csrfToken);
    const now = this.context.now();
    const live = (await tx.query<{
      active: boolean;
      role: string;
      expires_at: Date;
      revoked_at: Date | null;
      mfa_satisfied_at: Date | null;
    }>(
      "SELECT u.active,u.role,s.expires_at,s.revoked_at,s.mfa_satisfied_at FROM sessions s JOIN users u ON u.id=s.user_id AND u.organization_id=s.organization_id WHERE s.id=$1 AND s.organization_id=$2 FOR UPDATE",
      [actor.sessionId, this.context.organizationId],
    )).rows[0];
    if (!live || !live.active || live.role !== actor.role || live.revoked_at || live.expires_at <= now || !live.mfa_satisfied_at || !Number.isFinite(live.mfa_satisfied_at.getTime()) || live.mfa_satisfied_at > now) {
      throw conflict("UNAUTHENTICATED");
    }
    const liveActor: UserActor = { ...actor, role: live.role as UserActor["role"], mfaSatisfiedAt: live.mfa_satisfied_at };
    authorize(liveActor, command, now, { organizationId: this.context.organizationId });
    return liveActor;
  }

  private async reader(credentials: PayRunCredentials): Promise<UserActor> {
    const actor = await this.auth.checkCsrf(credentials.sessionToken, credentials.csrfToken);
    authorize(actor, "PAYROLL_DRAFT", this.context.now(), { organizationId: this.context.organizationId });
    return actor;
  }

  private async lock(tx: PoolClient, input: VersionedPayRunInput, state: PayRunStatus): Promise<Run> {
    const run = (await tx.query<Run>("SELECT * FROM pay_runs WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.payRunId, this.context.organizationId])).rows[0];
    if (!run || run.version !== input.expectedVersion) throw conflict("STALE_VERSION");
    if (run.status !== state) throw conflict("INVALID_STATE_TRANSITION");
    return run;
  }

  private async event(tx: PoolClient, run: Run, actor: UserActor, action: string): Promise<void> {
    const now = this.context.now();
    await tx.query(
      "INSERT INTO approval_events(id,organization_id,pay_run_id,actor_id,action,created_at) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), run.organization_id, run.id, actor.userId, action, now],
    );
    await tx.query(
      "INSERT INTO audit_events(id,organization_id,actor_id,action,aggregate_id,created_at) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), run.organization_id, actor.userId, action, run.id, now],
    );
  }

  async create(credentials: PayRunCredentials, input: CreatePayRunInput) {
    return withTransaction(this.pool, async (tx) => {
      const actor = await this.actor(tx, credentials, "PAYROLL_DRAFT");
      if (!input.workplaceId || !Number.isFinite(Date.parse(input.periodStart)) || !Number.isFinite(Date.parse(input.periodEnd)) || Date.parse(input.periodEnd) <= Date.parse(input.periodStart)) {
        throw conflict("INVALID_PAY_RUN_INPUT");
      }
      const run = (await tx.query<Run>(
        "INSERT INTO pay_runs(id,organization_id,workplace_id,evidence_mode,period_start,period_end) VALUES($1,$2,$3,'synthetic',$4,$5) RETURNING *",
        [randomUUID(), this.context.organizationId, input.workplaceId, input.periodStart, input.periodEnd],
      )).rows[0]!;
      await this.event(tx, run, actor, "pay_run.created");
      return { id: run.id, version: run.version, status: run.status };
    });
  }

  private async derive(tx: PoolClient, run: Run, binding: EmployeeSourceBinding): Promise<DerivedCalculation> {
    if (![binding.snapshotHash, binding.compensationHash, binding.rulePackHash, this.context.calculator.artifactHash].every((value) => HASH.test(value))) {
      throw conflict("HASH_INVALID");
    }
    const source = (await tx.query<{ snapshot: string; salary: string; rule_payload: string }>(
      "SELECT s.canonical_payload snapshot,c.monthly_salary_vnd::text salary,public.w4_released_rule_pack_payload($7,$2,$8) rule_payload FROM attendance_snapshots s JOIN compensation_terms c ON c.id=$5 AND c.organization_id=s.organization_id AND c.employee_id=s.employee_id AND c.content_hash=$6 LEFT JOIN compensation_term_closures cc ON cc.term_id=c.id AND cc.organization_id=c.organization_id AND cc.employee_id=c.employee_id WHERE s.id=$1 AND s.organization_id=$2 AND s.workplace_id=$3 AND s.employee_id=$4 AND s.content_hash=$11 AND s.status='approved' AND s.period_start=$9 AND s.period_end=$10 AND c.valid_from<=$9 AND COALESCE(cc.effective_to,c.valid_to,'infinity'::timestamptz)>=$10 FOR UPDATE OF c",
      [binding.snapshotId, run.organization_id, run.workplace_id, binding.employeeId, binding.compensationId, binding.compensationHash, binding.rulePackId, binding.rulePackHash, run.period_start, run.period_end, binding.snapshotHash],
    )).rows[0];
    if (!source) throw conflict("SOURCE_BINDING_STALE");
    const rule = JSON.parse(source.rule_payload) as { kind?: string; id?: string; version?: string; policy?: unknown; funds?: Array<Record<string, unknown>>; pit?: Record<string, unknown> };
    const raw = structuredClone(this.context.calculator.inputTemplate) as Record<string, any>;
    const attendance = JSON.parse(source.snapshot) as { rawMilliseconds?: string; approvedPayableMilliseconds?: string; totalPayableDurationMs?: string };
    if (!raw.employment || !raw.attendance || !raw.calculator || !raw.ruleBinding) throw conflict("RULE_PACK_CALCULATOR_INPUT_MISSING");
    if (rule.kind !== "synthetic_materialized_policy" || rule.id !== binding.rulePackId || typeof rule.version !== "string" || !rule.policy || !Array.isArray(rule.funds) || !rule.pit) throw conflict("RULE_PACK_CALCULATOR_INPUT_MISSING");
    const payable = attendance.totalPayableDurationMs ?? attendance.approvedPayableMilliseconds;
    if (typeof payable !== "string" || !/^\d+$/.test(payable)) throw conflict("ATTENDANCE_TOTAL_PAYABLE_REQUIRED");
    const templateFunds = new Map((raw.insuranceFunds as Array<Record<string, unknown>>).map((fund) => [fund.id, fund]));
    if (templateFunds.size !== rule.funds.length) throw conflict("RULE_PACK_CALCULATOR_INPUT_MISSING");
    raw.employment.monthlySalaryVnd = source.salary;
    raw.attendance.rawMilliseconds = attendance.rawMilliseconds ?? payable;
    raw.attendance.payableMilliseconds = payable;
    raw.ruleBinding = { ...raw.ruleBinding, id: rule.id, version: rule.version, status: "released" };
    raw.policy = rule.policy;
    raw.insuranceFunds = rule.funds.map((fund) => ({ ...templateFunds.get(fund.id), ...fund, baseVnd: source.salary, componentDate: raw.ruleBinding.componentDates.insurance }));
    raw.pit = { ...raw.pit, ...rule.pit };
    raw.calculator = { id: this.context.calculator.id, version: this.context.calculator.version, canonicalizationVersion: this.context.calculator.canonicalizationVersion, sourceArtifactSha256: this.context.calculator.artifactHash };

    const input = inputFromFixture(raw);
    const canonicalInput = canonicalize(input);
    const result = calculatePayroll(input);
    if (!HASH.test(this.context.calculator.artifactHash) || result.calculatorVersion !== this.context.calculator.version || result.calculatorArtifactHash !== this.context.calculator.artifactHash || result.canonicalizationVersion !== this.context.calculator.canonicalizationVersion || result.inputHash !== sha256(canonicalInput)) throw conflict("CALCULATOR_INPUT_HASH_MISMATCH");
    if (result.rulePackHash !== binding.rulePackHash) throw conflict("RULE_PACK_HASH_MISMATCH");
    return { canonicalInput, result };
  }

  async calculate(credentials: PayRunCredentials, input: CalculatePayRunInput) {
    return withTransaction(this.pool, async (tx) => {
      const actor = await this.actor(tx, credentials, "PAYROLL_DRAFT");
      const run = await this.lock(tx, input, "draft");
      if (!input.sources.length || new Set(input.sources.map((source) => source.employeeId)).size !== input.sources.length) {
        throw conflict("INVALID_CALCULATION_BATCH");
      }
      for (const binding of input.sources) {
        const derived = await this.derive(tx, run, binding);
        const result = derived.result;
        const employee = (await tx.query<{ id: string }>(
          "INSERT INTO pay_run_employees(id,organization_id,workplace_id,employee_id,pay_run_id,snapshot_id,snapshot_hash,compensation_id,compensation_hash,rule_pack_id,rule_pack_hash,calculator_version,calculator_artifact_hash,canonicalization_version,result_schema_version,canonical_input,input_hash,canonical_result,result_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id",
          [randomUUID(), run.organization_id, run.workplace_id, binding.employeeId, run.id, binding.snapshotId, binding.snapshotHash, binding.compensationId, binding.compensationHash, binding.rulePackId, binding.rulePackHash, result.calculatorVersion, result.calculatorArtifactHash, result.canonicalizationVersion, result.resultSchemaVersion, derived.canonicalInput, result.inputHash, result.canonicalResult, result.resultSha256],
        )).rows[0]!;
        for (const line of result.lines) {
          await tx.query("INSERT INTO calculation_lines(id,pay_run_employee_id,code,amount_vnd,trace) VALUES($1,$2,$3,$4,$5)", [randomUUID(), employee.id, line.code, line.amountVnd.toString(), canonicalize(line)]);
        }
      }
      const next = (await tx.query<Run>("UPDATE pay_runs SET status='calculated',version=version+1 WHERE id=$1 RETURNING *", [run.id])).rows[0]!;
      await this.event(tx, next, actor, "pay_run.calculated");
      return { version: next.version, status: next.status };
    });
  }

  private async move(credentials: PayRunCredentials, input: VersionedPayRunInput, command: Command, from: PayRunStatus, to: PayRunStatus, action: string) {
    return withTransaction(this.pool, async (tx) => {
      const actor = await this.actor(tx, credentials, command);
      const run = await this.lock(tx, input, from);
      const next = (await tx.query<Run>("UPDATE pay_runs SET status=$2,version=version+1 WHERE id=$1 RETURNING *", [run.id, to])).rows[0]!;
      await this.event(tx, next, actor, action);
      return { version: next.version, status: next.status };
    });
  }

  async submit(credentials: PayRunCredentials, input: VersionedPayRunInput) {
    return this.move(credentials, input, "PAYROLL_DRAFT", "calculated", "review_pending", "pay_run.submitted");
  }

  async approve(credentials: PayRunCredentials, input: VersionedPayRunInput) {
    return withTransaction(this.pool, async (tx) => {
      const actor = await this.actor(tx, credentials, "PAY_RUN_APPROVE");
      const run = await this.lock(tx, input, "review_pending");
      const maker = (await tx.query<{ actor_id: string }>(
        "SELECT actor_id FROM approval_events WHERE organization_id=$1 AND pay_run_id=$2 AND action='pay_run.calculated' ORDER BY created_at DESC LIMIT 1",
        [run.organization_id, run.id],
      )).rows[0];
      if (!maker || maker.actor_id === actor.userId) throw conflict("MAKER_CHECKER_REQUIRED");
      const next = (await tx.query<Run>("UPDATE pay_runs SET status='approved',version=version+1 WHERE id=$1 RETURNING *", [run.id])).rows[0]!;
      await this.event(tx, next, actor, "pay_run.approved");
      return { version: next.version, status: next.status };
    });
  }

  async finalize(credentials: PayRunCredentials, input: VersionedPayRunInput) {
    return withTransaction(this.pool, async (tx) => {
      const actor = await this.actor(tx, credentials, "PAY_RUN_FINALIZE");
      const run = (await tx.query<Run>("SELECT * FROM pay_runs WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.payRunId, this.context.organizationId])).rows[0];
      const finalVersion = input.expectedVersion + 1;
      const payload = { eventKind: "pay_run_finalized", payRunId: input.payRunId, finalVersion, evidenceMode: "synthetic" };
      if (!run) throw conflict("STALE_VERSION");
      if (run.status === "finalized") {
        if (run.version !== finalVersion) throw conflict("STALE_VERSION");
        const job = (await tx.query("SELECT * FROM outbox_jobs WHERE organization_id=$1 AND pay_run_id=$2 AND event_kind='pay_run_finalized' AND event_version=$3 AND idempotency_key=$4 AND payload=$5::jsonb", [run.organization_id, run.id, finalVersion, `pay-run:${run.id}:finalized:${finalVersion}`, JSON.stringify(payload)])).rows[0];
        if (!job) throw conflict("FINALIZATION_OUTBOX_MISSING");
        return { version: run.version, status: run.status, replayed: true, jobId: job.id, productionReady: false as const };
      }
      if (run.status !== "approved" || run.version !== input.expectedVersion) throw conflict("STALE_VERSION");
      const next = (await tx.query<Run>("UPDATE pay_runs SET status='finalized',version=version+1 WHERE id=$1 RETURNING *", [run.id])).rows[0]!;
      await this.event(tx, next, actor, "pay_run.finalized");
      const enqueue = this.context.enqueueFinalization ?? enqueueDraft;
      const job = await enqueue(tx, { organizationId: next.organization_id, payRunId: next.id, idempotencyKey: `pay-run:${next.id}:finalized:${next.version}`, eventKind: "pay_run_finalized", eventVersion: next.version, payload });
      return { version: next.version, status: next.status, replayed: false, jobId: job.id, productionReady: false as const };
    });
  }

  async get(credentials: PayRunCredentials, id: string) {
    await this.reader(credentials);
    const run = (await this.pool.query<Run>("SELECT * FROM pay_runs WHERE id=$1 AND organization_id=$2", [id, this.context.organizationId])).rows[0];
    if (!run) throw conflict("NOT_FOUND");
    const employees = (await this.pool.query<{ employee_id: string; canonical_result: string; result_hash: string }>(
      "SELECT e.employee_id,e.canonical_result,e.result_hash FROM pay_run_employees e JOIN pay_runs p ON p.id=e.pay_run_id WHERE e.pay_run_id=$1 AND p.organization_id=$2 ORDER BY e.employee_id",
      [id, this.context.organizationId],
    )).rows;
    return { ...run, employees };
  }

  async explain(credentials: PayRunCredentials, id: string, employeeId: string) {
    await this.reader(credentials);
    const employee = (await this.pool.query<{ canonical_result: string }>(
      "SELECT e.canonical_result FROM pay_run_employees e JOIN pay_runs p ON p.id=e.pay_run_id WHERE e.pay_run_id=$1 AND e.employee_id=$2 AND p.organization_id=$3",
      [id, employeeId, this.context.organizationId],
    )).rows[0];
    if (!employee) throw conflict("NOT_FOUND");
    return (JSON.parse(employee.canonical_result) as { trace?: unknown }).trace ?? [];
  }

  async createAdjustment(credentials: PayRunCredentials, input: CreateAdjustmentRunInput) {
    return withTransaction(this.pool, async (tx) => {
      const actor = await this.actor(tx, credentials, "PAY_RUN_FINALIZE");
      const original = (await tx.query<Run>("SELECT * FROM pay_runs WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.originalRunId, this.context.organizationId])).rows[0];
      if (!original || original.status !== "finalized") throw conflict("FINALIZED_ORIGINAL_REQUIRED");
      if (!input.reason.trim()) throw conflict("ADJUSTMENT_REASON_REQUIRED");
      const adjustment = (await tx.query<Run>(
        "INSERT INTO pay_runs(id,organization_id,workplace_id,evidence_mode,period_start,period_end) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [randomUUID(), original.organization_id, original.workplace_id, original.evidence_mode, original.period_start, original.period_end],
      )).rows[0]!;
      await tx.query("INSERT INTO adjustment_links(id,organization_id,original_run_id,adjustment_run_id,reason) VALUES($1,$2,$3,$4,$5)", [randomUUID(), adjustment.organization_id, original.id, adjustment.id, input.reason.trim()]);
      await this.event(tx, adjustment, actor, "pay_run.adjustment_created");
      return { id: adjustment.id, version: adjustment.version, status: adjustment.status };
    });
  }
}
