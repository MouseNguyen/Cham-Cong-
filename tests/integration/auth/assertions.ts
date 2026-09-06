import {expect} from "vitest";
export async function denied(work:Promise<unknown>,code?:string){let failure:unknown;try{await work}catch(error){failure=error}expect(failure instanceof Error&&(!code||failure.message===code)).toBe(true);}
