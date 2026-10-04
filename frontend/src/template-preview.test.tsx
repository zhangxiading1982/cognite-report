// @vitest-environment jsdom
import React from 'react';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {TemplatePreview,MatchedDataPreview} from './DataManagement';
import {DataView} from './ui';
import {TemplateThumbnail} from './TemplateThumbnail';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
const compiled={canvas:{widthPt:960,heightPt:540},theme:{background:'#ffffff',fontFace:'SimHei'},elements:[],diagnostics:[],assets:[]};
it('keeps library preview on one template with full preview before schema',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(url.endsWith('/preview')?{compiled,dataSpec:{resultSets:[],semanticSchema:{tables:[]}},sample:{name:'当前样本'}}:{items:[]})));
 render(<TemplatePreview templateId="one" templates={[{id:'one',name:'当前模板'},{id:'two',name:'其他模板'}]} onClose={()=>{}}/>);
 await waitFor(()=>expect(document.querySelector('.actual-preview svg')).toBeTruthy());
 expect(screen.queryByText('选择模板')).toBeNull();expect(screen.queryByText('其他模板')).toBeNull();
 expect(document.querySelector('.actual-preview')!.compareDocumentPosition(screen.getByText('数据规范与样例')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('shows result schema without exposing model internals',()=>{
 render(<DataView hideModelDetails data={{semanticSchema:{tables:[{id:'secret',name:'模型内部事实表',columns:[]}]},measures:[{id:'m',dax:'SECRET_DAX'}],resultSets:[{id:'r',fields:[{id:'value',name:'金额',type:'decimal'}],rows:[{value:'12'}]}]}}/>);
 expect(screen.queryByText(/语义 Schema/)).toBeNull();expect(screen.queryByText(/SECRET_DAX/)).toBeNull();expect(screen.getByText('图表结果字段 Schema')).toBeTruthy();
});
it('loads template-owned example without requesting managed datasets',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({compiled,dataSpec:{source:{modelId:'operations-demo'},snapshot:{dataAsOf:'2026-03-31T23:59:59+08:00',consistency:'fixture'},mode:'snapshot',resultSets:[]},example:{businessContext:{background:'预算执行复盘',scenarios:['部门预算偏差']}}})));vi.stubGlobal('fetch',fetcher);
 render(<TemplatePreview templateId="one" templates={[{id:'one',name:'预算'}]} onClose={()=>{}}/>);
 expect(await screen.findByText('预算执行复盘')).toBeTruthy();expect(screen.queryByText('operations-demo')).toBeNull();expect(screen.queryByText(/fixture.*snapshot/)).toBeNull();expect(screen.queryByLabelText('预览数据')).toBeNull();expect(fetcher.mock.calls.some((c:any)=>c[0]==='/api/datasets')).toBe(false);
});
it('renders thumbnail from server compiled sample rather than generic chart',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({compiled})));vi.stubGlobal('fetch',fetcher);
 render(<TemplateThumbnail templateId="donut" name="圆环"/>);
 await waitFor(()=>expect(document.querySelector('svg')).toBeTruthy());expect(fetcher).toHaveBeenCalledWith('/api/templates/donut/preview',expect.objectContaining({method:'POST'}));
});
it('uses inferred bindings locally and keeps other choices available for diagnosis',async()=>{
 const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/templates')?{items:[{templateId:'one',name:'优先模板',status:'matched',bindings:{main:{resultSetId:'a'}}},{templateId:'two',name:'其他匹配',status:'matched',bindings:{main:{resultSetId:'b'}}},{templateId:'bad',name:'需要绑定',status:'needsBinding'}]}:{compiled})));
 vi.stubGlobal('fetch',fetcher);render(<MatchedDataPreview dataset={{id:'d',version:1}} templates={[]} onCreated={()=>{}}/>);
 await screen.findByRole('option',{name:/其他匹配/});fireEvent.change(screen.getByRole('combobox',{name:'适合的图表类型'}),{target:{value:'two'}});
 expect((screen.getByRole('combobox',{name:'适合的图表类型'}) as HTMLSelectElement).value).toBe('two');
 expect(fetcher).toHaveBeenCalledWith('/api/datasets/d/templates',expect.objectContaining({headers:expect.any(Object)}));
 expect(fetcher.mock.calls.some((c:any)=>String(c[0]).endsWith('/preview'))).toBe(false);
 expect(screen.getByRole('option',{name:/需要绑定 · 需要配置字段/})).toBeTruthy();
});
it('always exposes the selected chart field roles while previewing with visible defaults',async()=>{
 const data={measures:[{id:'sales',name:'金额'}],resultSets:[{id:'sales',name:'销售数据',primaryKey:['month'],fields:[{id:'month',name:'月份',type:'string'},{id:'amount',name:'金额',type:'decimal',semanticRef:'sales'}],rows:[{month:'1月',amount:'12'}]}]};
 const bindingSchema={main:{roles:{categoryKey:{label:'分类字段',types:['string']},series:{label:'数值指标',types:['decimal'],multiple:true,min:1,max:2,requiresMeasure:true}}}};
 const bindings={main:{resultSetId:'sales',roles:{categoryKey:'month',series:['amount']}}};
 const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/templates')?{items:[{templateId:'column',name:'柱图',status:'matched',bindings,bindingSchema,chartType:'groupedColumn'}]}:{compiled})));
 vi.stubGlobal('fetch',fetcher);
 render(<MatchedDataPreview dataset={{id:'d',version:1,dataSpec:data}} templates={[]}/>);
 expect(await screen.findByRole('heading',{name:'图表配置'})).toBeTruthy();
 expect((screen.getByLabelText('绑定数据表') as HTMLSelectElement).value).toBe('sales');
 expect((screen.getByLabelText('分类字段') as HTMLSelectElement).value).toBe('month');
 expect((screen.getByLabelText('数值指标 1') as HTMLSelectElement).value).toBe('amount');
 expect(fetcher.mock.calls.some((c:any)=>String(c[0]).endsWith('/preview'))).toBe(false);
});
it('groups chart choices and explains when the selected chart needs more fields',async()=>{
 const data={measures:[{id:'sales',name:'金额'}],resultSets:[{id:'sales',name:'销售数据',primaryKey:['month'],fields:[{id:'month',name:'月份',type:'string'},{id:'amount',name:'金额',type:'decimal',semanticRef:'sales'}],rows:[{month:'1月',amount:'12'}]}]};
 const comboSchema={main:{roles:{categoryKey:{label:'分类',types:['string']},barSeries:{label:'柱指标',types:['decimal'],multiple:true,min:1,max:1,requiresMeasure:true},lineSeries:{label:'线指标',types:['decimal'],multiple:true,min:1,max:1,requiresMeasure:true}}}};
 const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/templates')?{items:[
  {templateId:'column',name:'柱图',status:'matched',chartType:'groupedColumn',bindings:{main:{resultSetId:'sales',roles:{categoryKey:'month',series:['amount']}}}},
  {templateId:'combo',name:'组合图',status:'incompatible',chartType:'combo',bindingSchema:comboSchema,diagnostics:[{message:'缺少第二个数值字段'}]}
 ]}:{compiled})));
 vi.stubGlobal('fetch',fetcher);render(<MatchedDataPreview dataset={{id:'d',version:1,dataSpec:data}} templates={[]}/>);
 const picker=await screen.findByRole('combobox',{name:/图表类型/});
 expect(screen.getByRole('group',{name:'比较'})).toBeTruthy();
 expect(screen.getByRole('group',{name:'关系'})).toBeTruthy();
 fireEvent.change(picker,{target:{value:'combo'}});
 expect((await screen.findByRole('status')).textContent).toContain('组合图还不能预览');
 expect(screen.getByText(/至少还需要 1 个数值字段/)).toBeTruthy();
 expect(fetcher.mock.calls.some((c:any)=>c[0]==='/api/templates/combo/preview')).toBe(false);
});
it('updates the local chart when the selected result set and fields change',async()=>{
 const data={measures:[{id:'sales',name:'金额'},{id:'profit',name:'利润'},{id:'cost',name:'成本'}],resultSets:[{id:'sales',name:'销售数据',primaryKey:['month'],fields:[{id:'month',name:'月份',type:'string'},{id:'amount',name:'金额',type:'decimal',semanticRef:'sales'},{id:'profit',name:'利润',type:'decimal',semanticRef:'profit'}],rows:[{month:'1月',amount:'12',profit:'3'}]},{id:'costs',name:'成本数据',primaryKey:['quarter'],fields:[{id:'quarter',name:'季度',type:'string'},{id:'cost',name:'成本',type:'decimal',semanticRef:'cost'}],rows:[{quarter:'Q1',cost:'7'}]}]};
 const bindingSchema={main:{roles:{categoryKey:{label:'分类字段',types:['string']},series:{label:'数值指标',types:['decimal'],multiple:true,min:1,max:1,requiresMeasure:true}}}};
 const initial={main:{resultSetId:'sales',roles:{categoryKey:'month',series:['amount']}}};
 const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/templates')?{items:[{templateId:'column',name:'柱图',status:'matched',bindings:initial,bindingSchema,chartType:'groupedColumn'}]}:{compiled})));
 vi.stubGlobal('fetch',fetcher);render(<MatchedDataPreview dataset={{id:'d',version:1,dataSpec:data}} templates={[]}/>);
 const field=await screen.findByRole('combobox',{name:'数值指标 1'});fireEvent.change(field,{target:{value:'profit'}});
 expect((screen.getByRole('combobox',{name:'数值指标 1'}) as HTMLSelectElement).value).toBe('profit');
 fireEvent.change(screen.getByRole('combobox',{name:'绑定数据表'}),{target:{value:'costs'}});
 expect((screen.getByRole('combobox',{name:'绑定数据表'}) as HTMLSelectElement).value).toBe('costs');
 expect((screen.getByRole('combobox',{name:'数值指标 1'}) as HTMLSelectElement).value).toBe('cost');
 expect(fetcher.mock.calls.some((c:any)=>String(c[0]).endsWith('/preview'))).toBe(false);
 expect(screen.queryByText(/默认字段已显示/)).toBeNull();
});
it('does not fabricate a chart when template sample is missing',async()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({message:'缺少样本'}),{status:422}));
 render(<TemplateThumbnail templateId="no-sample"/>);
 expect(await screen.findByText('样本预览暂不可用')).toBeTruthy();expect(document.querySelector('svg')).toBeNull();
});
it('edits named detail and subtotal refresh queries without model internals',async()=>{
 const {RefreshQueries}=await import('./DataManagement');const change=vi.fn();vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[{id:'source-sales',modelId:'sales',name:'销售源'}]})));
 render(<RefreshQueries value={{mode:'biStudioMock',queries:[{id:'q',name:'渠道明细',language:'dax',modelId:'sales',text:'EVALUATE X',resultSetId:'r',role:'detail'}]}} resultSets={[{id:'r',name:'明细结果'}]} onChange={change}/>);
 fireEvent.change(screen.getByLabelText('查询角色'),{target:{value:'rowSubtotal'}});expect(change.mock.calls[0][0].queries[0].role).toBe('rowSubtotal');
 fireEvent.click(await screen.findByText('使用模型推荐数据源'));expect(change.mock.calls[1][0].queries[0].dataSourceId).toBe('source-sales');
 fireEvent.change(screen.getByLabelText('图表输入分组'),{target:{value:'pivot'}});expect(change.mock.calls[2][0].queries[0].chartGroup).toBe('pivot');
 fireEvent.change(screen.getByLabelText('查询语言'),{target:{value:'sql'}});expect(change.mock.calls[3][0].queries[0].language).toBe('sql');
 expect(screen.queryByText(/语义 Schema/)).toBeNull();
});
it('removes fixture source footer only for template sample rendering',async()=>{
 const {loadTemplatePreview}=await import('./TemplateThumbnail');
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({slide:{elements:[{id:'footer',type:'sourceFooter'},{id:'title',type:'text'}]},compiled:{...compiled,elements:[{id:'footer',type:'text',text:'来源：fixture'},{id:'title',type:'text',text:'业务标题'},{id:'draft-watermark',type:'text',text:'草稿'}]}})));
 const sample=await loadTemplatePreview('one');expect(sample.compiled.elements.map((e:any)=>e.id)).toEqual(['title']);
 const live=await loadTemplatePreview('one',{datasetId:'data'});expect(live.compiled.elements.map((e:any)=>e.id)).toEqual(['footer','title','draft-watermark']);
});
