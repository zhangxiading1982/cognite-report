import {test,expect} from 'vitest';
import {fixture} from '../src/db.ts';
import {PHASE2_TEMPLATES} from '@slidebi/presentation';
import {matchTemplate} from '../src/template-matching.ts';
function template(id:string){const t=PHASE2_TEMPLATES.find(t=>t.id===id)!;return {template_id:t.id,version:1,visibility:'builtin',scene:t.scene,theme_id:'corporate-blue',theme_version:1,payload:{chartType:t.chartType,bindingSchema:{main:{roles:t.roles}}}};}
async function data(){const d=await fixture();d.chartHints=[];d.resultSets=d.resultSets.filter((r:any)=>r.id==='trend');return d;}
test('schema-compatible data without chart hints offers multiple real renderable templates',async()=>{
 const d=await data();expect(d.resultSets).toHaveLength(1);
 for(const id of ['revenue-area','channel-stacked','region-pie','region-donut']){
  const result=matchTemplate(d,template(id));expect(result.status).toBe('matched');expect(result.matchedBy).toBe('schema');expect(result.bindings.main.roles.series).toEqual(['revenue']);
 }
});
test('ambiguous result sets and axis roles require binding, not arbitrary selection',async()=>{
 const d=await data();d.resultSets.push({...structuredClone(d.resultSets[0]),id:'second'});
 expect(matchTemplate(d,template('region-pie')).status).toBe('needsBinding');
 expect(matchTemplate(await fixture(),template('budget-actual-scatter')).status).toBe('needsBinding');
});
test('shape matching still enforces measure semantics, missing values and negative shares',async()=>{
 const d=await data();d.resultSets[0].rows[0].revenue='-1';
 expect(matchTemplate(d,template('region-pie')).status).toBe('incompatible');
 d.resultSets[0].rows[0].revenue=null;
 expect(matchTemplate(d,template('revenue-area')).status).toBe('incompatible');
});
test('categorical budget data disables time-series and waterfall charts that cannot be configured',async()=>{
 const d=await fixture();d.chartHints=[];d.resultSets=d.resultSets.filter((r:any)=>r.id==='budget');
 expect(matchTemplate(d,{...template('revenue-area'),payload:{chartType:'line'}}).status).toBe('incompatible');
 expect(matchTemplate(d,{...template('revenue-area'),scene:'monthlyTrend',payload:{chartType:'area',bindingSchema:template('revenue-area').payload.bindingSchema}}).status).toBe('incompatible');
 expect(matchTemplate(d,{...template('revenue-area'),scene:'revenueBridge',payload:{chartType:'waterfall'}}).status).toBe('incompatible');
 expect(matchTemplate(d,template('revenue-margin-combo')).status).toBe('needsBinding');
});
