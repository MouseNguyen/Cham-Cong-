import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

// Construct explicitly at the trusted server boundary; importing this module
// does not read credentials or start a connection.
export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 3000 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { pool, prisma, async close() { await prisma.$disconnect(); await pool.end(); } };
}
