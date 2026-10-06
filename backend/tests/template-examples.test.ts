import {test,expect} from 'vitest';
import {createSlide} from '@slidebi/presentation';
import {fixture} from '../src/db';
import {captureTemplateExample} from '../src/template-examples';

test('template-owned example captures narrative and only its bound chart input independently',async()=>{
 const data=await fixture(),slide=createSlide(data,'budget-comparison');
 expect(data.resultSets.every((result:any)=>result.fields.every((field:any)=>field.name&&field.description))).toBe(true);
 expect(data.resultSets.find((result:any)=>result.id==='budget').fields.find((field:any)=>field.id==='actual')).toMatchObject({name:'实际收入',description:'本期实际收入',unit:'万元'});
 const text=slide.elements.find((e:any)=>e.type==='text') as any;
 text.runs=[{text:'销售增长由华东地区贡献。'}];
 slide.extensions={dataset:{id:'managed-live-id',version:1}};
 const example=captureTemplateExample(data,slide,{background:'年度预算复盘',scenarios:['目标达成率分析']});
 expect(example.dataSpec.snapshot.id).not.toBe(data.snapshot.id);
 expect(example.dataSpec.id).not.toBe(data.id);
 expect(example.slide.snapshotRef).toBe(example.dataSpec.snapshot.id);
 expect(example.slide.reviewState.snapshotId).toBe(example.dataSpec.snapshot.id);
 expect(JSON.stringify(example)).not.toContain('managed-live-id');
 expect(JSON.stringify(example)).not.toContain(data.snapshot.id);
 expect(example.dataSpec.resultSets.map((r:any)=>r.id)).toEqual(['budget']);
 expect(example.businessContext).toEqual({background:'年度预算复盘',scenarios:['目标达成率分析']});
 expect(example.slide.elements.find((e:any)=>e.id===text.id).runs[0].text).toBe('销售增长由华东地区贡献。');
 const before=structuredClone(example);
 text.runs[0].text='页面已修改';data.resultSets[0].rows[0].actual='999';
 expect(example).toEqual(before);
});
