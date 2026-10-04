import type pptxgen from 'pptxgenjs';
import type {CompiledElement,CompiledSlide} from '@slidebi/presentation';
export function addPhase2Chart(deck:pptxgen,slide:pptxgen.Slide,e:CompiledElement,theme:CompiledSlide['theme']){
 const r=e.rect,series=e.series!,labels=e.categories!.map(c=>c.label),ax=e.valueAxis!;
 const data=series.map(s=>({name:s.name,labels,values:s.values as number[]}));
 const axisOptions=(a:any)=>({valAxisMinVal:a.min,valAxisMaxVal:a.max,valAxisMajorUnit:a.step,valAxisTitle:a.title,showValAxisTitle:true,valAxisTitleFontFace:theme.fontFace,valAxisLabelFontFace:theme.fontFace,valAxisLabelFontSize:11});
 const options:any={x:r.x/72,y:r.y/72,w:r.w/72,h:r.h/72,lang:'zh-CN',showLegend:e.options?.showLegend,legendPos:'b',legendFontFace:theme.fontFace,legendFontSize:11,catAxisLabelFontFace:theme.fontFace,catAxisLabelFontSize:11,dataLabelFontFace:theme.fontFace,dataLabelFontSize:10,showValue:e.options?.showLabels,showTitle:false,chartColors:series.map(s=>s.color.replace('#','')),dataLabelFormatCode:e.options?.labelNumberFormat,valAxisLabelFormatCode:e.options?.labelNumberFormat,catAxisLineColor:'CBD5E1',valAxisLineColor:'CBD5E1',valGridLine:{color:'E2E8F0',size:.5},...axisOptions(ax),lineDataSymbol:'circle',lineDataSymbolSize:5,lineSize:2,displayBlanksAs:'gap'};
 switch(e.chartType){
 case 'stackedColumn':case 'percentStackedColumn':slide.addChart(deck.ChartType.bar,data,{...options,barDir:'col',barGrouping:e.chartType==='stackedColumn'?'stacked':'percentStacked',gapSizePct:80,dataLabelPosition:'ctr'});break;
 case 'pie':case 'donut':slide.addChart(e.chartType==='pie'?deck.ChartType.pie:deck.ChartType.doughnut,data,{...options,chartColors:['2563EB','0891B2','7C3AED','D97706','059669','DB2777','4F46E5','64748B','DC2626','65A30D','9333EA','0D9488'],showPercent:e.options?.showLabels,showValue:false,dataLabelFormatCode:'0.0%',dataLabelPosition:'bestFit',holeSize:56});break;
 case 'area':slide.addChart(deck.ChartType.area,data,{...options,chartColorsOpacity:35,catAxisMultiLevelLabels:false});break;
 case 'scatter':slide.addChart(deck.ChartType.scatter,[{name:'X',values:e.xValues},...data],{...options,lineSize:0,showValue:false,showLabel:e.options?.showLabels,catAxisMinVal:e.xAxis.min,catAxisMaxVal:e.xAxis.max,catAxisMajorUnit:e.xAxis.step,catAxisTitle:e.xAxis.title,showCatAxisTitle:true,catAxisTitleFontFace:theme.fontFace,catAxisLabelFormatCode:'0.##'});break;
 case 'combo':{
  const dual=!!e.secondaryValueAxis;
  const groups:any=[{type:deck.ChartType.bar,data:[data[0]],options:{barDir:'col',barGrouping:'clustered',dataLabelPosition:'outEnd',chartColors:[series[0].color.replace('#','')]}},{type:deck.ChartType.line,data:[data[1]],options:{secondaryValAxis:dual,secondaryCatAxis:dual,dataLabelPosition:'b',chartColors:[series[1].color.replace('#','')],lineSize:2,lineDataSymbol:'circle'}}];
  if(dual){options.valAxes=[axisOptions(ax),{...axisOptions(e.secondaryValueAxis),valAxisLabelFormatCode:series[1].format?.decimals?'0.'+'0'.repeat(series[1].format.decimals):'0'}];options.catAxes=[{catAxisLabelFontFace:theme.fontFace},{catAxisLabelFontFace:theme.fontFace,catAxisHidden:true}];}
  slide.addChart(groups,options);break;
 }
 default:throw new Error('UNSUPPORTED_CHART');
 }
}
