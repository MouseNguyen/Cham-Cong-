import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { appPool, finalizeSyntheticPayRun, moveSyntheticPayRun, prepareSyntheticPayRunForFinalization, seedScenario } from "./support";

let pool: Pool;
beforeAll(async () => { pool = appPool(); });
afterAll(async () => { await pool.end(); });
async function fresh() { const client = await pool.connect(); try { return await seedScenario(client); } finally { client.release(); } }

describe("DB07 revision and audit atomicity", () => {
  it("rolls back revision/audit together, writes one audit on success, and rejects stale revisions", async () => {
    const { withTransaction } = await import("../../../apps/web/src/lib/db/transaction");
    const fixture = await fresh(); const initial = Number((await pool.query<{version:number}>("SELECT version FROM pay_runs WHERE id = $1", [fixture.runId])).rows[0]!.version);
    const calculate={id:fixture.runId,expectedVersion:initial,actorId:fixture.ownerId,from:"draft" as const,to:"calculated" as const,action:"pay_run.calculated"};
    await expect(withTransaction(pool, async (tx) => { await moveSyntheticPayRun(tx, calculate); throw new Error("injected rollback"); })).rejects.toThrow("injected rollback");
    expect((await pool.query("SELECT version FROM pay_runs WHERE id = $1", [fixture.runId])).rows[0]!.version).toBe(initial);
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE aggregate_id = $1", [fixture.runId])).rows[0].count).toBe(0);
    await withTransaction(pool, (tx) => moveSyntheticPayRun(tx,calculate));
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE aggregate_id = $1", [fixture.runId])).rows[0].count).toBe(1);
    await expect(withTransaction(pool, (tx) => moveSyntheticPayRun(tx,calculate))).rejects.toMatchObject({ code: "STATE_VERSION_CONFLICT" });
  });
});

describe("DB08 finalization/outbox atomicity", () => {
  it("rolls back both records together and writes one job for the committed idempotency key", async () => {
    const { withTransaction } = await import("../../../apps/web/src/lib/db/transaction");
    const fixture = await fresh(); const initial = Number((await pool.query<{version:number}>("SELECT version FROM pay_runs WHERE id = $1", [fixture.runId])).rows[0]!.version);
    const approvedVersion=await withTransaction(pool,(tx)=>prepareSyntheticPayRunForFinalization(tx,{id:fixture.runId,expectedVersion:initial,actorId:fixture.ownerId}));
    const rollbackKey = `rollback-${randomUUID()}`;
    await expect(withTransaction(pool, async (tx) => { await finalizeSyntheticPayRun(tx, { id: fixture.runId, expectedVersion: approvedVersion, actorId: fixture.ownerId, idempotencyKey: rollbackKey }); throw new Error("injected finalization rollback"); })).rejects.toThrow("injected finalization rollback");
    expect((await pool.query("SELECT status FROM pay_runs WHERE id = $1", [fixture.runId])).rows[0].status).toBe("approved");
    expect((await pool.query("SELECT count(*)::int AS count FROM outbox_jobs WHERE pay_run_id = $1", [fixture.runId])).rows[0].count).toBe(0);
    const key = `outbox-${randomUUID()}`;
    await withTransaction(pool, (tx) => finalizeSyntheticPayRun(tx, { id: fixture.runId, expectedVersion: approvedVersion, actorId: fixture.ownerId, idempotencyKey: key }));
    expect((await pool.query("SELECT count(*)::int AS count FROM outbox_jobs WHERE pay_run_id = $1 AND idempotency_key = $2", [fixture.runId, key])).rows[0].count).toBe(1);
  });
});

describe("DB11 application-role privilege boundary", () => {
  it("has no superuser, BYPASSRLS, public-schema ownership/CREATE, or TRUNCATE privilege", async () => {
    const fixture = await fresh(); const client = await pool.connect();
    try {
      const privileges = await client.query<{rolsuper:boolean;rolbypassrls:boolean;owns_public:boolean;can_create_public:boolean}>("SELECT r.rolsuper, r.rolbypassrls, n.nspowner = r.oid AS owns_public, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public FROM pg_roles r JOIN pg_namespace n ON n.nspname = 'public' WHERE r.rolname = current_user");
      expect(privileges.rows).toEqual([{ rolsuper: false, rolbypassrls: false, owns_public: false, can_create_public: false }]);
      await expect(client.query("TRUNCATE clock_events")).rejects.toMatchObject({ code: "42501" });
      await expect(client.query(`CREATE TABLE app_role_escape_${fixture.runId.replaceAll("-", "_")} (id uuid)`)).rejects.toMatchObject({ code: "42501" });
    } finally { client.release(); }
  });
});
describe("DB08 replay", () => {
 it("replays the same finalization exactly once and rejects changed retry identity",async()=>{
  const {withTransaction}=await import("../../../apps/web/src/lib/db/transaction");
  const f=await fresh(),key=randomUUID();
  const approvedVersion=await withTransaction(pool,tx=>prepareSyntheticPayRunForFinalization(tx,{id:f.runId,expectedVersion:0,actorId:f.ownerId}));
  const input={id:f.runId,expectedVersion:approvedVersion,actorId:f.ownerId,idempotencyKey:key};
  const first=await withTransaction(pool,tx=>finalizeSyntheticPayRun(tx,input));
  const replay=await withTransaction(pool,tx=>finalizeSyntheticPayRun(tx,input));
  expect(first.replayed).toBe(false);
  expect(replay).toEqual({...first,replayed:true});
  await expect(withTransaction(pool,tx=>finalizeSyntheticPayRun(tx,{...input,expectedVersion:approvedVersion+1}))).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  expect((await pool.query("SELECT count(*)::int n FROM audit_events WHERE aggregate_id=$1",[f.runId])).rows[0].n).toBe(4);
  expect((await pool.query("SELECT count(*)::int n FROM outbox_jobs WHERE pay_run_id=$1",[f.runId])).rows[0].n).toBe(1);
 });
});

