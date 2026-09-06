import type { IncomingHttpHeaders } from 'node:http';

const TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
export function deviceToken(headers: IncomingHttpHeaders): string | null {
  const authorization = headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const value = authorization.slice('Bearer '.length);
    return TOKEN.test(value) ? value : null;
  }
  const cookie = headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('pay_slip_kiosk='));
  const value = cookie?.slice('pay_slip_kiosk='.length) ?? '';
  return TOKEN.test(value) ? value : null;
}
