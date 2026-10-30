import * as echarts from "echarts/core";
import { BarChart, CustomChart, LineChart, MapChart, TreemapChart } from "echarts/charts";
import {
  GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, VisualMapComponent, GeoComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart, CustomChart, LineChart, MapChart, TreemapChart,
  GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, VisualMapComponent, GeoComponent,
  CanvasRenderer,
]);

export { echarts };

export interface Tokens {
  surface: string;
  surface2: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  border: string;
  accent: string;
  series: string[]; // s1..s8
  map: string[]; // map-0..map-5
  good: string;
  warning: string;
  serious: string;
  critical: string;
  neutral: string;
  font: string;
}

export function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    surface: v("--surface"), surface2: v("--surface-2"), ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"),
    grid: v("--grid"), axis: v("--axis"), border: v("--border-strong"), accent: v("--accent"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)),
    map: [0, 1, 2, 3, 4, 5].map((i) => v(`--map-${i}`)),
    good: v("--good"), warning: v("--warning"), serious: v("--serious"), critical: v("--critical"), neutral: v("--neutral"),
    font: v("--font"),
  };
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Labels come from the workbook — escape before they go into tooltip HTML. */
export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Shared tooltip chrome: value first (strong), label second; line keys not boxes. */
export function tooltipBase(t: Tokens) {
  return {
    backgroundColor: t.surface,
    borderColor: t.border,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { color: t.ink, fontFamily: t.font, fontSize: 13 },
    extraCssText: "border-radius:10px;box-shadow:0 10px 30px -10px rgba(0,0,0,.35);",
    confine: true,
  };
}

export function tipRow(color: string, value: string, label: string, kind: "line" | "rect" = "line"): string {
  const key = kind === "line"
    ? `<span style="display:inline-block;width:12px;height:2px;border-radius:2px;background:${color};margin-right:8px;vertical-align:middle"></span>`
    : `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};margin-right:8px;vertical-align:middle"></span>`;
  return `<div style="display:flex;align-items:center;gap:4px;margin-top:4px">${key}<b style="font-weight:650">${value}</b><span style="opacity:.7;margin-left:6px">${esc(label)}</span></div>`;
}

export function tipTitle(s: string): string {
  return `<div style="font-size:12px;opacity:.7;margin-bottom:2px">${esc(s)}</div>`;
}

export function axisBase(t: Tokens) {
  return {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: t.font, fontSize: 12 },
    splitLine: { lineStyle: { color: t.grid, width: 1, type: "solid" as const } },
  };
}

export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
