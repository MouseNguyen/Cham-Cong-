"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import styles from "./auth.module.css";
type Session={actor:{role:"owner"|"accountant"};csrfToken:string};
export default function LoginPage(){
 const router=useRouter();
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[session,setSession]=useState<Session|null>(null);
 useEffect(()=>{let active=true;fetch("/api/auth/session",{cache:"no-store"}).then(async r=>{if(r.ok&&active)setSession(await r.json())}).catch(()=>{});return()=>{active=false}},[]);
 async function submit(data:FormData){
  setBusy(true);setMessage("");
  try{const r=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:data.get("email"),password:data.get("password")})});if(r.ok){router.push("/login/totp");return}setMessage("Không thể đăng nhập. Hãy kiểm tra thông tin hoặc thử lại sau.")}
  catch{setMessage("Chưa kết nối được. Hãy thử lại.")}finally{setBusy(false)}
 }
 async function logout(){if(!session)return;setBusy(true);try{const r=await fetch("/api/auth/logout",{method:"POST",headers:{"x-csrf-token":session.csrfToken}});if(r.ok){setSession(null);setMessage("")}else setMessage("Chưa đăng xuất được. Hãy tải lại trang và thử lại.")}catch{setMessage("Chưa kết nối được. Hãy thử lại.")}finally{setBusy(false)}}
 return <main className={styles.shell}><section className={styles.card} aria-labelledby="auth-title"><p className={styles.brand}>The Kay’s Gelato</p>
 {session?<><h1 id="auth-title" className={styles.title}>Đã đăng nhập</h1><p className={styles.hint}>Phiên làm việc của bạn đã được xác thực.</p><p className={styles.badge}>{session.actor.role==="owner"?"Chủ doanh nghiệp":"Kế toán"}</p><Link className={styles.link} href="/attendance">Duyệt bảng công</Link><div className={styles.form}><button className={styles.button} onClick={logout} disabled={busy}>Đăng xuất</button></div><Link className={styles.link} href="/login/totp">Xác thực lại cho thao tác cần phê duyệt</Link></>:
 <><h1 id="auth-title" className={styles.title}>Chào bạn trở lại</h1><p className={styles.hint}>Đăng nhập bằng tài khoản riêng của bạn, sau đó nhập mã xác thực hai bước.</p>
 <form action={submit} className={styles.form} aria-busy={busy}><label className={styles.label}>Email<input className={styles.input} name="email" type="email" maxLength={254} required autoComplete="username"/></label><label className={styles.label}>Mật khẩu<input className={styles.input} name="password" type="password" maxLength={256} required autoComplete="current-password"/></label><button className={styles.button} disabled={busy} type="submit">{busy?"Đang kiểm tra…":"Tiếp tục"}</button></form></>}
 <p className={styles.alert} role="alert" aria-live="polite">{message}</p></section></main>;
}
