"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import styles from "../auth.module.css";
export default function TotpPage(){
 const router=useRouter();
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[csrf,setCsrf]=useState("");
 useEffect(()=>{let active=true;fetch("/api/auth/session",{cache:"no-store"}).then(async r=>{if(r.ok&&active)setCsrf((await r.json()).csrfToken)}).catch(()=>{});return()=>{active=false}},[]);
 async function submit(data:FormData){setBusy(true);setMessage("");try{const r=await fetch("/api/auth/totp",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify({code:data.get("code")})});if(r.ok){router.push("/login");return}setMessage("Không thể xác thực. Dùng mã mới trong ứng dụng hoặc đăng nhập lại.")}catch{setMessage("Chưa kết nối được. Hãy thử lại.")}finally{setBusy(false)}}
 return <main className={styles.shell}><section className={styles.card} aria-labelledby="totp-title"><p className={styles.brand}>The Kay’s Gelato</p><h1 id="totp-title" className={styles.title}>Xác thực hai bước</h1><p className={styles.hint}>Nhập mã 6 chữ số đang hiển thị trong ứng dụng xác thực của bạn.</p><form action={submit} className={styles.form} aria-busy={busy}><label className={styles.label}>Mã xác thực<input className={styles.input} name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="one-time-code"/></label><button className={styles.button} disabled={busy} type="submit">{busy?"Đang xác thực…":"Xác thực"}</button><p className={styles.alert} role="alert" aria-live="polite">{message}</p></form><Link className={styles.link} href="/login">Quay lại đăng nhập</Link></section></main>
}
