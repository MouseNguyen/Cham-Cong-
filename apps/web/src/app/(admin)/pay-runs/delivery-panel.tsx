'use client';
import {useCallback,useEffect,useState} from 'react';
import Button from '../../../components/Button';
import Dialog from '../../../components/Dialog';
import Field from '../../../components/Field';
import {registerDeliveryTools,type DeliveryToolHost} from '../../../lib/admin/delivery-tools';
import type {ReleasePreview} from '../../../lib/application/commands/preview-payslip-release';
type Preview=ReleasePreview&{status:string;dispatchStatus:string|null;receipts:{kind:string;channel:string;createdAt:string}[]};
type Row={payRunEmployeeId:string;employeeId:string;employeeName:string;artifactId:string|null;sha256:string|null;bytes:string|null;destinations:{id:string;address:string}[]|null;previews:Preview[]|null};
type Action='generate'|'preview'|'release'|'manual'|'password'|'handoff';
const labels:Record<Action,string>={generate:'Tạo PDF mã hóa',preview:'Kiểm tra người nhận',release:'Gửi thử qua bộ giả lập',manual:'Xác nhận đã giao thủ công',password:'Xem mật khẩu riêng',handoff:'Xác nhận đã giao mật khẩu'};
const period=(value:string)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',month:'2-digit',year:'numeric'}).format(new Date(value));
export default function DeliveryPanel({payRunId,role}:{payRunId:string;role:'owner'|'accountant'}){
 const [rows,setRows]=useState<Row[]>([]),[employeeId,setEmployeeId]=useState(''),[destinationId,setDestinationId]=useState('');
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),[confirm,setConfirm]=useState<Action|null>(null),[ack,setAck]=useState(false),[password,setPassword]=useState<string|null>(null),[channel,setChannel]=useState('in_person');
 const row=rows.find(r=>r.employeeId===employeeId)??rows[0];
 const preview=row?.previews?.find(p=>p.status!=='draft')??row?.previews?.[0];
 const terminal=!!preview&&['queued_fake','operator_confirmed_manual'].includes(preview.status);
 const load=useCallback(async()=>{
  const response=await fetch(`/api/documents?payRunId=${encodeURIComponent(payRunId)}`,{cache:'no-store'});if(!response.ok)throw Error('LOAD_FAILED');
  const value=await response.json() as {rows:Row[]};setRows(value.rows);setUncertain(false);
 },[payRunId]);
 useEffect(()=>{
  if(role!=='owner')return;const controller=new AbortController();
  fetch(`/api/documents?payRunId=${encodeURIComponent(payRunId)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error('LOAD_FAILED');const value=await response.json() as {rows:Row[]};
   if(!controller.signal.aborted)setRows(value.rows);
  }).catch(()=>{if(!controller.signal.aborted)setMessage('Chưa tải được phiếu lương. Dùng nút tải lại để kiểm tra.');});
  return()=>controller.abort();
 },[payRunId,role]);
 useEffect(()=>{
  if(password===null)return;
  const clear=()=>setPassword(null),timer=setTimeout(clear,30000);
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
  return()=>{clearTimeout(timer);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);};
 },[password]);
 useEffect(()=>{
  if(role!=='owner'||!row||busy||uncertain||confirm||password!==null)return;
  const actions:Record<string,()=>void>={};
  const open=(a:Action)=>()=>{setAck(false);setConfirm(a);};
  if(!row.artifactId)actions.generate=open('generate');
  else if(!terminal&&row.destinations?.length)actions.preview=open('preview');
  if(preview&&!terminal){actions.release=open('release');actions.manual=open('manual');}
  // Password operations intentionally have no page tools, including confirmation of handoff.
  return registerDeliveryTools(window as Window&DeliveryToolHost,{payRunId,employeeId:row.employeeId,employeeName:row.employeeName,artifactId:row.artifactId,sha256:row.sha256,preview:preview??null},actions);
 },[role,row,busy,uncertain,confirm,password,payRunId,preview,terminal]);
 const open=(action:Action)=>{setAck(false);setPassword(null);setConfirm(action);};
 const execute=async()=>{
  if(!confirm||!ack||!row||busy||uncertain)return;const action=confirm;setBusy(true);setMessage('');
  try{
   const session=await fetch('/api/auth/session',{cache:'no-store'});if(!session.ok)throw Error('UNAUTHENTICATED');const {csrfToken}=await session.json() as {csrfToken:string};
   const input:Record<string,unknown>={action,confirmed:true,employeeId:row.employeeId};
   if(action==='generate')input.payRunEmployeeId=row.payRunEmployeeId;
   else if(action==='preview'){input.artifactId=row.artifactId;input.destinationId=destinationId||row.destinations?.[0]?.id;}
   else{input.previewId=preview?.id;input.hash=preview?.hash;if(action==='handoff')input.channel=channel;}
   const response=await fetch('/api/documents',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(input)});
   const result=await response.json() as {code?:string;password?:string};
   if(!response.ok)throw Error(result.code??'DELIVERY_UNAVAILABLE');
   if(action==='password'){setPassword(result.password??null);setConfirm(null);}
   else{await load();setConfirm(null);setMessage(action==='preview'?'Đã lưu bản xem trước. Kiểm tra toàn bộ thông tin trước khi xác nhận.':'Đã lưu kết quả. Trạng thái bên dưới lấy từ biên nhận.');}
  }catch(error){setUncertain(true);setConfirm(null);const code=error instanceof Error?error.message:'';setMessage(code==='FRESH_MFA_REQUIRED'?'Cần xác thực hai bước mới. Xác thực lại, rồi mở kỳ lương để kiểm tra.':code==='PREVIEW_EXPIRED'?'Bản xem trước đã hết hạn. Tải lại và kiểm tra trước khi tiếp tục.':'Chưa xác nhận được kết quả. Không gửi lại tự động; tải lại để đối chiếu biên nhận.');}
  finally{setBusy(false);setAck(false);}
 };
 if(role!=='owner')return <section className="delivery-panel"><h3>Giao phiếu lương</h3><p>Chủ doanh nghiệp thực hiện giao phiếu lương sau khi kiểm tra người nhận.</p></section>;
 return <section className="delivery-panel" aria-label="Giao phiếu lương"><header><h3>Giao phiếu lương</h3><p>PDF có mật khẩu · chỉ dữ liệu giả lập · không gửi email hoặc Zalo thật.</p></header>
  <p role="status">{message}</p><div className="button-row"><Button variant="secondary" disabled={busy} onClick={()=>{setPassword(null);void load().catch(()=>setMessage('Chưa tải được dữ liệu. Vui lòng thử tải lại.'));}}>Tải lại biên nhận</Button><a href="/login/totp">Xác thực lại trước khi giao</a></div>
  {rows.length>1?<Field label="Nhân viên nhận phiếu"><select value={row?.employeeId??''} onChange={e=>{setEmployeeId(e.target.value);setDestinationId('');setPassword(null);}}>{rows.map(r=><option value={r.employeeId} key={r.employeeId}>{r.employeeName}</option>)}</select></Field>:null}
  {row?<><h4>{row.employeeName}</h4>{row.artifactId?<><p>PDF đã mã hóa AES-256 · {row.bytes} byte</p><p className="delivery-hash">SHA-256: {row.sha256}</p><a className="button button-secondary" href={`/api/documents?view=download&artifactId=${row.artifactId}&employeeId=${row.employeeId}`} download>Tải PDF mã hóa</a></>:<p>Chưa tạo phiếu lương cho nhân viên này.</p>}
   {row.artifactId&&!terminal?<Field label="Email đã xác minh"><select value={destinationId||row.destinations?.[0]?.id||''} onChange={e=>setDestinationId(e.target.value)}>{row.destinations?.map(d=><option key={d.id} value={d.id}>{d.address}</option>)}</select></Field>:null}
   <div className="button-row">{!row.artifactId?<Button disabled={busy||uncertain} onClick={()=>open('generate')}>{labels.generate}</Button>:!terminal?<Button disabled={busy||uncertain||!row.destinations?.length} onClick={()=>open('preview')}>{labels.preview}</Button>:null}</div>
   {row.artifactId&&!row.destinations?.length?<p>Chưa có email đã xác minh. Cần hoàn tất xác minh người nhận trước khi giao.</p>:null}
   {preview?<div className="delivery-preview"><h4>Bản xem trước đã lưu</h4><dl><dt>Nhân viên</dt><dd>{preview.binding.employeeName}</dd><dt>Người nhận đã xác minh</dt><dd>{preview.binding.to}</dd><dt>Kỳ lương</dt><dd>{period(preview.binding.periodStart)}</dd><dt>Tệp</dt><dd>{preview.binding.relativePath}</dd><dt>SHA-256</dt><dd className="delivery-hash">{preview.binding.sha256}</dd></dl>
    <p>Hiệu lực xem trước: {new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'medium'}).format(new Date(preview.expiresAt))}</p>
    <p className="notice" data-testid="delivery-status">{preview.dispatchStatus==='accepted'?'Bộ giả lập đã tiếp nhận · không phải giao email thật':preview.status==='operator_confirmed_manual'?'Người vận hành xác nhận đã giao thủ công':preview.status==='queued_fake'?'Đã vào hàng đợi giả lập · chờ đối chiếu, không gửi lại':'Bản nháp · chưa giao'}</p>
    {!terminal?<div className="button-row"><Button disabled={busy||uncertain} onClick={()=>open('release')}>{labels.release}</Button><Button variant="secondary" disabled={busy||uncertain} onClick={()=>open('manual')}>{labels.manual}</Button></div>:<div className="delivery-handoff"><h4>Giao mật khẩu riêng</h4><p>Chỉ xem khi có thể trao riêng cho đúng nhân viên. Tự ẩn sau 30 giây hoặc khi rời cửa sổ.</p><Field label="Kênh giao mật khẩu"><select value={channel} onChange={e=>setChannel(e.target.value)}><option value="in_person">Trực tiếp</option><option value="phone">Điện thoại</option><option value="zalo_manual">Zalo thủ công</option></select></Field><div className="button-row"><Button variant="secondary" disabled={busy||uncertain} onClick={()=>open('password')}>{labels.password}</Button><Button disabled={busy||uncertain||preview.receipts.some(r=>r.kind==='password_handoff_confirmed')} onClick={()=>open('handoff')}>{labels.handoff}</Button></div></div>}
    <ul aria-label="Biên nhận đã lưu">{preview.receipts.map(r=><li key={r.kind}>{r.kind==='password_handoff_confirmed'?'Đã xác nhận giao mật khẩu riêng':r.kind==='queued_fake'?'Đã ghi nhận yêu cầu gửi giả lập':'Đã ghi nhận giao thủ công'} · {r.channel}</li>)}</ul>
   </div>:null}
  </>:<p>Đang tải phiếu lương…</p>}
  <Dialog name="Xác nhận giao phiếu lương" open={confirm!==null} onClose={()=>{if(!busy)setConfirm(null);}}><h2>{confirm?labels[confirm]:''}</h2><p>{row?.employeeName} · {confirm==='preview'?(row?.destinations?.find(d=>d.id===destinationId)??row?.destinations?.[0])?.address:preview?.binding.to}</p>{preview&&confirm!=='generate'&&confirm!=='preview'?<><p>Kỳ {period(preview.binding.periodStart)} · {preview.binding.relativePath}</p><p className="delivery-hash">SHA-256: {preview.binding.sha256}</p></>:null}<p>{confirm==='manual'?'Chỉ xác nhận sau khi chính bạn đã giao đúng PDF mã hóa cho người nhận.':confirm==='handoff'?'Chỉ xác nhận sau khi đã giao mật khẩu qua kênh riêng đã chọn.':confirm==='release'?'Bộ giả lập tiếp nhận tệp. Không có email thật được gửi.':'Kiểm tra đúng nhân viên và thông tin trước khi tiếp tục.'}</p><label className="field"><span>Tôi đã kiểm tra và đồng ý thao tác này</span><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/></label><div className="button-row"><Button variant="secondary" disabled={busy} onClick={()=>setConfirm(null)}>Hủy</Button><Button disabled={!ack||busy||uncertain} onClick={()=>void execute()}>Xác nhận thao tác</Button></div></Dialog>
  <Dialog name="Mật khẩu riêng" open={password!==null} onClose={()=>setPassword(null)}><h2>Mật khẩu riêng</h2><p>Trao riêng cho {row?.employeeName}. Không chụp hoặc ghi vào biên nhận.</p><output aria-label="Mật khẩu PDF">{password}</output><Button variant="secondary" onClick={()=>setPassword(null)}>Ẩn mật khẩu</Button></Dialog>
 </section>;
}
