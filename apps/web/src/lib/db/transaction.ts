import type { Pool, PoolClient } from "pg";
export async function withTransaction<T>(pool: Pool, work: (tx: PoolClient) => Promise<T>): Promise<T> {
  const tx = await pool.connect();
  let broken = false;
  try {
    await tx.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const result = await work(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    try { await tx.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { tx.release(broken); }
}
export function conflict(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}
