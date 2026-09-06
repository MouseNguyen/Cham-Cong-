import type {EmployeesRepository} from "../../db/repositories/employees";
export function getEmployee(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["getEmployee"]>){return repo.getEmployee(...args);}
