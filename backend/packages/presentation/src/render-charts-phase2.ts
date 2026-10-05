import type {CompiledElement} from './types';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const color=(v:string)=>/^#?[\da-f]{6}$/i.test(v)?'#'+v.replace('#',''):'#2563eb';
export function renderPhase2Chart(n:CompiledElement){
 const r=n.rect,series=n.series!,cats=n.categories!,ax=n.valueAxis!,kind=n.chartType;
 const fontSize=Number(n.options?.fontSize??11),labelFontSize=Number(n.options?.labelFontSize??10),labelColor=color(n.options?.labelColor??'475569'),axisColor=color(n.options?.axisColor??'94A3B8'),gridColor=color(n.options?.gridColor??'E2E8F0'),barThickness=Math.max(.25,Math.min(.95,Number(n.options?.barThickness??.7))),lineWidth=Math.max(1,Math.min(8,Number(n.options?.lineWidth??2))),markerSize=Math.max(0,Math.min(12,Number(n.options?.markerSize??3)));
 const text=(x:number,y:number,value:unknown,anchor='start',size=fontSize,fill=labelColor)=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}">${esc(value)}</text>`;
 let out=`<g font-family="${esc(n.options?.fontFace)}" data-chart-type="${kind}">`;
 if(kind==='pie'||kind==='donut'){
  const cx=r.x+r.w*.36,cy=r.y+r.h*.49,radius=Math.min(r.w*.28,r.h*.38),inner=kind==='donut'?radius*.56:0,total=series[0].values.reduce<number>((a,v)=>a+(v??0),0);let angle=-Math.PI/2;
  const slices=n.options?.sliceColors??['2563EB','0891B2','7C3AED','D97706','059669','DB2777','4F46E5','64748B','DC2626','65A30D','9333EA','0D9488'];
  cats.forEach((cat,i)=>{const value=series[0].values[i]??0;if(value<=0)return;const span=value/total*2*Math.PI,end=angle+span;const hue=slices[i%slices.length];
   if(span>=2*Math.PI-.000001)out+=`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#${hue}"/>`;
   else out+=`<path d="M ${cx} ${cy} L ${cx+radius*Math.cos(angle)} ${cy+radius*Math.sin(angle)} A ${radius} ${radius} 0 ${span>Math.PI?1:0} 1 ${cx+radius*Math.cos(end)} ${cy+radius*Math.sin(end)} Z" fill="#${hue}" stroke="white"/>`;
   if(n.options?.showLabels)out+=text(cx+(radius+15)*Math.cos(angle+span/2),cy+(radius+15)*Math.sin(angle+span/2),(value/total*100).toFixed(1)+'%','middle',labelFontSize,labelColor);
   if(n.options?.showLegend)out+=`<rect x="${r.x+r.w*.73}" y="${r.y+30+i*21}" width="9" height="9" fill="#${hue}"/>`+text(r.x+r.w*.73+15,r.y+39+i*21,cat.label);
   angle=end;
  });if(inner)out+=`<circle cx="${cx}" cy="${cy}" r="${inner}" fill="white"/>`;return out+'</g>';
 }
 const plotHeight=Math.max(.55,Math.min(1,Number(n.options?.plotHeight??1))),available=r.h-90,plot={x:r.x+52,y:r.y+27+available*(1-plotHeight),w:r.w-(n.secondaryValueAxis?110:74),h:available*plotHeight};
 const y=(v:number,a=ax)=>plot.y+plot.h-(v-a.min)/(a.max-a.min)*plot.h;
 const x=(i:number)=>plot.x+(i+.5)*plot.w/cats.length;
 const number=(v:number)=>Number(v.toPrecision(5));
 out+=text(plot.x,r.y+13,ax.title,'start',fontSize,axisColor);
 for(let t=ax.min,i=0;t<=ax.max+ax.step*.001&&i<100;t+=ax.step,i++){out+=(n.options?.showGridlines===false?'':`<line x1="${plot.x}" x2="${plot.x+plot.w}" y1="${y(t)}" y2="${y(t)}" stroke="${gridColor}"/>`)+text(plot.x-7,y(t)+4,kind==='percentStackedColumn'?Math.round(t*100)+'%':number(t),'end',fontSize,axisColor)}
 if(n.secondaryValueAxis){const a=n.secondaryValueAxis;out+=text(plot.x+plot.w,r.y+13,a.title,'end');for(let t=a.min,i=0;t<=a.max+a.step*.001&&i<100;t+=a.step,i++)out+=text(plot.x+plot.w+7,y(t,a)+4,number(t));}
 if(kind==='scatter'){
 const xa=n.xAxis;const sx=(v:number)=>plot.x+(v-xa.min)/(xa.max-xa.min)*plot.w;
 for(let t=xa.min,i=0;t<=xa.max+xa.step*.001&&i<100;t+=xa.step,i++)out+=text(sx(t),plot.y+plot.h+17,number(t),'middle');out+=text(plot.x+plot.w/2,r.y+r.h-15,xa.title,'middle');
 n.xValues.forEach((v:number,i:number)=>{out+=`<circle cx="${sx(v)}" cy="${y(series[0].values[i]!)}" r="5" fill="${color(series[0].color)}"/>`;if(n.options?.showLabels)out+=text(sx(v)+7,y(series[0].values[i]!)-7,cats[i].label)});
 }else{
 cats.forEach((c,i)=>{if(cats.length<=16||i%Math.ceil(cats.length/16)===0)out+=text(x(i),plot.y+plot.h+18,c.label,'middle')});
 const positives=Array(cats.length).fill(0),negatives=Array(cats.length).fill(0);
 series.forEach((s,j)=>{
  const a=n.secondaryValueAxis&&j===1?n.secondaryValueAxis:ax;const points=s.values.map((v,i)=>[x(i),y(v!,a)]);
  if(kind==='stackedColumn'||kind==='percentStackedColumn')s.values.forEach((raw,i)=>{const v=raw!,acc=v>=0?positives:negatives,from=acc[i];acc[i]+=v;const width=plot.w/cats.length*barThickness;out+=`<rect x="${x(i)-width/2}" y="${Math.min(y(from),y(acc[i]))}" width="${width}" height="${Math.abs(y(from)-y(acc[i]))}" fill="${color(s.color)}"/>`;if(n.options?.showLabels&&Math.abs(y(from)-y(acc[i]))>18)out+=text(x(i),(y(from)+y(acc[i]))/2+4,kind==='percentStackedColumn'?(v*100).toFixed(1)+'%':number(v),'middle',labelFontSize,labelColor)});
  else if(kind==='combo'&&j===0)s.values.forEach((v,i)=>{const width=plot.w/cats.length*barThickness;out+=`<rect x="${x(i)-width/2}" y="${Math.min(y(0),y(v!))}" width="${width}" height="${Math.abs(y(v!)-y(0))}" fill="${color(s.color)}"/>`});
  else if(kind==='area'){out+=`<path d="M ${x(0)} ${y(0)} L ${points.map(p=>p.join(' ')).join(' L ')} L ${x(cats.length-1)} ${y(0)} Z" fill="${color(s.color)}" fill-opacity="0.35" stroke="${color(s.color)}"/>`;}
  else{out+=`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color(s.color)}" stroke-width="${lineWidth}"/>`;if(markerSize>0)points.forEach(([px,py])=>out+=`<circle cx="${px}" cy="${py}" r="${markerSize}" fill="${color(s.color)}"/>`)}
  if(n.options?.showLabels&&(kind==='combo'||kind==='area'))points.forEach(([px,py],i)=>{out+=text(px,kind==='combo'&&j===1?py+17:py-7,number(s.values[i]!), 'middle',labelFontSize,labelColor)});
 });
 }
 if(n.options?.showLegend)series.forEach((s,i)=>{out+=`<rect x="${plot.x+i*150}" y="${r.y+r.h-19}" width="9" height="9" fill="${color(s.color)}"/>`+text(plot.x+15+i*150,r.y+r.h-10,s.name+(n.secondaryValueAxis&&i===1?'（右轴）':''))});
 return out+'</g>';
}
