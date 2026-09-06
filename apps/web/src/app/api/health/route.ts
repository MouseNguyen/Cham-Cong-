import { Pool } from 'pg';
export const runtime='nodejs';
export async function GET(){
  const url=process.env.PAYSLIP_AUTH_DATABASE_URL;
  if(!url)return Response.json({ready:false},{status:503,headers:{'cache-control':'no-store'}});
  const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:2000,statement_timeout:2000});
  try {await pool.query('SELECT 1');return Response.json({ready:true},{headers:{'cache-control':'no-store'}});}
  catch{return Response.json({ready:false},{status:503,headers:{'cache-control':'no-store'}});}
  finally{await pool.end();}
}
