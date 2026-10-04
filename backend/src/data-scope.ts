/** Project a template input without mutating its source snapshot or identity. */
export function scopeDataSpec(data:any,resultSetIds:string[]):any {
 const d=structuredClone(data), ids=new Set(resultSetIds);
 if(!ids.size||[...ids].some(id=>!d.resultSets.some((r:any)=>r.id===id)))throw new Error('所需结果集不存在，无法裁剪数据');
 d.resultSets=d.resultSets.filter((r:any)=>ids.has(r.id));
 const queries=new Set(d.resultSets.map((r:any)=>r.queryId));
 d.queries=d.queries.filter((q:any)=>queries.has(q.id));
 d.chartHints=(d.chartHints||[]).filter((h:any)=>ids.has(h.resultSetId));
 const refs=new Set<string>();
 function include(id:string){if(!id||refs.has(id))return;refs.add(id);d.measures.find((m:any)=>m.id===id)?.dependencies.forEach(include);}
 for(const r of d.resultSets)for(const f of r.fields)if(f.semanticRef)include(f.semanticRef);
 for(const q of d.queries)for(const f of q.effectiveFilters)include(f.fieldId);
 // Model-wide context filters remain part of the input's calculation context.
 for(const f of [...d.context.filters,...d.context.effectiveFilters])include(f.fieldId);
 d.measures=d.measures.filter((m:any)=>refs.has(m.id));
 const usedTables=new Set(d.semanticSchema.tables.filter((t:any)=>t.columns.some((c:any)=>refs.has(c.id))).map((t:any)=>t.id));
 const tableOf=new Map<string,string>();
 for(const t of d.semanticSchema.tables)for(const c of t.columns)tableOf.set(c.id,t.id);
 d.semanticSchema.relationships=d.semanticSchema.relationships.filter((r:any)=>usedTables.has(tableOf.get(r.oneColumnId))&&usedTables.has(tableOf.get(r.manyColumnId)));
 for(const r of d.semanticSchema.relationships){include(r.oneColumnId);include(r.manyColumnId);}
 d.semanticSchema.tables=d.semanticSchema.tables.filter((t:any)=>usedTables.has(t.id)).map((t:any)=>({...t,columns:t.columns.filter((c:any)=>refs.has(c.id))}));
 const params=new Set(d.queries.flatMap((q:any)=>Object.values(q.definition.parameterBindings||{})));
 d.context.parameters=Object.fromEntries(Object.entries(d.context.parameters).filter(([key])=>params.has(key)));
 // This is a projection of the snapshot, not bytes carrying its original hash.
 delete d.snapshot.contentHash;
 return d;
}
