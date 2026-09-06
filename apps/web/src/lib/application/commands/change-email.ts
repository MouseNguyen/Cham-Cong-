import type {EmployeesRepository} from "../../db/repositories/employees";
export function changeEmail(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["changeEmail"]>){return repo.changeEmail(...args);}
