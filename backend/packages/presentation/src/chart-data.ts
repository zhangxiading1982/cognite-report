/** Resolve independently owned chart inputs into one collision-free rendering input. */
export function composeChartData(inputSlide:any,inputData:any){
 const slide=structuredClone(inputSlide),data=structuredClone(inputData),usedBindings=new Set<string>();
 for(const element of slide.elements??[]){
  const source=slide.extensions?.chartData?.[element.id];if(!['chart','table'].includes(element.type)||!source?.dataSpec||!source.binding)continue;
  const d=structuredClone(source.dataSpec),prefix=`chart:${element.id}:`,ref=(s:string)=>prefix+s;
  for(const table of d.semanticSchema.tables){table.id=ref(table.id);for(const col of table.columns)col.id=ref(col.id)}
  for(const r of d.semanticSchema.relationships){r.id=ref(r.id);r.oneColumnId=ref(r.oneColumnId);r.manyColumnId=ref(r.manyColumnId)}
  for(const m of d.measures){m.id=ref(m.id);m.dependencies=m.dependencies.map(ref)}
  for(const q of d.queries){q.id=ref(q.id);for(const f of q.effectiveFilters??[])f.fieldId=ref(f.fieldId)}
  for(const rs of d.resultSets){rs.id=ref(rs.id);rs.queryId=ref(rs.queryId);for(const f of rs.fields)if(f.semanticRef)f.semanticRef=ref(f.semanticRef)}
  const bid=element.bindingRef&&!usedBindings.has(element.bindingRef)?element.bindingRef:`chart:${element.id}`;usedBindings.add(bid);element.bindingRef=bid;slide.bindings[bid]={...structuredClone(source.binding),resultSetId:ref(source.binding.resultSetId)};
  if(element.type==='table'&&Array.isArray(source.binding.roles?.columns))element.fields=[...source.binding.roles.columns];
  // Recomposition is idempotent when the stored snapshot was already composed.
  data.semanticSchema.tables=data.semanticSchema.tables.filter((x:any)=>!x.id.startsWith(prefix)).concat(d.semanticSchema.tables);
  data.semanticSchema.relationships=data.semanticSchema.relationships.filter((x:any)=>!x.id.startsWith(prefix)).concat(d.semanticSchema.relationships);
  data.measures=data.measures.filter((x:any)=>!x.id.startsWith(prefix)).concat(d.measures);
  data.queries=data.queries.filter((x:any)=>!x.id.startsWith(prefix)).concat(d.queries);
  data.resultSets=data.resultSets.filter((x:any)=>!x.id.startsWith(prefix)).concat(d.resultSets);
 }
 return {slide,data};
}
