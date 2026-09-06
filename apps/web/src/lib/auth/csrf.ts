import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
export function newCsrfToken(): string { return randomBytes(32).toString("base64url"); }
export function hashSecret(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function validCsrf(expectedHash: string, supplied: string | null): boolean { if (!supplied) return false; const expected=Buffer.from(expectedHash,"hex"), actual=Buffer.from(hashSecret(supplied),"hex"); return expected.length===actual.length && timingSafeEqual(expected,actual); }
