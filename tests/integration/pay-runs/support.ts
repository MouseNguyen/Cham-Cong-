import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { hashSecret } from "../../../apps/web/src/lib/auth/csrf";
import { AuthRepository } from "../../../apps/web/src/lib/db/repositories/auth";
import type { WindowsSecretProtector } from "../../../apps/web/src/lib/secrets/windows-dpapi";
import { calculatePayroll, inputFromFixture } from "../../../packages/payroll-domain/src/calculate";
import { canonicalize } from "../../../packages/payroll-domain/src/trace";
import type { EmployeeSourceBinding, PayRunCredentials } from "../../../packages/contracts/src/pay-run";

export const hash = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
export const NOW = new Date("2026-09-05T00:05:00Z");
export const CALCULATOR_ARTIFACT_HASH = hash("PAY-W1-03 synthetic calculator artifact");

export function payRunPool(): Pool {
  const value = process.env.PAYSLIP_TEST_DATABASE_URL;
  if (!value) throw new Error("OWNED_TEST_DATABASE_REQUIRED");
  const url = new URL(value);
  if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/payslip_w4_01_synthetic" || url.username !== "payslip_app") throw new Error("UNSAFE_TEST_DATABASE");
  return new Pool({ connectionString: value, max: 4, statement_timeout: 10_000 });
}

export interface PayRunFixture {
  organizationId: string; workplaceId: string; employeeId: string; accountantId: string; ownerId: string;
  accountantSessionId: string; ownerSessionId: string; compensationId: string; compensationHash: string;
  contractId: string;
  snapshotId: string; snapshotHash: string; rulePackId: string; rulePackHash: string;
  releaseEvidence: { accountantSignedContentHash: string; externalSpecialistSignedContentHash: string };
  accountantCredentials: PayRunCredentials;
  ownerCredentials: PayRunCredentials;
}

type RawInput = Record<string, any>;

function template(rulePackId: string): RawInput {
  return {
    mode: "synthetic_preview",
    calculator: { id: "payroll-domain", version: "0.1.0", canonicalizationVersion: "1", sourceArtifactSha256: CALCULATOR_ARTIFACT_HASH },
    employment: { kind: "full_time", monthlySalaryVnd: "45000000", proration: "none" },
    ruleBinding: { id: rulePackId, version: "fixture-1", status: "released", componentDates: { ordinaryPay: "2026-08-31", insurance: "2026-08-31", pit: "2026-08-31" } },
    attendance: { rawMilliseconds: "0", payableMilliseconds: "0", nightWorkMilliseconds: "0" },
    insuranceFunds: [
      { id: "SI_SICKNESS_MATERNITY", eligible: true, baseVnd: "45000000", minimumVnd: "2530000", maximumVnd: "50600000", employeeRateBasisPoints: 0, employerRateBasisPoints: 300, componentDate: "2026-08-31" },
      { id: "SI_RETIREMENT_SURVIVORSHIP", eligible: true, baseVnd: "45000000", minimumVnd: "2530000", maximumVnd: "50600000", employeeRateBasisPoints: 800, employerRateBasisPoints: 1400, componentDate: "2026-08-31" },
      { id: "HEALTH_INSURANCE", eligible: true, baseVnd: "45000000", minimumVnd: "2530000", maximumVnd: "50600000", employeeRateBasisPoints: 150, employerRateBasisPoints: 300, componentDate: "2026-08-31" },
      { id: "UNEMPLOYMENT_INSURANCE", eligible: true, baseVnd: "45000000", minimumVnd: "2530000", maximumVnd: "106200000", employeeRateBasisPoints: 100, employerRateBasisPoints: 100, componentDate: "2026-08-31" },
      { id: "OCCUPATIONAL_ACCIDENT_DISEASE", eligible: true, baseVnd: "45000000", minimumVnd: "2530000", maximumVnd: "50600000", employeeRateBasisPoints: 0, employerRateBasisPoints: 50, componentDate: "2026-08-31" },
    ],
    pit: { personalDeductionVnd: "15500000", dependentCount: 0, dependentDeductionVnd: "6200000", brackets: [{ upToVnd: "10000000", rateBasisPoints: 500 }, { upToVnd: "30000000", rateBasisPoints: 1000 }, { upToVnd: "60000000", rateBasisPoints: 2000 }, { upToVnd: "100000000", rateBasisPoints: 3000 }, { upToVnd: null, rateBasisPoints: 3500 }] },
    holiday: null,
    policy: { insuranceBasePolicy: "explicit_per_fund", pitBasePolicy: "all_earnings_less_employee_funds", evidence: "synthetic_assumption", holidayPremiumBasisPoints: 30000, holidayEntitlementTreatment: "included_in_monthly" },
    unsupportedComponents: [],
  };
}

