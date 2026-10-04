import {test,expect} from 'vitest';
import {fixture} from '../src/db';
import {validateDataSpec} from '@slidebi/presentation';
import {scopeDataSpec} from '../src/data-scope';

test('keeps only the selected input with transitive measures, query filters and schema dependencies',async()=>{
 const data=await fixture(), before=structuredClone(data);
 const scoped=scopeDataSpec(data,['budget']);
 expect(scoped.resultSets.map((r:any)=>r.id)).toEqual(['budget']);
 expect(scoped.queries.map((q:any)=>q.id)).toEqual(['q-budget']);
 expect(scoped.measures.map((m:any)=>m.id)).toEqual(['revenue-actual','revenue-budget']);
 expect(scoped.semanticSchema.tables.some((t:any)=>t.id==='fact-bridge')).toBe(false);
 expect(scoped.semanticSchema.tables.some((t:any)=>t.id==='dim-month')).toBe(true);
 expect(scoped.context.parameters).toEqual({reportMonth:data.context.parameters.reportMonth});
 expect(scoped.chartHints.every((h:any)=>h.resultSetId==='budget')).toBe(true);
 expect(validateDataSpec(scoped).errors).toEqual([]);
 expect(data).toEqual(before);
});
test('follows declared measure dependencies and keeps every input of a composite template',async()=>{
 const data=await fixture();
 data.measures[0].dependencies=['derived'];
 data.measures.push({...data.measures[0],id:'derived',dependencies:['sales-revenue']});
 const scoped=scopeDataSpec(data,['budget','trend']);
 expect(scoped.resultSets).toHaveLength(2);
 expect(scoped.measures.some((m:any)=>m.id==='derived')).toBe(true);
 expect(validateDataSpec(scoped).errors).toEqual([]);
 expect(()=>scopeDataSpec(data,['missing'])).toThrow();
});
