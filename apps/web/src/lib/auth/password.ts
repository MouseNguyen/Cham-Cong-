import argon2 from "argon2";
export const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export async function hashPassword(password: string): Promise<string> { if (password.length < 12 || password.length > 256) throw new Error("INVALID_PASSWORD"); return argon2.hash(password, ARGON2_OPTIONS); }
export async function verifyPassword(hash: string, password: string): Promise<boolean> { try { return await argon2.verify(hash, password); } catch { return false; } }
