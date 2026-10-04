import {fail} from './db.ts';
import {mockFetchDataSpec} from './mock-bi.ts';
import {scopeDataSpec} from './data-scope.ts';
export function defaultRefreshConfig(data:any,origin:any){
 return {mode:origin?.kind==='biStudio'?'biStudioMock':'manual',...(origin?.chartId?{chartId:origin.chartId}:{}),queries:data.resultSets.map((rs:any)=>{const q=data.queries.find((x:any)=>x.id===rs.queryId);return {id:rs.queryId??rs.id,name:rs.id,language:'dax',text:q?.definition?.dax??q?.definition?.query??`EVALUATE '${rs.id}'`,modelId:data.source.modelId,resultSetId:rs.id,role:'detail',chartGroup:rs.id};})};
}
export function validateRefreshConfig(input:any,data:any){
 if(!input||!['manual','biStudioMock'].includes(input.mode)||!Array.isArray(input.queries)||input.queries.length>30)fail(422,'INVALID_REFRESH_CONFIG','请选择刷新方式，最多30条具名查询');
 const result=structuredClone(input),ids=new Set(),names=new Set(),sets=new Set();
 if(result.chartId!==undefined&&(typeof result.chartId!=='string'||!result.chartId.trim()))fail(422,'INVALID_REFRESH_CONFIG','chartId无效');
 for(const q of result.queries){
  for(const field of ['id','name','text','resultSetId'])if(typeof q[field]!=='string'||!q[field].trim()||q[field].length>(field==='text'?50000:200))fail(422,'INVALID_REFRESH_CONFIG','查询必须包含名称、文本和结果集标识');
  for(const field of ['modelId','dataSourceId','chartGroup'])if(q[field]!==undefined&&(typeof q[field]!=='string'||!q[field].trim()||q[field].length>200))fail(422,'INVALID_REFRESH_CONFIG','模型或数据源标识无效');
  if(!['dax','sql'].includes(q.language)||(q.role!==undefined&&!['detail','rowSubtotal','columnSubtotal','grandTotal'].includes(q.role)))fail(422,'INVALID_REFRESH_CONFIG','查询语言或角色无效');
  if(ids.has(q.id)||names.has(q.name)||sets.has(q.resultSetId)||!data.resultSets.some((rs:any)=>rs.id===q.resultSetId))fail(422,'INVALID_REFRESH_CONFIG','查询名称、ID和结果集必须唯一并关联当前数据');
  if(result.mode==='biStudioMock'&&q.language==='dax'&&!q.modelId)fail(422,'INVALID_REFRESH_CONFIG','DAX查询需要模型ID');
  ids.add(q.id);names.add(q.name);sets.add(q.resultSetId);
 }
 if(result.mode==='biStudioMock'&&sets.size!==data.resultSets.length)fail(422,'INVALID_REFRESH_CONFIG','刷新配置必须覆盖所有结果集');
 return result;
}
/** Local fixture simulation only; query text is retained, never evaluated. */
export async function fetchConfiguredMock(config:any,current:any){
 if(config.queries.some((q:any)=>q.language==='sql'))fail(501,'SQL_NOT_IMPLEMENTED','SQL查询已保存，执行接口尚未实现');
 if(config.queries.some((q:any)=>q.modelId!=='operations-demo'||(q.dataSourceId&&q.dataSourceId!=='operations-demo')))fail(422,'MOCK_MODEL_NOT_FOUND','模拟数据源只支持 operations-demo');
 const upstream=await mockFetchDataSpec(config.chartId??'chart-demo-budget');
 for(const q of config.queries){const rs=upstream.resultSets.find((r:any)=>r.id===q.resultSetId),old=current.resultSets.find((r:any)=>r.id===q.resultSetId);if(!rs||!old||JSON.stringify(rs.fields.map((f:any)=>[f.id,f.type]))!==JSON.stringify(old.fields.map((f:any)=>[f.id,f.type])))fail(422,'QUERY_RESULT_MISMATCH',`查询「${q.name}」返回字段与当前数据不一致`);}
 return scopeDataSpec(upstream,config.queries.map((q:any)=>q.resultSetId));
}
