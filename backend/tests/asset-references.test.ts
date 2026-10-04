import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {authorizeAssets} from '../src/db';

test('archiving a library asset keeps an existing owner reference usable without granting another owner access',async()=>{
 const db=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
  const owner=Number((await db.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'asset-reference') RETURNING id",[randomUUID()])).rows[0].id);
  const stranger=Number((await db.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'asset-stranger') RETURNING id",[randomUUID()])).rows[0].id);
  const object=(await db.query("INSERT INTO app.storage_objects(storage_key,sha256,mime_type,byte_size) VALUES($1,$2,'image/png',1) RETURNING id",['tests/'+randomUUID(), 'a'.repeat(64)])).rows[0].id;
  const aid='archive-'+randomUUID();
  await db.query("INSERT INTO app.assets(id,owner_id,visibility,name,kind,original_object_id) VALUES($1,$2,'private','existing image','image',$3)",[aid,owner,object]);
  await db.query('UPDATE app.assets SET archived_at=now() WHERE id=$1',[aid]);
  await expect(authorizeAssets(db,owner,{elements:[{type:'image',assetId:aid}]})).resolves.toEqual([aid]);
  await expect(authorizeAssets(db,stranger,{elements:[{type:'image',assetId:aid}]})).rejects.toMatchObject({status:404});
 }finally{await db.end()}
});
