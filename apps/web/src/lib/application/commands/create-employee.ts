import type {EmployeesRepository} from "../../db/repositories/employees";
export function createEmployee(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["createEmployee"]>){return repo.createEmployee(...args);}
