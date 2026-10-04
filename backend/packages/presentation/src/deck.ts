import { z } from 'zod';
import type { CompiledElement, CompiledSlide } from './types';
import type { Diagnostic } from './schema';

const id = z.string().trim().min(1).max(160);
export const deckSchema = z.object({
  id: id.optional(), revision: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(80),
  sections: z.array(z.object({id,title:z.string().trim().min(1).max(48),order:z.number().int()})).max(100),
  instances: z.array(z.object({instanceId:id,slideRef:z.object({id,revision:z.number().int().positive()}),sectionId:id,order:z.number().int(),included:z.boolean()})).max(300),
  structurePolicy:z.object({cover:z.boolean(),agenda:z.boolean(),sectionDividers:z.boolean(),agendaPageCapacity:z.number().int().min(1).max(8)}),
  numbering:z.object({mode:z.enum(['contentOnly','physical']),showTotal:z.boolean()}),
});
export type DeckSpec = z.infer<typeof deckSchema>;
export interface DeckNavigation {
  pageId:string; physicalIndex:number; kind:'cover'|'agenda'|'section'|'content';
  sectionId?:string; instanceId?:string; displayNumber?:number;
}
export interface CompiledDeck { slides:CompiledSlide[]; navigation:DeckNavigation[]; diagnostics:Diagnostic[] }
const error=(code:string,message:string):Diagnostic=>({code,message,severity:'error'});
const sort=(a:{order:number;id:string},b:{order:number;id:string})=>a.order-b.order||(a.id<b.id?-1:a.id>b.id?1:0);
const text=(id:string,value:string,x:number,y:number,w:number,h:number,size=22):CompiledElement=>({id,type:'text',text:value,rect:{x,y,w,h},fontFace:'SimHei',fontSize:size,color:'#172554',align:'left',valign:'top'});
function structure(title:string,subtitle=''):CompiledSlide {
  // Fixed wrapping keeps generated structure independent of Office font substitution.
  const wrap=(value:string,limit:number)=>Array.from({length:Math.ceil([...value].length/limit)},(_,i)=>[...value].slice(i*limit,(i+1)*limit).join('')).join('\n');
  return {canvas:{width:960,height:540,unit:'pt'},theme:{fontFace:'SimHei',background:'#ffffff',textColor:'#172554',seriesColors:['#2563eb']},elements:[
    {id:'deck-accent',type:'shape',shape:'rect',rect:{x:48,y:58,w:8,h:40},fill:'#2563eb'},
    text('deck-heading',wrap(title,25),76,56,820,160,32),
    ...(subtitle?[text('deck-subtitle',wrap(subtitle,40),76,240,820,140,20)]:[]),
  ],diagnostics:[]};
}

