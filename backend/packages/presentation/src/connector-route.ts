export type RoutePoint = { x: number; y: number };
export type RouteSide = "top" | "right" | "bottom" | "left";
export type ElbowControlKey = "middle" | "departure" | "corridor" | "arrival" | `segment-${number}`;
export type ElbowControl = {
  key: ElbowControlKey;
  axis: "x" | "y";
  point: RoutePoint;
  /** Index of the segment between points[index] and points[index + 1]. */
  segmentIndex?: number;
};

type RouteRect = { x: number; y: number; w: number; h: number };

export type OrthogonalRouteInput = {
  begin: RoutePoint;
  end: RoutePoint;
  beginSide?: RouteSide;
  endSide?: RouteSide;
  obstacles?: RouteRect[];
  /** Connected shapes are excluded from collision checks, but their bounds still
   * define how far an outside corridor must travel before turning. */
  endpointRects?: RouteRect[];
  canvas?: { width: number; height: number };
  elbowOffset?: number;
  elbowStartOffset?: number;
  elbowCorridorOffset?: number;
  elbowEndOffset?: number;
  manualPoints?: RoutePoint[];
};

const direction: Record<RouteSide, RoutePoint> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const midpoint = (a: RoutePoint, b: RoutePoint): RoutePoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function controlsForPoints(points:RoutePoint[],keys?:ElbowControlKey[]):ElbowControl[]{
 return points.slice(1,-2).map((point,index)=>{
  const segmentIndex=index+1,next=points[segmentIndex+1];
  return {key:keys?.[index]??`segment-${segmentIndex}`,axis:point.x===next.x?'x':'y',point:midpoint(point,next),segmentIndex};
 });
}

function manualRoute(input:OrthogonalRouteInput){
 const points=(input.manualPoints??[]).slice(0,32).map(point=>({x:Number(point.x),y:Number(point.y)}));
 if(points.length<4||points.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)))return undefined;
 points[0]={...input.begin};points[points.length-1]={...input.end};
 const first=points[1],last=points[points.length-2];
 if(input.beginSide==='top'||input.beginSide==='bottom')first.x=input.begin.x;
 else if(input.beginSide)first.y=input.begin.y;
 if(input.endSide==='top'||input.endSide==='bottom')last.x=input.end.x;
 else if(input.endSide)last.y=input.end.y;
 const vertical=points.slice(1,-1).find((point,index)=>point.x===points[index+2]?.x);
 return {begin:input.begin,end:input.end,middleX:vertical?.x??(input.begin.x+input.end.x)/2,points,controls:controlsForPoints(points)};
}

function segmentHitsRect(a: RoutePoint, b: RoutePoint, rect: RouteRect) {
  const padding = 8;
  const left = rect.x - padding, right = rect.x + rect.w + padding;
  const top = rect.y - padding, bottom = rect.y + rect.h + padding;
  if (a.x === b.x) return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  return false;
}

function routeHits(points: RoutePoint[], obstacles: RouteRect[], allowEndpointEgress = false) {
  return points.slice(1).some((point, index) => {
    if (allowEndpointEgress && (index === 0 || index === points.length - 2)) return false;
    return obstacles.some(rect => segmentHitsRect(points[index], point, rect));
  });
}

function chooseOuterCoordinate(input: OrthogonalRouteInput, axis: "x" | "y", clearance: number) {
  const canvas = input.canvas ?? { width: 960, height: 540 };
  const obstacles = [...(input.endpointRects ?? []), ...(input.obstacles ?? [])];
  if (!obstacles.length) obstacles.push({ x: Math.min(input.begin.x, input.end.x), y: Math.min(input.begin.y, input.end.y), w: Math.abs(input.end.x - input.begin.x), h: Math.abs(input.end.y - input.begin.y) });
  if (axis === "x") {
    const left = Math.max(12, Math.min(...obstacles.map(rect => rect.x)) - clearance * 2);
    const right = Math.min(canvas.width - 12, Math.max(...obstacles.map(rect => rect.x + rect.w)) + clearance * 2);
    const leftCost = Math.abs(input.begin.x - left) + Math.abs(input.end.x - left);
    const rightCost = Math.abs(input.begin.x - right) + Math.abs(input.end.x - right);
    return rightCost <= leftCost ? right : left;
  }
  const top = Math.max(12, Math.min(...obstacles.map(rect => rect.y)) - clearance * 2);
  const bottom = Math.min(canvas.height - 12, Math.max(...obstacles.map(rect => rect.y + rect.h)) + clearance * 2);
  const topCost = Math.abs(input.begin.y - top) + Math.abs(input.end.y - top);
  const bottomCost = Math.abs(input.begin.y - bottom) + Math.abs(input.end.y - bottom);
  return bottomCost <= topCost ? bottom : top;
}

