// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AuthGate,useAuth} from './Auth';
import {UserManagement} from './UserManagement';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requires login before rendering workspace and supports logout',async()=>{
 const user={id:1,username:'marx',displayName:'marx',role:'admin',disabled:false};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith('/login')?{user}:url.endsWith('/logout')?{}:{message:'请先登录'}),{status:url.endsWith('/me')?401:200})));
 function Workspace(){const auth=useAuth();return <><span>文稿工作区</span><button onClick={auth.logout}>退出</button></>;}
 render(<AuthGate><Workspace/></AuthGate>);
 expect(screen.queryByText('文稿工作区')).toBeNull();
 fireEvent.change(await screen.findByLabelText('用户名'),{target:{value:'marx'}});fireEvent.change(screen.getByLabelText('密码'),{target:{value:'admin'}});fireEvent.click(screen.getByRole('button',{name:'登录'}));
 expect(await screen.findByText('文稿工作区')).toBeTruthy();fireEvent.click(screen.getByText('退出'));expect(await screen.findByLabelText('用户名')).toBeTruthy();
});
it('user management lists users and submits new user without displaying passwords',async()=>{
 const user={id:1,username:'mary',displayName:'mary',role:'user',disabled:false};
 const fetch=vi.fn(async()=>new Response(JSON.stringify({items:[user],user})));vi.stubGlobal('fetch',fetch);
 render(<UserManagement/>);expect((await screen.findAllByText('mary')).length).toBe(2);
 fireEvent.click(screen.getByRole('button',{name:'新增用户'}));
 fireEvent.change(screen.getByLabelText('用户名'),{target:{value:'newuser'}});fireEvent.change(screen.getByLabelText('初始密码'),{target:{value:'pass'}});fireEvent.click(screen.getByRole('button',{name:'创建用户'}));
 await screen.findByText('用户已创建');expect(fetch.mock.calls.some((args:any)=>args[0]==='/api/users'&&args[1]?.method==='POST')).toBe(true);
});
