import {afterAll,expect,test} from 'vitest';
import express from 'express';
import request from 'supertest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {registerAuth,currentActorId,hashPassword,verifyPassword} from '../src/auth.ts';
const pool=new Pool({connectionString:'postgresql://slidebi_app@localhost:5432/slidebi_test'});
afterAll(()=>pool.end());
const app=express();app.use(express.json());
registerAuth(app,pool);
app.get('/api/protected',(_q,r)=>r.json({id:currentActorId()}));
app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.status||500).json({code:e.code,message:e.message}));
test('password hashing uses salted scrypt and rejects invalid passwords',async()=>{
 const hash=await hashPassword('admin');expect(hash).not.toContain('admin');expect(await verifyPassword('admin',hash)).toBe(true);expect(await verifyPassword('bad',hash)).toBe(false);expect(await hashPassword('admin')).not.toBe(hash);
});
test('cookie authentication isolates requests and logout revokes session',async()=>{
 expect((await request(app).get('/api/protected')).status).toBe(401);
 expect((await request(app).post('/api/auth/login').send({username:'marx',password:'wrong'})).status).toBe(401);
 const marx=request.agent(app),summer=request.agent(app);
 const login=await marx.post('/api/auth/login').send({username:'marx',password:'admin'});
 expect(login.status).toBe(200);expect(login.body.user.role).toBe('admin');expect(login.headers['set-cookie'][0]).toContain('HttpOnly');expect(login.body.user.passwordHash).toBeUndefined();
 expect((await summer.post('/api/auth/login').send({username:'summer',password:'summer'})).status).toBe(200);
 const [a,b]=await Promise.all([marx.get('/api/protected'),summer.get('/api/protected')]);expect(a.body.id).not.toBe(b.body.id);
 expect((await summer.get('/api/users')).status).toBe(403);
 expect((await marx.get('/api/users')).body.items.map((u:any)=>u.username)).toContain('mary');
 await marx.post('/api/auth/logout');expect((await marx.get('/api/auth/me')).status).toBe(401);
});
test('administrator can create and disable users; self demotion is rejected',async()=>{
 const admin=request.agent(app);await admin.post('/api/auth/login').send({username:'marx',password:'admin'});
 const me=(await admin.get('/api/auth/me')).body.user;
 expect((await admin.patch('/api/users/'+me.id).send({role:'user'})).status).toBe(409);
 const username='u'+randomUUID().replaceAll('-','');
 const made=await admin.post('/api/users').send({username,password:'pass',role:'user'});expect(made.status).toBe(201);
 const user=request.agent(app);expect((await user.post('/api/auth/login').send({username,password:'pass'})).status).toBe(200);
 expect((await admin.patch('/api/users/'+made.body.user.id).send({disabled:true})).status).toBe(200);
 expect((await user.get('/api/auth/me')).status).toBe(401);
});
test('password reset invalidates sessions immediately',async()=>{
 const admin=request.agent(app);await admin.post('/api/auth/login').send({username:'marx',password:'admin'});
 const username='u'+randomUUID().replaceAll('-','');
 const created=await admin.post('/api/users').send({username,password:'old'});
 const user=request.agent(app);await user.post('/api/auth/login').send({username,password:'old'});
 expect((await admin.patch('/api/users/'+created.body.user.id).send({password:'new'})).status).toBe(200);
 expect((await user.get('/api/auth/me')).status).toBe(401);
 expect((await user.post('/api/auth/login').send({username,password:'old'})).status).toBe(401);
 expect((await user.post('/api/auth/login').send({username,password:'new'})).status).toBe(200);
});
