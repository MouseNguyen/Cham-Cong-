import {expect,test} from "vitest";
import {createAuthHandlers} from "../../../apps/web/src/lib/auth/http";
import type {AuthRepository} from "../../../apps/web/src/lib/db/repositories/auth";
const origin="http://127.0.0.1:46217";
test("Next loopback URL normalization preserves valid Origin and actual Host validation",async()=>{
 const handlers=createAuthHandlers({} as AuthRepository,origin);
 const request=new Request("http://localhost:46217/api/auth/login",{method:"POST",headers:{origin,host:"127.0.0.1:46217","content-type":"application/json"},body:"{}"});
 expect((await handlers.login(request)).status).toBe(400);
});
test("forged Host is rejected even when Origin matches",async()=>{
 const handlers=createAuthHandlers({} as AuthRepository,origin);
 const request=new Request(origin+"/api/auth/login",{method:"POST",headers:{origin,host:"example.invalid","content-type":"application/json"},body:"{}"});
 expect((await handlers.login(request)).status).toBe(403);
});
