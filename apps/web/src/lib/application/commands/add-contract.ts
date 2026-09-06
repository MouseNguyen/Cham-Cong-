import type {EmployeesRepository} from "../../db/repositories/employees";
export function addContract(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["addContract"]>){return repo.addContract(...args);}
