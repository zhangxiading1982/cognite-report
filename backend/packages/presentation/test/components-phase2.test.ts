import {it,expect} from 'vitest';
import fixture from '../../../fixtures/monthly-operations.data.json';
import budget from '../../../fixtures/budget.slide.json';
import {compileSlide,renderSlideSvg,composeChartData} from '../src/index';
const page=(e:any)=>({...structuredClone(budget),elements:[{id:'component',rect:{x:40,y:40,w:800,h:300},z:1,...e}]}) as any;
it('binds table to selected current result fields with editable native export semantics',()=>{
 const c=compileSlide(page({type:'table',bindingRef:'main',fields:['regionName','actual']}),fixture as any);
 expect(c.elements[0]?.type).toBe('table');expect(c.elements[0]?.rows?.[0]).toEqual(['Name','实际收入']);expect(c.elements[0]?.rows?.[1]).toContain('12000000');expect(renderSlideSvg(c)).toContain('<text');
});
it('compiles table typography, body fill and border styles into the shared renderer',()=>{
 const c=compileSlide(page({type:'table',bindingRef:'main',fields:['regionName','actual'],style:{fontFace:'Arial',fontSize:14,color:'112233',bold:true,fill:'DDEEFF',bodyFill:'FFF7ED',line:{color:'AABBCC',width:2}}}),fixture as any),table=c.elements[0]!;
 expect(table).toMatchObject({fontFace:'Arial',fontSize:14,color:'112233',bold:true,fill:'DDEEFF',bodyFill:'FFF7ED',line:{color:'AABBCC',width:2}});
 const svg=renderSlideSvg(c);expect(svg).toContain('fill="#FFF7ED"');expect(svg).toContain('stroke="#AABBCC"');expect(svg).toContain('stroke-width="2"');expect(svg).toContain('font-weight="bold"');
});
it('keeps editable table outline and dash styles in the shared renderer',()=>{
 const c=compileSlide(page({type:'table',bindingRef:'main',fields:['regionName','actual'],style:{borderMode:'outline',line:{color:'123456',width:2,dash:'dash'}}}),fixture as any),table=c.elements[0]!;
 expect(table).toMatchObject({borderMode:'outline',line:{color:'123456',width:2,dash:'dash'}});
 const svg=renderSlideSvg(c);expect(svg).toContain('class="table-outline"');expect(svg).toContain('stroke="#123456"');expect(svg).toContain('stroke-width="2"');expect(svg).toContain('stroke-dasharray="8 5"');
});
it('supports tables without visible borders',()=>{
 const c=compileSlide(page({type:'table',bindingRef:'main',fields:['regionName','actual'],style:{borderMode:'none',line:{color:'123456',width:2}}}),fixture as any);
 const svg=renderSlideSvg(c);expect(svg).not.toContain('stroke="#123456"');expect(svg).not.toContain('class="table-outline"');
});
it('compiles presentation-grade table column geometry and semantic cell styles',()=>{
 const d=structuredClone(fixture) as any,rs=d.resultSets[0];
 rs.rows[0].actual='120';rs.rows[1].actual='-80';
 d.measures.find((measure:any)=>measure.id===rs.fields.find((field:any)=>field.id==='actual').semanticRef).format.displayDivisor='1';
 const c=compileSlide(page({type:'table',bindingRef:'main',fields:['regionName','actual'],style:{fontFace:'SimHei',fontSize:15,headerFontSize:13,fill:'DCEAF7',headerColor:'173B67',firstColumnBold:true,lastRowBold:true,numericAlign:'right',columnWidths:[1.8,1],formatNumbers:true,directionFields:['actual'],positiveColor:'16845B',negativeColor:'C53B43'}}),d),table=c.elements[0]!;
 expect(table.columnWidths).toEqual([1.8,1]);
 expect(table.cellStyles[1][0]).toMatchObject({bold:true,align:'left'});
 expect(table.cellStyles[1][1]).toMatchObject({color:'16845B',align:'right'});
 expect(table.cellStyles[2][1]).toMatchObject({color:'C53B43',align:'right'});
 expect(table.rows?.[1][1]).toBe('+120');
 const svg=renderSlideSvg(c);
 expect(svg).toContain('fill="#16845B"');
 expect(svg).toContain('fill="#C53B43"');
 expect(svg).toContain('text-anchor="end"');
});
it('renders inferred finance and matrix table presentation styles in shared SVG output',()=>{
 const finance=compileSlide(page({id:'pnl-table',type:'table',bindingRef:'main',fields:['regionName','actual'],style:{fill:'DCEAF7',bodyFill:'FFFFFF',bodyStripeFill:'F8FAFC',borderMode:'horizontal',line:{color:'D8E1EC',width:.6},lastRowBold:true}}),fixture as any),table=finance.elements[0]!;
 expect(table.tablePreset).toBe('variance');expect(table.lastRowFill).toBe('E9EEF5');expect(table.cellStyles.at(-1)[0].fill).toBe('E9EEF5');expect(renderSlideSvg(finance)).toContain('fill="#E9EEF5"');
 const data=structuredClone(fixture) as any;data.resultSets[0].fields[0].name='职责';data.resultSets[0].rows[0].regionName='R';data.resultSets[0].rows[1].regionName='A';
 const matrix=compileSlide(page({id:'raci-matrix-table',type:'table',bindingRef:'main',fields:['regionName']}),data),matrixTable=matrix.elements[0]!;
 expect(matrixTable.tablePreset).toBe('matrix');expect(matrixTable.cellStyles[1][0]).toMatchObject({fill:'DCEBFA',color:'174A7E',bold:true,align:'center'});expect(renderSlideSvg(matrix)).toContain('fill="#DCEBFA"');
});
it('preserves common editable shape types and their outline styles',()=>{
 const c=compileSlide(page({type:'shape',shape:'ellipse',fill:'DDEEFF',line:{color:'123456',width:3}}),fixture as any),shape=c.elements[0]!;
 expect(shape).toMatchObject({type:'shape',shape:'ellipse',fill:'DDEEFF',line:{color:'123456',width:3}});expect(renderSlideSvg(c)).toContain('<ellipse');expect(renderSlideSvg(c)).toContain('stroke="#123456"');
});
it('composes independently managed table data and uses stable field ids for its columns',()=>{
 const d=structuredClone(fixture) as any,s=page({type:'table',bindingRef:'table-binding',fields:['old'],id:'managed-table'});s.bindings={'table-binding':{resultSetId:'unused',roles:{}}};s.extensions={chartData:{'managed-table':{mode:'dataset',datasetId:'d',dataSpec:d,binding:{resultSetId:d.resultSets[0].id,roles:{columns:['regionName','actual']}}}}};
 const composed=composeChartData(s,fixture);expect(composed.slide.elements[0].fields).toEqual(['regionName','actual']);expect(compileSlide(composed.slide,composed.data).diagnostics.filter((item:any)=>item.severity==='error')).toEqual([]);
});
it('renders process steps as editable shapes and text',()=>{
 const c=compileSlide(page({type:'process',steps:['准备','复核','交付']}),fixture as any);
 expect(c.elements.filter(e=>e.type==='shape')).toHaveLength(3);expect(c.elements.filter(e=>e.type==='text'&&e.id.startsWith('component')).map(e=>e.text)).toEqual(['1. 准备','2. 复核','3. 交付']);
});
it('renders bounded status with explicit manual provenance',()=>{
 const c=compileSlide(page({type:'status',value:0.75,label:'完成率',style:{fontSize:16}}),fixture as any);
 expect(c.elements.find(e=>e.type==='text')?.text).toContain('75%');expect(c.elements.find(e=>e.type==='text')?.text).toContain('人工');
});
it.each([{type:'status',value:2},{type:'process',steps:[]},{type:'table',bindingRef:'main',fields:['missing']}])('rejects invalid component %o',e=>{
 expect(compileSlide(page(e),fixture as any).diagnostics.some(d=>d.severity==='error')).toBe(true);
});
it('bound status follows current data and fails when its row disappears',()=>{
 const d=structuredClone(fixture) as any;const rs=d.resultSets[0];rs.rows[0].actual='0.75';
 const s=page({type:'status',bindingRef:'progress',rowKey:{regionId:'east'},label:'完成率'});s.bindings.progress={resultSetId:rs.id,roles:{value:'actual'}};
 const row=rs.rows[0];s.elements[0].rowKey={regionId:row.regionId};
 expect(compileSlide(s,d).elements.find(e=>e.id==='component-label')?.text).toContain('75%');
 row.actual='0.5';expect(compileSlide(s,d).elements.find(e=>e.id==='component-label')?.text).toContain('50%');
 rs.rows.shift();expect(compileSlide(s,d).diagnostics.some(e=>e.code==='INVALID_COMPONENT')).toBe(true);
});
