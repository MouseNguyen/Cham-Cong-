import {authorize,type Command} from "../../auth/authorization";
import type {AuthRepository} from "../../db/repositories/auth";
export {authorize,type Actor,type Command} from "../../auth/authorization";
export async function authorizeCommand(repo:AuthRepository,token:string,command:Command,resource:{organizationId:string},csrf:string){
 const actor=await repo.checkCsrf(token,csrf);
 try{authorize(actor,command,repo.now(),resource)}catch(error){await repo.recordAuthorization(actor,command,"denied",resource);throw error;}
 await repo.recordAuthorization(actor,command,"passed",resource);
 return actor;
}
