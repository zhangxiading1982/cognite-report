import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Save,
  Download,
  ImagePlus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Copy,
  Trash2,
  Database,
  ChevronUp,
  BringToFront,
  SendToBack,
  Maximize,
  ChartColumn,
  Table2,
  Minimize,
  LayoutTemplate,
  ChartLine,
  ChartArea,
  ChartPie,
  ChartNoAxesCombined,
  ChartScatter,
  Circle,
  Layers3,
  GitCompareArrows,
  PanelRightClose,
  PanelRightOpen,
  Bold,
  Check,
} from "lucide-react";
import {
  compileSlide,
  composeChartData,
  renderSlideSvg,
  createSlide,
  FONT_OPTIONS,
  CHART_PALETTES,
  insertFragment,
} from "@slidebi/presentation";
import { api, post, saveSlide, Template } from "./api";
import {
  History,
  SaveQueue,
  rectOf,
  transformSelection,
  expandSelection,
  moveSelection,
  scaleSelection,
  setSelectionLayer,
  snapSelection,
} from "./editor-state";
import { ComponentForm } from "./ComponentForm";
import { FragmentLibrary } from "./FragmentLibrary";
import { Modal, Mini, DataView } from "./ui";
import { sourceLabel } from "./DataManagement";
import { AssetLibrary } from "./AssetLibrary";
import { ExportList } from "./App";
import "./editor-workspace.css";
import {ChartDataPanel} from "./ChartDataPanel";
import { PptColorPicker, TextColorPicker } from "./PptColorPicker";
import { PptFillLinePanel } from "./PptFillLinePanel";
import { PptShapesIcon, PptTextBoxIcon } from "./PptToolbarIcons";
import { INSERT_SHAPE_GROUPS, ShapeGlyph } from "./shape-catalog";
import {
  connectionAnchors,
  connectorBounds,
  connectorEndpoints,
  connectorRoute,
  findConnectorSnap,
  isConnector,
  setElbowControl,
  setConnectorEndpoint,
  type ConnectorEnd,
  type ElbowControlKey,
} from "./connector-geometry";
import {toDataSpec} from "./table-import";
import { resolveTemplateElementData, TemplateElementDataPanel } from "./TemplateElementDataPanel";
const INSERT_CHART_GROUPS=[
  {label:"比较与趋势",items:[["comparison","簇状柱图",ChartColumn],["line","折线图",ChartLine],["waterfall","瀑布图",GitCompareArrows],["area","面积图",ChartArea]]},
  {label:"构成与组合",items:[["stackedColumn","堆积柱图",Layers3],["percentStackedColumn","百分比堆积柱图",Layers3],["pie","饼图",ChartPie],["donut","圆环图",Circle],["combo","柱线组合图",ChartNoAxesCombined]]},
  {label:"关系",items:[["scatter","散点图",ChartScatter]]},
] as const;
export function createInsertedChartSource(type:string){
 const date=type==="line"||type==="area",waterfall=type==="waterfall",two=type==="combo"||type==="scatter"||type==="stackedColumn"||type==="percentStackedColumn";
 const input=waterfall
  ?{name:"瀑布图示例",schema:[{name:"步骤",type:"string"},{name:"名称",type:"string"},{name:"类型",type:"string"},{name:"数值",type:"number"},{name:"顺序",type:"integer"}],rows:[["start","期初","start",100,0],["growth","新增","delta",30,1],["end","期末","end",130,2]]}
  :{name:"图表示例",schema:[{name:date?"日期":"分类",type:date?"date":"string"},{name:"数值 A",type:"number"},...(two?[{name:"数值 B",type:"number"}]:[])],rows:date?[["2026-01-01",30,...(two?[18]:[])],["2026-02-01",45,...(two?[28]:[])],["2026-03-01",60,...(two?[40]:[])]]:[["项目 A",30,...(two?[20]:[])],["项目 B",45,...(two?[32]:[])],["项目 C",60,...(two?[48]:[])]]};
 const data=toDataSpec(input),roles=waterfall
  ?{stepKey:"f1",label:"f2",role:"f3",value:"f4",sort:"f5"}
  :type==="combo"?{categoryKey:"f1",categoryLabel:"f1",barSeries:["f2"],lineSeries:["f3"]}
  :type==="scatter"?{categoryKey:"f1",categoryLabel:"f1",x:"f2",y:"f3"}
  :{categoryKey:"f1",categoryLabel:"f1",series:type==="pie"||type==="donut"?["f2"]:two?["f2","f3"]:["f2"]};
 if(["pie","donut","percentStackedColumn"].includes(type))for(const measure of data.measures)measure.aggregationBehavior="additive";
 return {data,binding:{resultSetId:"table",roles}};
}
export function Editor({
  initial,
  templates,
  onClose,
  onOpen,
  onExports,
  embedded: inContent = false,
  registerFlush,
  onSaved,
  onChanged,
  frozen = false,
  workspaceMode = "document",
  workspaceData,
  onWorkspaceDataChange,
  initialFullscreen = false,
  onWorkspaceClose,
}: {
  initial: any;
  templates: Template[];
  onClose: () => void;
  onOpen: (s: any) => void;
  onExports: () => void;
  embedded?: boolean;
  registerFlush?: (flush: () => Promise<any>) => void;
  onSaved?: (slide: any) => void;
  onChanged?: () => void;
  frozen?: boolean;
  workspaceMode?: "document" | "template";
  workspaceData?: any;
  onWorkspaceDataChange?: (dataSpec: any) => void;
  initialFullscreen?: boolean;
  onWorkspaceClose?: () => void;
}) {
  const templateWorkspace = workspaceMode === "template";
  const [slide, S] = useState(initial),
    [data, D] = useState<any>(workspaceData),
    [lineage, Lineage] = useState<any>(),
    [selected, Sel] = useState<string[]>([]),
    [tab, Tab] = useState("content"),
    [modal, M] = useState(""),
    [error, E] = useState(""),
    [tick, Tick] = useState(0),
    [preflight, Pre] = useState<any>(),
    [jobs, Jobs] = useState<any[]>([]),
    [personal, Personal] = useState(""),
    [scalePercent, ScalePercent] = useState("100"),
    [candidate, Candidate] = useState<any>(),
    [embedded, Embedded] = useState<any[]>([]),
    [imagesLoading, ImagesLoading] = useState(false);
  const [fullscreen, Fullscreen] = useState(initialFullscreen);
  const [propertiesCollapsed,PropertiesCollapsed]=useState(false);
  const [editingText, EditingText] = useState<string>();
  const [alignmentGuides,AlignmentGuides]=useState<{vertical?:number;horizontal?:number}>({});
  const [connectorEditing, ConnectorEditing] = useState<{ id: string; endpoint: ConnectorEnd }>();
  const [connectionHint, ConnectionHint] = useState<any>();
  const chartFlush=useRef<()=>Promise<void>>(async()=>{});
  const chartDirty=useRef(false);
  const [chartPreview,ChartPreview]=useState<Record<string,any>>({});
  const historyRef = useRef(new History(initial));
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const queue = useRef<SaveQueue<any>>(null);
  if (!queue.current)
    queue.current = new SaveQueue(initial, templateWorkspace
      ? async (draft, revision) => {
          const saved = { ...draft, revision };
          savedCallback.current?.(saved);
          return saved;
        }
      : saveSlide, () => Tick((t) => t + 1));
  const q = queue.current;
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<any>(undefined);
  const selectionRequest=useRef(0);
  async function selectElements(ids:string[]){const request=++selectionRequest.current;try{await chartFlush.current();if(request!==selectionRequest.current)return false;Sel(ids);const element=current.current.elements.find((e:any)=>e.id===ids[0]);if(["chart","table"].includes(element?.type))Tab("data");else if(tab==="data")Tab("content");return true;}catch(e:any){E(e.message);return false;}}
  const current = useRef(slide);
  current.current = slide;
  function commit(next: any, group?: string) {
    if (frozen) return;
    onChanged?.();
    next = {
      ...next,
      reviewState: { status: "needsReview", snapshotId: next.snapshotRef },
    };
    historyRef.current.commit(next, group);
    S(next);
    q.edit(next);
  }
  function edit(fn: (n: any) => void, group?: string) {
    const n = structuredClone(current.current);
    fn(n);
    commit(n, group);
  }
  function undo(redo = false) {
    if (frozen) return;
    onChanged?.();
    const previous = redo
      ? historyRef.current.redo()
      : historyRef.current.undo();
    const n = {
      ...previous,
      reviewState: { status: "needsReview", snapshotId: previous.snapshotRef },
    };
    S(n);
    q.edit(n);
  }
  async function flush() {
    await chartFlush.current();
    return flushSlide();
  }
  async function flushSlide() {
    await q.flush();
    S((s: any) => ({ ...s, revision: q.revision }));
    const saved = { ...current.current, revision: q.revision };
    if (!templateWorkspace) onSaved?.(saved);
    return saved;
  }
  useEffect(() => { registerFlush?.(flush); }, [registerFlush]);
  useEffect(() => {
    if (!q.dirty && q.status === "saved") S(q.draft);
  }, [tick]);
  useEffect(() => {
    if (frozen || !q.dirty || q.status === "conflict" || q.status === "saving") return;
    const timer = window.setTimeout(() => flush().catch((e:any) => E(e.message)), 1000);
    return () => window.clearTimeout(timer);
  }, [tick, frozen]);
  useEffect(() => {
    if (templateWorkspace) return;
    api(`/data-snapshots/${initial.snapshotRef}`)
      .then(D)
      .catch((e) => { if(e.status!==404) E(e.message); });
  }, [initial.id]);
  async function checkCurrent(beforeExport = false) {
    if (templateWorkspace) return false;
    const linked = current.current.extensions?.dataset;
    if (!linked?.id && !Object.values(current.current.extensions?.chartData||{}).some((s:any)=>s.mode==="dataset")) return false;
    if (linked && (linked.refreshMode ?? (linked.origin?.kind === "biStudio" ? "biStudioMock" : "manual")) === "biStudioMock") {
      try {
        await api(`/datasets/${linked.id}/refresh`, {
          method: "POST",
          headers: { "If-Match": String(linked.version) },
          body: JSON.stringify(beforeExport ? {} : { check: true }),
        });
      } catch (e: any) {
        if (e.status !== 409) throw e;
      }
    }
    const latest = await api(`/slides/${initial.id}`);
    const currentData = latest.revision > q.revision ? await api(`/data-snapshots/${latest.snapshotRef}`) : undefined;
    // A background request can finish after our own save or a newer check.
    if (latest.revision < q.revision) return false;
    if (latest.revision === q.revision) return false;
    if (q.dirty || q.status === "saving" || chartDirty.current) {
      q.status = "conflict";
      q.error = new Error("数据已更新，本地草稿已保留，请备份并加载最新数据。");
      Tick((t) => t + 1);
      return true;
    }
    q.draft = latest;
    q.revision = latest.revision;
    q.status = "saved";
    historyRef.current = new History(latest);
    current.current = latest;
    S(latest);
    D(currentData);
    Pre(undefined);
    E("");
    return true;
  }
  useEffect(() => {
    if (templateWorkspace) return;
    const run = () => {
      if (document.visibilityState !== "hidden")
        checkCurrent().catch((e) => E(e.message));
    };
    run();
    window.addEventListener("focus", run);
    const timer = setInterval(run, 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [initial.id, templateWorkspace]);
  useEffect(() => {
    if (!q.dirty || q.status === "conflict") return;
    const timer = setTimeout(() => q.flush().catch((e) => E(e.message)), 800);
    return () => clearTimeout(timer);
  }, [slide]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (q.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if(e.key === "Escape" && !modal && !(e.target as HTMLElement).closest("input,textarea,select")) { Fullscreen(false); return; }
      if (frozen) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        flush().catch((x) => E(x.message));
        return;
      }
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        ) ||
        modal
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo(e.shiftKey);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      }
      if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const delta = e.shiftKey ? 4 : 1;
        commit(
          moveSelection(
            current.current,
            selected,
            e.key === "ArrowRight" ? delta : e.key === "ArrowLeft" ? -delta : 0,
            e.key === "ArrowDown" ? delta : e.key === "ArrowUp" ? -delta : 0,
          ),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, modal, slide, frozen]);
  useEffect(() => {
    if (modal !== "exports") return;
    const poll = () =>
      api("/export-jobs")
        .then((r) => Jobs(r.items.filter((j: any) => j.slideId === slide.id)))
        .catch((e) => E(e.message));
    poll();
    const timer = setInterval(poll, 1200);
    return () => clearInterval(timer);
  }, [modal]);
  useEffect(() => {
    const ids = [
      ...new Set(
        slide.elements
          .filter((e: any) => e.type === "image")
          .map((e: any) => e.assetId),
      ),
    ] as string[];
    ImagesLoading(ids.length > 0);
    let live = true;
    Promise.all(
      ids.map(async (id) => {
        const response = await fetch(`/api/assets/${id}/file`);
        if (!response.ok) throw new Error("图片资源读取失败");
        const blob = await response.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        return { id, dataUri };
      }),
    )
      .then((result) => {
        if (live) Embedded(result);
      })
      .catch((e) => {
        if (live) E(e.message);
      })
      .finally(() => {
        if (live) ImagesLoading(false);
      });
    return () => {
      live = false;
    };
  }, [
    slide.elements
      .filter((e: any) => e.type === "image")
      .map((e: any) => e.assetId)
      .join(","),
  ]);
  const compiled = useMemo(() => {
    if (!data) return undefined;
    try {
      const composed=composeChartData({...slide,extensions:{...slide.extensions,chartData:{...slide.extensions?.chartData,...chartPreview}}},data);
      return compileSlide(composed.slide, composed.data, "draft");
    } catch (e: any) {
      return {
        diagnostics: [{ severity: "error", message: e.message }],
        elements: [],
      };
    }
  }, [slide, data, chartPreview]);
  const svg = useMemo(() => {
    if (!compiled || !("canvas" in compiled)) return "";
    try {
      return renderSlideSvg({ ...compiled, elements:compiled.elements.filter((item:any)=>item.id!=="draft-watermark"), assets: embedded } as any);
    } catch {
      return "";
    }
  }, [compiled, embedded]);
  const el = slide.elements.find((e: any) => e.id === selected[0]);
  const templateElementData = templateWorkspace ? resolveTemplateElementData(slide,data,el) : undefined;
  const dataTabAvailable = !!el && (!!el.bindingRef || ["chart","table"].includes(el.type) || !!templateElementData);
  const rect = el ? rectOf(slide, el) : null;
  function changeEl(fn: (e: any) => void, group?: string) {
    if (el) edit((n) => fn(n.elements.find((x: any) => x.id === el.id)), group);
  }
  function remove() {
    edit((n) => {
      n.elements = n.elements.filter(
        (x: any) =>
          !selected.includes(x.id) ||
          x.type === "sourceFooter" ||
          /-(title|note|kpi)$/.test(x.id),
      );
    });
    Sel([]);
  }
  function duplicate() {
    edit((n) => {
      const clones = n.elements
        .filter(
          (x: any) => selected.includes(x.id) && x.type !== "sourceFooter",
        )
        .map((x: any) => {
          const r = rectOf(n, x);
          const copiedId=crypto.randomUUID();
          if(x.type==="chart"&&n.extensions?.chartData?.[x.id])n.extensions.chartData[copiedId]=structuredClone(n.extensions.chartData[x.id]);
          return {
            ...structuredClone(x),
            id: copiedId,
            rect: {
              ...r,
              x: Math.min(960 - r.w, r.x + 12),
              y: Math.min(540 - r.h, r.y + 12),
            },
            z: n.elements.length + 1,
          };
        });
      const copiedGroups = new Map<string, string>();
      for (const clone of clones) {
        if (clone.groupId) {
          if (!copiedGroups.has(clone.groupId))
            copiedGroups.set(clone.groupId, crypto.randomUUID());
          clone.groupId = copiedGroups.get(clone.groupId);
        }
      }
      n.elements.push(...clones);
      Sel(clones.map((x: any) => x.id));
    });
  }
  function pointerStart(e: React.PointerEvent, id: string, resize = false, connectorHandle?: ConnectorEnd | ElbowControlKey) {
    e.preventDefault();
    e.stopPropagation();
    const ids = expandSelection(
      slide,
      e.shiftKey
        ? [...new Set([...selected, id])]
        : selected.includes(id)
          ? selected
          : [id],
    );
    Sel(ids);
    AlignmentGuides({});
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      original: structuredClone(slide),
      ids,
      resize,
      connectorHandle,
      id,
      scale: stage.current!.getBoundingClientRect().width / 960,
      moved: false,
    };
    ConnectorEditing(connectorHandle === "begin" || connectorHandle === "end" ? { id, endpoint: connectorHandle } : undefined);
    ConnectionHint(undefined);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.x) / d.scale / 4) * 4,
      dy = Math.round((e.clientY - d.y) / d.scale / 4) * 4;
    if (!dx && !dy) return;
    d.moved = true;
    if (typeof d.connectorHandle==="string"&&(["middle", "departure", "corridor", "arrival"].includes(d.connectorHandle)||d.connectorHandle.startsWith("segment-"))) {
      const connector = d.original.elements.find((item: any) => item.id === d.id);
      const control = connectorRoute(d.original, connector).controls.find(item => item.key === d.connectorHandle);
      if (!control) return;
      const next = setElbowControl(d.original, d.id, d.connectorHandle as ElbowControlKey, {
        x: Math.max(0, Math.min(960, control.point.x + dx)),
        y: Math.max(0, Math.min(540, control.point.y + dy)),
      });
      S(next);
      current.current = next;
      return;
    }
    if (d.connectorHandle) {
      const connector = d.original.elements.find((item: any) => item.id === d.id);
      const origin = connectorEndpoints(d.original, connector)[d.connectorHandle as ConnectorEnd];
      const point = {
        x: Math.max(0, Math.min(960, origin.x + dx)),
        y: Math.max(0, Math.min(540, origin.y + dy)),
      };
      const snap = findConnectorSnap(d.original, d.id, point, 14);
      ConnectionHint(snap);
      const next = setConnectorEndpoint(
        d.original,
        d.id,
        d.connectorHandle as ConnectorEnd,
        snap?.point ?? point,
        snap ? { elementId: snap.elementId, side: snap.side } : undefined,
      );
      S(next);
      current.current = next;
      return;
    }
    if (!d.resize) {
      const snapped = snapSelection(d.original, d.ids, dx, dy);
      for (const id of d.ids) {
        const moved = snapped.slide.elements.find((item: any) => item.id === id);
        if (isConnector(moved)) {
          delete moved.line?.beginConnection;
          delete moved.line?.endConnection;
        }
      }
      AlignmentGuides(snapped.guides);
      S(snapped.slide);
      current.current = snapped.slide;
      return;
    }
    AlignmentGuides({});
    if (d.ids.length > 1) {
      const rs = d.ids.map((id: string) =>
        rectOf(
          d.original,
          d.original.elements.find((x: any) => x.id === id),
        ),
      );
      const w =
        Math.max(...rs.map((r: any) => r.x + r.w)) -
        Math.min(...rs.map((r: any) => r.x));
      const h =
        Math.max(...rs.map((r: any) => r.y + r.h)) -
        Math.min(...rs.map((r: any) => r.y));
      try {
        const n = scaleSelection(
          d.original,
          d.ids,
          1 + (Math.abs(dx / w) > Math.abs(dy / h) ? dx / w : dy / h),
        );
        S(n);
        current.current = n;
      } catch (e: any) {
        E(e.message);
      }
      return;
    }
    const n = structuredClone(d.original);
    for (const id of d.ids) {
      const item = n.elements.find((x: any) => x.id === id);
      const r = rectOf(n, item);
      if (d.resize) {
        const minW = item.type === "chart" ? 280 : 24,
          minH = item.type === "chart" ? 180 : 16;
        const w = Math.max(minW, Math.min(960 - r.x, r.w + dx));
        r.h =
          item.type === "image"
            ? Math.min(540 - r.y, (w * r.h) / r.w)
            : Math.max(minH, Math.min(540 - r.y, r.h + dy));
        r.w = w;
      } else {
        r.x = Math.max(0, Math.min(960 - r.w, r.x + dx));
        r.y = Math.max(0, Math.min(540 - r.h, r.y + dy));
      }
      n.layoutOverrides[id] = { ...n.layoutOverrides[id], rect: r };
    }
    S(n);
    current.current = n;
  }
  function pointerEnd() {
    if (drag.current?.moved) commit(current.current);
    drag.current = undefined;
    AlignmentGuides({});
    ConnectorEditing(undefined);
    ConnectionHint(undefined);
  }
  async function reloadChartData(){
    if(templateWorkspace){D(workspaceData);return;}
    const sent=current.current;
    const latest=await api(`/slides/${initial.id}`);
    q.adoptRemote(latest,sent);
    if(!q.dirty)historyRef.current=new History(q.draft);
    current.current=q.draft;S({...q.draft});
    D(await api(`/data-snapshots/${latest.snapshotRef}`));ChartPreview({});chartDirty.current=false;onSaved?.(latest);
  }
  function insertChart(type:string){
    const {data:d,binding}=createInsertedChartSource(type),id=crypto.randomUUID();
    edit(n=>{n.elements.push({id,type:"chart",chartType:type,rect:{x:120,y:100,w:640,h:360},z:n.elements.length+2,bindingRef:`chart:${id}`,options:{showLabels:true,showLegend:true,...(type==="combo"?{secondaryAxis:true}:{})}});n.bindings[`chart:${id}`]=binding;n.extensions={...n.extensions,chartData:{...n.extensions?.chartData,[id]:{mode:"private",dataSpec:d,binding}}}});
    Sel([id]);Tab("data");M("");
  }
  function insertImage(asset: any) {
    edit((n) => {
      const id = crypto.randomUUID();
      n.elements.push({
        id,
        type: "image",
        rect: { x: 48, y: 120, w: 240, h: 160 },
        z: n.elements.length + 2,
        assetId: asset.id,
        fit: "contain",
      });
      Sel([id]);
    });
    M("");
  }
  async function exportCheck() {
    try {
      if (await checkCurrent(true)) return;
      const saved = await flush();
      const result = await post(`/slides/${slide.id}/preflight`, {
        revision: saved.revision,
        deliveryMode: "final",
      });
      Pre({ ...result, revision: saved.revision });
      M("preflight");
    } catch (e: any) {
      E(e.message);
    }
  }
  async function exportJob(mode: string) {
    try {
      if (await checkCurrent(true)) {
        M("");
        return;
      }
      await api("/export-jobs", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          slideId: slide.id,
          revision: preflight.revision,
          deliveryMode: mode,
        }),
      });
      M("exports");
    } catch (e: any) {
      E(
        e.status === 409
          ? "数据或页面已更新，请重新打开页面后导出。"
          : e.message,
      );
    }
  }
  const saveLabel: any = {
    saved: `已保存 · r${q.revision}`,
    dirty: "未保存",
    saving: "保存中…",
    error: "保存失败",
    conflict: "保存冲突",
  };
  const selectedTextElements=slide.elements.filter((item:any)=>selected.includes(item.id)&&(["text","sourceFooter"].includes(item.type)||(item.type==="shape"&&item.runs)));
  const sharedTextStyle=(key:string,fallback:any)=>{const values=selectedTextElements.map((item:any)=>item.style?.[key]??fallback);return values.length&&values.every((value:any)=>value===values[0])?values[0]:undefined};
  const changeSelectedTextStyle=(patch:Record<string,any>)=>edit((next)=>{for(const item of next.elements)if(selected.includes(item.id)&&(["text","sourceFooter"].includes(item.type)||(item.type==="shape"&&item.runs)))item.style={...item.style,...patch}});
  return (
    <div className={`editor focused-editor ${inContent ? "embedded-editor" : ""} ${fullscreen ? "editor-fullscreen" : ""}`}>
      {!inContent && <header className="editor-header">
        <button
          aria-label="返回我的页面"
          onClick={async () => {
            try {
              await flush();
              onClose();
            } catch (e: any) {
              E(e.message);
            }
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <a className="brand" href="/slides">
          <span className="brandmark">S</span>SlideBI
        </a>
        <span className="divider" />
        <input
          className="title-input"
          aria-label="页面名称"
          value={slide.title}
          onChange={(e) =>
            edit((n) => {
              n.title = e.target.value;
            }, "title")
          }
          onBlur={() => historyRef.current.endGroup()}
        />
        <span className={`save-status ${q.status}`} aria-live="polite">
          {saveLabel[q.status]}
        </span>
        <button onClick={() => flush().catch((e) => E(e.message))}>
          <Save size={15} />
          保存
        </button>
        <button className="primary" onClick={exportCheck}>
          <Download size={15} />
          导出 PPT
        </button>
      </header>}
      <div className="toolbar">
        <button
          aria-label="撤销"
          disabled={!historyRef.current.past.length}
          onClick={() => undo()}
        >
          <Undo2 size={17} />
        </button>
        <button
          aria-label="重做"
          disabled={!historyRef.current.future.length}
          onClick={() => undo(true)}
        >
          <Redo2 size={17} />
        </button>
        <span className="divider" />
        <button
          aria-label="文本框"
          onClick={() =>
            edit((n) => {
              const id = crypto.randomUUID();
              n.elements.push({
                id,
                type: "text",
                rect: { x: 48, y: 120, w: 240, h: 60 },
                z: n.elements.length + 2,
                style: { fontSize: 18 },
                runs: [{ text: "补充说明" }],
              });
              Sel([id]);
            })
          }
        >
          <PptTextBoxIcon />
          文本框
        </button>
        <button onClick={() => M("assets")}>
          <ImagePlus size={16} />
          资源
        </button>
        <button onClick={() => M("shapes")}><PptShapesIcon/>形状</button>
        <button onClick={()=>M("chart")}><ChartColumn size={16}/>图表</button>
        <span className="divider" />
        {selectedTextElements.length?<div className="text-toolbar" aria-label="文字工具栏"><span><select aria-label="工具栏字体" value={sharedTextStyle("fontFace","SimHei")??""} onChange={event=>changeSelectedTextStyle({fontFace:event.target.value})} style={{fontFamily:FONT_OPTIONS.find(option=>option.id===(sharedTextStyle("fontFace","SimHei")??"SimHei"))?.css}}><option value="" disabled>混合字体</option>{FONT_OPTIONS.map(option=><option key={option.id} value={option.id} style={{fontFamily:option.css}}>{option.label}</option>)}</select></span><span><input aria-label="工具栏字号" type="number" min="8" max="72" value={sharedTextStyle("fontSize",16)??""} onChange={event=>event.target.value&&changeSelectedTextStyle({fontSize:Math.max(8,Math.min(72,Number(event.target.value)))})}/></span><button type="button" className="text-bold" aria-label="粗体" aria-pressed={sharedTextStyle("bold",false)===true} title="粗体" onClick={()=>changeSelectedTextStyle({bold:sharedTextStyle("bold",false)!==true})}><Bold size={16}/></button><TextColorPicker color={sharedTextStyle("color","#334155")??"#334155"} onChange={color=>changeSelectedTextStyle({color})}/>{[["left",AlignLeft,"文字左对齐"],["center",AlignCenter,"文字居中"],["right",AlignRight,"文字右对齐"]].map(([value,Icon,label]:any)=><button key={value} aria-label={label} aria-pressed={sharedTextStyle("align","left")===value} onClick={()=>changeSelectedTextStyle({align:value})}><Icon size={16}/></button>)}{[["top",AlignStartVertical,"文字顶部对齐"],["middle",AlignCenterVertical,"文字垂直居中"],["bottom",AlignEndVertical,"文字底部对齐"]].map(([value,Icon,label]:any)=><button key={value} aria-label={label} aria-pressed={sharedTextStyle("valign","top")===value} onClick={()=>changeSelectedTextStyle({valign:value})}><Icon size={16}/></button>)}</div>:<>{[
          ["left", AlignLeft, "左对齐"],
          ["right", AlignRight, "右对齐"],
          ["top", AlignStartVertical, "顶对齐"],
          ["bottom", AlignEndVertical, "底对齐"],
        ].map(([op, Icon, label]: any) => <button key={op} aria-label={label} disabled={selected.length < 2} onClick={() => commit(transformSelection(slide, selected, op))}><Icon size={17}/></button>)}
        <button disabled={selected.length < 3} onClick={() =>commit(transformSelection(slide, selected, "distribute"))}>水平等距</button>
        <button disabled={selected.length < 2} onClick={() => commit(transformSelection(slide, selected, "size"))}>同尺寸</button></>}

        <span className="toolbar-spacer" />
        <button aria-label={propertiesCollapsed?"展开配置栏":"收起配置栏"} title={propertiesCollapsed?"展开配置栏":"收起配置栏"} onClick={()=>PropertiesCollapsed(value=>!value)}>{propertiesCollapsed?<PanelRightOpen size={17}/>:<PanelRightClose size={17}/>}</button>
        <button aria-label={fullscreen?"退出全屏编辑":"全屏编辑页面"} title={fullscreen?"退出全屏编辑":"全屏编辑页面"} onClick={()=>Fullscreen(!fullscreen)}>{fullscreen?<Minimize size={17}/>:<Maximize size={17}/>}</button>
        {!templateWorkspace && <button
          onClick={() => {
            Personal(`${slide.title} · 个人模板`);
            M("personal");
          }}
        >
          <LayoutTemplate size={16} />另存为模板
        </button>}
        {templateWorkspace && <button className="primary" aria-label="完成模板页面编辑" onClick={async()=>{try{await flush();onWorkspaceClose?.()}catch(error:any){E(error.message)}}}><Check size={17}/>完成</button>}
      </div>
      {error && (
        <div className="editor-error error" role="alert">
          {error}
          <button onClick={() => E("")}>关闭</button>
        </div>
      )}
      {q.status === "conflict" && (
        <div className="conflict">
          远端版本已更新，本地草稿已保留。基于 r{q.revision}。
          <button
            onClick={async () => {
              try {
                onOpen(
                  await post(`/slides/${slide.id}/copy`, {
                    slide: q.draft,
                    title: `${slide.title} · 本地副本`,
                  }),
                );
              } catch (e: any) {
                E(e.message);
              }
            }}
          >
            另存副本
          </button>
          <button
            onClick={async () => {
              localStorage.setItem(
                `slidebi-backup-${slide.id}`,
                JSON.stringify(q.draft),
              );
              try {
                const latest = await api(`/slides/${slide.id}`);
                q.draft = latest;
                q.revision = latest.revision;
                q.dirty = false;
                q.status = "saved";
                q.error = undefined;
                historyRef.current = new History(latest);
                S(latest);
                D(await api(`/data-snapshots/${latest.snapshotRef}`));
              } catch (e: any) {
                E(e.message);
              }
            }}
          >
            备份本地并加载最新
          </button>
          <span>可继续本地编辑</span>
        </div>
      )}
      <div className="editor-body">
        <section className="canvas-area">
          <div className="canvas" ref={stage} onPointerDown={() => {selectElements([])}}>
            <div
              className="svg-content"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            {alignmentGuides.vertical!==undefined&&<i className="alignment-guide vertical" aria-label="垂直对齐参考线" style={{left:`${alignmentGuides.vertical/9.6}%`}}/>}
            {alignmentGuides.horizontal!==undefined&&<i className="alignment-guide horizontal" aria-label="水平对齐参考线" style={{top:`${alignmentGuides.horizontal/5.4}%`}}/>}
            {connectorEditing && connectionAnchors(slide, connectorEditing.id).map(anchor => {
              const sideLabel={top:"上侧",right:"右侧",bottom:"下侧",left:"左侧"}[anchor.side];
              const active=connectionHint?.elementId===anchor.elementId&&connectionHint?.side===anchor.side;
              return <i key={`${anchor.elementId}-${anchor.side}`} className={`connector-anchor ${active?"active":""}`} aria-label={active?`连接到 ${anchor.elementId} ${sideLabel}`:`连接点 ${anchor.elementId} ${sideLabel}`} style={{left:`${anchor.point.x/9.6}%`,top:`${anchor.point.y/5.4}%`}}/>;
            })}
            {slide.elements.map((e: any) => {
              const connector=isConnector(e);
              const r = connector ? connectorBounds(slide, e) : rectOf(slide, e);
              const endpoints=connector?connectorEndpoints(slide,e):undefined;
              const elbowControls=e.shape==="elbow"?connectorRoute(slide,e).controls:[];
              return (
                <div
                  key={e.id}
                  className={`element-hit ${connector ? "connector" : ""} ${selected.includes(e.id) ? "selected" : ""}`}
                  aria-label={`选择${e.type === "chart" ? "图表" : e.type === "table" ? "表格" : e.id}`}
                  title={["text","shape"].includes(e.type)&&e.runs?"拖动移动；双击编辑文字":undefined}
                  role="button"
                  tabIndex={0}
                  style={{
                    left: `${r.x / 9.6}%`,
                    top: `${r.y / 5.4}%`,
                    width: `${r.w / 9.6}%`,
                    height: `${r.h / 5.4}%`,
                    zIndex: (e.z || 0) + 2,
                  }}
                  onPointerDown={(ev) => { if(editingText!==e.id && !frozen) pointerStart(ev, e.id); }}
                  onClick={(ev) => {if(editingText!==e.id)selectElements(expandSelection(slide,ev.shiftKey?[...new Set([...selected,e.id])]:[e.id]));}}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerEnd}
                  onPointerCancel={pointerEnd}
                  onDoubleClick={() => {
                    selectElements([e.id]).then(ok=>{if(ok&&["text","shape"].includes(e.type)&&e.runs&&!frozen)EditingText(e.id)});
                  }}
                  onKeyDown={(ev) => ev.key === "Enter" && selectElements(expandSelection(slide, [e.id]))}
                >
                  {["chart","table"].includes(e.type)&&slide.extensions?.chartData?.[e.id]?.mode==="private"&&<span className="chart-private-badge">页面数据 · 未绑定</span>}
                  {editingText===e.id && <textarea autoFocus aria-label="画布文字编辑" className="canvas-text-input" value={(e.runs??[]).some((r:any)=>r.inlineValue)?(e.runs??[]).find((r:any)=>r.text!==undefined)?.text||"":(e.runs??[]).map((r:any)=>r.text||"").join("")} onPointerDown={ev=>ev.stopPropagation()} onClick={ev=>ev.stopPropagation()} onChange={ev=>edit(n=>{const target=n.elements.find((x:any)=>x.id===e.id);target.runs??=[];if(target.runs.some((r:any)=>r.inlineValue)){const first=target.runs.findIndex((r:any)=>r.text!==undefined);if(first>=0)target.runs[first]={...target.runs[first],text:ev.target.value};else target.runs.unshift({text:ev.target.value});}else target.runs=[{text:ev.target.value}];},e.id)} onBlur={()=>{EditingText(undefined);historyRef.current.endGroup()}} onKeyDown={ev=>{ev.stopPropagation();if(ev.key==="Escape"){EditingText(undefined);historyRef.current.endGroup()}}} style={{fontSize:`${(e.style?.fontSize||18)*(stage.current?.getBoundingClientRect().width||960)/960}px`,fontFamily:FONT_OPTIONS.find(option=>option.id===(e.style?.fontFace||"SimHei"))?.css||e.style?.fontFace||"SimHei",fontWeight:e.style?.bold?700:400,color:e.style?.color||"#334155",background:e.type==='shape'?(e.fill||'#DCEAE8'):(e.style?.fill||'#fff'),textAlign:e.style?.align||"left"}}/>}
                  {selected.includes(e.id) && editingText!==e.id && (
                    <>
                      {!connector&&<span className="selection-label">
                        {Math.round(r.w)} × {Math.round(r.h)}
                      </span>}
                      {connector && endpoints ? <>
                        <i aria-label="拖动线条起点" className="connector-handle begin" style={{left:`${((endpoints.begin.x-r.x)/r.w)*100}%`,top:`${((endpoints.begin.y-r.y)/r.h)*100}%`}} onPointerDown={ev=>pointerStart(ev,e.id,false,"begin")} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}/>
                        <i aria-label="拖动线条终点" className="connector-handle end" style={{left:`${((endpoints.end.x-r.x)/r.w)*100}%`,top:`${((endpoints.end.y-r.y)/r.h)*100}%`}} onPointerDown={ev=>pointerStart(ev,e.id,false,"end")} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}/>
                        {elbowControls.map(control=><i key={control.key} aria-label={control.key==="middle"?"拖动折线中段":control.key==="departure"?"拖动折线起始段":control.key==="arrival"?"拖动折线结束段":control.key==="corridor"?"拖动折线外侧段":`拖动折线第 ${Number(control.segmentIndex)+1} 段`} title="拖动此线段调整折线路径" className={`connector-bend-handle axis-${control.axis}`} style={{left:`${((control.point.x-r.x)/r.w)*100}%`,top:`${((control.point.y-r.y)/r.h)*100}%`}} onPointerDown={ev=>pointerStart(ev,e.id,false,control.key)} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}/>) }
                      </> : <i
                          className="handle"
                          onPointerDown={(ev) => pointerStart(ev, e.id, true)}
                          onPointerMove={pointerMove}
                          onPointerUp={pointerEnd}
                          onPointerCancel={pointerEnd}
                        />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        {!propertiesCollapsed && <aside className="properties" aria-label="页面属性">
          <div className="tabs">
            {[
              ["content", "内容"],
              ["style", "样式"],
              ["data", "数据"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                disabled={id==="data"&&!dataTabAvailable}
                onClick={async()=>{try{await chartFlush.current();Tab(id)}catch(e:any){E(e.message)}}}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="property-body">
            {tab === "data" && templateElementData ? (
              <TemplateElementDataPanel slide={slide} element={el} dataSpec={data} onChange={next=>{D(next);onWorkspaceDataChange?.(next)}}/>
            ) : tab === "data" && dataTabAvailable ? (
              <>
                <ChartDataPanel key={el.id} slideId={slide.id} chartId={el.id} source={slide.extensions?.chartData?.[el.id]} frozen={frozen} registerFlush={fn=>{chartFlush.current=fn}} flushSlide={flushSlide} onReload={reloadChartData} onPreview={source=>{chartDirty.current=true;ChartPreview({...chartPreview,[el.id]:source})}} onChange={source=>edit(n=>{n.extensions={...n.extensions,chartData:{...n.extensions?.chartData,[el.id]:source}}})}/>
              </>
            ) : (
              <>
                <h3>
                  {selected.length > 1
                    ? `已选择 ${selected.length} 个对象`
                    : el
                      ? el.type === "chart"
                        ? "业务图表"
                        : el.type === "table"
                          ? "数据表格"
                          : el.type === "text"
                            ? "文本"
                            : el.type === "image"
                              ? "图片"
                        : el.type === "sourceFooter"
                          ? "来源信息"
                          : "对象属性"
                      : "页面设置"}
                </h3>
                {!el && (
                  <p className="muted">
                    在画布或左侧对象列表选择元素，调整内容、样式与布局。
                  </p>
                )}
                {tab === "style" && selected.length > 1 && (
                  <div className="selection-scale">
                    <label className="field">
                      组合缩放（%）
                      <input
                        type="number"
                        value={scalePercent}
                        onChange={(e) => ScalePercent(e.target.value)}
                      />
                    </label>
                    <button
                      onClick={() => {
                        try {
                          commit(
                            scaleSelection(
                              slide,
                              selected,
                              Number(scalePercent) / 100,
                            ),
                          );
                          ScalePercent("100");
                        } catch (e: any) {
                          E(e.message);
                        }
                      }}
                    >
                      应用等比缩放
                    </button>
                  </div>
                )}
                {tab === "content" && slide.elements.filter(
                  (x: any) => selected.includes(x.id) && x.type === "chart",
                ).length > 0 && (
                  <label className="field">
                    图表数值精度（批量）
                    <select
                      value={(() => {
                        const values = slide.elements
                          .filter(
                            (x: any) =>
                              selected.includes(x.id) && x.type === "chart",
                          )
                          .map(
                            (x: any) => x.options?.numberFormat?.decimals ?? 0,
                          );
                        return values.every((v: any) => v === values[0])
                          ? String(values[0])
                          : "";
                      })()}
                      onChange={(e) =>
                        edit((n) => {
                          for (const x of n.elements)
                            if (selected.includes(x.id) && x.type === "chart")
                              x.options = {
                                ...x.options,
                                numberFormat: {
                                  ...x.options?.numberFormat,
                                  decimals: Number(e.target.value),
                                },
                              };
                        })
                      }
                    >
                      <option value="" disabled>
                        混合值
                      </option>
                      {[0, 1, 2, 3, 4].map((v) => (
                        <option key={v} value={v}>
                          {v}位小数
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {el && (
                  <>
                    {tab === "content" && (
                      <>
                        {["process", "status"].includes(el.type) && (
                          <ComponentForm
                            key={JSON.stringify([
                              el,
                              slide.bindings[el.bindingRef],
                            ])}
                            type={el.type}
                            data={data}
                            initial={el}
                            binding={slide.bindings[el.bindingRef]}
                            onApply={(element, binding) =>
                              edit((n) => {
                                const index = n.elements.findIndex(
                                  (x: any) => x.id === el.id,
                                );
                                n.elements[index] = element;
                                if (binding) {
                                  n.bindings[element.bindingRef] = binding;
                                  if(element.type==="table"&&n.extensions?.chartData?.[element.id])n.extensions.chartData[element.id]={...n.extensions.chartData[element.id],binding};
                                }
                              })
                            }
                          />
                        )}
                        {el.type === "table" && <section className="property-section"><h4>表格内容</h4><p className="muted">表格字段、字段顺序和数据内容在“数据”中维护；这里仅保留页面展示相关设置。</p></section>}
                        {el.type === "hierarchy" && el.style?.variant === "decision" && <label className="field">决策树展开方向<select aria-label="决策树展开方向" value={el.style?.orientation || "horizontal"} onChange={event=>changeEl(item=>{item.style={...item.style,orientation:event.target.value}})}><option value="horizontal">横向展开</option><option value="vertical">纵向展开</option></select></label>}
                        {el.runs && (
                          <label className="field">
                            文字内容
                            {el.runs.some((r: any) => r.inlineValue) && (
                              <small>
                                含绑定数值：仅修改静态文字，数值保持绑定。
                              </small>
                            )}
                            <textarea
                              aria-label="文字内容"
                              id="element-text"
                              rows={5}
                              value={
                                el.runs.some((r: any) => r.inlineValue)
                                  ? el.runs.find(
                                      (r: any) => r.text !== undefined,
                                    )?.text || ""
                                  : el.runs
                                      .map((r: any) => r.text || "")
                                      .join("")
                              }
                              onChange={(e) =>
                                changeEl((x) => {
                                  if (x.runs.some((r: any) => r.inlineValue)) {
                                    const first = x.runs.findIndex(
                                      (r: any) => r.text !== undefined,
                                    );
                                    if (first >= 0)
                                      x.runs[first] = {
                                        ...x.runs[first],
                                        text: e.target.value,
                                      };
                                  } else x.runs = [{ text: e.target.value }];
                                }, el.id)
                              }
                              onBlur={() => historyRef.current.endGroup()}
                            />
                          </label>
                        )}
                        {el.type === "sourceFooter" && (
                          <p className="callout">
                            来源由当前数据生成，导出时保留追溯信息。
                          </p>
                        )}
                        {el.type === "chart" && (
                          <>
                            <label className="field">
                              方向
                              <select
                                value={el.options?.direction || "column"}
                                onChange={(e) =>
                                  changeEl((x) => {
                                    x.options = {
                                      ...x.options,
                                      direction: e.target.value,
                                    };
                                  })
                                }
                              >
                                <option value="column">纵向</option>
                                <option value="bar">横向</option>
                              </select>
                            </label>
                            {[
                              ["showLegend", "显示图例"],
                              ["showLabels", "显示数据标签"],
                              ["showDifferences", "显示实际与预算差异"],
                            ].map(([key, label]) => (
                              <label className="check" key={key}>
                                <input
                                  type="checkbox"
                                  checked={
                                    key === "showDifferences"
                                      ? !!el.options?.[key]
                                      : el.options?.[key] !== false
                                  }
                                  onChange={(e) =>
                                    changeEl((x) => {
                                      x.options = {
                                        ...x.options,
                                        [key]: e.target.checked,
                                      };
                                    })
                                  }
                                />
                                {label}
                              </label>
                            ))}
                            <label className="field">
                              数值精度
                              <select
                                value={el.options?.numberFormat?.decimals || 0}
                                onChange={(e) =>
                                  changeEl((x) => {
                                    x.options = {
                                      ...x.options,
                                      numberFormat: {
                                        ...x.options?.numberFormat,
                                        decimals: Number(e.target.value),
                                      },
                                    };
                                  })
                                }
                              >
                                {[0, 1, 2].map((v) => (
                                  <option key={v} value={v}>
                                    {v} 位小数
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              目标线（原始数值）
                              <input
                                type="number"
                                value={el.options?.targetLine?.value ?? ""}
                                onChange={(e) =>
                                  changeEl((x) => {
                                    x.options = {
                                      ...x.options,
                                      targetLine: e.target.value
                                        ? {
                                            value: e.target.value,
                                            label: "目标",
                                            source: "人工录入目标",
                                          }
                                        : undefined,
                                    };
                                  })
                                }
                              />
                            </label>
                            <p className="muted">
                              {el.chartType === "waterfall"
                                ? "图形与文字可编辑"
                                : "图表数据可编辑"}
                            </p>
                          </>
                        )}
                      </>
                    )}
                    {tab === "style" && (
                      <>
                        {["text","sourceFooter"].includes(el.type)&&<TextStylePanel
                          elements={slide.elements.filter(
                            (x: any) => selected.includes(x.id) && ["text", "sourceFooter"].includes(x.type),
                          )}
                          onChange={(patch: any) => edit((n) => {for (const x of n.elements)if(selected.includes(x.id)&&["text", "sourceFooter"].includes(x.type))x.style={...x.style,...patch}})}
                        />}
                        {el.type==="table"&&<TableStylePanel element={el} onChange={(patch:any)=>changeEl(x=>{x.style={...x.style,...patch}})}/>} 
                        {el.type==="chart"&&<ChartStylePanel element={el} onChange={(patch:any)=>changeEl(x=>{x.style={...x.style,...patch}})}/>} 
                        {el.type==="shape"&&<><ShapeStylePanel element={el} onChange={(patch:any)=>changeEl(x=>Object.assign(x,patch))}/>{el.runs&&<TextStylePanel elements={[el]} boxStyle={false} onChange={(patch:any)=>changeEl(x=>{x.style={...x.style,...patch}})}/>}</>} 
                        {el.type==="image"&&<label className="field">图片适配<select value={el.fit||"contain"} onChange={event=>changeEl(x=>{x.fit=event.target.value})}><option value="contain">等比完整显示</option><option value="cover">等比裁剪填充</option></select></label>}
                      </>
                    )}
                    {tab === "style" && <><h4>位置与尺寸 · pt</h4>
                    <div className="geometry">
                      {[
                        ["x", "X"],
                        ["y", "Y"],
                        ["w", "宽"],
                        ["h", "高"],
                      ].map(([k, label]) => (
                        <label key={k}>
                          {label}
                          <input
                            aria-label={label}
                            type="number"
                            value={Math.round(rect[k])}
                            onChange={(e) => {
                              const r = { ...rect, [k]: +e.target.value };
                              if (
                                r.x < 0 ||
                                r.y < 0 ||
                                r.w < 16 ||
                                r.h < 16 ||
                                r.x + r.w > 960 ||
                                r.y + r.h > 540
                              ) {
                                E("位置或尺寸超出画布，请输入有效 pt 数值");
                                return;
                              }
                              edit((n) => {
                                n.layoutOverrides[el.id] = { rect: r };
                              });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="row object-actions">
                      <button
                        aria-label="置于顶层"
                        title="置于顶层"
                        onClick={() => commit(setSelectionLayer(slide, selected, "front"))}
                      >
                        <BringToFront size={16} />
                      </button>
                      <button
                        aria-label="置于底层"
                        title="置于底层"
                        onClick={() => commit(setSelectionLayer(slide, selected, "back"))}
                      >
                        <SendToBack size={16} />
                      </button>
                      <button aria-label="复制对象" onClick={duplicate}>
                        <Copy size={16} />
                      </button>
                      <button aria-label="删除对象" onClick={remove}>
                        <Trash2 size={16} />
                      </button>
                    </div></>}
                  </>
                )}
              </>
            )}
          </div>
        </aside>}
      </div>
      {modal === "data" && (
        <Modal title="当前数据与计算口径" wide onClose={() => M("")}>
          <DataView data={data} />
        </Modal>
      )}
      {modal === "preflight" && (
        <Modal title="导出前检查" onClose={() => M("")}>
          <div className="callout">
            <b>{slide.title}</b>
            <p>
              冻结版本 r{preflight.revision} ·{" "}
              {slide.templateRef.id === "revenue-bridge"
                ? "图形与文字可编辑"
                : "图表数据可编辑"}
            </p>
            <p>截至 {data?.snapshot?.dataAsOf}</p>
          </div>
          {preflight.diagnostics?.length ? (
            preflight.diagnostics.map((d: any, i: number) => (
              <div
                className={d.severity === "error" ? "error" : "callout"}
                key={i}
              >
                {d.message}
                {d.elementId && (
                  <button
                    onClick={() => {
                      Sel([d.elementId]);
                      M("");
                    }}
                  >
                    定位问题
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="success">数据、布局与复核检查通过</p>
          )}
          <footer>
            <button onClick={() => M("")}>返回编辑</button>
            <button onClick={() => exportJob("draft")}>导出草稿</button>
            <button
              className="primary"
              disabled={preflight.diagnostics?.some(
                (d: any) => d.severity === "error",
              )}
              onClick={() => exportJob("final")}
            >
              生成 PPT
            </button>
          </footer>
        </Modal>
      )}
      {modal === "exports" && (
        <Modal title="导出任务" wide onClose={() => M("")}>
          <p className="muted">任务固定创建时的修订；可关闭此窗口继续编辑。</p>
          <ExportList jobs={jobs} onError={E} />
          <footer>
            <button onClick={onExports}>全部导出记录</button>
            <button onClick={() => M("")}>继续编辑</button>
          </footer>
        </Modal>
      )}
      {modal === "personal" && (
        <Modal title="存为个人模板" onClose={() => M("")}>
          <label className="field">
            模板名称
            <input
              value={personal}
              onChange={(e) => Personal(e.target.value)}
            />
          </label>
          <p className="callout">
            保存当前页面及图表配套数据，作为独立模板继续维护。
          </p>
          <footer>
            <button onClick={() => M("")}>取消</button>
            <button
              className="primary"
              disabled={!personal.trim()}
              onClick={async () => {
                try {
                  await flush();
                  await post("/templates", {
                    slideId: slide.id,
                    name: personal,
                    scene: slide.scene,
                  });
                  M("");
                } catch (e: any) {
                  E(e.message);
                }
              }}
            >
              保存个人模板
            </button>
          </footer>
        </Modal>
      )}
      {modal === "template" && candidate && (
        <Modal title="切换业务模板" onClose={() => M("")}>
          <div className="actual-preview" dangerouslySetInnerHTML={{__html:renderSlideSvg(compileSlide(candidate,data))}} />
          <p className="callout">
            将更新图表与字段绑定，并恢复新模板布局。保留同角色标题、说明和当前主题；可撤销。
          </p>
          <footer>
            <button onClick={() => M("")}>取消</button>
            <button
              className="primary"
              onClick={() => {
                const n = {
                  ...candidate,
                  revision: q.revision,
                  title: slide.title,
                  themeRef: slide.themeRef,
                };
                for (const suffix of ["title", "note"]) {
                  const old = slide.elements.find((e: any) =>
                    e.id.endsWith(`-${suffix}`),
                  );
                  const target = n.elements.find((e: any) =>
                    e.id.endsWith(`-${suffix}`),
                  );
                  if (old && target) target.runs = old.runs;
                }
                commit(n);
                Sel([]);
                M("");
              }}
            >
              应用模板与绑定
            </button>
          </footer>
        </Modal>
      )}
      {modal === "fragments" && (
        <Modal title="组件片段库" wide onClose={() => M("")}>
          <FragmentLibrary
            selected={selected}
            flush={flush}
            onInsert={(spec, theme) => {
              commit(insertFragment(slide, spec, data, theme));
              M("");
            }}
          />
        </Modal>
      )}
      {modal.startsWith("insert-") && (
        <Modal title={modal==="insert-table"?"插入普通表格":"插入业务组件"} onClose={() => M("")}>
          <ComponentForm
            type={modal.slice(7)}
            data={data}
            onApply={(element, binding) => {
              edit((n) => {
                element.z = n.elements.length + 2;
                n.elements.push(element);
                if (binding) {
                  const resolved=element.type==="table"?{...binding,roles:{...binding.roles,columns:[...element.fields]}}:binding;
                  n.bindings[element.bindingRef] = resolved;
                  if(element.type==="table")n.extensions={...n.extensions,chartData:{...n.extensions?.chartData,[element.id]:{mode:"private",dataSpec:data,binding:resolved}}};
                }
              });
              Sel([element.id]);
              if(element.type==="table")Tab("data");
              M("");
            }}
          />
        </Modal>
      )}
      {modal === "chart" && <Modal title="插入图表" wide onClose={()=>M("")}><div className="insert-chart-groups">{INSERT_CHART_GROUPS.map(group=><section key={group.label}><h3>{group.label}</h3><div className="row">{group.items.map(([type,label,Icon])=><button key={type} onClick={()=>insertChart(type)}><Icon size={16}/>{label}</button>)}</div></section>)}<section><h3>表格</h3><button onClick={()=>M("insert-table")}><Table2 size={16}/>普通表格</button></section></div><p className="muted">插入后可绑定数据管理中的数据。</p></Modal>}
      {modal === "assets" && (
        <Modal title="资源库" wide onClose={() => M("")}>
          <AssetLibrary onSelect={insertImage} />
        </Modal>
      )}
      {modal === "shapes" && <Modal title="插入形状" wide onClose={()=>M("")}><div className="shape-picker">{INSERT_SHAPE_GROUPS.map(group=><section key={group.label}><h3>{group.label}</h3><div className="shape-grid">{group.items.map(preset=><button type="button" key={preset.id} onClick={()=>{const id=crypto.randomUUID(),connector=["line","elbow"].includes(preset.shape);edit(n=>{n.elements.push({id,type:"shape",shape:preset.shape,rect:{x:48,y:120,w:preset.w,h:preset.h},z:Math.max(0,...n.elements.map((element:any)=>element.z||0))+1,...(!connector?{fill:"#DCEAE8"}:{}),line:{color:"#52768B",width:2,dash:"solid",...preset.line},...(!connector?{runs:[{text:"形状文字"}],style:{fontFace:"SimHei",fontSize:16,color:"#334155",bold:false,align:"center",valign:"middle"}}:{})})});Sel([id]);Tab("style");M("")}}><ShapeGlyph shape={preset.shape} line={preset.line}/><span>{preset.label}</span></button>)}</div></section>)}</div></Modal>}
    </div>
  );
}

function TextStylePanel({
  elements,
  onChange,
  boxStyle=true,
}: {
  elements: any[];
  onChange: (patch: Record<string, any>) => void;
  boxStyle?:boolean;
}) {
  if (!elements.length)
    return <p className="muted">请选择文字或数据来源对象来设置文字样式。</p>;
  const defaults: Record<string, any> = {
    fontFace: "SimHei",
    fontSize: 16,
    bold: false,
    italic: false,
    align: "left",
    valign: "top",
    color: "#334155",
  };
  function value(key: string) {
    const values = elements.map((el) => {
      const v = el.style?.[key] ?? defaults[key];
      return key === "fontFace" && v === "Noto Sans CJK SC" ? "SimHei" : v;
    });
    return values.every((v) => v === values[0]) ? values[0] : undefined;
  }
  const font = value("fontFace"),
    size = value("fontSize"),
    color = value("color");
  return (
    <section className="text-style-panel">
      {boxStyle&&<header className="ppt-format-title"><strong>设置形状格式</strong><span>文本选项</span></header>}
      <h4>文字样式</h4>
      <p className="muted">
        应用于 {elements.length} 个文字 / 来源对象
        {elements.length > 1 ? " · 不改变其他对象" : ""}
      </p>
      <label className="field">
        字体
        <select
          value={font ?? ""}
          onChange={(e) => onChange({ fontFace: e.target.value })}
        >
          <option value="" disabled>
            混合值
          </option>
          {font && !FONT_OPTIONS.some((option) => option.id === font) && (
            <option value={font}>{font}</option>
          )}
          {FONT_OPTIONS.map((option) => (
            <option
              key={option.id}
              value={option.id}
              style={{ fontFamily: option.css }}
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        所选字体需在浏览器及目标设备安装；缺失时将使用替代字体，排版可能不同。
      </p>
      <label className="check text-style-toggle"><input aria-label="属性粗体" type="checkbox" checked={value("bold")===true} onChange={event=>onChange({bold:event.target.checked})}/><Bold size={16}/>粗体 B</label>
      <label className="field">
        字号（pt）
        <input
          type="number"
          min="8"
          max="72"
          value={size ?? ""}
          placeholder={size === undefined ? "混合值" : undefined}
          onChange={(e) => {
            if (
              e.target.value !== "" &&
              Number.isFinite(Number(e.target.value))
            )
              onChange({
                fontSize: Math.max(8, Math.min(72, Number(e.target.value))),
              });
          }}
        />
      </label>
      <label className="field">
        水平对齐
        <select
          value={value("align") ?? ""}
          onChange={(e) => onChange({ align: e.target.value })}
        >
          <option value="" disabled>
            混合值
          </option>
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </select>
      </label>
      <label className="field">
        垂直对齐
        <select
          value={value("valign") ?? ""}
          onChange={(e) => onChange({ valign: e.target.value })}
        >
          <option value="" disabled>
            混合值
          </option>
          <option value="top">顶部</option>
          <option value="middle">居中</option>
          <option value="bottom">底部</option>
        </select>
      </label>
      <PptColorPicker label="文字颜色" ariaLabel="属性文字颜色" customAriaLabel="文字颜色" color={color??"#334155"} kind="outline" onChange={value=>value&&onChange({color:value})}/>
      {color === undefined && <small>混合值；选择颜色后统一应用</small>}
      {boxStyle&&<PptFillLinePanel prefix="文本框" fill={value("fill")} fillTransparency={value("fillTransparency")??0} line={elements[0]?.style?.line} onChange={onChange}/>}
    </section>
  );
}

function TableStylePanel({element,onChange}:{element:any;onChange:(patch:Record<string,any>)=>void}){
 const style=element.style??{};
 const css=(value:string|undefined,fallback:string)=>{const color=value||fallback;return color.startsWith('#')?color:`#${color}`};
 const directionColors=style.valueColorMode==="direction"||(Array.isArray(style.directionFields)&&style.directionFields.length>0);
 return <section className="property-section table-style-panel"><h4>表格样式</h4>
  <div className="chart-style-grid"><label className="field">字体<select aria-label="表格字体" value={style.fontFace||"SimHei"} onChange={event=>onChange({fontFace:event.target.value})}>{FONT_OPTIONS.map(option=><option key={option.id} value={option.id} style={{fontFamily:option.css}}>{option.label}</option>)}</select></label><label className="field">正文字号<input aria-label="表格字号" type="number" min="8" max="80" value={style.fontSize??12} onChange={event=>onChange({fontSize:Math.max(8,Math.min(80,Number(event.target.value)))})}/></label><label className="field">表头字号<input aria-label="表格表头字号" type="number" min="8" max="80" value={style.headerFontSize??Math.max(8,(style.fontSize??12)-1)} onChange={event=>onChange({headerFontSize:Math.max(8,Math.min(80,Number(event.target.value)))})}/></label><label className="field">数值对齐<select aria-label="表格数值对齐" value={style.numericAlign||"right"} onChange={event=>onChange({numericAlign:event.target.value})}><option value="right">右对齐</option><option value="center">居中</option><option value="left">左对齐</option></select></label></div>
  <div className="row"><button type="button" className="text-style-toggle" aria-label="表格粗体" aria-pressed={style.bold===true} onClick={()=>onChange({bold:style.bold!==true})}><Bold size={16}/>全部粗体</button><label className="check"><input aria-label="首列加粗" type="checkbox" checked={style.firstColumnBold===true} onChange={event=>onChange({firstColumnBold:event.target.checked})}/>首列加粗</label><label className="check"><input aria-label="末行加粗" type="checkbox" checked={style.lastRowBold===true} onChange={event=>onChange({lastRowBold:event.target.checked})}/>末行加粗</label></div>
  <div className="chart-style-color-row"><PptColorPicker label="正文" ariaLabel="表格文字颜色" customAriaLabel="表格自定义文字颜色" color={css(style.color,"#334155")} kind="outline" onChange={value=>value&&onChange({color:value})}/><PptColorPicker label="表头文字" ariaLabel="表头文字颜色" customAriaLabel="表头自定义文字颜色" color={css(style.headerColor,"#173B67")} kind="outline" onChange={value=>value&&onChange({headerColor:value})}/><PptColorPicker label="表头底色" ariaLabel="表格表头颜色" customAriaLabel="表格自定义表头颜色" color={css(style.fill,"#DCEAF7")} kind="fill" onChange={value=>value&&onChange({fill:value})}/></div>
  <label className="check"><input aria-label="数值涨跌着色" type="checkbox" checked={directionColors} onChange={event=>onChange({valueColorMode:event.target.checked?"direction":"none",directionFields:undefined})}/>数值按涨跌着色</label>
  {directionColors&&<div className="chart-style-color-row"><PptColorPicker label="上升" ariaLabel="表格上升数值颜色" customAriaLabel="表格自定义上升数值颜色" color={css(style.positiveColor,"#16845B")} kind="outline" onChange={value=>value&&onChange({positiveColor:value})}/><PptColorPicker label="下降" ariaLabel="表格下降数值颜色" customAriaLabel="表格自定义下降数值颜色" color={css(style.negativeColor,"#C53B43")} kind="outline" onChange={value=>value&&onChange({negativeColor:value})}/></div>}
  <div className="chart-style-color-row"><PptColorPicker label="表格底色" ariaLabel="表格底色" customAriaLabel="表格自定义底色" color={css(style.bodyFill,"#FFFFFF")} kind="fill" onChange={value=>value&&onChange({bodyFill:value})}/><PptColorPicker label="隔行底色" ariaLabel="表格隔行底色" customAriaLabel="表格自定义隔行底色" color={css(style.bodyStripeFill,"#F8FAFC")} kind="fill" onChange={value=>value&&onChange({bodyStripeFill:value})}/></div>
  <label className="field">分隔方式<select aria-label="表格分隔方式" value={style.borderMode||"grid"} onChange={event=>onChange({borderMode:event.target.value})}><option value="grid">网格</option><option value="horizontal">仅横向分隔</option></select></label><div className="chart-style-grid"><PptColorPicker label="线条" ariaLabel="表格线条颜色" customAriaLabel="表格自定义线条颜色" color={css(style.line?.color,"#CBD5E1")} kind="outline" onChange={value=>value&&onChange({line:{...style.line,color:value}})}/><label className="field">线条粗细<input aria-label="表格线条粗细" type="number" min="0" max="12" step="0.5" value={style.line?.width??0.5} onChange={event=>onChange({line:{...style.line,width:Math.max(0,Math.min(12,Number(event.target.value)))}})}/></label></div>
 </section>;
}

function ShapeStylePanel({element,onChange}:{element:any;onChange:(patch:Record<string,any>)=>void}){
 const line=element.line??{};
 const connector=["line","elbow"].includes(element.shape);
 return <section className="property-section"><header className="ppt-format-title"><strong>设置形状格式</strong><span>形状选项</span></header><h4>形状样式</h4><PptFillLinePanel prefix={connector?"线条":"形状"} connector={connector} fill={element.fill} fillTransparency={element.fillTransparency??0} line={line} onChange={onChange}/></section>;
}

function ChartStylePanel({element,onChange}:{element:any;onChange:(patch:Record<string,any>)=>void}){
 const style=element.style??{};
 const paletteId=style.themeId||"corporate-blue",palette=(CHART_PALETTES as any)[paletteId]??CHART_PALETTES["corporate-blue"];
 const colors=(style.seriesColors?.length?style.seriesColors:palette.colors).map((value:string)=>value.startsWith("#")?value:`#${value}`);
 const updateColor=(index:number,value:string)=>{const next=[...colors];next[index]=value;onChange({seriesColors:next.map(color=>color.replace("#",""))})};
 const column=["comparison","stackedColumn","percentStackedColumn","combo"].includes(element.chartType);
 const line=["line","combo","area","scatter"].includes(element.chartType);
 return <section className="property-section chart-style-panel"><h4>图表样式</h4>
  <label className="field">图表配色<select aria-label="图表配色" value={paletteId} onChange={event=>onChange({themeId:event.target.value,seriesColors:undefined})}>{Object.entries(CHART_PALETTES).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}</select></label>
  <div className="chart-palette-preview" aria-label="当前图表配色">{colors.slice(0,4).map((value:string,index:number)=><span key={`${value}-${index}`} style={{background:value}}/>)}</div>
  <div className="chart-style-color-row"><PptColorPicker label="主系列" ariaLabel="主系列颜色" customAriaLabel="主系列自定义颜色" color={colors[0]} kind="outline" onChange={value=>value&&updateColor(0,value)}/><PptColorPicker label="次系列" ariaLabel="次系列颜色" customAriaLabel="次系列自定义颜色" color={colors[1]??colors[0]} kind="outline" onChange={value=>value&&updateColor(1,value)}/></div>
  <label className="field">字体<select aria-label="图表字体" value={style.fontFace||"SimHei"} onChange={event=>onChange({fontFace:event.target.value})}>{FONT_OPTIONS.map(option=><option key={option.id} value={option.id} style={{fontFamily:option.css}}>{option.label}</option>)}</select></label>
  <div className="chart-style-grid"><label className="field">图表文字大小<input aria-label="图表文字大小" type="number" min="8" max="24" value={style.fontSize??11} onChange={event=>onChange({fontSize:Number(event.target.value)})}/></label><label className="field">数据标签大小<input aria-label="数据标签大小" type="number" min="8" max="24" value={style.labelFontSize??10} onChange={event=>onChange({labelFontSize:Number(event.target.value)})}/></label></div>
  <div className="chart-style-color-row"><PptColorPicker label="文字" ariaLabel="图表文字颜色" customAriaLabel="图表自定义文字颜色" color={`#${String(style.labelColor??"475569").replace("#","")}`} kind="outline" onChange={value=>value&&onChange({labelColor:value.replace("#","")})}/><PptColorPicker label="网格线" ariaLabel="图表网格线颜色" customAriaLabel="图表自定义网格线颜色" color={`#${String(style.gridColor??"E2E8F0").replace("#","")}`} kind="outline" onChange={value=>value&&onChange({gridColor:value.replace("#","")})}/></div>
  <label className="check"><input aria-label="显示图表网格线" type="checkbox" checked={style.showGridlines!==false} onChange={event=>onChange({showGridlines:event.target.checked})}/>显示网格线</label>
  <label className="field range-field">绘图区高度 <span>{Math.round((style.plotHeight??1)*100)}%</span><input aria-label="绘图区高度" type="range" min="55" max="100" value={Math.round((style.plotHeight??1)*100)} onChange={event=>onChange({plotHeight:Number(event.target.value)/100})}/></label>
  {column&&<label className="field range-field">柱形粗细 <span>{Math.round((style.barThickness??.7)*100)}%</span><input aria-label="柱形粗细" type="range" min="25" max="95" value={Math.round((style.barThickness??.7)*100)} onChange={event=>onChange({barThickness:Number(event.target.value)/100})}/></label>}
  {line&&<div className="chart-style-grid"><label className="field">折线粗细<input aria-label="折线粗细" type="number" min="1" max="8" value={style.lineWidth??2} onChange={event=>onChange({lineWidth:Number(event.target.value)})}/></label><label className="field">数据点大小<input aria-label="数据点大小" type="number" min="0" max="12" value={style.markerSize??3} onChange={event=>onChange({markerSize:Number(event.target.value)})}/></label></div>}
 </section>;
}
