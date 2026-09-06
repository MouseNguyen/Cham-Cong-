import type { KioskAdminRepository } from '../../db/repositories/kiosk-admin';
type Credentials={sessionToken:string;csrfToken:string};
export function setKioskPin(repository:KioskAdminRepository,credentials:Credentials,input:{employeeId:string;deviceId:string;employeeCode:string;pin:string}){return repository.setEmployeePin(credentials,input);}
