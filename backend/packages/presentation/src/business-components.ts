import type { DataSpec } from "./schema";
import type { Binding, CompiledElement, Rect, SlideElement } from "./types";
import { wrapText } from "./layout";

const TYPES = new Set([
  "kpiCards",
  "roadmap",
  "riskMatrix",
  "processFlow",
  "funnel",
  "multiWaterfall",
  "gantt",
  "mekko",
  "bubble",
  "regionMap",
  "hierarchy",
  "statusTable",
  "journeyMap",
  "decisionScorecard",
  "portfolioMatrix",
  "proposalFlow",
  "swotMatrix",
]);
const palette = ["2563EB", "0891B2", "7C3AED", "16A34A", "F59E0B", "DC2626", "64748B"];

type Result = { handled: boolean; elements: CompiledElement[]; error?: string };

export function compileBusinessComponent(
  element: SlideElement,
  rect: Rect,
  style: Record<string, any>,
  data: DataSpec,
  binding: Binding | undefined,
  fontFace: string,
): Result {
  if (!TYPES.has(element.type)) return { handled: false, elements: [] };
  const result = data.resultSets.find((item) => item.id === binding?.resultSetId);
  if (!result || !binding) return { handled: true, elements: [], error: "组件缺少有效数据绑定" };
  if (!result.rows.length) return { handled: true, elements: [], error: "组件数据为空" };
  const rows = result.rows.slice(0, Number(element.maxItems ?? 12));
  const role = (name: string) => {
    const value = binding.roles[name];
    return typeof value === "string" ? value : undefined;
  };
  const roles = (name: string) => {
    const value = binding.roles[name];
    return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  };
  const field = (id?: string) => result.fields.find((item) => item.id === id);
  const value = (row: Record<string, unknown>, id?: string) => id ? row[id] : undefined;
  const display = (row: Record<string, unknown>, id?: string) => {
    const raw = value(row, id);
    if (raw === null || raw === undefined || raw === "") return "—";
    const meta = field(id);
    if (meta && ["decimal", "integer"].includes(meta.type) && Number.isFinite(Number(raw))) {
      const n = Number(raw);
      const shown = meta.unit === "%" && Math.abs(n) <= 1 ? n * 100 : n;
      return `${shown.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}${meta.unit ?? ""}`;
    }
    return String(raw);
  };
  const fs = Number(style.fontSize ?? 13);
  const text = (
    id: string,
    box: Rect,
    content: string,
    size = fs,
    color = style.color ?? "172033",
    extra: Record<string, unknown> = {},
  ): CompiledElement => ({
    id,
    type: "text",
    rect: box,
    text: wrapText(content, Math.max(8, box.w), size).join("\n"),
    fontFace,
    fontSize: size,
    color,
    margin: 0,
    valign: "middle",
    ...extra,
  });
  const shape = (
    id: string,
    box: Rect,
    fill: string,
    shapeType: CompiledElement["shape"] = "roundRect",
    line = "FFFFFF",
  ): CompiledElement => ({ id, type: "shape", shape: shapeType, rect: box, fill, line: { color: line, width: 0.7 } });
  const line = (id: string, x: number, y: number, w: number, h: number, color = "94A3B8", width = 1): CompiledElement => ({
    id,
    type: "shape",
    shape: "line",
    rect: { x, y, w, h },
    line: { color, width },
  });
  const colorForStatus = (raw: unknown) => {
    const status = String(raw ?? "");
    if (/完成|正常|良好|达成|绿|赢/.test(status)) return "16A34A";
    if (/风险|阻塞|延期|红|失败/.test(status)) return "DC2626";
    if (/关注|进行|黄|待/.test(status)) return "F59E0B";
    return "64748B";
  };

  if (element.type === "kpiCards") {
    const label = role("label"), actual = role("value"), target = role("target"), trend = role("trend"), status = role("status");
    if (!label || !actual) return { handled: true, elements: [], error: "KPI 卡需要名称和值字段" };
    const columns = Math.min(4, Math.max(1, Number(element.columns ?? Math.min(4, rows.length))));
    const gap = 12, cardW = (rect.w - gap * (columns - 1)) / columns;
    const cardH = (rect.h - gap * (Math.ceil(rows.length / columns) - 1)) / Math.ceil(rows.length / columns);
    return { handled: true, elements: rows.flatMap((row, index) => {
      const col = index % columns, rowIndex = Math.floor(index / columns);
      const box = { x: rect.x + col * (cardW + gap), y: rect.y + rowIndex * (cardH + gap), w: cardW, h: cardH };
      const accent = colorForStatus(value(row, status));
      return [
        shape(`${element.id}-card-${index}`, box, "F8FAFC", "roundRect", "CBD5E1"),
        shape(`${element.id}-accent-${index}`, { x: box.x, y: box.y, w: 6, h: box.h }, accent, "rect", accent),
        text(`${element.id}-label-${index}`, { x: box.x + 16, y: box.y + 8, w: box.w - 28, h: 22 }, display(row, label), 12, "64748B"),
        text(`${element.id}-value-${index}`, { x: box.x + 16, y: box.y + 31, w: box.w - 28, h: 32 }, display(row, actual), 21, "172033", { bold: true }),
        text(`${element.id}-meta-${index}`, { x: box.x + 16, y: box.y + box.h - 40, w: box.w - 28, h: 32 }, `${target ? `目标 ${display(row, target)}` : ""}${trend ? `\n趋势 ${display(row, trend)}` : ""}`, 9, accent),
      ];
    }) };
  }

  if (element.type === "roadmap") {
    const label = role("label"), lane = role("lane"), period = role("period"), status = role("status");
    if (!label || !lane || !period) return { handled: true, elements: [], error: "路线图需要事项、泳道和阶段字段" };
    const periods = [...new Set(rows.map((row) => String(value(row, period))))];
    const lanes = [...new Set(rows.map((row) => String(value(row, lane))))];
    const left = 105, header = 34, colW = (rect.w - left) / periods.length, rowH = (rect.h - header) / lanes.length;
    const elements: CompiledElement[] = [];
    periods.forEach((item, index) => elements.push(text(`${element.id}-period-${index}`, { x: rect.x + left + index * colW, y: rect.y, w: colW, h: header }, item, 12, "475569", { bold: true, align: "center" })));
    lanes.forEach((item, laneIndex) => {
      const y = rect.y + header + laneIndex * rowH;
      elements.push(text(`${element.id}-lane-${laneIndex}`, { x: rect.x, y, w: left - 8, h: rowH }, item, 12, "475569", { bold: true }));
      elements.push(line(`${element.id}-lane-line-${laneIndex}`, rect.x + left, y + rowH, rect.w - left, 0, "E2E8F0"));
    });
    rows.forEach((row, index) => {
      const col = periods.indexOf(String(value(row, period))), laneIndex = lanes.indexOf(String(value(row, lane)));
      const box = { x: rect.x + left + col * colW + 6, y: rect.y + header + laneIndex * rowH + 8, w: colW - 12, h: rowH - 16 };
      const fill = colorForStatus(value(row, status));
      elements.push(shape(`${element.id}-item-${index}`, box, fill, "roundRect", fill));
      elements.push(text(`${element.id}-item-text-${index}`, { x: box.x + 6, y: box.y + 3, w: box.w - 12, h: box.h - 6 }, display(row, label), 10, "FFFFFF", { bold: true, align: "center" }));
    });
    return { handled: true, elements };
  }

  if (element.type === "riskMatrix") {
    const key = role("key"), label = role("label"), probability = role("probability"), impact = role("impact");
    if (!key || !label || !probability || !impact) return { handled: true, elements: [], error: "风险矩阵需要风险、概率和影响字段" };
    const axis = 34, cellW = (rect.w - axis) / 3, cellH = (rect.h - axis) / 3;
    const fills = [["DCFCE7", "FEF3C7", "FEE2E2"], ["DCFCE7", "FEF3C7", "FEE2E2"], ["FEF3C7", "FEE2E2", "FECACA"]];
    const elements: CompiledElement[] = [];
    for (let p = 1; p <= 3; p++) for (let i = 1; i <= 3; i++) {
      const box = { x: rect.x + axis + (i - 1) * cellW, y: rect.y + (3 - p) * cellH, w: cellW, h: cellH };
      elements.push(shape(`${element.id}-cell-${p}-${i}`, box, fills[p - 1][i - 1], "rect", "FFFFFF"));
    }
    elements.push(text(`${element.id}-impact`, { x: rect.x + axis, y: rect.y + rect.h - axis, w: rect.w - axis, h: axis }, "影响  低                         高", 10, "64748B", { align: "center" }));
    elements.push(text(`${element.id}-probability`, { x: rect.x, y: rect.y, w: axis, h: rect.h - axis }, "高\n\n概率\n\n低", 10, "64748B", { align: "center" }));
    rows.forEach((row, index) => {
      const p = Math.min(3, Math.max(1, Number(value(row, probability)))), i = Math.min(3, Math.max(1, Number(value(row, impact))));
      const cx = rect.x + axis + (i - .5) * cellW + ((index % 2) * 18 - 9), cy = rect.y + (3 - p + .5) * cellH + (Math.floor(index / 2) * 12 - 6);
      elements.push(shape(`${element.id}-point-${index}`, { x: cx - 13, y: cy - 13, w: 26, h: 26 }, "172033", "ellipse", "FFFFFF"));
      elements.push(text(`${element.id}-point-text-${index}`, { x: cx - 13, y: cy - 13, w: 26, h: 26 }, display(row, key), 9, "FFFFFF", { bold: true, align: "center" }));
    });
    return { handled: true, elements };
  }

  if (element.type === "processFlow") {
    const label = role("label"), owner = role("owner"), output = role("output"), sort = role("sort");
    if (!label) return { handled: true, elements: [], error: "业务流程需要步骤字段" };
    const ordered = [...rows].sort((a, b) => Number(value(a, sort)) - Number(value(b, sort)));
    const gap = 20, width = (rect.w - gap * (ordered.length - 1)) / ordered.length;
    return { handled: true, elements: ordered.flatMap((row, index) => {
      const box = { x: rect.x + index * (width + gap), y: rect.y + 58, w: width, h: rect.h - 58 };
      const accent = ["2458A6", "3277C8", "168E96", "167567"][index % 4];
      return [
        ...(index < ordered.length - 1 ? [line(`${element.id}-track-${index}`, box.x + width / 2, rect.y + 25, width + gap, 0, "B8C8DC", 2)] : []),
        shape(`${element.id}-number-bg-${index}`, { x: box.x + width / 2 - 25, y: rect.y, w: 50, h: 50 }, accent, "ellipse", accent),
        text(`${element.id}-number-${index}`, { x: box.x + width / 2 - 25, y: rect.y, w: 50, h: 50 }, `0${index + 1}`, 13, "FFFFFF", { bold: true, align: "center" }),
        shape(`${element.id}-box-${index}`, box, "FFFFFF", "rect", "D8E2EE"),
        shape(`${element.id}-accent-${index}`, { x: box.x, y: box.y, w: 5, h: box.h }, accent, "rect", accent),
        text(`${element.id}-label-${index}`, { x: box.x + 16, y: box.y + 14, w: box.w - 28, h: 30 }, display(row, label), 15, "102B57", { bold: true }),
        text(`${element.id}-owner-label-${index}`, { x: box.x + 16, y: box.y + 54, w: 44, h: 18 }, "负责", 9, "7B8DA5", { bold: true }),
        text(`${element.id}-owner-${index}`, { x: box.x + 62, y: box.y + 54, w: box.w - 76, h: 18 }, owner ? display(row, owner) : "—", 10, "29466F", { bold: true }),
        text(`${element.id}-output-label-${index}`, { x: box.x + 16, y: box.y + 78, w: 44, h: 18 }, "产出", 9, "7B8DA5", { bold: true }),
        text(`${element.id}-output-${index}`, { x: box.x + 62, y: box.y + 78, w: box.w - 76, h: 20 }, output ? display(row, output) : "—", 10, "29466F", { bold: true }),
      ];
    }) };
  }

  if (element.type === "journeyMap") {
    const stage = role("stage"), goal = role("goal"), pain = role("pain"), opportunity = role("opportunity");
    if (!stage || !goal || !pain || !opportunity) return { handled: true, elements: [], error: "客户旅程需要阶段、目标、痛点和机会字段" };
    const gap = 14, width = (rect.w - gap * (rows.length - 1)) / rows.length;
    const elements: CompiledElement[] = [];
    rows.forEach((row, index) => {
      const x = rect.x + index * (width + gap), accent = ["315C93", "4C86D7", "E6A100", "168E96"][index % 4];
      if (index < rows.length - 1) elements.push(line(`${element.id}-track-${index}`, x + width / 2, rect.y + 24, width + gap, 0, "CBD8E8", 2));
      elements.push(shape(`${element.id}-stage-${index}`, { x, y: rect.y + 50, w: width, h: rect.h - 50 }, "FFFFFF", "roundRect", "D8E2EE"));
      elements.push(shape(`${element.id}-node-${index}`, { x: x + width / 2 - 23, y: rect.y, w: 46, h: 46 }, accent, "ellipse", accent));
      elements.push(text(`${element.id}-number-${index}`, { x: x + width / 2 - 23, y: rect.y, w: 46, h: 46 }, `0${index + 1}`, 12, "FFFFFF", { bold: true, align: "center" }));
      elements.push(text(`${element.id}-name-${index}`, { x: x + 16, y: rect.y + 66, w: width - 32, h: 26 }, display(row, stage), 16, "102B57", { bold: true, align: "center" }));
      elements.push(shape(`${element.id}-rule-${index}`, { x: x + width / 2 - 22, y: rect.y + 98, w: 44, h: 2 }, accent, "rect", accent));
      const blocks = [["客户目标", goal, "F4F7FB", "29466F"], ["关键痛点", pain, "FFF4F2", "B2473E"], ["改进机会", opportunity, "EEF9F6", "167567"]] as const;
      blocks.forEach(([label, fieldId, fill, color], blockIndex) => {
        const y = rect.y + 112 + blockIndex * 62;
        elements.push(shape(`${element.id}-block-${index}-${blockIndex}`, { x: x + 12, y, w: width - 24, h: 54 }, fill, "roundRect", fill));
        elements.push(text(`${element.id}-block-label-${index}-${blockIndex}`, { x: x + 22, y: y + 6, w: width - 44, h: 15 }, label, 8, "7B8DA5", { bold: true }));
        elements.push(text(`${element.id}-block-value-${index}-${blockIndex}`, { x: x + 22, y: y + 21, w: width - 44, h: 28 }, display(row, fieldId), 10, color, { bold: true }));
      });
    });
    return { handled: true, elements };
  }

  if (element.type === "decisionScorecard") {
    const option = role("option"), total = role("total"), criteria = roles("criteria");
    if (!option || !total || !criteria.length) return { handled: true, elements: [], error: "决策评分需要方案、评价维度和总分字段" };
    const totals = rows.map(row => Number(value(row, total))), winner = totals.indexOf(Math.max(...totals));
    const labelW = 150, totalW = 82, headerH = 34, rowH = (rect.h - headerH) / rows.length, criteriaW = (rect.w - labelW - totalW) / criteria.length;
    const elements: CompiledElement[] = [text(`${element.id}-option-header`, { x: rect.x + 14, y: rect.y, w: labelW - 14, h: headerH }, "候选方案", 10, "7B8DA5", { bold: true })];
    criteria.forEach((fieldId, index) => elements.push(text(`${element.id}-criterion-header-${index}`, { x: rect.x + labelW + index * criteriaW, y: rect.y, w: criteriaW, h: headerH }, field(fieldId)?.name ?? fieldId, 10, "7B8DA5", { bold: true, align: "center" })));
    elements.push(text(`${element.id}-total-header`, { x: rect.x + rect.w - totalW, y: rect.y, w: totalW, h: headerH }, "加权总分", 10, "7B8DA5", { bold: true, align: "center" }));
    rows.forEach((row, rowIndex) => {
      const y = rect.y + headerH + rowIndex * rowH, active = rowIndex === winner, bg = active ? "EDF7F4" : rowIndex % 2 ? "F7F9FC" : "FFFFFF";
      elements.push(shape(`${element.id}-option-${rowIndex}`, { x: rect.x, y: y + 4, w: rect.w, h: rowH - 8 }, bg, "roundRect", active ? "8BC8BA" : bg));
      elements.push(shape(`${element.id}-option-accent-${rowIndex}`, { x: rect.x, y: y + 4, w: active ? 5 : 2, h: rowH - 8 }, active ? "168E96" : "D8E2EE", "rect", active ? "168E96" : "D8E2EE"));
      elements.push(text(`${element.id}-option-name-${rowIndex}`, { x: rect.x + 16, y, w: labelW - 20, h: rowH }, `${active ? "推荐  " : ""}${display(row, option)}`, 12, active ? "167567" : "29466F", { bold: true }));
      criteria.forEach((fieldId, criterionIndex) => {
        const score = Math.max(0, Math.min(10, Number(value(row, fieldId))));
        const x = rect.x + labelW + criterionIndex * criteriaW + 16, barW = criteriaW - 32;
        elements.push(shape(`${element.id}-score-track-${rowIndex}-${criterionIndex}`, { x, y: y + rowH / 2 - 4, w: barW, h: 8 }, "E3EAF2", "roundRect", "E3EAF2"));
        elements.push(shape(`${element.id}-score-${rowIndex}-${criterionIndex}`, { x, y: y + rowH / 2 - 4, w: barW * score / 10, h: 8 }, active ? "168E96" : "4C86D7", "roundRect", active ? "168E96" : "4C86D7"));
        elements.push(text(`${element.id}-score-value-${rowIndex}-${criterionIndex}`, { x, y: y + 8, w: barW, h: 16 }, score.toFixed(1), 9, "5B6F88", { align: "center" }));
      });
      elements.push(text(`${element.id}-total-${rowIndex}`, { x: rect.x + rect.w - totalW, y, w: totalW, h: rowH }, display(row, total), 18, active ? "167567" : "102B57", { bold: true, align: "center" }));
    });
    return { handled: true, elements };
  }

  if (element.type === "portfolioMatrix") {
    const label = role("label"), xField = role("x"), yField = role("y"), decision = role("decision");
    if (!label || !xField || !yField) return { handled: true, elements: [], error: "组合矩阵需要项目、成本和影响字段" };
    const axis = 44, plot = { x: rect.x + axis, y: rect.y + 14, w: rect.w - axis - 12, h: rect.h - axis - 14 }, splitX = plot.x + plot.w / 2, splitY = plot.y + plot.h / 2;
    const elements: CompiledElement[] = [
      shape(`${element.id}-q1`, { x: plot.x, y: plot.y, w: plot.w / 2, h: plot.h / 2 }, "EAF6F3", "rect", "FFFFFF"),
      shape(`${element.id}-q2`, { x: splitX, y: plot.y, w: plot.w / 2, h: plot.h / 2 }, "EFF4FA", "rect", "FFFFFF"),
      shape(`${element.id}-q3`, { x: plot.x, y: splitY, w: plot.w / 2, h: plot.h / 2 }, "F7F9FC", "rect", "FFFFFF"),
      shape(`${element.id}-q4`, { x: splitX, y: splitY, w: plot.w / 2, h: plot.h / 2 }, "FFF7EE", "rect", "FFFFFF"),
      text(`${element.id}-q1-label`, { x: plot.x + 12, y: plot.y + 8, w: 140, h: 20 }, "优先投入", 11, "167567", { bold: true }),
      text(`${element.id}-q2-label`, { x: splitX + 12, y: plot.y + 8, w: 140, h: 20 }, "分期实施", 11, "315C93", { bold: true }),
      text(`${element.id}-q3-label`, { x: plot.x + 12, y: splitY + 8, w: 140, h: 20 }, "快速验证", 11, "5B6F88", { bold: true }),
      text(`${element.id}-q4-label`, { x: splitX + 12, y: splitY + 8, w: 140, h: 20 }, "暂缓", 11, "A45C12", { bold: true }),
      text(`${element.id}-y-label`, { x: rect.x, y: plot.y, w: axis - 8, h: plot.h }, "高\n\n业\n务\n影\n响\n\n低", 8, "7B8DA5", { bold: true, align: "center" }),
      text(`${element.id}-x-label`, { x: plot.x, y: plot.y + plot.h + 8, w: plot.w, h: 24 }, "实施成本    低                                      高", 9, "7B8DA5", { bold: true, align: "center" }),
    ];
    rows.forEach((row, index) => {
      const xScore = Math.max(0, Math.min(10, Number(value(row, xField)))), yScore = Math.max(0, Math.min(10, Number(value(row, yField))));
      const cx = plot.x + (xScore / 10) * plot.w, cy = plot.y + plot.h - (yScore / 10) * plot.h;
      const status = String(value(row, decision) ?? ""), accent = /优先|快速/.test(status) ? "168E96" : /分期/.test(status) ? "4C86D7" : "D8872D";
      elements.push(shape(`${element.id}-point-${index}`, { x: cx - 8, y: cy - 8, w: 16, h: 16 }, accent, "ellipse", "FFFFFF"));
      elements.push(text(`${element.id}-point-label-${index}`, { x: Math.min(plot.x + plot.w - 118, cx + 10), y: Math.max(plot.y + 28, cy - 15), w: 108, h: 30 }, `${display(row, label)}\n${decision ? display(row, decision) : ""}`, 9, "29466F", { bold: true }));
    });
    return { handled: true, elements };
  }

  if (element.type === "proposalFlow") {
    const section = role("section"), message = role("message"), evidence = role("evidence");
    if (!section || !message || !evidence) return { handled: true, elements: [], error: "销售提案需要模块、核心信息和证据字段" };
    const gap = 16, width = (rect.w - gap * (rows.length - 1)) / rows.length;
    const accents = ["C85C5C", "4C86D7", "168E96", "D39A1A"];
    const elements: CompiledElement[] = [];
    rows.forEach((row, index) => {
      const x = rect.x + index * (width + gap), accent = accents[index % accents.length];
      if (index < rows.length - 1) elements.push(line(`${element.id}-arrow-${index}`, x + width, rect.y + 48, gap, 0, "AFC0D3", 2));
      elements.push(shape(`${element.id}-step-${index}`, { x, y: rect.y, w: width, h: rect.h }, "FFFFFF", "roundRect", "D8E2EE"));
      elements.push(shape(`${element.id}-accent-${index}`, { x, y: rect.y, w: width, h: 7 }, accent, "rect", accent));
      elements.push(text(`${element.id}-index-${index}`, { x: x + 16, y: rect.y + 22, w: 34, h: 28 }, `0${index + 1}`, 18, accent, { bold: true }));
      elements.push(text(`${element.id}-section-${index}`, { x: x + 16, y: rect.y + 58, w: width - 32, h: 30 }, display(row, section), 16, "102B57", { bold: true }));
      elements.push(text(`${element.id}-message-${index}`, { x: x + 16, y: rect.y + 98, w: width - 32, h: 66 }, display(row, message), 12, "29466F", { bold: true }));
      elements.push(shape(`${element.id}-evidence-bg-${index}`, { x: x + 12, y: rect.y + rect.h - 80, w: width - 24, h: 66 }, "F4F7FB", "roundRect", "F4F7FB"));
      elements.push(text(`${element.id}-evidence-label-${index}`, { x: x + 22, y: rect.y + rect.h - 72, w: width - 44, h: 15 }, "支撑证据", 8, "7B8DA5", { bold: true }));
      elements.push(text(`${element.id}-evidence-${index}`, { x: x + 22, y: rect.y + rect.h - 55, w: width - 44, h: 35 }, display(row, evidence), 9, "5B6F88", { bold: true }));
    });
    return { handled: true, elements };
  }

  if (element.type === "swotMatrix") {
    const quadrant = role("quadrant"), item = role("item"), priority = role("priority");
    if (!quadrant || !item) return { handled: true, elements: [], error: "SWOT 矩阵需要象限和分析要点字段" };
    const gap = 12, width = (rect.w - gap) / 2, height = (rect.h - gap) / 2;
    const letters = ["S", "W", "O", "T"], fills = ["EAF6F3", "FFF2F0", "EFF4FA", "FFF7E8"], accents = ["168E96", "C85C5C", "4C86D7", "D39A1A"];
    return { handled: true, elements: rows.slice(0, 4).flatMap((row, index) => {
      const x = rect.x + (index % 2) * (width + gap), y = rect.y + Math.floor(index / 2) * (height + gap), accent = accents[index], box = { x, y, w: width, h: height };
      return [
        shape(`${element.id}-quadrant-${index}`, box, fills[index], "roundRect", fills[index]),
        text(`${element.id}-letter-${index}`, { x: x + 18, y: y + 16, w: 46, h: 50 }, letters[index], 34, accent, { bold: true, align: "center" }),
        text(`${element.id}-name-${index}`, { x: x + 76, y: y + 16, w: width - 94, h: 24 }, display(row, quadrant), 14, "102B57", { bold: true }),
        text(`${element.id}-item-${index}`, { x: x + 76, y: y + 46, w: width - 94, h: height - 62 }, display(row, item), 12, "29466F", { bold: true }),
        ...(priority ? [text(`${element.id}-priority-${index}`, { x: x + width - 64, y: y + height - 26, w: 48, h: 16 }, `${display(row, priority)}优先级`, 8, accent, { bold: true, align: "right" })] : []),
      ];
    }) };
  }

  if (element.type === "funnel") {
    const label = role("label"), amount = role("value"), conversion = role("conversion"), owner = role("owner");
    if (!label || !amount) return { handled: true, elements: [], error: "漏斗需要阶段和值字段" };
    const max = Math.max(...rows.map((row) => Math.abs(Number(value(row, amount))))), gap = 5, height = (rect.h - gap * (rows.length - 1)) / rows.length;
    return { handled: true, elements: rows.flatMap((row, index) => {
      const ratio = max ? Math.max(.34, Math.abs(Number(value(row, amount))) / max) : 1;
      const width = rect.w * ratio, box = { x: rect.x + (rect.w - width) / 2, y: rect.y + index * (height + gap), w: width, h: height };
      const fill = palette[index % palette.length];
      return [shape(`${element.id}-stage-${index}`, box, fill, "roundRect", fill), text(`${element.id}-stage-text-${index}`, { x: box.x + 8, y: box.y, w: box.w - 16, h: box.h }, `${display(row, label)}  ${display(row, amount)}${conversion ? `  ·  ${display(row, conversion)}` : ""}${owner ? `  ·  ${display(row, owner)}` : ""}`, 11, "FFFFFF", { bold: true, align: "center" })];
    }) };
  }

  if (element.type === "multiWaterfall") {
    const label = role("label"), kind = role("kind"), sort = role("sort"), series = roles("series");
    if (!label || !kind || !series.length) return { handled: true, elements: [], error: "多系列利润桥需要步骤、类型和数值序列" };
    const ordered = [...rows].sort((a, b) => Number(value(a, sort)) - Number(value(b, sort)));
    const totals = ordered.map((row) => series.reduce((sum, fieldId) => sum + Number(value(row, fieldId) ?? 0), 0));
    let running = 0;
    const levels = ordered.map((row, index) => {
      const total = totals[index];
      if (String(value(row, kind)) === "total") { running = total; return { from: 0, to: running }; }
      const from = running; running += total; return { from, to: running };
    });
    const numbers = levels.flatMap((item) => [item.from, item.to]), min = Math.min(0, ...numbers), max = Math.max(1, ...numbers), span = max - min;
    const plot = { x: rect.x + 38, y: rect.y + 12, w: rect.w - 48, h: rect.h - 54 }, dx = plot.w / ordered.length;
    const y = (n: number) => plot.y + plot.h - ((n - min) / span) * plot.h;
    const elements: CompiledElement[] = [];
    ordered.forEach((row, index) => {
      const level = levels[index], total = totals[index], positive = total >= 0;
      let cursor = String(value(row, kind)) === "total" ? 0 : level.from;
      series.forEach((fieldId, seriesIndex) => {
        const amount = Number(value(row, fieldId) ?? 0), next = cursor + amount;
        const top = Math.min(y(cursor), y(next)), height = Math.max(1, Math.abs(y(cursor) - y(next)));
        elements.push(shape(`${element.id}-bar-${index}-${seriesIndex}`, { x: plot.x + index * dx + dx * .2, y: top, w: dx * .58, h: height }, positive ? palette[seriesIndex % 4] : "DC2626", "rect", "FFFFFF"));
        cursor = next;
      });
      elements.push(text(`${element.id}-label-${index}`, { x: plot.x + index * dx, y: plot.y + plot.h + 5, w: dx, h: 34 }, display(row, label), 9, "475569", { align: "center" }));
      elements.push(text(`${element.id}-value-${index}`, { x: plot.x + index * dx, y: Math.min(y(level.from), y(level.to)) - 18, w: dx, h: 16 }, total.toLocaleString("zh-CN"), 9, positive ? "166534" : "B91C1C", { align: "center" }));
      if (index < ordered.length - 1) elements.push(line(`${element.id}-connector-${index}`, plot.x + index * dx + dx * .78, y(level.to), dx * .42, 0, "94A3B8"));
    });
    return { handled: true, elements };
  }

  if (element.type === "gantt") {
    const label = role("label"), start = role("start"), end = role("end"), owner = role("owner"), status = role("status"), milestone = role("milestone");
    if (!label || !start || !end) return { handled: true, elements: [], error: "甘特图需要任务、开始和结束日期" };
    const parsed = rows.map((row) => ({ row, start: Date.parse(String(value(row, start))), end: Date.parse(String(value(row, end))) }));
    if (parsed.some((item) => !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end < item.start)) return { handled: true, elements: [], error: "甘特图日期范围无效" };
    const min = Math.min(...parsed.map((item) => item.start)), max = Math.max(...parsed.map((item) => item.end)), span = Math.max(86400000, max - min);
    const left = 180, header = 30, rowH = (rect.h - header) / parsed.length, timelineW = rect.w - left;
    const elements: CompiledElement[] = [text(`${element.id}-header`, { x: rect.x + left, y: rect.y, w: timelineW, h: header }, `${new Date(min).toLocaleDateString("zh-CN")}  —  ${new Date(max).toLocaleDateString("zh-CN")}`, 10, "64748B", { align: "center" })];
    parsed.forEach((item, index) => {
      const y = rect.y + header + index * rowH, x = rect.x + left + ((item.start - min) / span) * timelineW, width = Math.max(8, ((item.end - item.start) / span) * timelineW);
      elements.push(text(`${element.id}-task-${index}`, { x: rect.x, y, w: left - 10, h: rowH }, `${display(item.row, label)}${owner ? ` · ${display(item.row, owner)}` : ""}`, 10, "172033", { bold: true }));
      elements.push(line(`${element.id}-grid-${index}`, rect.x + left, y + rowH, timelineW, 0, "E2E8F0"));
      if (milestone && /true|1|是|里程碑/.test(String(value(item.row, milestone)))) elements.push(shape(`${element.id}-milestone-${index}`, { x: x - 6, y: y + rowH / 2 - 6, w: 12, h: 12 }, colorForStatus(value(item.row, status)), "diamond"));
      else elements.push(shape(`${element.id}-bar-${index}`, { x, y: y + rowH * .27, w: width, h: rowH * .46 }, colorForStatus(value(item.row, status)), "roundRect"));
    });
    return { handled: true, elements };
  }

  if (element.type === "mekko") {
    const category = role("category"), segment = role("segment"), amount = role("value");
    if (!category || !segment || !amount) return { handled: true, elements: [], error: "Mekko 需要类别、细分和值字段" };
    const categories = [...new Set(rows.map((row) => String(value(row, category))))], grand = rows.reduce((sum, row) => sum + Math.max(0, Number(value(row, amount))), 0);
    const elements: CompiledElement[] = [];
    let x = rect.x;
    categories.forEach((categoryName, categoryIndex) => {
      const categoryRows = rows.filter((row) => String(value(row, category)) === categoryName), total = categoryRows.reduce((sum, row) => sum + Math.max(0, Number(value(row, amount))), 0), width = grand ? rect.w * total / grand : rect.w / categories.length;
      let y = rect.y;
      categoryRows.forEach((row, segmentIndex) => {
        const height = total ? (rect.h - 26) * Math.max(0, Number(value(row, amount))) / total : 0;
        const box = { x, y, w: width, h: height };
        elements.push(shape(`${element.id}-cell-${categoryIndex}-${segmentIndex}`, box, palette[segmentIndex % palette.length], "rect", "FFFFFF"));
        if (height > 24 && width > 55) elements.push(text(`${element.id}-cell-text-${categoryIndex}-${segmentIndex}`, { x: x + 4, y: y + 3, w: width - 8, h: height - 6 }, `${display(row, segment)}\n${display(row, amount)}`, 9, "FFFFFF", { bold: true, align: "center" }));
        y += height;
      });
      elements.push(text(`${element.id}-category-${categoryIndex}`, { x, y: rect.y + rect.h - 24, w: width, h: 22 }, categoryName, 10, "475569", { bold: true, align: "center" }));
      x += width;
    });
    return { handled: true, elements };
  }

  if (element.type === "bubble") {
    const label = role("label"), xField = role("x"), yField = role("y"), size = role("size"), group = role("group");
    if (!label || !xField || !yField || !size) return { handled: true, elements: [], error: "气泡图需要标签、X、Y 和规模字段" };
    const xs = rows.map((row) => Number(value(row, xField))), ys = rows.map((row) => Number(value(row, yField))), sizes = rows.map((row) => Math.max(0, Number(value(row, size))));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), maxSize = Math.max(1, ...sizes);
    const plot = { x: rect.x + 38, y: rect.y + 10, w: rect.w - 48, h: rect.h - 42 }, groups = [...new Set(rows.map((row) => String(value(row, group))))];
    const elements: CompiledElement[] = [line(`${element.id}-x-axis`, plot.x, plot.y + plot.h, plot.w, 0), line(`${element.id}-y-axis`, plot.x, plot.y, 0, plot.h)];
    rows.forEach((row, index) => {
      const diameter = 24 + 42 * Math.sqrt(sizes[index] / maxSize), cx = plot.x + ((xs[index] - minX) / Math.max(1e-9, maxX - minX)) * plot.w, cy = plot.y + plot.h - ((ys[index] - minY) / Math.max(1e-9, maxY - minY)) * plot.h;
      const color = palette[Math.max(0, groups.indexOf(String(value(row, group)))) % palette.length];
      elements.push(shape(`${element.id}-bubble-${index}`, { x: cx - diameter / 2, y: cy - diameter / 2, w: diameter, h: diameter }, color, "ellipse", "FFFFFF"));
      elements.push(text(`${element.id}-bubble-label-${index}`, { x: cx - diameter / 2, y: cy - 11, w: diameter, h: 22 }, display(row, label), 9, "FFFFFF", { bold: true, align: "center" }));
    });
    return { handled: true, elements };
  }

  if (element.type === "regionMap") {
    const region = role("region"), amount = role("value"), status = role("status");
    if (!region || !amount) return { handled: true, elements: [], error: "区域图需要区域和值字段" };
    if (style.variant === "executive") {
      const values = rows.map(row => Number(value(row, amount))), max = Math.max(1, ...values), total = values.reduce((sum, current) => sum + current, 0);
      const map = { x: rect.x, y: rect.y + 12, w: rect.w * .61, h: rect.h - 24 }, ranking = { x: rect.x + rect.w * .68, y: rect.y, w: rect.w * .32, h: rect.h };
      const placements = [
        { x: .43, y: .10, w: .34, h: .27 }, { x: .52, y: .40, w: .37, h: .25 }, { x: .24, y: .13, w: .25, h: .27 },
        { x: .31, y: .42, w: .25, h: .26 }, { x: .05, y: .38, w: .29, h: .32 },
      ];
      const elements: CompiledElement[] = [
        text(`${element.id}-total-label`, { x: ranking.x, y: ranking.y, w: ranking.w, h: 18 }, "区域收入合计", 9, "7B8DA5", { bold: true }),
        text(`${element.id}-total`, { x: ranking.x, y: ranking.y + 18, w: ranking.w, h: 38 }, total.toLocaleString("zh-CN") + (field(amount)?.unit ?? ""), 23, "102B57", { bold: true }),
        text(`${element.id}-rank-label`, { x: ranking.x, y: ranking.y + 70, w: ranking.w, h: 18 }, "区域贡献", 10, "5B6F88", { bold: true }),
      ];
      rows.forEach((row, index) => {
        const placement = placements[index] ?? { x: .1 + (index % 3) * .3, y: .1 + Math.floor(index / 3) * .4, w: .26, h: .28 };
        const level = Math.min(4, Math.floor((values[index] / max) * 4)), fill = ["EDF3FA", "D7E7F8", "9EC5EF", "4C86D7", "2458A6"][level];
        const box = { x: map.x + map.w * placement.x, y: map.y + map.h * placement.y, w: map.w * placement.w, h: map.h * placement.h };
        elements.push(shape(`${element.id}-region-${index}`, box, fill, "roundRect", "FFFFFF"));
        elements.push(text(`${element.id}-region-text-${index}`, { x: box.x + 8, y: box.y + 6, w: box.w - 16, h: box.h - 12 }, `${display(row, region)}\n${display(row, amount)}\n${status ? display(row, status) : ""}`, 10, level >= 3 ? "FFFFFF" : "29466F", { bold: true, align: "center" }));
        const rowY = ranking.y + 101 + index * 40, barWidth = ranking.w - 78;
        elements.push(text(`${element.id}-rank-name-${index}`, { x: ranking.x, y: rowY, w: 54, h: 20 }, display(row, region), 9, "29466F", { bold: true }));
        elements.push(shape(`${element.id}-rank-track-${index}`, { x: ranking.x + 58, y: rowY + 5, w: barWidth, h: 8 }, "E3EAF2", "roundRect", "E3EAF2"));
        elements.push(shape(`${element.id}-rank-bar-${index}`, { x: ranking.x + 58, y: rowY + 5, w: barWidth * values[index] / max, h: 8 }, fill, "roundRect", fill));
        elements.push(text(`${element.id}-rank-value-${index}`, { x: ranking.x + 58, y: rowY + 15, w: barWidth, h: 14 }, display(row, amount), 8, "7B8DA5", { align: "right" }));
      });
      return { handled: true, elements };
    }
    const columns = Math.min(3, rows.length), gap = 10, width = (rect.w - gap * (columns - 1)) / columns, height = (rect.h - gap * (Math.ceil(rows.length / columns) - 1)) / Math.ceil(rows.length / columns), values = rows.map((row) => Number(value(row, amount))), max = Math.max(1, ...values);
    return { handled: true, elements: rows.flatMap((row, index) => {
      const box = { x: rect.x + (index % columns) * (width + gap), y: rect.y + Math.floor(index / columns) * (height + gap), w: width, h: height };
      const level = Math.min(4, Math.floor((values[index] / max) * 4)), fill = ["EFF6FF", "DBEAFE", "93C5FD", "3B82F6", "1D4ED8"][level];
      return [shape(`${element.id}-region-${index}`, box, fill, "roundRect", "FFFFFF"), text(`${element.id}-region-text-${index}`, { x: box.x + 8, y: box.y + 8, w: box.w - 16, h: box.h - 16 }, `${display(row, region)}\n${display(row, amount)}${status ? `\n${display(row, status)}` : ""}`, 12, level >= 3 ? "FFFFFF" : "172033", { bold: true, align: "center" })];
    }) };
  }

  if (element.type === "hierarchy") {
    const key = role("key"), label = role("label"), parent = role("parent"), subtitle = role("subtitle");
    if (!key || !label || !parent) return { handled: true, elements: [], error: "层级图需要节点、名称和父节点字段" };
    const byKey = new Map(rows.map((row) => [String(value(row, key)), row]));
    const levelOf = (row: Record<string, unknown>) => { let level = 0, cursor = String(value(row, parent) ?? ""); const visited = new Set<string>(); while (cursor && byKey.has(cursor) && !visited.has(cursor)) { visited.add(cursor); level++; cursor = String(value(byKey.get(cursor)!, parent) ?? ""); } return level; };
    if (style.variant === "decision" && style.orientation === "vertical") {
      const levels = rows.map(levelOf), maxLevel = Math.max(...levels), levelH = rect.h / (maxLevel + 1), elements: CompiledElement[] = [];
      const boxes = new Map<string, Rect>();
      for (let level = 0; level <= maxLevel; level++) {
        const peers = rows.filter(row => levelOf(row) === level), gap = 18;
        const width = Math.min(220, (rect.w - gap * Math.max(0, peers.length - 1)) / Math.max(1, peers.length));
        const boxH = Math.max(46, Math.min(66, levelH - 22));
        const rowWidth = peers.length * width + Math.max(0, peers.length - 1) * gap;
        peers.forEach((row, peerIndex) => boxes.set(String(value(row, key)), {
          x: rect.x + (rect.w - rowWidth) / 2 + peerIndex * (width + gap),
          y: rect.y + level * levelH + (levelH - boxH) / 2,
          w: width,
          h: boxH,
        }));
      }
      rows.forEach((row, index) => {
        const box = boxes.get(String(value(row, key)))!, parentId = String(value(row, parent) ?? ""), level = levels[index];
        if (parentId && boxes.has(parentId)) {
          const parentBox = boxes.get(parentId)!, startX = parentBox.x + parentBox.w / 2, startY = parentBox.y + parentBox.h, endX = box.x + box.w / 2, endY = box.y, middleY = (startY + endY) / 2;
          elements.push(line(`${element.id}-link-a-${index}`, startX, startY, 0, middleY - startY, "AFC0D3", 1.3));
          elements.push(line(`${element.id}-link-b-${index}`, Math.min(startX, endX), middleY, Math.abs(endX - startX), 0, "AFC0D3", 1.3));
          elements.push(line(`${element.id}-link-c-${index}`, endX, middleY, 0, endY - middleY, "AFC0D3", 1.3));
        }
        const fill = level === 0 ? "2458A6" : level === maxLevel ? "EEF7F4" : "F1F5FA", outline = level === 0 ? "2458A6" : level === maxLevel ? "8BC8BA" : "C5D4E5", color = level === 0 ? "FFFFFF" : "102B57";
        elements.push(shape(`${element.id}-node-${index}`, box, fill, "roundRect", outline));
        elements.push(text(`${element.id}-node-text-${index}`, { x: box.x + 12, y: box.y + 7, w: box.w - 24, h: box.h - 14 }, `${display(row, label)}${subtitle ? `\n${display(row, subtitle)}` : ""}`, level === 0 ? 12 : 10, color, { bold: true, align: "center" }));
      });
      return { handled: true, elements };
    }
    if (style.variant === "decision") {
      const levels = rows.map(levelOf), maxLevel = Math.max(...levels), columnW = rect.w / (maxLevel + 1), elements: CompiledElement[] = [];
      const boxes = new Map<string, Rect>();
      for (let level = 0; level <= maxLevel; level++) {
        const peers = rows.filter(row => levelOf(row) === level), boxH = Math.min(88, (rect.h - 24 - (peers.length - 1) * 22) / peers.length);
        peers.forEach((row, peerIndex) => {
          const width = Math.max(88, Math.min(236, columnW - 54)), x = rect.x + level * columnW + (columnW - width) / 2, y = rect.y + 12 + peerIndex * (boxH + 22) + (rect.h - 24 - (peers.length * boxH + (peers.length - 1) * 22)) / 2;
          boxes.set(String(value(row, key)), { x, y, w: width, h: boxH });
        });
      }
      rows.forEach((row, index) => {
        const box = boxes.get(String(value(row, key)))!, parentId = String(value(row, parent) ?? ""), level = levelOf(row);
        if (parentId && boxes.has(parentId)) {
          const parentBox = boxes.get(parentId)!, startX = parentBox.x + parentBox.w, startY = parentBox.y + parentBox.h / 2, endX = box.x, endY = box.y + box.h / 2, middleX = (startX + endX) / 2;
          elements.push(line(`${element.id}-link-a-${index}`, startX, startY, middleX - startX, 0, "AFC0D3", 1.3));
          elements.push(line(`${element.id}-link-b-${index}`, middleX, Math.min(startY, endY), 0, Math.abs(endY - startY), "AFC0D3", 1.3));
          elements.push(line(`${element.id}-link-c-${index}`, middleX, endY, endX - middleX, 0, "AFC0D3", 1.3));
        }
        const fill = level === 0 ? "2458A6" : level === maxLevel ? "EEF7F4" : "F1F5FA", outline = level === 0 ? "2458A6" : level === maxLevel ? "8BC8BA" : "C5D4E5", color = level === 0 ? "FFFFFF" : "102B57";
        elements.push(shape(`${element.id}-node-${index}`, box, fill, "roundRect", outline));
        elements.push(text(`${element.id}-node-text-${index}`, { x: box.x + 12, y: box.y + 7, w: box.w - 24, h: box.h - 14 }, `${display(row, label)}${subtitle ? `\n${display(row, subtitle)}` : ""}`, level === 0 ? 12 : 10, color, { bold: true, align: "center" }));
      });
      return { handled: true, elements };
    }
    const levels = rows.map(levelOf), maxLevel = Math.max(...levels), levelH = rect.h / (maxLevel + 1), elements: CompiledElement[] = [];
    rows.forEach((row, index) => {
      const level = levels[index], peers = rows.filter((candidate) => levelOf(candidate) === level), peerIndex = peers.indexOf(row), gap = 14, width = Math.min(190, (rect.w - gap * (peers.length - 1)) / peers.length), x = rect.x + (rect.w - (width * peers.length + gap * (peers.length - 1))) / 2 + peerIndex * (width + gap), y = rect.y + level * levelH + 8, box = { x, y, w: width, h: Math.max(46, levelH - 16) };
      const parentId = String(value(row, parent) ?? "");
      if (parentId && byKey.has(parentId)) {
        const parentRow = byKey.get(parentId)!, parentLevel = levelOf(parentRow), parentPeers = rows.filter((candidate) => levelOf(candidate) === parentLevel), parentIndex = parentPeers.indexOf(parentRow), parentWidth = Math.min(190, (rect.w - gap * (parentPeers.length - 1)) / parentPeers.length), parentX = rect.x + (rect.w - (parentWidth * parentPeers.length + gap * (parentPeers.length - 1))) / 2 + parentIndex * (parentWidth + gap);
        elements.push(line(`${element.id}-link-${index}`, parentX + parentWidth / 2, rect.y + parentLevel * levelH + levelH - 8, x + width / 2 - (parentX + parentWidth / 2), 16, "94A3B8"));
      }
      elements.push(shape(`${element.id}-node-${index}`, box, level === 0 ? "2563EB" : level === 1 ? "DBEAFE" : "F8FAFC", "roundRect", level === 0 ? "2563EB" : "CBD5E1"));
      elements.push(text(`${element.id}-node-text-${index}`, { x: box.x + 8, y: box.y + 4, w: box.w - 16, h: box.h - 8 }, `${display(row, label)}${subtitle ? `\n${display(row, subtitle)}` : ""}`, 11, level === 0 ? "FFFFFF" : "172033", { bold: true, align: "center" }));
    });
    return { handled: true, elements };
  }

  if (element.type === "statusTable") {
    const label = role("label"), owner = role("owner"), status = role("status"), progress = role("progress"), comment = role("comment");
    if (!label || !status) return { handled: true, elements: [], error: "状态表需要事项和状态字段" };
    const header = 28, rowH = (rect.h - header) / rows.length, elements: CompiledElement[] = [shape(`${element.id}-header`, { x: rect.x, y: rect.y, w: rect.w, h: header }, "E8F0FE", "rect", "CBD5E1"), text(`${element.id}-header-text`, { x: rect.x + 12, y: rect.y, w: rect.w - 24, h: header }, "事项                         负责人        进度        状态与说明", 10, "475569", { bold: true })];
    rows.forEach((row, index) => {
      const y = rect.y + header + index * rowH, progressValue = progress ? Math.max(0, Math.min(1, Number(value(row, progress)))) : 0;
      elements.push(shape(`${element.id}-row-${index}`, { x: rect.x, y, w: rect.w, h: rowH }, index % 2 ? "F8FAFC" : "FFFFFF", "rect", "E2E8F0"));
      elements.push(text(`${element.id}-label-${index}`, { x: rect.x + 12, y, w: rect.w * .35, h: rowH }, display(row, label), 11, "172033", { bold: true }));
      elements.push(text(`${element.id}-owner-${index}`, { x: rect.x + rect.w * .37, y, w: rect.w * .15, h: rowH }, owner ? display(row, owner) : "—", 10, "475569"));
      elements.push(shape(`${element.id}-progress-track-${index}`, { x: rect.x + rect.w * .53, y: y + rowH / 2 - 5, w: rect.w * .14, h: 10 }, "E2E8F0", "roundRect"));
      if (progressValue > 0) elements.push(shape(`${element.id}-progress-${index}`, { x: rect.x + rect.w * .53, y: y + rowH / 2 - 5, w: rect.w * .14 * progressValue, h: 10 }, colorForStatus(value(row, status)), "roundRect"));
      elements.push(shape(`${element.id}-status-dot-${index}`, { x: rect.x + rect.w * .7, y: y + rowH / 2 - 6, w: 12, h: 12 }, colorForStatus(value(row, status)), "ellipse"));
      elements.push(text(`${element.id}-status-${index}`, { x: rect.x + rect.w * .73, y, w: rect.w * .25, h: rowH }, `${display(row, status)}${comment ? ` · ${display(row, comment)}` : ""}`, 10, "475569"));
    });
    return { handled: true, elements };
  }

  return { handled: true, elements: [], error: "不支持的业务组件" };
}
