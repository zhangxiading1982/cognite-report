import {test,expect} from 'vitest';
import fixture from '../../../../../prompt/sd/examples/monthly-operations.data.json';
import budget from '../../../../../prompt/sd/examples/budget.slide.json';
import {validateDataSpec,compileSlide} from '../src/index';

test('display names for result sets and fields survive validation without changing stable bindings or values',()=>{
 const d:any=structuredClone(fixture);
 d.resultSets[0].name='地区预算';d.resultSets[0].fields[2].name='订正后实际收入';
 const validated=validateDataSpec(d);
 expect(validated.valid).toBe(true);
 expect(validated.data?.resultSets[0].name).toBe('地区预算');
 expect(validated.data?.resultSets[0].fields[2].name).toBe('订正后实际收入');
 expect(validated.data?.resultSets[0].fields[2].id).toBe('actual');
 expect(compileSlide(budget as any,validated.data!).elements.find(e=>e.id.endsWith('-kpi'))?.text).toContain('100万元');
 d.resultSets[0].fields[2].name='x'.repeat(201);expect(validateDataSpec(d).valid).toBe(false);
});
