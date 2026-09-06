import { afterAll, describe, expect, test } from "vitest";
import {testPool} from "./support";
const pool=testPool();
afterAll(async()=>pool.end());
describe("auth storage migration",()=>{
 test("creates challenge, replay and rate-limit storage",async()=>{
  const tables=await pool.query("SELECT to_regclass('public.auth_login_challenges') AS challenge,to_regclass('public.auth_totp_replays') AS replay,to_regclass('public.auth_rate_limits') AS rate");
  expect(tables.rows[0]).toEqual({challenge:"auth_login_challenges",replay:"auth_totp_replays",rate:"auth_rate_limits"});
 });
});
