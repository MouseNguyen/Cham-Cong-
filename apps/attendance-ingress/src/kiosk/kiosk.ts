type Pending={employeeCode:string;idempotencyKey:string;action:'CLOCK_IN'|'CLOCK_OUT'};
const form=document.querySelector<HTMLFormElement>('#clock-form')!;
const code=document.querySelector<HTMLInputElement>('#employee-code')!;
const pin=document.querySelector<HTMLInputElement>('#pin')!;
const receipt=document.querySelector<HTMLElement>('#receipt')!;
const title=document.querySelector<HTMLElement>('#status-title')!;
const detail=document.querySelector<HTMLElement>('#status-detail')!;
const recheck=document.querySelector<HTMLButtonElement>('#recheck')!;
const storageKey='pay-slip-pending';
let pending:Pending|null=null,timer:ReturnType<typeof setTimeout>|undefined,checking=false;
function showStatus(state:string,heading:string,text:string){receipt.dataset.state=state;title.textContent=heading;detail.textContent=text;}
function locked(value:boolean){for(const x of form.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button'))x.disabled=value;}
function clearPending(){pending=null;clearTimeout(timer);try{sessionStorage.removeItem(storageKey)}catch{}locked(false);recheck.hidden=true;}
function saved(value:Record<string,unknown>){return value.recorded===true&&typeof value.eventId==='string'&&typeof value.recordedAt==='string'&&Number.isFinite(Date.parse(value.recordedAt))&&(value.nextAllowedAction==='CLOCK_IN'||value.nextAllowedAction==='CLOCK_OUT');}
function accept(value:Record<string,unknown>){const action=value.nextAllowedAction==='CLOCK_OUT'?'vào ca':'ra ca';const at=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(value.recordedAt as string));clearPending();showStatus('recorded','Đã ghi nhận '+action,at+' · Giờ cửa hàng');code.focus();code.select();}
async function post(path:string,body:object){const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const value:unknown=await response.json();if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_RESPONSE');return {response,value:value as Record<string,unknown>};}
function uncertain(){showStatus('uncertain','Chưa xác nhận được — đang kiểm tra','Chưa có xác nhận lưu. Không gửi lại chấm công; hệ thống sẽ kiểm tra yêu cầu ban đầu.');locked(true);recheck.hidden=false;}
async function check(attempt=0){if(!pending||checking)return;checking=true;recheck.disabled=true;const original=pending;try{const {response,value}=await post('/reconcile',{employeeCode:original.employeeCode,idempotencyKey:original.idempotencyKey});if(pending===original&&response.ok&&saved(value)){accept(value);return;}}catch{}finally{checking=false;recheck.disabled=false;}
 if(pending===original){if(attempt<2)timer=setTimeout(()=>void check(attempt+1),1500);else{showStatus('uncertain','Chưa xác nhận được — đang kiểm tra','Vẫn chưa có xác nhận. Liên hệ quản lý trước khi chấm công lại.');}}
}
form.addEventListener('submit',async event=>{event.preventDefault();if(pending||!form.reportValidity())return;const action=(event.submitter as HTMLButtonElement|null)?.value;if(action!=='CLOCK_IN'&&action!=='CLOCK_OUT')return;
 const next:Pending={employeeCode:code.value.trim(),idempotencyKey:crypto.randomUUID(),action};pending=next;
 try{sessionStorage.setItem(storageKey,JSON.stringify(next));}catch{pending=null;pin.value='';showStatus('rejected','Chưa ghi nhận chấm công','Trình duyệt không thể giữ mã kiểm tra. Liên hệ quản lý.');return;}
 let request:Promise<Awaited<ReturnType<typeof post>>>;
 try{request=post('/clock',{...next,pin:pin.value});}finally{pin.value='';}
 locked(true);showStatus('sending','Đang gửi chấm công','Vui lòng chờ xác nhận lưu.');
 try{const {response,value}=await request;if(response.ok&&saved(value)){accept(value);return;}if(value.recorded===false&&typeof value.code==='string'&&typeof value.requestId==='string'){clearPending();showStatus('rejected','Chưa ghi nhận chấm công','Kiểm tra mã và PIN hoặc liên hệ quản lý.');return;}}catch{}
 uncertain();void check();
});
recheck.addEventListener('click',()=>{clearTimeout(timer);void check();});
try{const raw=sessionStorage.getItem(storageKey);if(raw){const v=JSON.parse(raw) as Pending;if(typeof v.employeeCode==='string'&&v.employeeCode.length<=64&&/^[0-9a-f-]{36}$/i.test(v.idempotencyKey)&&['CLOCK_IN','CLOCK_OUT'].includes(v.action)){pending={employeeCode:v.employeeCode,idempotencyKey:v.idempotencyKey,action:v.action};code.value=v.employeeCode;uncertain();void check();}else sessionStorage.removeItem(storageKey);}}catch{showStatus('rejected','Chưa ghi nhận chấm công','Không đọc được mã kiểm tra. Liên hệ quản lý trước khi gửi lại.');locked(true);}
// Read-only page capability exposes outcome only, never PIN, code, token or request key.
Object.defineProperty(window,'paySlipKioskTools',{value:Object.freeze({readState:()=>({state:receipt.dataset.state??'ready',pendingConfirmation:pending!==null})}),writable:false});
window.addEventListener('pagehide',()=>{pin.value='';clearTimeout(timer);});
