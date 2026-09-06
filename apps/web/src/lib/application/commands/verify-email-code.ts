import type {EmployeesRepository} from "../../db/repositories/employees";
export function verifyEmailCode(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["verifyEmailCode"]>){return repo.verifyEmailCode(...args);}
