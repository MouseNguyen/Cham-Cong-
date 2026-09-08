/** A small state-scoped page interface. Effects only open the same human confirmation UI. */
export type DeliveryTool={name:string;description:string;inputSchema:{type:'object';properties:Record<string,{type:'string';enum?:string[]}>;required:string[];additionalProperties:false};readOnly:boolean;execute:(input:Record<string,unknown>)=>unknown};
export type DeliveryToolHost={paySlipDeliveryTools?:ReadonlyArray<DeliveryTool>};
export function registerDeliveryTools(host:DeliveryToolHost,snapshot:unknown,actions:Record<string,()=>void>){
 const controller=new AbortController();
 const tools:DeliveryTool[]=[{name:'delivery_status',description:'Read current synthetic delivery metadata and receipts. Never returns passwords.',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},readOnly:true,execute(input){if(controller.signal.aborted)throw Error('STALE_TOOL');if(Object.keys(input).length)throw Error('INVALID_INPUT');return structuredClone(snapshot);}}];
 for(const [action,open] of Object.entries(actions))tools.push({name:`delivery_review_${action}`,description:'Open the current UI confirmation dialog. A human must review and confirm; this tool executes no delivery.',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},readOnly:false,execute(input){if(controller.signal.aborted)throw Error('STALE_TOOL');if(Object.keys(input).length)throw Error('INVALID_INPUT');open();return {status:'human_confirmation_required'};}});
 host.paySlipDeliveryTools=tools;
 return ()=>{controller.abort();if(host.paySlipDeliveryTools===tools)delete host.paySlipDeliveryTools;};
}
