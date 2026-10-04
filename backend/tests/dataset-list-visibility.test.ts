import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {createApp} from '../src/app';
import {fixture} from '../src/db';

test('dataset listing omits data made private between listing IDs and reading details',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
 try{
  const actor=async()=>Number((await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name) VALUES('test',$1,'list race') RETURNING id",[randomUUID()])).rows[0].id);
  const owner=await actor(),viewer=await actor();const app=await createApp({pool,actorId:owner,workerEnabled:false}),view=await createApp({pool,actorId:viewer,workerEnabled:false});
  const created=await request(app).post('/api/datasets').send({name:'即将隐藏',dataSpec:await fixture()});expect(created.status).toBe(201);
  await pool.query("UPDATE app.datasets SET visibility='public' WHERE id=$1",[created.body.id]);
  const query=pool.query.bind(pool);let raced=false;
  pool.query=(async(...args:any[])=>{const result=await (query as any)(...args);if(typeof args[0]==='string'&&args[0].startsWith('SELECT id FROM app.datasets WHERE (owner_id=')){raced=true;await query("UPDATE app.datasets SET visibility='private' WHERE id=$1",[created.body.id]);}return result;}) as any;
  const listed=await request(view).get('/api/datasets');expect(raced).toBe(true);expect(listed.status,JSON.stringify(listed.body)).toBe(200);expect(listed.body.items.some((x:any)=>x.id===created.body.id)).toBe(false);
 }finally{await pool.end()}
});