function rulePayload(rulePackId: string): RawInput {
  const raw = template(rulePackId);
  return {
    kind: "synthetic_materialized_policy", id: rulePackId, version: raw.ruleBinding.version, policy: raw.policy,
    funds: raw.insuranceFunds.map((fund: RawInput) => ({ id: fund.id, minimumVnd: fund.minimumVnd, maximumVnd: fund.maximumVnd, employeeRateBasisPoints: fund.employeeRateBasisPoints, employerRateBasisPoints: fund.employerRateBasisPoints })).sort((a: RawInput, b: RawInput) => a.id.localeCompare(b.id)),
    pit: { personalDeductionVnd: raw.pit.personalDeductionVnd, dependentDeductionVnd: raw.pit.dependentDeductionVnd, brackets: raw.pit.brackets },
  };
}

export function calculatorContext(f: PayRunFixture) {
  return { id: "payroll-domain", version: "0.1.0", artifactHash: CALCULATOR_ARTIFACT_HASH, canonicalizationVersion: "1", inputTemplate: template(f.rulePackId) };
}

export function expectedW1Calculation(f: PayRunFixture, salary = "8000000") {
  const raw = template(f.rulePackId);
  raw.employment.monthlySalaryVnd = salary;
  raw.insuranceFunds.forEach((fund: RawInput) => { fund.baseVnd = salary; });
  raw.insuranceFunds.sort((left: RawInput, right: RawInput) => left.id.localeCompare(right.id));
  raw.attendance.rawMilliseconds = "3600000";
  raw.attendance.payableMilliseconds = "3600000";
  return calculatePayroll(inputFromFixture(raw));
}

export function sourceBinding(f: PayRunFixture): EmployeeSourceBinding {
  return { employeeId: f.employeeId, snapshotId: f.snapshotId, snapshotHash: f.snapshotHash, compensationId: f.compensationId, compensationHash: f.compensationHash, rulePackId: f.rulePackId, rulePackHash: f.rulePackHash };
}

export const credentials = (f: PayRunFixture, role: "accountant" | "owner"): PayRunCredentials =>
  role === "owner" ? f.ownerCredentials : f.accountantCredentials;

export function authForFixture(pool: Pool, f: PayRunFixture): AuthRepository {
  const unusedProtector: WindowsSecretProtector = {
    protect: async () => { throw new Error("NOT_USED"); },
    unprotect: async () => { throw new Error("NOT_USED"); },
  };
  return new AuthRepository(pool, unusedProtector, { organizationId: f.organizationId, now: () => NOW });
}

