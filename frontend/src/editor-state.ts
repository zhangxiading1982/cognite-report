export class History<T> {
  past: T[] = [];
  future: T[] = [];
  private group?: string;
  constructor(public current: T) {}
  endGroup() {
    this.group = undefined;
  }
  commit(d: T, group?: string) {
    if (JSON.stringify(d) === JSON.stringify(this.current)) return;
    if (!group || group !== this.group) this.past.push(this.current);
    this.group = group;
    if (this.past.length > 100) this.past.shift();
    this.current = d;
    this.future = [];
  }
  undo() {
    this.endGroup();
    if (this.past.length) {
      this.future.push(this.current);
      this.current = this.past.pop()!;
    }
    return this.current;
  }
  redo() {
    this.endGroup();
    if (this.future.length) {
      this.past.push(this.current);
      this.current = this.future.pop()!;
    }
    return this.current;
  }
}
export class SaveQueue<T extends { revision: number }> {
  draft: T;
  revision: number;
  dirty = false;
  status = "saved";
  error: any;
  private generation = 0;
  private active?: Promise<void>;
  constructor(
    d: T,
    private save: (d: T, r: number) => Promise<T>,
    private changed: () => void = () => {},
  ) {
    this.draft = d;
    this.revision = d.revision;
  }
  edit(d: T) {
    if (
      JSON.stringify({ ...d, revision: 0 }) ===
      JSON.stringify({ ...this.draft, revision: 0 })
    )
      return;
    this.draft = d;
    this.generation++;
    this.dirty = true;
    if (this.status !== "conflict") this.status = "dirty";
    this.changed();
  }
  adoptRemote(result: T, sent: T) {
    const changed =
      JSON.stringify({ ...this.draft, revision: 0 }) !==
      JSON.stringify({ ...sent, revision: 0 });
    this.revision = result.revision;
    this.draft = changed
      ? { ...this.draft, revision: result.revision }
      : result;
    this.dirty = changed;
    this.status = changed ? "dirty" : "saved";
    this.changed();
  }
  flush(): Promise<void> {
    if (this.active) return this.active;
    if (this.status === "conflict") return Promise.reject(this.error);
    this.active = this.drain().finally(() => {
      this.active = undefined;
    });
    return this.active;
  }
  private async drain() {
    while (this.dirty) {
      const generation = this.generation;
      const sent = this.draft;
      this.status = "saving";
      this.changed();
      try {
        const result = await this.save(
          { ...sent, revision: this.revision },
          this.revision,
        );
        this.revision = result.revision;
        if (generation === this.generation) {
          this.draft = result;
          this.dirty = false;
        }
        this.status = this.dirty ? "dirty" : "saved";
        this.error = undefined;
        this.changed();
      } catch (error: any) {
        this.error = error;
        this.status = error.status === 409 ? "conflict" : "error";
        this.changed();
        throw error;
      }
    }
  }
}
export function rectOf(d: any, e: any) {
  return { ...e.rect, ...d.layoutOverrides?.[e.id]?.rect };
}
export function transformSelection(d: any, ids: string[], op: string) {
  const next = structuredClone(d);
  const es = next.elements.filter((e: any) => ids.includes(e.id));
  if (!es.length) return next;
  const rs = es.map((e: any) => rectOf(next, e));
  const left = Math.min(...rs.map((r: any) => r.x));
  const top = Math.min(...rs.map((r: any) => r.y));
  const right = Math.max(...rs.map((r: any) => r.x + r.w));
  const bottom = Math.max(...rs.map((r: any) => r.y + r.h));
  const ordered = [...es].sort(
    (a: any, b: any) => rectOf(next, a).x - rectOf(next, b).x,
  );
  const gap =
    (right - left - rs.reduce((n: number, r: any) => n + r.w, 0)) /
    Math.max(1, es.length - 1);
  let x = left;
  for (const e of op === "distribute" ? ordered : es) {
    const r = rectOf(next, e);
    if (op === "left") r.x = left;
    if (op === "right") r.x = right - r.w;
    if (op === "top") r.y = top;
    if (op === "bottom") r.y = bottom - r.h;
    if (op === "size") {
      r.w = rs[0].w;
      r.h = rs[0].h;
    }
    if (op === "distribute") {
      r.x = x;
      x += r.w + gap;
    }
    next.layoutOverrides ??= {};
    next.layoutOverrides[e.id] = { ...next.layoutOverrides[e.id], rect: r };
  }
  return next;
}
export function expandSelection(d: any, ids: string[]) {
  const groups = new Set(
    d.elements
      .filter((e: any) => ids.includes(e.id) && e.groupId)
      .map((e: any) => e.groupId),
  );
  return d.elements
    .filter((e: any) => ids.includes(e.id) || groups.has(e.groupId))
    .map((e: any) => e.id) as string[];
}
export function groupSelection(d: any, ids: string[], groupId?: string) {
  const next = structuredClone(d),
    members = expandSelection(d, ids);
  for (const e of next.elements)
    if (members.includes(e.id)) {
      if (groupId) e.groupId = groupId;
      else delete e.groupId;
    }
  return next;
}
function selectionBounds(d: any, ids: string[]) {
  const es = d.elements.filter((e: any) => ids.includes(e.id));
  if (!es.length) throw new Error("请选择对象");
  const rs = es.map((e: any) => rectOf(d, e));
  return {
    es,
    left: Math.min(...rs.map((r: any) => r.x)),
    top: Math.min(...rs.map((r: any) => r.y)),
    right: Math.max(...rs.map((r: any) => r.x + r.w)),
    bottom: Math.max(...rs.map((r: any) => r.y + r.h)),
  };
}
function writeRect(d: any, e: any, r: any) {
  d.layoutOverrides ??= {};
  d.layoutOverrides[e.id] = { ...d.layoutOverrides[e.id], rect: r };
}
export function moveSelection(d: any, ids: string[], dx: number, dy: number) {
  const next = structuredClone(d),
    b = selectionBounds(d, ids);
  const x = Math.max(-b.left, Math.min(960 - b.right, dx)),
    y = Math.max(-b.top, Math.min(540 - b.bottom, dy));
  for (const e of b.es) {
    const r = rectOf(d, e);
    writeRect(next, e, { ...r, x: r.x + x, y: r.y + y });
  }
  return next;
}
export type AlignmentGuides = {
  vertical?: number;
  horizontal?: number;
};

