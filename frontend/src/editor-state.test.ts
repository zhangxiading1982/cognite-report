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
  findConnectorSnap,
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