export async function fixture(client: PoolClient, ruleStatus: "released" | "draft" = "released"): Promise<PayRunFixture> {
  const organizationId = randomUUID(), workplaceId = randomUUID(), employeeId = randomUUID(), accountantId = randomUUID(), ownerId = randomUUID();
  const accountantSessionId = randomUUID(), ownerSessionId = randomUUID(), compensationId = randomUUID(), snapshotId = randomUUID(), rulePackId = randomUUID();
  const accountantCredentials = { sessionToken: randomBytes(32).toString("base64url"), csrfToken: randomBytes(32).toString("base64url") };
  const ownerCredentials = { sessionToken: randomBytes(32).toString("base64url"), csrfToken: randomBytes(32).toString("base64url") };
  const compensationPayload = '{"basis":"monthly_salary","monthlySalaryVnd":"8000000"}';
  const snapshotPayload = '{"totalPayableDurationMs":"3600000","approvedPayableMilliseconds":"3600000","synthetic":true}';
  const policyPayload = rulePayload(rulePackId), rulePackHash = hash(canonicalize(policyPayload));
  const releaseEvidence = { accountantSignedContentHash: rulePackHash, externalSpecialistSignedContentHash: rulePackHash };
  await client.query("INSERT INTO organizations(id,name) VALUES($1,'Synthetic W4 organization')", [organizationId]);
  await client.query("INSERT INTO workplaces(id,organization_id,name) VALUES($1,$2,'Synthetic W4 workplace')", [workplaceId, organizationId]);
  await client.query("INSERT INTO employees(id,organization_id,workplace_id,display_name) VALUES($1,$2,$3,'Synthetic W4 employee')", [employeeId, organizationId, workplaceId]);
  await client.query("INSERT INTO users(id,organization_id,role,email) VALUES($1,$2,'accountant',$3),($4,$2,'owner',$5)", [accountantId, organizationId, `${accountantId}@example.invalid`, ownerId, `${ownerId}@example.invalid`]);
  await client.query("INSERT INTO mfa_factors(id,organization_id,user_id,encrypted_secret_ref) VALUES($1,$2,$3,$4),($5,$2,$6,$4)", [randomUUID(), organizationId, accountantId, Buffer.from("synthetic").toString("base64"), randomUUID(), ownerId]);
  await client.query("INSERT INTO sessions(id,organization_id,user_id,token_hash,csrf_hash,mfa_satisfied_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7),($8,$2,$9,$10,$11,$6,$7)", [accountantSessionId, organizationId, accountantId, hashSecret(accountantCredentials.sessionToken), hashSecret(accountantCredentials.csrfToken), NOW, new Date("2026-09-06T00:00:00Z"), ownerSessionId, ownerId, hashSecret(ownerCredentials.sessionToken), hashSecret(ownerCredentials.csrfToken)]);
  const contractId = randomUUID();
  await client.query("INSERT INTO employment_contracts(id,organization_id,employee_id,kind,valid_from,valid_to) VALUES($1,$2,$3,'full_time','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')", [contractId, organizationId, employeeId]);
  await client.query("INSERT INTO compensation_terms(id,organization_id,employee_id,contract_id,monthly_salary_vnd,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,$4,8000000,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',$5,$6)", [compensationId, organizationId, employeeId, contractId, compensationPayload, hash(compensationPayload)]);
  await client.query("INSERT INTO attendance_snapshots(id,organization_id,workplace_id,employee_id,period_start,period_end,canonical_payload,content_hash,status,approved_by) VALUES($1,$2,$3,$4,'2026-08-31T17:00:00Z','2026-09-30T17:00:00Z',$5,$6,'approved',$7)", [snapshotId, organizationId, workplaceId, employeeId, snapshotPayload, hash(snapshotPayload), ownerId]);
  if (process.env.PAYSLIP_DB_TEST_MODE === "Red") {
    await client.query("INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode) VALUES($1,$2,'draft',$3,$4,'synthetic')", [rulePackId, organizationId, canonicalize(policyPayload), rulePackHash]);
  } else {
    await client.query("INSERT INTO legal_rule_packs(id,organization_id,status,canonical_payload,content_hash,evidence_mode,release_evidence) VALUES($1,$2,$3,$4,$5,'synthetic',$6)", [rulePackId, organizationId, ruleStatus, canonicalize(policyPayload), rulePackHash, ruleStatus === "released" ? JSON.stringify(releaseEvidence) : null]);
  }
  return { organizationId, workplaceId, employeeId, accountantId, ownerId, accountantSessionId, ownerSessionId, contractId, compensationId, compensationHash: hash(compensationPayload), snapshotId, snapshotHash: hash(snapshotPayload), rulePackId, rulePackHash, releaseEvidence, accountantCredentials, ownerCredentials };
}

export async function addEmployeeSource(client: PoolClient, f: PayRunFixture, salary = "9000000"): Promise<EmployeeSourceBinding> {
  const employeeId = randomUUID(), contractId = randomUUID(), compensationId = randomUUID(), snapshotId = randomUUID();
  const compensationPayload = JSON.stringify({ basis: "monthly_salary", monthlySalaryVnd: salary });
  const snapshotPayload = '{"totalPayableDurationMs":"3600000","approvedPayableMilliseconds":"3600000","synthetic":true}';
  await client.query("INSERT INTO employees(id,organization_id,workplace_id,display_name) VALUES($1,$2,$3,'Second synthetic W4 employee')", [employeeId, f.organizationId, f.workplaceId]);
  await client.query("INSERT INTO employment_contracts(id,organization_id,employee_id,kind,valid_from,valid_to) VALUES($1,$2,$3,'full_time','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')", [contractId, f.organizationId, employeeId]);
  await client.query("INSERT INTO compensation_terms(id,organization_id,employee_id,contract_id,monthly_salary_vnd,valid_from,valid_to,canonical_payload,content_hash) VALUES($1,$2,$3,$4,$5,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',$6,$7)", [compensationId, f.organizationId, employeeId, contractId, salary, compensationPayload, hash(compensationPayload)]);
  await client.query("INSERT INTO attendance_snapshots(id,organization_id,workplace_id,employee_id,period_start,period_end,canonical_payload,content_hash,status,approved_by) VALUES($1,$2,$3,$4,'2026-08-31T17:00:00Z','2026-09-30T17:00:00Z',$5,$6,'approved',$7)", [snapshotId, f.organizationId, f.workplaceId, employeeId, snapshotPayload, hash(snapshotPayload), f.ownerId]);
  return { employeeId, snapshotId, snapshotHash: hash(snapshotPayload), compensationId, compensationHash: hash(compensationPayload), rulePackId: f.rulePackId, rulePackHash: f.rulePackHash };
}
