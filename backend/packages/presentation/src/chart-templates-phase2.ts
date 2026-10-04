import type {DataSpec} from './schema';
import type {SlideSpec,Binding} from './types';
const category={categoryKey:{label:'分类唯一键',types:['string','date','datetime'],multiple:false},categoryLabel:{label:'分类标签',types:['string','date','datetime'],multiple:false}};
const numeric=(label:string,min=1,max=4)=>({label,types:['decimal','integer'],multiple:true,min,max,requiresMeasure:true});
export const PHASE2_TEMPLATES=[
 {id:'channel-stacked',name:'渠道收入堆积柱图',chartType:'stackedColumn',scene:'budgetComparison',roles:{...category,series:numeric('堆积指标',1,4)}},
 {id:'channel-percent',name:'渠道收入百分比堆积',chartType:'percentStackedColumn',scene:'budgetComparison',roles:{...category,series:numeric('份额指标',1,4)}},
 {id:'region-pie',name:'区域收入饼图',chartType:'pie',scene:'budgetComparison',roles:{...category,series:numeric('份额指标',1,1)}},
 {id:'region-donut',name:'区域收入圆环图',chartType:'donut',scene:'budgetComparison',roles:{...category,series:numeric('份额指标',1,1)}},
 {id:'revenue-margin-combo',name:'收入与利润率双轴',chartType:'combo',scene:'monthlyTrend',roles:{...category,barSeries:numeric('柱指标',1,1),lineSeries:numeric('线指标',1,1)}},
 {id:'revenue-area',name:'月度收入面积图',chartType:'area',scene:'monthlyTrend',roles:{...category,categoryKey:{label:'日期',types:['date','datetime'],multiple:false},series:numeric('面积指标',1,4)}},
 {id:'budget-actual-scatter',name:'预算与实际收入散点图',chartType:'scatter',scene:'budgetComparison',roles:{...category,x:{label:'X轴指标',types:['decimal','integer'],multiple:false,requiresMeasure:true},y:{label:'Y轴指标',types:['decimal','integer'],multiple:false,requiresMeasure:true}}},
] as const;
export function createPhase2Slide(data:DataSpec,templateId:string,options:{id?:string,title?:string}={}):SlideSpec{
 const t=PHASE2_TEMPLATES.find(t=>t.id===templateId);if(!t)throw new Error('UNKNOWN_TEMPLATE');
 const hint=data.chartHints?.find(h=>h.chartType===t.chartType);if(!hint?.roles||!data.resultSets.some(r=>r.id===hint.resultSetId))throw new Error('AMBIGUOUS_BINDING: explicit chart roles required');
 const id=options.id??`slide-${templateId}`,title=options.title??t.name;
 return {specVersion:'1.0',id,revision:1,title,scene:t.scene,templateRef:{id:templateId,version:1},themeRef:{id:'corporate-blue',version:1},canvas:{width:960,height:540,unit:'pt'},snapshotRef:data.snapshot.id,bindings:{main:{resultSetId:hint.resultSetId,roles:hint.roles as Binding['roles'],computations:[]}},elements:[{id:id+'-title',type:'text',rect:{x:24,y:24,w:912,h:60},z:1,style:{fontSize:28},runs:[{text:title}]},{id:id+'-chart',type:'chart',rect:{x:40,y:100,w:880,h:365},z:2,bindingRef:'main',chartType:t.chartType,options:{showLegend:true,showLabels:true,...(t.chartType==='combo'?{secondaryAxis:true}:{})},exportPolicy:'nativeChart'},{id:id+'-source',type:'sourceFooter',rect:{x:24,y:490,w:912,h:25},z:3,style:{fontSize:10}}],annotations:[],layoutOverrides:{},reviewState:{status:'needsReview',snapshotId:data.snapshot.id}};
}
