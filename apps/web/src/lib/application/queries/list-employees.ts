import type {EmployeesRepository} from "../../db/repositories/employees";
export function listEmployees(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["listEmployees"]>){return repo.listEmployees(...args);}
