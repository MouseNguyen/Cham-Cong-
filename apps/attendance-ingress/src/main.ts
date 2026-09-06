import { createAttendanceServer } from './server.ts';
import { createPgAttendanceIngressRepository } from './repository.ts';
const databaseUrl = process.env.PAYSLIP_INGRESS_DATABASE_URL;
if (!databaseUrl) throw Error('PAYSLIP_INGRESS_DATABASE_URL_REQUIRED');
const server = createAttendanceServer({ repository: createPgAttendanceIngressRepository(databaseUrl) });
server.listen(46218, '127.0.0.1');
const close = () => server.close(() => process.exit(0));
process.once('SIGINT', close); process.once('SIGTERM', close);
