import type {EmployeesRepository} from "../../db/repositories/employees";
export function deactivateEmployee(repo:EmployeesRepository,...args:Parameters<EmployeesRepository["deactivateEmployee"]>){return repo.deactivateEmployee(...args);}
