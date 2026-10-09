import React,{createContext,useContext,useEffect,useState} from 'react';
import {LogIn} from 'lucide-react';
import {api,post} from './api';
import './auth.css';
export type User={id:number;username:string;displayName:string;role:'admin'|'user';disabled:boolean};
type AuthState={user:User|null;logout:()=>Promise<void>};
const AuthContext=createContext<AuthState>({user:null,logout:async()=>{}});
export const useAuth=()=>useContext(AuthContext);
export function AuthGate({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState('');
 useEffect(()=>{let active=true;api('/auth/me').then(r=>{if(active)setUser(r.user);}).catch(e=>{if(active&&e.status!==401)setError(e.message);}).finally(()=>{if(active)setLoading(false);});const expire=()=>{setUser(null);setError('登录已过期，请重新登录');};window.addEventListener('slidebi:unauthorized',expire);return()=>{active=false;window.removeEventListener('slidebi:unauthorized',expire);};},[]);
 const logout=async()=>{try{await post('/auth/logout');setUser(null);setPassword('');}catch(e:any){setError(e.message);}};
 if(loading)return <main className="auth-shell"><p role="status">正在验证登录状态…</p></main>;
 if(user)return <AuthContext.Provider value={{user,logout}}>{error&&<div role="alert" className="auth-session-error">{error}<button onClick={()=>setError('')}>关闭</button></div>}{children}</AuthContext.Provider>;
 return <main className="auth-shell"><section className="auth-card"><div className="auth-mark">S</div><p className="auth-eyebrow">SLIDE REPORT</p><h1>登录工作空间</h1><p className="muted">将数据与商业模板组合成清晰的汇报。</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await post('/auth/login',{username:username.trim(),password});setUser(r.user);setPassword('');}catch(e:any){setError(e.message);}finally{setBusy(false);}}}><label>用户名<input autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label><label>密码<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}><LogIn size={17}/>{busy?'登录中…':'登录'}</button></form></section></main>;
}
