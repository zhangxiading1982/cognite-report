import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import type {Express} from 'express';
import type {Pool} from 'pg';
import {fail,transaction} from './db.ts';
const scrypt=promisify(scryptCallback);
export interface AuthUser {id:number;username:string;displayName:string;role:'admin'|'user';disabled:boolean}
const context=new AsyncLocalStorage<AuthUser>();
export const currentUser=()=>context.getStore()||fail(401,'AUTH_REQUIRED','请先登录');
export const currentActorId=()=>currentUser().id;
export const requestActor={valueOf:currentActorId,toPostgres:currentActorId,[Symbol.toPrimitive]:currentActorId} as unknown as number;
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return `scrypt:${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password:string,encoded:string){const [scheme,salt,key]=encoded.split(':');if(scheme!=='scrypt'||!salt||!key)return false;const actual=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(key,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
const view=(r:any):AuthUser=>({id:Number(r.id),username:r.username||r.external_subject,displayName:r.display_name,role:r.role,disabled:!!r.disabled_at});
const cookieName='slidebi_session';
const sessionToken=(req:any)=>{const value=(req.headers.cookie||'').split(';').map((v:string)=>v.trim()).find((v:string)=>v.startsWith(cookieName+'='));return value?.slice(cookieName.length+1);};
const cookieOptions={httpOnly:true,sameSite:'lax' as const,secure:process.env.NODE_ENV==='production',path:'/'};
function validatePassword(value:any){if(typeof value!=='string'||value.length<1||value.length>200)fail(422,'INVALID_PASSWORD','密码长度应为 1–200 个字符');}
function adminOnly(){if(currentUser().role!=='admin')fail(403,'ADMIN_REQUIRED','仅管理员可以管理用户');}
export function registerAuth(app:Express,pool:Pool,options:{actorId?:number}={}){
 const failures=new Map<string,{count:number;until:number}>();
 app.post('/api/auth/login',async(req,res)=>{
  const {username,password}=req.body||{};
  if(typeof username!=='string'||typeof password!=='string'||username.length>100||password.length>200)fail(401,'INVALID_CREDENTIALS','用户名或密码错误');
  const key=`${req.ip}:${username}`;const previous=failures.get(key);
  if(previous&&previous.until>Date.now()&&previous.count>=10)fail(429,'LOGIN_RATE_LIMIT','尝试次数过多，请稍后再试');
  const row=(await pool.query('SELECT * FROM app.users WHERE username=$1',[username])).rows[0];
  if(!row||row.disabled_at||!await verifyPassword(password,row.password_hash||'')){
   for(const [k,v] of failures)if(v.until<=Date.now())failures.delete(k);
   failures.set(key,{count:(previous&&previous.until>Date.now()?previous.count:0)+1,until:Date.now()+60000});
   fail(401,'INVALID_CREDENTIALS','用户名或密码错误');
  }
  failures.delete(key);const token=randomBytes(32).toString('hex');
  const prior=sessionToken(req);if(prior)await pool.query('DELETE FROM app.sessions WHERE token_hash=$1',[tokenHash(prior)]);
  await pool.query("INSERT INTO app.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[tokenHash(token),row.id]);
  res.cookie(cookieName,token,{...cookieOptions,maxAge:7*86400000}).json({user:view(row)});
 });
 app.post('/api/auth/logout',async(req,res)=>{const token=sessionToken(req);if(token)await pool.query('DELETE FROM app.sessions WHERE token_hash=$1',[tokenHash(token)]);res.clearCookie(cookieName,cookieOptions).status(204).end();});
 app.use('/api',async(req,res,next)=>{
  if(req.path==='/health'){next();return;}
  const token=sessionToken(req);
  const row=options.actorId!==undefined?(await pool.query('SELECT * FROM app.users WHERE id=$1 AND disabled_at IS NULL',[options.actorId])).rows[0]:token?(await pool.query('SELECT u.* FROM app.sessions s JOIN app.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL',[tokenHash(token)])).rows[0]:undefined;
  if(!row)fail(401,'AUTH_REQUIRED','请先登录');
  const user=view(row);res.locals.user=user;context.run(user,next);
 });
 app.get('/api/auth/me',(_req,res)=>res.json({user:currentUser()}));
 app.get('/api/users',async(_req,res)=>{adminOnly();res.json({items:(await pool.query('SELECT * FROM app.users WHERE username IS NOT NULL ORDER BY id')).rows.map(view)});});
 app.post('/api/users',async(req,res)=>{
  adminOnly();const {username,password,displayName,role='user'}=req.body||{};
  if(typeof username!=='string'||! /^[a-zA-Z0-9_.-]{1,100}$/.test(username)||!['admin','user'].includes(role)||(displayName!==undefined&&(typeof displayName!=='string'||!displayName.trim()||displayName.length>200)))fail(422,'INVALID_USER','请填写有效的用户名、名称和角色');validatePassword(password);
  if((await pool.query('SELECT 1 FROM app.users WHERE username=$1',[username])).rowCount)fail(409,'USERNAME_EXISTS','用户名已存在');
  try{const row=(await pool.query("INSERT INTO app.users(identity_provider,external_subject,display_name,username,password_hash,role) VALUES('local',$1,$2,$1,$3,$4) RETURNING *",[username,displayName?.trim()||username,await hashPassword(password),role])).rows[0];res.status(201).json({user:view(row)});}catch(e:any){if(e.code==='23505')fail(409,'USERNAME_EXISTS','用户名已存在');throw e;}
 });
 app.patch('/api/users/:id',async(req,res)=>{
  adminOnly();const userId=Number(req.params.id),{displayName,role,password,disabled}=req.body||{};
  if(!Number.isSafeInteger(userId)||userId<=0||(role!==undefined&&!['admin','user'].includes(role))||(disabled!==undefined&&typeof disabled!=='boolean')||(displayName!==undefined&&(typeof displayName!=='string'||!displayName.trim()||displayName.length>200)))fail(422,'INVALID_USER','用户信息格式不正确');
  if(userId===currentActorId()&&(disabled===true||role==='user'))fail(409,'SELF_ADMIN_CHANGE','不能停用自己或移除自己的管理员角色');
  if(password!==undefined)validatePassword(password);const encoded=password!==undefined?await hashPassword(password):null;
  const row=await transaction(pool,async db=>{
   const r=(await db.query('UPDATE app.users SET display_name=COALESCE($2,display_name),role=COALESCE($3,role),password_hash=COALESCE($4,password_hash),disabled_at=CASE WHEN $5::boolean IS NULL THEN disabled_at WHEN $5 THEN now() ELSE NULL END WHERE id=$1 AND username IS NOT NULL RETURNING *',[userId,displayName?.trim()??null,role??null,encoded,disabled??null])).rows[0];
   if(!r)fail(404,'NOT_FOUND','用户不存在');if(encoded||disabled===true)await db.query('DELETE FROM app.sessions WHERE user_id=$1',[userId]);return r;
  });res.json({user:view(row)});
 });
}