function detour(input: OrthogonalRouteInput, startDirection: RoutePoint, endDirection: RoutePoint, primary: "vertical" | "horizontal", clearance: number) {
  const startDistance = Math.max(12, clearance + Number(input.elbowStartOffset ?? 0));
  const endDistance = Math.max(12, clearance + Number(input.elbowEndOffset ?? 0));
  const startExit = { x: input.begin.x + startDirection.x * startDistance, y: input.begin.y + startDirection.y * startDistance };
  const endExit = { x: input.end.x + endDirection.x * endDistance, y: input.end.y + endDirection.y * endDistance };
  if (primary === "vertical") {
    const corridor = chooseOuterCoordinate(input, "x", clearance) + Number(input.elbowCorridorOffset ?? 0);
    const points = [input.begin, startExit, { x: corridor, y: startExit.y }, { x: corridor, y: endExit.y }, endExit, input.end];
    return { points, controls: [
      { key: "departure", axis: "y", point: midpoint(points[1], points[2]), segmentIndex: 1 },
      { key: "corridor", axis: "x", point: midpoint(points[2], points[3]), segmentIndex: 2 },
      { key: "arrival", axis: "y", point: midpoint(points[3], points[4]), segmentIndex: 3 },
    ] as ElbowControl[] };
  }
  const corridor = chooseOuterCoordinate(input, "y", clearance) + Number(input.elbowCorridorOffset ?? 0);
  const points = [input.begin, startExit, { x: startExit.x, y: corridor }, { x: endExit.x, y: corridor }, endExit, input.end];
  return { points, controls: [
    { key: "departure", axis: "x", point: midpoint(points[1], points[2]), segmentIndex: 1 },
    { key: "corridor", axis: "y", point: midpoint(points[2], points[3]), segmentIndex: 2 },
    { key: "arrival", axis: "x", point: midpoint(points[3], points[4]), segmentIndex: 3 },
  ] as ElbowControl[] };
}

/** Builds the same automatic orthogonal route used by the editor, preview and PPT export. */
export function buildOrthogonalRoute(input: OrthogonalRouteInput) {
  const manuallyAdjusted=manualRoute(input);
  if(manuallyAdjusted)return manuallyAdjusted;
  const clearance = 28;
  const beginDirection = input.beginSide ? direction[input.beginSide] : undefined;
  const endDirection = input.endSide ? direction[input.endSide] : undefined;
  const offset = Number(input.elbowOffset ?? 0);
  const middleX = (input.begin.x + input.end.x) / 2 + offset;
  const collisionRects = [...(input.obstacles ?? []), ...(input.endpointRects ?? [])];

  if (!beginDirection || !endDirection) {
    const points = [input.begin, { x: middleX, y: input.begin.y }, { x: middleX, y: input.end.y }, input.end];
    return { begin: input.begin, end: input.end, middleX, points, controls: [{ key: "middle", axis: "x", point: midpoint(points[1], points[2]), segmentIndex:1 }] as ElbowControl[] };
  }

  const beginVertical = beginDirection.y !== 0;
  const endVertical = endDirection.y !== 0;
  if (beginVertical !== endVertical) {
    const startExit = { x: input.begin.x + beginDirection.x * clearance, y: input.begin.y + beginDirection.y * clearance };
    const endExit = { x: input.end.x + endDirection.x * clearance, y: input.end.y + endDirection.y * clearance };
    const corner = beginVertical ? { x: startExit.x, y: endExit.y } : { x: endExit.x, y: startExit.y };
    const points = [input.begin, startExit, corner, endExit, input.end];
    if (!routeHits(points, collisionRects, true)) return { begin: input.begin, end: input.end, middleX, points, controls: controlsForPoints(points) };
    const routed = detour(input, beginDirection, endDirection, beginVertical ? "vertical" : "horizontal", clearance);
    return { begin: input.begin, end: input.end, middleX, ...routed };
  }

  if (beginVertical) {
    if (beginDirection.y === endDirection.y) {
      const base = beginDirection.y < 0 ? Math.min(input.begin.y, input.end.y) - clearance : Math.max(input.begin.y, input.end.y) + clearance;
      const y = base + offset;
      const points = [input.begin, { x: input.begin.x, y }, { x: input.end.x, y }, input.end];
      if (!routeHits(points, collisionRects, true)) return { begin: input.begin, end: input.end, middleX, points, controls: [{ key: "middle", axis: "y", point: midpoint(points[1], points[2]), segmentIndex:1 }] as ElbowControl[] };
    } else {
      const faces = beginDirection.y * (input.end.y - input.begin.y) > 0;
      const y = (input.begin.y + input.end.y) / 2 + offset;
      const points = [input.begin, { x: input.begin.x, y }, { x: input.end.x, y }, input.end];
      if (faces && !routeHits(points, collisionRects, true)) return { begin: input.begin, end: input.end, middleX, points, controls: [{ key: "middle", axis: "y", point: midpoint(points[1], points[2]), segmentIndex:1 }] as ElbowControl[] };
    }
    const routed = detour(input, beginDirection, endDirection, "vertical", clearance);
    return { begin: input.begin, end: input.end, middleX, ...routed };
  }

  if (beginDirection.x === endDirection.x) {
    const base = beginDirection.x < 0 ? Math.min(input.begin.x, input.end.x) - clearance : Math.max(input.begin.x, input.end.x) + clearance;
    const x = base + offset;
    const points = [input.begin, { x, y: input.begin.y }, { x, y: input.end.y }, input.end];
    if (!routeHits(points, collisionRects, true)) return { begin: input.begin, end: input.end, middleX: x, points, controls: [{ key: "middle", axis: "x", point: midpoint(points[1], points[2]), segmentIndex:1 }] as ElbowControl[] };
  } else {
    const faces = beginDirection.x * (input.end.x - input.begin.x) > 0;
    const x = (input.begin.x + input.end.x) / 2 + offset;
    const points = [input.begin, { x, y: input.begin.y }, { x, y: input.end.y }, input.end];
    if (faces && !routeHits(points, collisionRects, true)) return { begin: input.begin, end: input.end, middleX: x, points, controls: [{ key: "middle", axis: "x", point: midpoint(points[1], points[2]), segmentIndex:1 }] as ElbowControl[] };
  }
  const routed = detour(input, beginDirection, endDirection, "horizontal", clearance);
  return { begin: input.begin, end: input.end, middleX, ...routed };
}
