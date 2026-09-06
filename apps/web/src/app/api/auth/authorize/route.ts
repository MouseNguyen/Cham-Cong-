import {authRoute} from "../../../../lib/auth/runtime";
export const runtime="nodejs";
export async function POST(request:Request){return authRoute("authorize",request);}
