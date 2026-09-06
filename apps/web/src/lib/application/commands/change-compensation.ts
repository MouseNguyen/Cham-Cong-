import type {EmployeesRepository} from "../../db/repositories/employees";
export function changeCompensation(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["changeCompensation"]>){return repo.changeCompensation(...args);}
