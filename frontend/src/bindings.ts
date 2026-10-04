export function eligibleFields(rs:any,rule:any,data?:any){const measures=data?new Set((data.measures||[]).map((m:any)=>m.id)):undefined;return (rs?.fields??[]).filter((f:any)=>(!rule?.types||rule.types.includes(f.type))&&(!rule?.requiresMeasure||(measures?measures.has(f.semanticRef):!!f.semanticRef)));}
export function initialRoles(rs:any,schema:Record<string,any>,data?:any){
 const used=new Set<string>(),roles:Record<string,string|string[]>={};
 for(const [key,rule] of Object.entries(schema)){
  const fields=eligibleFields(rs,rule,data);const numeric=rule.requiresMeasure||rule.types?.every((t:string)=>['decimal','integer'].includes(t));
  const choices=numeric?fields.filter((f:any)=>!used.has(f.id)):fields;
  if(rule.multiple){const ids=choices.slice(0,Math.max(rule.min??1,Math.min(2,rule.max??4))).map((f:any)=>f.id);while(ids.length<(rule.min??1))ids.push('');roles[key]=ids;ids.forEach((id:string)=>used.add(id));}
  else {const preferred=!numeric?(key==='categoryLabel'||key==='label'?fields.find((f:any)=>!rs.primaryKey?.includes(f.id)):fields.find((f:any)=>rs.primaryKey?.includes(f.id))):undefined;const id=preferred?.id??choices[0]?.id??'';roles[key]=id;if(numeric)used.add(id);}
 }
 return roles;
}
