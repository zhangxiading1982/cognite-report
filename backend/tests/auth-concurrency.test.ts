import {expect,test} from 'vitest';
import {Pool} from 'pg';
import request from 'supertest';
import {createApp} from '../src/app.ts';
test('real cookie sessions retain numeric actor across queued concurrent database requests',async()=>{
 const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test',max:1});
 const app=await createApp({pool,workerEnabled:false});
 try{
  const agents=[request.agent(app),request.agent(app)];
  const users=await Promise.all([agents[0].post('/api/auth/login').send({username:'marx',password:'admin'}),agents[1].post('/api/auth/login').send({username:'summer',password:'summer'})]);
  const routes=['/api/contents','/api/templates','/api/datasets','/api/assets'];
  const results=await Promise.all(Array.from({length:24},(_,i)=>agents[Math.floor(i/4)%2].get(routes[i%4])));
  expect(results.map(r=>({status:r.status,code:r.body.code}))).toEqual(results.map(()=>({status:200,code:undefined})));
  for(const [index,result] of results.entries()){const actor=users[Math.floor(index/4)%2].body.user.id;for(const item of result.body.items){expect(item.visibility==='public'||Number(item.ownerId)===actor).toBe(true);if(item.canEdit!==undefined)expect(item.canEdit).toBe(Number(item.ownerId)===actor);}}
  const documents=await Promise.all(agents.map((agent,index)=>agent.post('/api/contents').send({title:'并发权限 '+index})));
  expect(documents.map(r=>r.status)).toEqual([201,201]);
  try{
   const own=await Promise.all(agents.map((agent,index)=>agent.get('/api/contents/'+documents[index].body.id)));
   expect(own.map(r=>r.body.ownerId)).toEqual(users.map(r=>r.body.user.id));
   const denied=await Promise.all(agents.flatMap((agent,index)=>[
    agent.get('/api/contents/'+documents[1-index].body.id),
    agent.patch('/api/management/contents/'+documents[1-index].body.id).send({name:'越权修改'}),
    agent.post('/api/contents/'+documents[1-index].body.id+'/archive'),
   ]));expect(denied.map(r=>r.status)).toEqual([404,404,404,404,404,404]);
   const unchanged=await Promise.all(agents.map((agent,index)=>agent.get('/api/contents/'+documents[index].body.id)));
   expect(unchanged.map(r=>r.body.title)).toEqual(['并发权限 0','并发权限 1']);
  }finally{await Promise.all(agents.map((agent,index)=>agent.post('/api/contents/'+documents[index].body.id+'/archive')));}
 }finally{await app.locals.close();}
},60000);
