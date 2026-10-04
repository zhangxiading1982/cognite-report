// @vitest-environment jsdom
import React from 'react';
import {render,screen,cleanup,within} from '@testing-library/react';
import {test,expect,afterEach,vi} from 'vitest';
import {DatasetChartPreview} from './DatasetChartPreview';

afterEach(()=>{cleanup();vi.unstubAllGlobals()});

const data={measures:[{id:'sales',name:'金额'}],resultSets:[{id:'sales',name:'销售数据',primaryKey:['month'],fields:[{id:'month',name:'月份',type:'string'},{id:'amount',name:'金额',type:'decimal',semanticRef:'sales'}],rows:[{month:'1月',amount:'12'}]}]};

test('focuses chart preview without repeating the dataset table',()=>{
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({items:[]})));
 render(<DatasetChartPreview dataset={{id:'data-1',dataSpec:data}} data={data} templates={[]}/>);
 expect(screen.getByRole('heading',{name:'图表预览'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'图形'})).toBeNull();
 expect(screen.queryByRole('button',{name:'数据表'})).toBeNull();
 expect(screen.queryByText('销售数据')).toBeNull();
 expect(screen.queryByRole('button',{name:'交叉表'})).toBeNull();
 expect(screen.queryByText(/交叉表/)).toBeNull();
});

test('gives legacy chart bindings Chinese role names and type-safe field choices',async()=>{
 vi.stubGlobal('fetch',async(url:string)=>{
  if(url.endsWith('/templates'))return new Response(JSON.stringify({items:[{templateId:'monthly-trend',name:'月度趋势',scene:'monthlyTrend',chartType:'line',status:'matched',bindings:{main:{resultSetId:'sales',roles:{categoryKey:'month',categoryLabel:'month',series:['amount']}}}}]}));
  return new Response(JSON.stringify({compatible:true,slide:{elements:[]},compiled:{elements:[]}}));
 });
 render(<DatasetChartPreview dataset={{id:'data-1',version:1,dataSpec:data}} data={data} templates={[]}/>);
 const category=await screen.findByLabelText('分类唯一键');
 expect(within(category).getByRole('option',{name:'月份 · string'})).toBeTruthy();
 expect(within(category).queryByRole('option',{name:'金额 · decimal'})).toBeNull();
 const series=screen.getByLabelText('数值指标 1');
 expect(within(series).getByRole('option',{name:'金额 · decimal'})).toBeTruthy();
 expect(within(series).queryByRole('option',{name:'月份 · string'})).toBeNull();
});