/** Deterministic assembly of frozen page revisions. Never fetches or recalculates source data. */
export function compileDeck(input:DeckSpec,sources:Record<string,CompiledSlide>,mode:'draft'|'final'='final'):CompiledDeck {
  const parsed=deckSchema.safeParse(input);
  if(!parsed.success)return {slides:[],navigation:[],diagnostics:[error('INVALID_DECK',parsed.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '))]};
  const spec=parsed.data,diagnostics:Diagnostic[]=[],sourceDiagnostics:Diagnostic[]=[];
  const sectionIds=new Set<string>(),instanceIds=new Set<string>();
  for(const section of spec.sections){if(sectionIds.has(section.id))diagnostics.push(error('DUPLICATE_SECTION','章节 ID 重复。'));sectionIds.add(section.id);}
  for(const instance of spec.instances){
    if(instanceIds.has(instance.instanceId))diagnostics.push(error('DUPLICATE_INSTANCE','页面实例 ID 重复。'));instanceIds.add(instance.instanceId);
    if(!sectionIds.has(instance.sectionId))diagnostics.push(error('UNKNOWN_SECTION','页面引用的章节不存在。'));
    if(instance.included){
      const source=sources[`${instance.slideRef.id}@${instance.slideRef.revision}`];
      if(!source)diagnostics.push(error('MISSING_SLIDE',`页面修订不存在：${instance.slideRef.id}@${instance.slideRef.revision}`));
      else {
        sourceDiagnostics.push(...source.diagnostics.map(d=>({...d,path:`instances.${instance.instanceId}${d.path?'.'+d.path:''}`})));
        if(source.canvas.unit!=='pt'||source.canvas.width!==960||source.canvas.height!==540)diagnostics.push(error('INVALID_CANVAS','汇报页面必须使用 960 × 540 pt 画布。'));
      }
    }
  }
  const included=spec.instances.filter(i=>i.included);
  if(!included.length)diagnostics.push(error('EMPTY_DECK','请至少纳入一个内容页面。'));
  if(diagnostics.some(d=>d.severity==='error'))return {slides:[],navigation:[],diagnostics};
  diagnostics.push(...sourceDiagnostics);
  const sections=[...spec.sections].sort(sort).filter(s=>included.some(i=>i.sectionId===s.id));
  const slides:CompiledSlide[]=[],navigation:DeckNavigation[]=[];
  function append(slide:CompiledSlide,nav:Omit<DeckNavigation,'physicalIndex'>){
    slides.push(slide);navigation.push({...nav,physicalIndex:slides.length});
  }
  if(spec.structurePolicy.cover)append(structure(spec.title,'业务汇报'),{pageId:'cover',kind:'cover'});
  const agendaCount=spec.structurePolicy.agenda?Math.ceil(sections.length/spec.structurePolicy.agendaPageCapacity):0;
  for(let i=0;i<agendaCount;i++)append(structure(agendaCount>1?`目录 ${i+1} / ${agendaCount}`:'目录'),{pageId:`agenda:${i+1}`,kind:'agenda'});
  for(const section of sections){
    if(spec.structurePolicy.sectionDividers)append(structure(section.title),{pageId:`section:${section.id}`,kind:'section',sectionId:section.id});
    const items=included.filter(i=>i.sectionId===section.id).sort((a,b)=>sort({...a,id:a.instanceId},{...b,id:b.instanceId}));
    for(const instance of items)append(structuredClone(sources[`${instance.slideRef.id}@${instance.slideRef.revision}`]),{pageId:`content:${instance.instanceId}`,kind:'content',sectionId:section.id,instanceId:instance.instanceId});
  }
  let contentNumber=0;
  navigation.forEach((nav,i)=>{
    if(mode==='draft'&&nav.kind!=='content') slides[i].elements.push({...text('draft-watermark','草稿',856,498,80,16,10),color:'#B91C1C'});
    if(nav.kind==='content')contentNumber++;
    if(spec.numbering.mode==='physical'||nav.kind==='content')nav.displayNumber=spec.numbering.mode==='physical'?i+1:contentNumber;
    if(nav.displayNumber!==undefined&&nav.kind!=='cover'){
      const total=spec.numbering.mode==='physical'?slides.length:included.length;
      const number = {...text('deck-page-number',`${nav.displayNumber}${spec.numbering.showTotal?` / ${total}`:''}`,822,520,102,15,10),align:'right'};
      const available = [822, 429, 36].find(x => !slides[i].elements.some(e => e.type !== 'shape' && e.rect.x < x + 102 && e.rect.x + e.rect.w > x && e.rect.y < 535 && e.rect.y + e.rect.h > 520));
      if (available === undefined) {
        const diagnostic=error('PAGE_NUMBER_OVERLAP',`第 ${i+1} 页底部没有页码空间，请将底部内容移到 y=520 pt 以上。`);
        diagnostics.push(diagnostic); slides[i].diagnostics.push(diagnostic);
      }
      else { number.rect.x = available; slides[i].elements.push(number); }
    }
    slides[i].provenance={...slides[i].provenance,deckId:spec.id,deckRevision:spec.revision,deckPageId:nav.pageId,deckPageKind:nav.kind,physicalIndex:nav.physicalIndex,displayNumber:nav.displayNumber,instanceId:nav.instanceId};
  });
  sections.forEach((section,i)=>{
    if(!agendaCount)return;
    const page=Math.floor(i/spec.structurePolicy.agendaPageCapacity),row=i%spec.structurePolicy.agendaPageCapacity;
    const nav=navigation.find(n=>n.sectionId===section.id&&n.kind==='content')!;
    const agenda=navigation.find(n=>n.pageId===`agenda:${page+1}`)!;
    const label=[...section.title];
    const title=label.length>30?`${label.slice(0,30).join('')}\n${label.slice(30).join('')}`:section.title;
    slides[agenda.physicalIndex-1].elements.push({...text(`deck-agenda-item:${section.id}`,`${title}    ${nav.displayNumber}`,76,160+row*42,808,42,16),hyperlinkSlide:nav.physicalIndex});
  });
  return {slides,navigation,diagnostics};
}
