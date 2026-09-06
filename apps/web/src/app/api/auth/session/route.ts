import {authRoute} from "../../../../lib/auth/runtime";
export const runtime="nodejs";
export async function GET(request:Request){return authRoute("session",request);}
