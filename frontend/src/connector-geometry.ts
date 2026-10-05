import { rectOf } from "./editor-state";
import { buildOrthogonalRoute, type ElbowControlKey } from "@slidebi/presentation";
export type { ElbowControlKey } from "@slidebi/presentation";

export type ConnectorEnd = "begin" | "end";
export type ConnectionSide = "top" | "right" | "bottom" | "left";
export type ConnectorPoint = { x: number; y: number };
export type ConnectorConnection = { elementId: string; side: ConnectionSide };
export type ConnectionAnchor = ConnectorConnection & { point: ConnectorPoint };

export function isConnector(element: any) {
  return element?.type === "shape" && ["line", "elbow"].includes(element.shape);
}

export function pointForSide(rect: any, side: ConnectionSide): ConnectorPoint {
  if (side === "top") return { x: rect.x + rect.w / 2, y: rect.y };
  if (side === "right") return { x: rect.x + rect.w, y: rect.y + rect.h / 2 };
  if (side === "bottom") return { x: rect.x + rect.w / 2, y: rect.y + rect.h };
  return { x: rect.x, y: rect.y + rect.h / 2 };
}

function resolveConnection(document: any, connection?: ConnectorConnection) {
  if (!connection) return undefined;
  const target = document.elements.find((element: any) => element.id === connection.elementId);
  return target && !isConnector(target)
    ? pointForSide(rectOf(document, target), connection.side)
    : undefined;
}

export function connectorEndpoints(document: any, element: any) {
  const rect = rectOf(document, element);
  const line = element.line ?? {};
  const begin = resolveConnection(document, line.beginConnection) ?? {
    x: rect.x + (line.flipH ? rect.w : 0),
    y: rect.y + (line.flipV ? rect.h : 0),
  };
  const end = resolveConnection(document, line.endConnection) ?? {
    x: rect.x + (line.flipH ? 0 : rect.w),
    y: rect.y + (line.flipV ? 0 : rect.h),
  };
  return { begin, end };
}

export function connectorRoute(document: any, element: any) {
  const { begin, end } = connectorEndpoints(document, element);
  if (element?.shape !== "elbow") return { begin, end, middleX: (begin.x + end.x) / 2, points: [begin, end], controls: [] };
  const excluded = new Set([element.line?.beginConnection?.elementId, element.line?.endConnection?.elementId]);
  const endpointRects = document.elements
    .filter((item: any) => excluded.has(item.id) && item.type === "shape" && !isConnector(item))
    .map((item: any) => rectOf(document, item));
  const obstacles = document.elements
    .filter((item: any) => item.id !== element.id && item.type === "shape" && !isConnector(item) && !excluded.has(item.id))
    .map((item: any) => rectOf(document, item));
  return buildOrthogonalRoute({
    begin,
    end,
    beginSide: element.line?.beginConnection?.side,
    endSide: element.line?.endConnection?.side,
    obstacles,
    endpointRects,
    canvas: { width: document.canvas?.width ?? 960, height: document.canvas?.height ?? 540 },
    elbowOffset: element.line?.elbowOffset,
    elbowStartOffset: element.line?.elbowStartOffset,
    elbowCorridorOffset: element.line?.elbowCorridorOffset,
  });
}

export function connectorBounds(document: any, element: any) {
  const { points } = connectorRoute(document, element);
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}

export function connectionAnchors(document: any, connectorId: string): ConnectionAnchor[] {
  return document.elements
    .filter((element: any) => element.id !== connectorId && element.type === "shape" && !isConnector(element))
    .flatMap((element: any) => {
      const rect = rectOf(document, element);
      return (["top", "right", "bottom", "left"] as ConnectionSide[]).map(side => ({
        elementId: element.id,
        side,
        point: pointForSide(rect, side),
      }));
    });
}

export function findConnectorSnap(document: any, connectorId: string, point: ConnectorPoint, threshold = 12) {
  let best: (ConnectionAnchor & { distance: number }) | undefined;
  for (const anchor of connectionAnchors(document, connectorId)) {
    const distance = Math.hypot(anchor.point.x - point.x, anchor.point.y - point.y);
    if (distance <= threshold && (!best || distance < best.distance)) best = { ...anchor, distance };
  }
  return best;
}

export function setConnectorEndpoint(
  document: any,
  connectorId: string,
  endpoint: ConnectorEnd,
  point: ConnectorPoint,
  connection?: ConnectorConnection,
) {
  const next = structuredClone(document);
  const original = document.elements.find((element: any) => element.id === connectorId);
  const connector = next.elements.find((element: any) => element.id === connectorId);
  if (!original || !connector || !isConnector(original)) return next;
  const points = connectorEndpoints(document, original);
  points[endpoint] = point;
  next.layoutOverrides ??= {};
  next.layoutOverrides[connectorId] = {
    ...next.layoutOverrides[connectorId],
    rect: {
      x: Math.min(points.begin.x, points.end.x),
      y: Math.min(points.begin.y, points.end.y),
      w: Math.max(1, Math.abs(points.end.x - points.begin.x)),
      h: Math.max(1, Math.abs(points.end.y - points.begin.y)),
    },
  };
  connector.line = {
    ...(connector.line ?? {}),
    flipH: points.begin.x > points.end.x,
    flipV: points.begin.y > points.end.y,
  };
  const key = endpoint === "begin" ? "beginConnection" : "endConnection";
  if (connection) connector.line[key] = connection;
  else delete connector.line[key];
  return next;
}

export function setElbowControl(document: any, connectorId: string, controlKey: ElbowControlKey, point: ConnectorPoint) {
  const next = structuredClone(document);
  const original = document.elements.find((element: any) => element.id === connectorId);
  const connector = next.elements.find((element: any) => element.id === connectorId);
  if (!original || !connector || original.shape !== "elbow") return next;
  const control = connectorRoute(document, original).controls.find(item => item.key === controlKey);
  if (!control) return next;
  const delta = point[control.axis] - control.point[control.axis];
  const line = connector.line ?? {};
  if (controlKey === "middle") line.elbowOffset = Math.round(Number(line.elbowOffset ?? 0) + delta);
  if (controlKey === "corridor") line.elbowCorridorOffset = Math.round(Number(line.elbowCorridorOffset ?? 0) + delta);
  if (controlKey === "departure") {
    const side = line.beginConnection?.side as ConnectionSide | undefined;
    const sign = side === "top" || side === "left" ? -1 : 1;
    line.elbowStartOffset = Math.round(Number(line.elbowStartOffset ?? 0) + delta * sign);
  }
  connector.line = line;
  return next;
}