function nearestSnap(
  moving: number[],
  targets: number[],
  threshold: number,
) {
  let best: { correction: number; target: number; distance: number } | undefined;
  for (const source of moving)
    for (const target of targets) {
      const correction = target - source;
      const distance = Math.abs(correction);
      if (distance <= threshold && (!best || distance < best.distance))
        best = { correction, target, distance };
    }
  return best;
}

/**
 * Moves a selection and applies PowerPoint-like edge/centre snapping.
 * Geometry stays in slide points so every element type shares one behaviour.
 */
export function snapSelection(
  d: any,
  ids: string[],
  dx: number,
  dy: number,
  threshold = 6,
): {
  slide: any;
  dx: number;
  dy: number;
  guides: AlignmentGuides;
} {
  const bounds = selectionBounds(d, ids);
  const canvasWidth = d.canvas?.width ?? 960;
  const canvasHeight = d.canvas?.height ?? 540;
  let boundedX = Math.max(-bounds.left, Math.min(canvasWidth - bounds.right, dx));
  let boundedY = Math.max(-bounds.top, Math.min(canvasHeight - bounds.bottom, dy));
  const verticalTargets: number[] = [];
  const horizontalTargets: number[] = [];
  for (const element of d.elements.filter((item: any) => !ids.includes(item.id))) {
    const rect = rectOf(d, element);
    verticalTargets.push(rect.x, rect.x + rect.w / 2, rect.x + rect.w);
    horizontalTargets.push(rect.y, rect.y + rect.h / 2, rect.y + rect.h);
  }
  const movingX = [
    bounds.left + boundedX,
    (bounds.left + bounds.right) / 2 + boundedX,
    bounds.right + boundedX,
  ];
  const movingY = [
    bounds.top + boundedY,
    (bounds.top + bounds.bottom) / 2 + boundedY,
    bounds.bottom + boundedY,
  ];
  const objectX = nearestSnap(movingX, verticalTargets, threshold);
  const objectY = nearestSnap(movingY, horizontalTargets, threshold);
  const canvasX = nearestSnap([movingX[1]], [canvasWidth / 2], threshold);
  const canvasY = nearestSnap([movingY[1]], [canvasHeight / 2], threshold);
  const snapX =
    !objectX || (canvasX && canvasX.distance < objectX.distance)
      ? canvasX
      : objectX;
  const snapY =
    !objectY || (canvasY && canvasY.distance < objectY.distance)
      ? canvasY
      : objectY;
  if (snapX) boundedX += snapX.correction;
  if (snapY) boundedY += snapY.correction;
  boundedX = Math.max(-bounds.left, Math.min(canvasWidth - bounds.right, boundedX));
  boundedY = Math.max(-bounds.top, Math.min(canvasHeight - bounds.bottom, boundedY));
  return {
    slide: moveSelection(d, ids, boundedX, boundedY),
    dx: boundedX,
    dy: boundedY,
    guides: {
      ...(snapX ? { vertical: snapX.target } : {}),
      ...(snapY ? { horizontal: snapY.target } : {}),
    },
  };
}
export function scaleSelection(d: any, ids: string[], factor: number) {
  if (!Number.isFinite(factor) || factor <= 0)
    throw new Error("缩放比例必须大于0");
  const next = structuredClone(d),
    b = selectionBounds(d, ids);
  for (const e of next.elements.filter((e: any) => ids.includes(e.id))) {
    const r = rectOf(d, e);
    const scaled = {
      x: b.left + (r.x - b.left) * factor,
      y: b.top + (r.y - b.top) * factor,
      w: r.w * factor,
      h: r.h * factor,
    };
    if (
      scaled.x < 0 ||
      scaled.y < 0 ||
      scaled.x + scaled.w > 960 ||
      scaled.y + scaled.h > 540
    )
      throw new Error("缩放后超出画布边界");
    if (e.type === "chart" && (scaled.w < 280 || scaled.h < 180))
      throw new Error("图表尺寸不能小于280×180");
    if (scaled.w < 16 || scaled.h < 16) throw new Error("对象缩放后尺寸过小");
    if (
      e.style?.fontSize !== undefined ||
      ["text", "sourceFooter", "table", "process", "status"].includes(e.type)
    ) {
      const fontSize = (e.style?.fontSize ?? 16) * factor;
      if (
        fontSize < 8 ||
        fontSize > (["table", "process", "status"].includes(e.type) ? 80 : 200)
      )
        throw new Error("缩放后字号超出支持范围");
      e.style = { ...e.style, fontSize };
    }
    writeRect(next, e, scaled);
  }
  return next;
}
export function swapSelection(d: any, ids: string[]) {
  if (ids.length !== 2) throw new Error("交换位置需要恰好两个对象");
  const next = structuredClone(d),
    es = ids.map((id) => next.elements.find((e: any) => e.id === id));
  if (es.some((e) => !e)) throw new Error("对象不存在");
  const rs = es.map((e) => rectOf(d, e));
  es.forEach((e, i) => {
    const r = { ...rs[i], x: rs[1 - i].x, y: rs[1 - i].y };
    if (r.x + r.w > 960 || r.y + r.h > 540)
      throw new Error("交换位置后超出画布边界");
    writeRect(next, e, r);
  });
  return next;
}

/**
 * Moves a selection to an absolute layer boundary. The element array and z
 * values are kept in the same order because the browser preview and PPT
 * compiler both use that order when objects overlap.
 */
export function setSelectionLayer(
  d: any,
  ids: string[],
  destination: "front" | "back",
) {
  const next = structuredClone(d);
  const selected = next.elements.filter((element: any) => ids.includes(element.id));
  const rest = next.elements.filter((element: any) => !ids.includes(element.id));
  next.elements = destination === "front" ? [...rest, ...selected] : [...selected, ...rest];
  next.elements.forEach((element: any, index: number) => {
    element.z = index + 1;
  });
  return next;
}
