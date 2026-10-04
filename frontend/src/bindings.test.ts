import {it,expect} from 'vitest';import {initialRoles} from './bindings';
it('creates explicit combo roles without confusing two differently typed axes',()=>{
 const schema={categoryKey:{types:['string']},barSeries:{types:['decimal'],multiple:true,min:1,max:1,requiresMeasure:true},lineSeries:{types:['decimal'],multiple:true,min:1,max:1,requiresMeasure:true}};
 const rs={primaryKey:['id'],fields:[{id:'id',type:'string'},{id:'income',type:'decimal',semanticRef:'m1'},{id:'rate',type:'decimal',semanticRef:'m2'}]};
 expect(initialRoles(rs,schema)).toEqual({categoryKey:'id',barSeries:['income'],lineSeries:['rate']});
});
it('leaves missing numeric roles visible for binding instead of empty arrays',()=>expect(initialRoles({fields:[{id:'name',type:'string'}]},{series:{types:['decimal'],multiple:true,min:1}})).toEqual({series:['']}));
