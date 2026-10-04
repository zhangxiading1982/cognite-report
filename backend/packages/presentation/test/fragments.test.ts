import {it,expect} from 'vitest';
import {makeFragment,insertFragment} from '../src/fragments';
import page from '../../../../../prompt/sd/examples/budget.slide.json';
import data from '../../../../../prompt/sd/examples/monthly-operations.data.json';
it('copies selected content and immutable resolved styles, rekeys bindings and keeps target theme',()=>{
 const p=structuredClone(page) as any;const id=p.elements.find((e:any)=>e.type==='chart').id;
 const f=makeFragment(p,[id]);expect(f.elements).toHaveLength(1);expect(JSON.stringify(f)).not.toContain('snapshot-2026');
 const target={...structuredClone(p),themeRef:{id:'neutral',version:1}};const n=insertFragment(target,f,data as any,'target');
 expect(n.elements).toHaveLength(p.elements.length+1);expect(n.elements.at(-1)!.id).not.toBe(id);expect(n.themeRef.id).toBe('neutral');expect(n.elements.at(-1)!.bindingRef).not.toBe(p.elements.find((e:any)=>e.id===id).bindingRef);
});
it('rejects missing selection and incompatible target data instead of misbinding',()=>{
 expect(()=>makeFragment(page as any,['missing'])).toThrow();const id=page.elements.find(e=>e.type==='chart')!.id;const f=makeFragment(page as any,[id]);expect(()=>insertFragment(page as any,f,{...data,resultSets:[]} as any,'target')).toThrow();
});
it('source theme retains source chart palette while target theme adopts current palette',async()=>{
 const {compileSlide}=await import('../src/index');const source=structuredClone(page) as any;source.themeRef={id:'neutral',version:1};const id=source.elements.find((e:any)=>e.type==='chart').id;const fragment=makeFragment(source,[id]);
 const target=structuredClone(page) as any;const a=insertFragment(target,fragment,data as any,'source'),b=insertFragment(target,fragment,data as any,'target');
 const color=(s:any)=>compileSlide(s,data as any).elements.filter(e=>e.type==='nativeChart').at(-1)!.series![0].color;
 expect(color(a)).toBe('475569');expect(color(b)).toBe('2563EB');
});
