/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS subprocess runner. */
const cp=require("node:child_process"),path=require("node:path"),crypto=require("node:crypto"),net=require("node:net");
const root=process.cwd(),origin="http://127.0.0.1:46217";
const env={...process.env,PAYSLIP_AUTH_DATABASE_URL:process.env.PAYSLIP_TEST_DATABASE_URL,PAYSLIP_ORGANIZATION_ID:crypto.randomUUID(),PAYSLIP_PROJECT_ROOT:root,PAYSLIP_ADMIN_ORIGIN:origin,PLAYWRIGHT_BROWSERS_PATH:path.join(root,".tools/playwright"),NEXT_TELEMETRY_DISABLED:"1"};
let server,output="",closed=false;
function freePort(){return new Promise((resolve,reject)=>{const s=net.connect({host:"127.0.0.1",port:46217});s.once("connect",()=>{s.destroy();reject(Error("AUTH_PORT_ALREADY_OWNED"))});s.once("error",e=>e.code==="ECONNREFUSED"?resolve():reject(e));})}
function stop(){if(server&&server.exitCode===null&&!closed){cp.spawnSync("taskkill.exe",["/PID",String(server.pid),"/T","/F"],{windowsHide:true,stdio:"ignore",timeout:15000});closed=true;}}
process.once("SIGINT",()=>{stop();process.exit(130)});
process.once("SIGTERM",()=>{stop();process.exit(143)});
(async()=>{
 try{
  await freePort();
  server=cp.spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"dev",path.join(root,"apps/web"),"--hostname","127.0.0.1","--port","46217"],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  for(const stream of [server.stdout,server.stderr])stream.on("data",b=>{output=(output+b.toString()).slice(-12000)});
  server.on("error",()=>{output="AUTH_SERVER_START_FAILED"});
  const deadline=Date.now()+90000;let ready=false;
  while(Date.now()<deadline){if(server.exitCode!==null)throw Error("AUTH_SERVER_EXITED");try{const r=await fetch(origin+"/login",{signal:AbortSignal.timeout(1500)});if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw Error("AUTH_SERVER_HEALTH_TIMEOUT");
  const test=cp.spawnSync(process.execPath,[path.join(root,"node_modules/@playwright/test/cli.js"),"test","tests/e2e/auth.spec.ts"],{cwd:root,env,windowsHide:true,encoding:"utf8",timeout:150000,maxBuffer:2*1024*1024});
  if(test.stdout)process.stdout.write(test.stdout);
  if(test.stderr)process.stderr.write(test.stderr);
  await new Promise(r=>setTimeout(r,100)); if(test.error||test.status!==0)throw Error("AUTH_BROWSER_TEST_FAILED");
 }catch(error){process.exitCode=1;process.stderr.write(String(error.message)+"\n");if(output)process.stderr.write(output.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,"[redacted-connection]")+"\n");}
 finally{stop();try{let released=false;for(let i=0;i<100;i++){try{await freePort();released=true;break}catch{await new Promise(r=>setTimeout(r,50))}}if(!released)throw Error("LISTENER_REMAINS");console.log(JSON.stringify({browser_cleanup:"passed",port:46217,owned_pid:server?.pid??null}));}catch{process.exitCode=1;console.log(JSON.stringify({browser_cleanup:"failed",port:46217}));}}
})();
