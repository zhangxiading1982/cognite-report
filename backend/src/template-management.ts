import type {Express} from 'express';
import type {Pool} from 'pg';
import {compileSlide,validateDataSpec,validateSlideSpec} from '@slidebi/presentation';
import {authorizeAssets,fail,id,transaction,type DB} from './db.ts';
import {captureTemplateExample} from './template-examples.ts';
import {completeTemplatePayloadSchema} from './data-schema.ts';
export function assertTemplateOwner(t:any,actor:number){if(Number(t.owner_id)!==Number(actor))fail(403,'OWNER_REQUIRED','只有模板 owner 可以修改或删除')}
export function prepareTemplateDraft(t:any,input:any){
 if(input.expectedVersion!==t.version)fail(409,'VERSION_CONFLICT','模板已更新，请重新打开后编辑');
 const name=input.name===undefined?t.name:input.name;
 if(typeof name!=='string'||!name.trim()||name.trim().length>200)fail(422,'INVALID_NAME','模板名称需为 1 至 200 字');
 const visibility=input.visibility??t.visibility??'private';if(!['private','public'].includes(visibility))fail(422,'INVALID_VISIBILITY','请选择私有或公开');
 const source=input.example??t.payload.example;
 if(!source||!validateDataSpec(source.dataSpec).valid||!validateSlideSpec(source.slide).valid)fail(422,'INVALID_TEMPLATE','模板样例数据或页面格式错误');
 const businessContext=source.businessContext;
 if(!businessContext||typeof businessContext.background!=='string'||businessContext.background.length>4000||!Array.isArray(businessContext.scenarios)||businessContext.scenarios.length>30||businessContext.scenarios.some((s:any)=>typeof s!=='string'||s.length>500))fail(422,'INVALID_CONTEXT','请填写业务背景和适用场景');
 const example=captureTemplateExample(source.dataSpec,source.slide,businessContext);
 const compiled=compileSlide(example.slide,example.dataSpec,'draft');if(compiled.diagnostics.some(d=>d.severity==='error'))fail(422,'INVALID_TEMPLATE','图表绑定或样例数据不完整，请检查后保存');
 const defaultElements=structuredClone(example.slide.elements).map((e:any)=>{const o=example.slide.layoutOverrides?.[e.id];return {...e,rect:{...e.rect,...o?.rect},style:{...e.style,...o?.style}}});
 return {name:name.trim(),visibility,compiled,payload:{...t.payload,example,defaultElements,defaultBindings:example.slide.bindings,canvas:example.slide.canvas}};
}
async function read(db:DB,actor:number,id:string,lock=false){
 const row=(await db.query(`SELECT * FROM app.templates WHERE id=$1 AND archived_at IS NULL AND (owner_id=$2 OR visibility IN ('public','builtin'))${lock?' FOR UPDATE':''}`,[id,actor])).rows[0];if(!row)fail(404,'NOT_FOUND','模板不存在');
 const v=(await db.query('SELECT * FROM app.template_versions WHERE template_id=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0];return {...row,...v,payload:completeTemplatePayloadSchema(v.payload),id:row.id};
}
function view(t:any,actor:number){return {...t.payload,folderId:t.folder_id??null,id:t.id,name:t.name,version:t.version,scene:t.scene,themeRef:{id:t.theme_id,version:t.theme_version},ownerId:Number(t.owner_id),visibility:t.visibility,canEdit:Number(t.owner_id)===Number(actor),canDelete:Number(t.owner_id)===Number(actor)}}
async function validateFolder(db:DB,actor:number,folderId:unknown){
 if(folderId!==null&&(typeof folderId!=='string'||!(await db.query("SELECT id FROM app.folders WHERE id=$1 AND owner_id=$2 AND kind='templates'",[folderId,actor])).rows.length))fail(404,'NOT_FOUND','模板目录不存在');
}
async function importFolder(db:DB,actor:number,folderId:unknown){
 if(folderId===null||folderId===undefined)return null;
 if(typeof folderId!=='string')fail(404,'NOT_FOUND','模板目录不存在');
 const folder=(await db.query("SELECT owner_id FROM app.folders WHERE id=$1 AND kind='templates'",[folderId])).rows[0];
 if(!folder)fail(404,'NOT_FOUND','模板目录不存在');
 // Exported public templates carry their owner's folder metadata. A new copy
 // starts at the importing user's root unless that directory belongs to them.
 return Number(folder.owner_id)===Number(actor)?folderId:null;
}
export function registerTemplateManagement(app:Express,pool:Pool,actor:number){
 app.post('/api/templates/import',async(req,res)=>{
  const owner=Number(actor),input=req.body;
  if(!input||typeof input!=='object'||Array.isArray(input))fail(422,'INVALID_TEMPLATE','请上传模板 JSON');
  const source=input.example,scene=input.scene??source?.slide?.scene;
  const draft=prepareTemplateDraft({name:input.name??'导入模板',version:0,visibility:'private',payload:{example:source}},{expectedVersion:0,name:input.name??'导入模板',example:source});
  const example=draft.payload.example,theme=example.slide.themeRef;
  if(typeof scene!=='string'||!scene||scene.length>100)fail(422,'INVALID_TEMPLATE','模板缺少业务场景');
  const tid=id('template');
  const result=await transaction(pool,async db=>{
   const folderId=await importFolder(db,owner,input.folderId);const refs=await authorizeAssets(db,owner,draft.payload);
   const payload={...draft.payload,requiredBindings:input.requiredBindings??{},slots:input.slots??[],allowedControls:input.allowedControls??[],exportCapabilities:input.exportCapabilities??[]};
   await db.query("INSERT INTO app.templates(id,owner_id,visibility,folder_id) VALUES($1,$2,'private',$3)",[tid,owner,folderId]);
   await db.query('INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,1,$2,$3,$4,$5,$6)',[tid,draft.name,scene,theme.id,theme.version,payload]);
   for(const asset of refs)await db.query('INSERT INTO app.template_asset_refs(template_id,template_version,asset_id) VALUES($1,1,$2)',[tid,asset]);
   return view({id:tid,owner_id:owner,folder_id:folderId,visibility:'private',version:1,name:draft.name,scene,theme_id:theme.id,theme_version:theme.version,payload},owner);
  });res.status(201).json(result);
 });
 app.get('/api/templates/:id',async(req,res)=>res.json(view(await read(pool,Number(actor),req.params.id),Number(actor))));
 app.post('/api/templates/:id/preview-draft',async(req,res)=>{const t=await read(pool,Number(actor),req.params.id);assertTemplateOwner(t,Number(actor));const d=prepareTemplateDraft(t,req.body);await authorizeAssets(pool,Number(actor),d.payload);res.json({compiled:d.compiled,slide:d.payload.example.slide})});
 const update=async(req:any,res:any)=>{const result=await transaction(pool,async db=>{const t=await read(db,Number(actor),req.params.id,true);assertTemplateOwner(t,Number(actor));const d=prepareTemplateDraft(t,req.body);const folderId=req.body.folderId===undefined?t.folder_id:req.body.folderId;await validateFolder(db,Number(actor),folderId??null);const refs=await authorizeAssets(db,Number(actor),d.payload);const version=t.version+1;await db.query('UPDATE app.templates SET visibility=$2,folder_id=$3 WHERE id=$1',[t.id,d.visibility,folderId??null]);await db.query('INSERT INTO app.template_versions(template_id,version,name,scene,theme_id,theme_version,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',[t.id,version,d.name,t.scene,t.theme_id,t.theme_version,d.payload]);for(const asset of refs)await db.query('INSERT INTO app.template_asset_refs(template_id,template_version,asset_id) VALUES($1,$2,$3)',[t.id,version,asset]);return view({...t,...d,folder_id:folderId??null,version},Number(actor))});res.json(result)};
 app.put('/api/templates/:id',update);app.patch('/api/templates/:id/metadata',async(req,res)=>{req.body={expectedVersion:req.body.expectedVersion,name:req.body.name,visibility:req.body.visibility,folderId:req.body.folderId};await update(req,res)});
 app.delete('/api/templates/:id',async(req,res)=>{await transaction(pool,async db=>{const t=await read(db,Number(actor),req.params.id,true);assertTemplateOwner(t,Number(actor));if(req.body.expectedVersion!==t.version)fail(409,'VERSION_CONFLICT','模板已更新，请重新打开');await db.query('UPDATE app.templates SET archived_at=now() WHERE id=$1',[t.id])});res.status(204).end()});
}