describe("W2 schema/client/repository agreement",()=>{
 it("exposes exactly the 60 declared models with their columns with matching PostgreSQL types and nullability",async()=>{
  const {readFileSync}=await import("node:fs");
  const schema=readFileSync("prisma/schema.prisma","utf8");
  const expected:Record<string,Record<string,{type:string;nullable:boolean}>>={};
  for(const model of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)){
   const fields:Record<string,{type:string;nullable:boolean}>={};
   for(const line of model[2]!.split("\n")){
    const field=line.match(/^\s+(\w+) (String|BigInt|Int|Boolean|Json|DateTime)(\?)?(.*)$/);
    if(!field)continue;
    const attrs=field[4]!;
    const type=attrs.includes("@db.Uuid")?"uuid":attrs.includes("@db.Date")?"date":attrs.includes("@db.Timestamptz")?"timestamptz":({String:"text",BigInt:"int8",Int:"int4",Boolean:"bool",Json:"jsonb"} as Record<string,string>)[field[2]!]!;
    fields[field[1]!]={type,nullable:field[3]==="?"};
   }
   expected[model[1]!]=fields;
  }
  expect(Object.keys(expected)).toHaveLength(60);
  const actual:typeof expected={};
  for(const row of (await pool.query("SELECT table_name,column_name,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations'")).rows){
   (actual[row.table_name]??={})[row.column_name]={type:row.udt_name,nullable:row.is_nullable==="YES"};
  }
  expect(actual).toEqual(expected);
 });
 it("uses the generated Prisma adapter and archives exact UTF-8 bytes through repositories",async()=>{
  const {createDatabase}=await import("../../../apps/web/src/lib/db/client");
  const {withTransaction}=await import("../../../apps/web/src/lib/db/transaction");
  const {findCompensation}=await import("../../../apps/web/src/lib/db/repositories/compensation");
  const {archiveSnapshot}=await import("../../../apps/web/src/lib/db/repositories/snapshots");
  const {archiveSyntheticRuleDraft}=await import("../../../apps/web/src/lib/db/repositories/rule-packs");
  const f=await fresh();
  const db=createDatabase(process.env.PAYSLIP_TEST_DATABASE_URL!);
  try {
   expect((await db.prisma.organizations.findUnique({where:{id:f.orgId}}))?.name).toBe("Synthetic Gelato");
   await withTransaction(pool,async tx=>{
    const term=await findCompensation(tx,{organizationId:f.orgId,employeeId:f.employeeId,at:new Date("2026-09-01T00:00:00Z")});
    expect(term.monthly_salary_vnd).toBe("8000000");
    expect(await findCompensation(tx,{organizationId:f.orgId,employeeId:f.employeeId,at:new Date("2027-01-01T00:00:00Z")})).toBeNull();
    const canonicalPayload='{"nhan":"Nhân viên mô phỏng"}';
    const snapshot=await archiveSnapshot(tx,{id:randomUUID(),organizationId:f.orgId,workplaceId:f.workplaceId,employeeId:f.employeeId,periodStart:new Date("2026-08-31T17:00:00Z"),periodEnd:new Date("2026-09-30T17:00:00Z"),canonicalPayload,approvedBy:f.ownerId});
    const rule=await archiveSyntheticRuleDraft(tx,{id:randomUUID(),organizationId:f.orgId,canonicalPayload});
    expect(snapshot.canonical_payload).toBe(canonicalPayload);
    expect(rule.canonical_payload).toBe(canonicalPayload);
    expect(rule.status).toBe("draft");
    expect(snapshot.content_hash).toBe(rule.content_hash);
   });
  } finally {await db.close();}
 });
});
