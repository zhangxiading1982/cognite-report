import {describe,expect,it} from 'vitest';
import {buildOrthogonalRoute} from '../src/connector-route';

const orthogonal=(points:{x:number;y:number}[])=>points.slice(1).every((point,index)=>point.x===points[index].x||point.y===points[index].y);

describe('PowerPoint-style elbow routes from the line6 reference',()=>{
 it('routes matching top anchors through an adjustable outside corridor',()=>{
  const route=buildOrthogonalRoute({begin:{x:120,y:140},end:{x:360,y:140},beginSide:'top',endSide:'top',endpointRects:[{x:70,y:140,w:100,h:60},{x:310,y:140,w:100,h:60}],canvas:{width:960,height:540}});
  expect(orthogonal(route.points)).toBe(true);
  expect(Math.min(...route.points.map(point=>point.y))).toBeLessThan(140);
  expect(route.controls).toEqual([expect.objectContaining({axis:'y',segmentIndex:1})]);
 });

 it('keeps perpendicular endpoints on their selected sides',()=>{
  const route=buildOrthogonalRoute({begin:{x:120,y:200},end:{x:310,y:170},beginSide:'bottom',endSide:'left',endpointRects:[{x:70,y:140,w:100,h:60},{x:310,y:140,w:100,h:60}],canvas:{width:960,height:540}});
  expect(orthogonal(route.points)).toBe(true);
  expect(route.points[1].x).toBe(120);
  expect(route.points[1].y).toBeGreaterThan(200);
  expect(route.points.at(-2)?.x).toBeLessThan(310);
  expect(route.points.at(-2)?.y).toBe(170);
 });

 it('restores a user-adjusted multi-turn path and exposes every internal segment',()=>{
  const manualPoints=[{x:540,y:372},{x:510,y:372},{x:510,y:102},{x:730,y:102},{x:730,y:160},{x:768,y:160}];
  const route=buildOrthogonalRoute({begin:manualPoints[0],end:manualPoints.at(-1)!,beginSide:'left',endSide:'left',manualPoints});
  expect(route.points).toEqual(manualPoints);
  expect(route.controls.map(control=>control.segmentIndex)).toEqual([1,2,3]);
  expect(route.controls.map(control=>control.axis)).toEqual(['x','y','x']);
 });

 it('keeps every segment orthogonal when either free endpoint of a manual route moves',()=>{
  const manualPoints=[{x:140,y:380},{x:140,y:430},{x:600,y:430},{x:600,y:72},{x:480,y:72},{x:480,y:120}];
  const beginMoved=buildOrthogonalRoute({begin:{x:205,y:345},end:manualPoints.at(-1)!,manualPoints});
  expect(beginMoved.points[0]).toEqual({x:205,y:345});
  expect(orthogonal(beginMoved.points)).toBe(true);
  const endMoved=buildOrthogonalRoute({begin:beginMoved.points[0],end:{x:735,y:188},manualPoints:beginMoved.points});
  expect(endMoved.points.at(-1)).toEqual({x:735,y:188});
  expect(orthogonal(endMoved.points)).toBe(true);
 });

 it('never returns a diagonal manual segment from legacy malformed data',()=>{
  const route=buildOrthogonalRoute({begin:{x:120,y:180},end:{x:520,y:360},manualPoints:[{x:120,y:180},{x:210,y:240},{x:360,y:240},{x:520,y:360}]});
  expect(orthogonal(route.points)).toBe(true);
 });
});
