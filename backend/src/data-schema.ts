import { upgradeTemplateElementsReadability, upgradeTemplateSlideReadability, usesTemplateReadability } from "@slidebi/presentation";

const KNOWN_FIELDS:Record<string,{name:string;description:string}>={
 regionId:{name:'区域ID',description:'区域稳定标识'},regionName:{name:'区域',description:'业务区域名称'},actual:{name:'实际收入',description:'本期实际收入'},budget:{name:'预算收入',description:'同期批准预算收入'},
 month:{name:'月份',description:'经营数据所属月份'},revenue:{name:'收入',description:'当期收入'},stepId:{name:'步骤ID',description:'收入桥步骤稳定标识'},label:{name:'步骤',description:'收入桥步骤名称'},role:{name:'步骤类型',description:'起点、变动项或终点'},amount:{name:'变动金额',description:'该步骤的收入金额或变动贡献'},order:{name:'顺序',description:'步骤展示顺序'},
 online:{name:'线上收入',description:'线上渠道收入'},retail:{name:'线下收入',description:'线下渠道收入'},margin:{name:'利润率',description:'收入对应的利润率'},
};
const RESULT_NAMES:Record<string,string>={budget:'预算对比',trend:'月度趋势',bridge:'收入桥',channelMix:'渠道收入结构',profitTrend:'收入与利润率'};

/** Backfill presentation-facing field metadata while retaining stable table and field IDs. */
export function completeDataSpecSchema(input:any){
 const data=structuredClone(input);
 if(!data||typeof data!=='object'||!Array.isArray(data.resultSets))return data;
 const semanticFields=new Map<string,any>();
 for(const table of data.semanticSchema?.tables??[])for(const column of table.columns??[])semanticFields.set(column.id,column);
 for(const measure of data.measures??[])semanticFields.set(measure.id,measure);
 for(const result of data.resultSets){
  result.name??=RESULT_NAMES[result.id]??result.id;
  for(const field of result.fields??[]){
   const semantic=semanticFields.get(field.semanticRef),known=KNOWN_FIELDS[field.id];
   field.name||=known?.name??semantic?.name??field.id;
   field.description||=known?.description??semantic?.description??`${field.name}字段`;
   if(['decimal','integer'].includes(field.type)&&semantic?.unit){
    field.unit||=semantic.format?.suffix||semantic.unit.currency||semantic.unit.baseUnit;
   }
  }
 }
 return data;
}

export function completeTemplatePayloadSchema(payload:any){
 if(!payload?.example?.dataSpec)return payload;
 const example={...payload.example,dataSpec:completeDataSpecSchema(payload.example.dataSpec)};
 if(!usesTemplateReadability(example.slide?.templateRef?.id))return {...payload,example};
 const slide=upgradeTemplateSlideReadability(example.slide);
 return {
  ...payload,
  ...(Array.isArray(payload.defaultElements)?{defaultElements:upgradeTemplateElementsReadability(payload.defaultElements)}:{}),
  example:{...example,slide},
 };
}
