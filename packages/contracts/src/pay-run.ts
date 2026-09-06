export type PayRunStatus="draft"|"calculated"|"review_pending"|"approved"|"finalized";
export interface PayRunCredentials{sessionToken:string;csrfToken:string}
export interface CreatePayRunInput{workplaceId:string;periodStart:string;periodEnd:string}
export interface VersionedPayRunInput{payRunId:string;expectedVersion:number}
export interface EmployeeSourceBinding{employeeId:string;snapshotId:string;snapshotHash:string;compensationId:string;compensationHash:string;rulePackId:string;rulePackHash:string}
export interface CalculatePayRunInput extends VersionedPayRunInput{sources:readonly EmployeeSourceBinding[]}
export interface CreateAdjustmentRunInput{originalRunId:string;reason:string}
