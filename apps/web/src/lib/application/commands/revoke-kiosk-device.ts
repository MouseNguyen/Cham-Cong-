import type { KioskAdminRepository } from '../../db/repositories/kiosk-admin';
type Credentials={sessionToken:string;csrfToken:string};
export function revokeKioskDevice(repository:KioskAdminRepository,credentials:Credentials,deviceId:string){return repository.revoke(credentials,deviceId);}
export function rotateKioskDevice(repository:KioskAdminRepository,credentials:Credentials,deviceId:string,expiresAt:Date){return repository.rotate(credentials,deviceId,expiresAt);}
