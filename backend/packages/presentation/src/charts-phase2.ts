import type {DataSpec,ResultSet,Diagnostic} from './schema';
import {formatSchema} from './schema';
import type {Binding,SlideElement,CompiledElement,Rect,CompiledSlide} from './types';
import {axis,chartNumber,D} from './math';
export const PHASE2_CHARTS=['stackedColumn','percentStackedColumn','pie','donut','combo','area','scatter'] as const;
export function compilePhase2Chart(e:SlideElement,rect:Rect,b:Binding|undefined,r:ResultSet|undefined,data:DataSpec,theme:CompiledSlide['theme'],mode:string){
 const diagnostics:Diagnostic[]=[];const error=(code:string,message:string)=>diagnostics.push({code,message,severity:'error',elementId:e.id});
 const done=(node?:CompiledElement)=>({node,diagnostics});
 if(!r||!b){error('MISSING_BINDING','请选择有效结果集与字段');return done()}
 if(!r.rows.length){diagnostics.push({code:'EMPTY_RESULT',message:'无数据',severity:mode==='final'?'error':'warning',elementId:e.id});return done({id:e.id,type:'text',rect,text:'无数据',fontSize:16})}
 if(r.rows.length>200){error('CHART_ROW_LIMIT','图表最多200行');return done()}
 if(rect.w<280||rect.h<180){error('CHART_TOO_SMALL','图表最小280×180pt');return done()}
 const kind=e.chartType!,scatter=kind==='scatter',combo=kind==='combo',share=['pie','donut','percentStackedColumn'].includes(kind),round=['pie','donut'].includes(kind);
 const fields:any[]=scatter?[b.roles.x,b.roles.y]:combo?[...(Array.isArray(b.roles.barSeries)?b.roles.barSeries:[]),...(Array.isArray(b.roles.lineSeries)?b.roles.lineSeries:[])]:Array.isArray(b.roles.series)?b.roles.series:[];
 if(!fields.length||fields.length>4||new Set(fields).size!==fields.length||(round&&fields.length!==1)||(combo&&(!Array.isArray(b.roles.barSeries)||b.roles.barSeries.length!==1||!Array.isArray(b.roles.lineSeries)||b.roles.lineSeries.length!==1))||fields.some(f=>typeof f!=='string'||!['decimal','integer'].includes(r.fields.find(x=>x.id===f)?.type??''))){error('INVALID_SERIES','需明确选择1–4个数值指标；饼图单指标、组合图柱线各1指标、散点图明确X/Y');return done()}
 const measures=fields.map(f=>data.measures.find(m=>m.id===r.fields.find(x=>x.id===f)?.semanticRef));
 if(measures.some(m=>!m)){const index=measures.findIndex(m=>!m),field=r.fields.find(item=>item.id===fields[index]),semantic=data.semanticSchema.tables.flatMap(table=>table.columns).find(item=>item.id===field?.semanticRef);error('MISSING_MEASURE',`“${field?.name||semantic?.name||field?.id||fields[index]}”不是指标字段；数值轴需要具有计算口径和单位的指标`);return done()}
 const units=measures.map(m=>JSON.stringify([m!.unit.baseUnit,m!.unit.currency??null]));
 if(!scatter&&!(combo&&e.options?.secondaryAxis===true)&&new Set(units).size!==1){error('UNIT_MISMATCH','同轴指标单位必须一致，组合图不同单位请显式使用双轴');return done()}
 const cat=b.roles.categoryKey,label=b.roles.categoryLabel??cat;
 if(typeof cat!=='string'||typeof label!=='string'||!r.fields.some(f=>f.id===cat)||!r.fields.some(f=>f.id===label)||r.rows.some(row=>row[cat]==null)||new Set(r.rows.map(row=>JSON.stringify(row[cat]))).size!==r.rows.length){error('INVALID_CATEGORY','需要唯一且完整的分类键与标签');return done()}
 if(round&&r.rows.length>12){error('TOO_MANY_SLICES','饼图最多12个分类，请先聚合');return done()}
 if(kind==='area'&&!['date','datetime'].includes(r.fields.find(f=>f.id===cat)?.type??'')){error('INVALID_DATE_ROLE','面积图需要真实日期字段');return done()}
 const rows=kind==='area'?[...r.rows].sort((a,b)=>String(a[cat]).localeCompare(String(b[cat]))):r.rows;
 if(rows.some(row=>fields.some(f=>row[f]==null))){error('INCOMPLETE_CHART_DATA','所选指标存在缺失值，不能将缺失默认为零');return done()}
 try{
 const dual=combo&&e.options?.secondaryAxis===true;
 const formats=measures.map((m,i)=>formatSchema.parse(scatter||dual?m!.format:e.options?.numberFormat??measures[0]!.format));
 const series=fields.map((f,i)=>({id:f,name:measures[i]!.name,sourceValues:rows.map(row=>String(row[f])),values:rows.map(row=>chartNumber(String(row[f]),formats[i])),color:theme.seriesColors[i%theme.seriesColors.length],axis:dual&&i===1?'secondary':'primary',format:formats[i]}));
 if(share){if(series.some(s=>s.values.some(v=>v<0))||(round?new D(0).add(series[0].sourceValues.reduce((a,v)=>a.add(v),new D(0))).lte(0):rows.some((_,i)=>series.reduce((a,s)=>a.add(s.sourceValues[i]),new D(0)).lte(0)))){error('INVALID_SHARE_VALUES','份额值不得为负且合计必须大于零');return done()}if(measures.some(m=>m!.aggregationBehavior!=='additive')){error('NON_ADDITIVE_SHARE','份额图只支持可加指标');return done()}}
 if(kind==='percentStackedColumn')rows.forEach((_,i)=>{const total=series.reduce((a,s)=>a.add(s.sourceValues[i]),new D(0));series.forEach(s=>{s.values[i]=new D(s.sourceValues[i]).div(total).toNumber()})});
 let vals=series.flatMap(s=>s.values);
 if(kind==='stackedColumn')vals=rows.flatMap((_,i)=>[series.reduce((v,s)=>v+Math.max(0,s.values[i]),0),series.reduce((v,s)=>v+Math.min(0,s.values[i]),0)]);
 if(dual||scatter)vals=series[scatter?1:0].values;
 const valueAxis=kind==='percentStackedColumn'?{min:0,max:1,step:.2,title:'占比'}:{...axis(vals,true),title:formats[scatter?1:0].suffix||measures[scatter?1:0]!.unit.baseUnit};
 const node:CompiledElement={id:e.id,type:'nativeChart',rect,chartType:kind as any,categories:rows.map(row=>({id:String(row[cat]),label:String(row[label])})),series,valueAxis,numericUnit:{baseUnit:measures[0]!.unit.baseUnit,displayDivisor:formats[0].displayDivisor,label:valueAxis.title},options:{...e.options,fontFace:theme.fontFace,showLegend:e.options?.showLegend!==false,showLabels:e.options?.showLabels!==false,labelNumberFormat:kind==='percentStackedColumn'?'0.0%':formats[0].decimals?'0.'+'0'.repeat(formats[0].decimals):'0'}};
 if(dual)node.secondaryValueAxis={...axis(series[1].values,true),title:formats[1].suffix||measures[1]!.unit.baseUnit};
 if(scatter){node.xAxis={...axis(series[0].values,false),title:formats[0].suffix||measures[0]!.unit.baseUnit};node.xValues=series[0].values;node.series=[series[1]];node.options!.showLegend=false;}
 return done(node);
 }catch{error('INVALID_CHART_VALUES','指标格式或数值精度无法安全绘制');return done()}
}
