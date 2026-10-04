import type {Express} from 'express';
import type {Pool} from 'pg';
import {fail,transaction} from './db.ts';
import {getDeck,saveRevision} from './decks.ts';
import {editDataset,getDataset} from './datasets.ts';
const tables:Record<string,string>={contents:'decks',decks:'decks',slides:'slides',datasets:'datasets',data:'datasets',assets:'assets',templates:'templates'};
export function registerAccess(app:Express,pool:Pool,actor:number){
 // Deny object mutations centrally as well as in domain methods. Public reads never grant write access.
 app.use('/api',async(req,_res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const parts=req.path.split('/').map(p=>decodeURIComponent(p)),kind=parts[1]?.toLowerCase(),id=parts[2],operation=parts[3]?.toLowerCase(),table=tables[kind];
  if(!table||!id||['from-import','validate'].includes(id))return next();
  if((kind==='assets'&&['favorite','processing-preview','processed-copies'].includes(operation))||(kind==='templates'&&['preview','favorite'].includes(operation))||(['decks','slides'].includes(kind)&&['preview','preflight','export'].includes(operation)))return next();
  const row=(await pool.query(`SELECT owner_id${table==='slides'?'':',visibility'} FROM app.${table} WHERE id=$1`,[id])).rows[0];
  if(!row)return next();
  if(Number(row.owner_id)!==Number(Number(actor))){
   let visible=row.visibility==='public';
   if(table==='slides')visible=!!(await pool.query("SELECT 1 FROM app.slides s JOIN app.decks d ON d.id=s.content_deck_id WHERE s.id=$1 AND d.visibility='public' AND d.archived_at IS NULL",[id])).rowCount;
   fail(visible?403:404,visible?'OWNER_REQUIRED':'NOT_FOUND',visible?'仅 owner 可以修改此内容':'内容不存在');
  }
  next();
 });
 app.patch('/api/management/:kind/:id',async(req,res)=>{
  const table=tables[req.params.kind];if(!['decks','datasets','assets'].includes(table))fail(404,'NOT_FOUND','内容不存在');
  const result=await transaction(pool,async db=>{
   const row=(await db.query(`SELECT * FROM app.${table} WHERE id=$1 AND archived_at IS NULL FOR UPDATE`,[req.params.id])).rows[0];
   if(!row)fail(404,'NOT_FOUND','内容不存在');
   if(Number(row.owner_id)!==Number(Number(actor)))fail(row.visibility==='public'?403:404,'OWNER_REQUIRED','仅 owner 可以修改此内容');
   const {visibility,name,folderId}=req.body;
   if(table==='datasets'&&name!==undefined&&(visibility!==undefined||folderId!==undefined))fail(422,'SEPARATE_DATA_RENAME','请单独保存数据名称，再调整可见性或目录');
   if(visibility!==undefined&&!['private','public'].includes(visibility))fail(422,'INVALID_VISIBILITY','请选择私有或公开');
   if(name!==undefined&&(typeof name!=='string'||!name.trim()||name.trim().length>(table==='decks'?80:200)))fail(422,'INVALID_NAME','名称不能为空或过长');
   if(folderId!==undefined){
    if(table==='decks')fail(422,'INVALID_FOLDER','文稿不支持目录');
    if(folderId!==null&&!(await db.query('SELECT 1 FROM app.folders WHERE id=$1 AND owner_id=$2 AND kind=$3',[folderId,Number(actor),table==='datasets'?'data':'assets'])).rowCount)fail(422,'INVALID_FOLDER','请选择自己的有效目录');
    await db.query(`UPDATE app.${table} SET folder_id=$2 WHERE id=$1`,[row.id,folderId]);
   }
   if(visibility!==undefined)await db.query(`UPDATE app.${table} SET visibility=$2 WHERE id=$1`,[row.id,visibility]);
   if(name!==undefined&&table==='decks'){
    const d=await getDeck(db,Number(actor),row.id),spec={...d.spec,title:name.trim(),revision:d.revision+1};await saveRevision(db,Number(actor),spec);await db.query('UPDATE app.decks SET current_revision=$2,updated_at=now() WHERE id=$1',[row.id,spec.revision]);
   }else if(name!==undefined&&table==='assets')await db.query('UPDATE app.assets SET name=$2 WHERE id=$1',[row.id,name.trim()]);
   return {id:row.id,visibility:visibility??row.visibility,folderId:folderId===undefined?row.folder_id:folderId};
  });
  // Dataset edits use the existing versioned service, which opens its own transaction.
  if(req.body.name!==undefined&&table==='datasets'){const old=await getDataset(pool,Number(actor),req.params.id);await editDataset(pool,Number(actor),old.id,old.version,{name:req.body.name.trim(),dataSpec:old.dataSpec});}
  res.json(result);
 });
}
