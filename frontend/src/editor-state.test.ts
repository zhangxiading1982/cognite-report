import { describe, it, expect } from "vitest";
import {
  History,
  SaveQueue,
  setSelectionLayer,
  snapSelection,
  transformSelection,
} from "./editor-state";
import {
  connectionAnchors,
  connectorEndpoints,
  connectorRoute,
  findConnectorSnap,
  setElbowControl,
  setConnectorEndpoint,
} from "./connector-geometry";
const doc = {
  id: "s",
  revision: 1,
  title: "A",
  canvas: { width: 960, height: 540 },
  elements: [
    { id: "a", rect: { x: 24, y: 24, w: 100, h: 60 } },
    { id: "b", rect: { x: 200, y: 90, w: 80, h: 40 } },
  ],
  layoutOverrides: {},
};
describe("editor commands", () => {
  it("moves selected objects to the absolute front or back and normalizes layer order", () => {
    const layered = {
      ...doc,
      elements: [
        { ...doc.elements[0], z: 8 },
        { ...doc.elements[1], z: 2 },
        { id: "c", rect: { x: 320, y: 90, w: 80, h: 40 }, z: 99 },
      ],
    };
    const front = setSelectionLayer(layered, ["a"], "front");
    expect(front.elements.map((element: any) => element.id)).toEqual(["b", "c", "a"]);
    expect(front.elements.map((element: any) => element.z)).toEqual([1, 2, 3]);
    const back = setSelectionLayer(front, ["c", "a"], "back");
    expect(back.elements.map((element: any) => element.id)).toEqual(["c", "a", "b"]);
    expect(back.elements.map((element: any) => element.z)).toEqual([1, 2, 3]);
    expect(layered.elements.map((element: any) => element.id)).toEqual(["a", "b", "c"]);
  });
  it("undoes one gesture and invalidates redo after a new edit", () => {
    const h = new History(doc);
    h.commit({ ...doc, title: "B" });
    expect(h.undo().title).toBe("A");
    expect(h.redo().title).toBe("B");
    h.undo();
    h.commit({ ...doc, title: "C" });
    expect(h.redo().title).toBe("C");
  });
  it("aligns selected objects without mutating original geometry", () => {
    const next = transformSelection(doc, ["a", "b"], "left");
    expect(next.layoutOverrides.b.rect.x).toBe(24);
    expect(doc.elements[1].rect.x).toBe(200);
  });
  it("snaps any moved object to nearby object edges and returns alignment guides", () => {
    const aligned = snapSelection(doc, ["a"], 72, 64);
    expect(aligned.slide.layoutOverrides.a.rect).toMatchObject({ x: 100, y: 90 });
    expect(aligned.guides).toEqual({ vertical: 200, horizontal: 90 });
    expect(doc.elements[0].rect).toEqual({ x: 24, y: 24, w: 100, h: 60 });
  });
  it("snaps selection centers to the slide center", () => {
    const centered = snapSelection(
      { ...doc, elements: [doc.elements[0]] },
      ["a"],
      404,
      214,
    );
    expect(centered.slide.layoutOverrides.a.rect).toMatchObject({ x: 430, y: 240 });
    expect(centered.guides).toEqual({ vertical: 480, horizontal: 270 });
  });
});
describe("PowerPoint-like connector geometry", () => {
  const connectorDoc = {
    ...doc,
    elements: [
      { id: "line", type: "shape", shape: "line", rect: { x: 40, y: 80, w: 120, h: 40 }, line: { color: "#2563EB", width: 2 } },
      { id: "target", type: "shape", shape: "rect", rect: { x: 280, y: 70, w: 120, h: 100 } },
    ],
  };
  it("offers four edge-midpoint anchors and snaps an endpoint to the nearest one", () => {
    const anchors = connectionAnchors(connectorDoc, "line");
    expect(anchors.map(anchor => anchor.side)).toEqual(["top", "right", "bottom", "left"]);
    const snap = findConnectorSnap(connectorDoc, "line", { x: 282, y: 121 }, 12);
    expect(snap).toMatchObject({ elementId: "target", side: "left", point: { x: 280, y: 120 } });
  });
  it("persists endpoint direction and keeps a connected endpoint attached after its shape moves", () => {
    const attached = setConnectorEndpoint(connectorDoc, "line", "end", { x: 280, y: 120 }, { elementId: "target", side: "left" });
    expect(attached.elements[0].line.endConnection).toEqual({ elementId: "target", side: "left" });
    expect(connectorEndpoints(attached, attached.elements[0]).end).toEqual({ x: 280, y: 120 });
    attached.layoutOverrides.target = { rect: { x: 340, y: 90, w: 120, h: 100 } };
    expect(connectorEndpoints(attached, attached.elements[0]).end).toEqual({ x: 340, y: 140 });
    const reversed = setConnectorEndpoint(attached, "line", "begin", { x: 420, y: 170 });
    expect(reversed.elements[0].line.flipH).toBe(true);
    expect(reversed.elements[0].line.flipV).toBe(true);
  });
  it("moves an elbow middle segment independently and keeps it adjusted when endpoints move", () => {
    const elbowDoc = structuredClone(connectorDoc) as any;
    elbowDoc.elements[0].shape = "elbow";
    const adjusted = setElbowControl(elbowDoc, "line", "middle", { x: 140, y: 100 });
    expect(adjusted.elements[0].line.elbowOffset).toBe(40);
    expect(connectorRoute(adjusted, adjusted.elements[0]).middleX).toBe(140);
    const attached = setConnectorEndpoint(adjusted, "line", "end", { x: 280, y: 120 }, { elementId: "target", side: "left" });
    attached.layoutOverrides.target = { rect: { x: 340, y: 90, w: 120, h: 100 } };
    const route = connectorRoute(attached, attached.elements[0]);
    expect(route.end).toEqual({ x: 340, y: 140 });
    expect(route.middleX).toBe(230);
  });
  it("builds a five-segment route with three independently adjustable controls when connected sides face away", () => {
    const routed = {
      ...doc,
      elements: [
        { id: "source", type: "shape", shape: "rect", rect: { x: 80, y: 448, w: 136, h: 136 } },
        { id: "target", type: "shape", shape: "rect", rect: { x: 450, y: 448, w: 136, h: 136 } },
        { id: "elbow", type: "shape", shape: "elbow", rect: { x: 148, y: 448, w: 370, h: 136 }, line: { color: "#2563EB", width: 2, beginConnection: { elementId: "source", side: "bottom" }, endConnection: { elementId: "target", side: "top" } } },
      ],
    };
    const route = connectorRoute(routed, routed.elements[2]);
    expect(route.points).toHaveLength(6);
    expect(route.points[0]).toEqual({ x: 148, y: 584 });
    expect(route.points.at(-1)).toEqual({ x: 518, y: 448 });
    expect(route.controls.map(control => control.key)).toEqual(["departure", "corridor", "arrival"]);
    const moved = setElbowControl(routed, "elbow", "departure", { ...route.controls[0].point, y: route.controls[0].point.y + 24 });
    expect(connectorRoute(moved, moved.elements[2]).points[1].y).toBe(route.points[1].y + 24);
    const arrivalMoved = setElbowControl(routed, "elbow", "arrival", { ...route.controls[2].point, y: route.controls[2].point.y - 20 });
    expect(arrivalMoved.elements[2].line.elbowEndOffset).toBe(20);
    expect(connectorRoute(arrivalMoved, arrivalMoved.elements[2]).points[4].y).toBe(route.points[4].y - 20);
  });
  it("moves any internal elbow segment directly and preserves the manual route when a connected shape moves", () => {
    const routed: any = {
      ...doc,
      elements: [
        { id: "source", type: "shape", shape: "rect", rect: { x: 80, y: 300, w: 120, h: 80 } },
        { id: "target", type: "shape", shape: "rect", rect: { x: 420, y: 100, w: 120, h: 80 } },
        { id: "elbow", type: "shape", shape: "elbow", rect: { x: 140, y: 100, w: 340, h: 280 }, line: { beginConnection: { elementId: "source", side: "bottom" }, endConnection: { elementId: "target", side: "top" } } },
      ],
    };
    const route = connectorRoute(routed, routed.elements[2]);
    expect(route.controls).toHaveLength(3);
    expect(route.controls.map(control => control.segmentIndex)).toEqual([1, 2, 3]);
    const corridor = route.controls[1];
    const adjusted = setElbowControl(routed, "elbow", corridor.key, { ...corridor.point, x: corridor.point.x - 52 });
    expect(adjusted.elements[2].line.elbowPoints).toHaveLength(6);
    expect(connectorRoute(adjusted, adjusted.elements[2]).points[2].x).toBe(route.points[2].x - 52);
    adjusted.layoutOverrides = { target: { rect: { x: 500, y: 120, w: 120, h: 80 } } };
    const moved = connectorRoute(adjusted, adjusted.elements[2]);
    expect(moved.end).toEqual({ x: 560, y: 120 });
    expect(moved.points[2].x).toBe(route.points[2].x - 52);
    expect(moved.points.at(-2)?.x).toBe(560);
  });
  it("keeps an adjusted elbow strictly orthogonal when its start and end points are dragged", () => {
    const routed: any = {
      ...doc,
      elements: [
        { id: "elbow", type: "shape", shape: "elbow", rect: { x: 140, y: 100, w: 340, h: 280 }, line: { elbowPoints: [{ x: 140, y: 380 }, { x: 140, y: 430 }, { x: 600, y: 430 }, { x: 600, y: 72 }, { x: 480, y: 72 }, { x: 480, y: 120 }] } },
      ],
    };
    const isOrthogonal = (points: { x: number; y: number }[]) => points.slice(1).every((point, index) => point.x === points[index].x || point.y === points[index].y);
    const beginMoved = setConnectorEndpoint(routed, "elbow", "begin", { x: 205, y: 345 });
    expect(isOrthogonal(connectorRoute(beginMoved, beginMoved.elements[0]).points)).toBe(true);
    const endMoved = setConnectorEndpoint(beginMoved, "elbow", "end", { x: 735, y: 188 });
    expect(isOrthogonal(connectorRoute(endMoved, endMoved.elements[0]).points)).toBe(true);
  });
  it("routes the outer corridor beyond both connected shapes and follows a moved target", () => {
    const routed: any = {
      ...doc,
      elements: [
        { id: "source", type: "shape", shape: "rect", rect: { x: 100, y: 250, w: 138, h: 80 } },
        { id: "target", type: "shape", shape: "rect", rect: { x: 310, y: 250, w: 138, h: 80 } },
        { id: "elbow", type: "shape", shape: "elbow", rect: { x: 169, y: 250, w: 210, h: 80 }, line: { color: "#4472C4", width: 2, beginConnection: { elementId: "source", side: "bottom" }, endConnection: { elementId: "target", side: "top" } } },
      ],
    };
    const initial = connectorRoute(routed, routed.elements[2]);
    expect(initial.points).toHaveLength(6);
    expect(initial.points[2].x).toBeGreaterThan(448);
    expect(initial.points[3].x).toBe(initial.points[2].x);

    routed.layoutOverrides = { target: { rect: { x: 520, y: 210, w: 138, h: 80 } } };
    const moved = connectorRoute(routed, routed.elements[2]);
    expect(moved.end).toEqual({ x: 589, y: 210 });
    expect(moved.points[2].x).toBeGreaterThan(658);
  });
  it("does not let a perpendicular route cut through its target shape", () => {
    const routed: any = {
      ...doc,
      elements: [
        { id: "source", type: "shape", shape: "rect", rect: { x: 150, y: 100, w: 160, h: 80 } },
        { id: "target", type: "shape", shape: "rect", rect: { x: 650, y: 100, w: 160, h: 80 } },
        { id: "elbow", type: "shape", shape: "elbow", rect: { x: 230, y: 100, w: 580, h: 40 }, line: { beginConnection: { elementId: "source", side: "top" }, endConnection: { elementId: "target", side: "right" } } },
      ],
    };
    const route = connectorRoute(routed, routed.elements[2]);
    expect(route.points).toHaveLength(6);
    expect(route.points[2].x).toBeGreaterThan(810);
  });
});
describe("serial immutable revision saves", () => {
  it("keeps edits made during saving and uses returned revision for the next write", async () => {
    let finish: any;
    const saved: any[] = [];
    const q = new SaveQueue(doc, async (d: any, r: number) => {
      saved.push({ d, r });
      if (saved.length === 1) await new Promise((r) => (finish = r));
      return { ...d, revision: r + 1 };
    });
    q.edit({ ...doc, title: "B" });
    const pending = q.flush();
    q.edit({ ...doc, title: "C" });
    finish();
    await pending;
    expect(q.draft.title).toBe("C");
    expect(q.revision).toBe(3);
    expect(saved.map((x) => x.r)).toEqual([1, 2]);
    expect(q.dirty).toBe(false);
  });
  it("retains draft and stops writes after conflict", async () => {
    const q = new SaveQueue(doc, async () => {
      throw Object.assign(new Error("冲突"), { status: 409 });
    });
    q.edit({ ...doc, title: "local" });
    await expect(q.flush()).rejects.toThrow("冲突");
    expect(q.draft.title).toBe("local");
    expect(q.status).toBe("conflict");
    expect(q.dirty).toBe(true);
  });
});
it("does not save again when undo restores the unchanged document", async () => {
  let writes = 0;
  const q = new SaveQueue(doc, async (d: any, r: number) => {
    writes++;
    return { ...d, revision: r + 1 };
  });
  q.edit({ ...doc });
  await q.flush();
  expect(writes).toBe(0);
});
it("groups continuous typing into one undo operation", () => {
  const h = new History(doc);
  h.commit({ ...doc, title: "B" }, "title");
  h.commit({ ...doc, title: "BC" }, "title");
  expect(h.undo().title).toBe("A");
});
it("preserves a newer local edit when a review response arrives", () => {
  const q = new SaveQueue(doc, async (d: any) => d);
  const reviewed = { ...doc, revision: 2 };
  q.edit({ ...doc, title: "newer" });
  q.adoptRemote(reviewed, doc);
  expect(q.draft.title).toBe("newer");
  expect(q.revision).toBe(2);
  expect(q.dirty).toBe(true);
});
it("expands flat groups and preserves relative positions at the canvas edge", async () => {
  const { groupSelection, expandSelection, moveSelection } =
    await import("./editor-state");
  const grouped = groupSelection(doc, ["a", "b"], "g");
  expect(expandSelection(grouped, ["a"])).toEqual(["a", "b"]);
  const moved = moveSelection(grouped, ["a", "b"], -100, -100);
  expect(moved.layoutOverrides.b.rect.x - moved.layoutOverrides.a.rect.x).toBe(
    176,
  );
  expect(moved.layoutOverrides.a.rect.x).toBe(0);
});
it("scales a whole selection and font sizes while rejecting chart minima and overflow", async () => {
  const { scaleSelection } = await import("./editor-state");
  const d = {
    ...doc,
    elements: [
      {
        id: "a",
        type: "text",
        rect: { x: 20, y: 20, w: 100, h: 60 },
        style: { fontSize: 12 },
      },
      { id: "b", type: "chart", rect: { x: 140, y: 20, w: 280, h: 180 } },
    ],
  };
  const scaled = scaleSelection(d, ["a", "b"], 1.2);
  expect(scaled.elements[0].style.fontSize).toBeCloseTo(14.4);
  expect(scaled.layoutOverrides.b.rect.x).toBe(164);
  expect(() => scaleSelection(d, ["a", "b"], 0.9)).toThrow(/图表/);
  expect(() => scaleSelection(d, ["a", "b"], 3)).toThrow(/画布/);
});
it("swaps only positions without changing dimensions", async () => {
  const { swapSelection } = await import("./editor-state");
  const swapped = swapSelection(doc, ["a", "b"]);
  expect(swapped.layoutOverrides.a.rect).toEqual({
    x: 200,
    y: 90,
    w: 100,
    h: 60,
  });
  expect(swapped.layoutOverrides.b.rect).toEqual({
    x: 24,
    y: 24,
    w: 80,
    h: 40,
  });
  expect(doc.elements[0].rect.x).toBe(24);
});
