import React,{useRef,useState} from 'react';
import './directory-split.css';
export function DirectorySplit({directory,children,storageKey,initialWidth=200,className=''}:{directory:React.ReactNode;children:React.ReactNode;storageKey:string;initialWidth?:number;className?:string}){
 const key=`slidebi.directory-width.${storageKey}`,min=160,max=420;
 const clamp=(value:number)=>Math.max(min,Math.min(max,value));
 const [width,W]=useState(()=>{try{const saved=Number(window.localStorage.getItem(key));return saved?clamp(saved):initialWidth}catch{return initialWidth}});
 const drag=useRef<{x:number;width:number}|undefined>(undefined);
 function resize(value:number){const next=clamp(value);W(next);try{window.localStorage.setItem(key,String(next))}catch{}}
 return <div className={`directory-split ${className}`} style={{'--directory-width':`${width}px`} as React.CSSProperties}>
  <aside className="directory-split-tree">{directory}</aside>
  <div className="directory-resize-handle" role="separator" tabIndex={0} aria-label="调整目录宽度" aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} title="拖动调整目录宽度；方向键微调"
   onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,width};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault()}}
   onPointerMove={e=>{if(drag.current)resize(drag.current.width+e.clientX-drag.current.x)}}
   onPointerUp={e=>{drag.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
   onPointerCancel={()=>{drag.current=undefined}} onLostPointerCapture={()=>{drag.current=undefined}}
   onKeyDown={e=>{const value=e.key==='ArrowLeft'?width-16:e.key==='ArrowRight'?width+16:e.key==='Home'?min:e.key==='End'?max:undefined;if(value!==undefined){e.preventDefault();resize(value)}}}/>
  <div className="directory-split-content">{children}</div>
 </div>;
}
