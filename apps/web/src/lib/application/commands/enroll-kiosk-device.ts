import type { KioskAdminRepository } from '../../db/repositories/kiosk-admin';
type Credentials={sessionToken:string;csrfToken:string};
export function enrollKioskDevice(repository:KioskAdminRepository,credentials:Credentials,input:{workplaceId:string;expiresAt:Date}){return repository.enroll(credentials,input);}
