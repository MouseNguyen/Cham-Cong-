import {createHmac,randomBytes} from "node:crypto";
import {hashSecret} from "./csrf";
export const SESSION_COOKIE="pay_slip_session";
export const CHALLENGE_COOKIE="pay_slip_challenge";
export function csrfForToken(token:string):string{return createHmac("sha256",token).update("pay-slip/csrf/v1").digest("base64url");}
export function newSessionSecrets(){const token=randomBytes(32).toString("base64url"),csrfToken=csrfForToken(token);return {token,tokenHash:hashSecret(token),csrfToken,csrfHash:hashSecret(csrfToken)};}
export function secureCookie(token:string,expires:Date,name=SESSION_COOKIE):string{return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`;}
export function expiredCookie(name=SESSION_COOKIE):string{return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;}
export function cookieValue(header:string|null,name=SESSION_COOKIE):string|null{const v=header?.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="))?.slice(name.length+1);return v&&/^[A-Za-z0-9_-]{43}$/.test(v)?v:null;}
