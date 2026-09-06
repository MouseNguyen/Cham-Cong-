export type Credentials={sessionToken:string;csrfToken:string};
export type ContractProfile={kind:"full_time"|"part_time";templateVersion:string;startDate:string;durationMonths:12;probationDays:6};
export type CreateEmployeeInput={workplaceId:string;displayName:string;nationality:"VN";taxResidency:"resident";contract:ContractProfile;compensation:import("./compensation").CompensationTerm};
export type DeliveryDestination={id:string;address:string;validFrom:string;validTo:string|null;verificationStatus:"pending"|"verified";version:string};
export function fail(code:string):never{throw Object.assign(new Error(code),{code,nextAction:code==="UNSUPPORTED_EMPLOYMENT_PROFILE"?"Chỉ dùng hồ sơ Việt Nam cư trú và mẫu hợp đồng12 tháng đã duyệt.":"Kiểm tra thông tin và tải lại phiên bản hiện hành trước khi thử lại."});}
export function localDate(value:string):Date{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail("INVALID_EFFECTIVE_DATE");
 const parsed=new Date(value+"T00:00:00.000Z");if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail("INVALID_EFFECTIVE_DATE");
 return new Date(parsed.getTime()-7*3600000);
}
export function contractDates(profile:ContractProfile):{from:Date;to:Date}{
 if(!profile||!["full_time","part_time"].includes(profile.kind)||profile.durationMonths!==12||profile.probationDays!==6||profile.templateVersion!==profile.kind+"_12_month_v1")fail("UNSUPPORTED_EMPLOYMENT_PROFILE");
 const from=localDate(profile.startDate),local=new Date(from.getTime()+7*3600000);const year=local.getUTCFullYear()+1,month=local.getUTCMonth();
 const day=Math.min(local.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
 return {from,to:new Date(Date.UTC(year,month,day)-7*3600000)};
}
