import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ECharts } from "echarts/core";
import { t } from "../lib/i18n";
import { pct } from "../lib/format";
import type { Status } from "../lib/model";
import { reducedMotion } from "../lib/echarts";
import { IconAlert, IconCheck, IconDownload, IconImage, IconInfo, IconSort, IconTable, IconX } from "./icons";

// ───────────────────────── Table data & export ─────────────────────────
export interface Column<R> {
  key: string;
  label: string;
  numeric?: boolean;
  value: (r: R) => string | number | null;
  render?: (r: R) => ReactNode;
  width?: number | string;
}

export function toCsv<R>(cols: Column<R>[], rows: R[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => cell(c.label)).join(","), ...rows.map((r) => cols.map((c) => cell(c.value(r))).join(","))].join("\n");
}

export function download(name: string, content: string | Blob, type = "text/csv;charset=utf-8") {
  const blob = typeof content === "string" ? new Blob(["﻿" + content], { type }) : content;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ───────────────────────── DataTable ─────────────────────────
export function DataTable<R>({
  cols, rows, onRowClick, initialSort, maxHeight, caption,
}: {
  cols: Column<R>[];
  rows: R[];
  onRowClick?: (r: R) => void;
  initialSort?: { key: string; dir: 1 | -1 };
  maxHeight?: number;
  caption?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    return [...rows].sort((a, b) => {
      const va = c.value(a), vb = c.value(b);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [rows, cols, sort]);

  return (
    <div className="table-wrap" tabIndex={0} style={maxHeight ? { maxHeight } : undefined}>
      <table className="data">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.numeric ? "n" : undefined} style={{ width: c.width }}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                <button onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? ((-s.dir) as 1 | -1) : c.numeric ? -1 : 1 }))}>
                  {c.label} <IconSort />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className={onRowClick ? "clickable" : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}>
              {cols.map((c) => (
                <td key={c.key} className={c.numeric ? "n" : undefined}>{c.render ? c.render(r) : c.value(r)}</td>
              ))}
            </tr>
          ))}
          {!sorted.length && (
            <tr><td colSpan={cols.length}><div className="empty">{t("No data for the current filters")}</div></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── ChartCard ─────────────────────────
/** A card with a chart, a table-view twin (always available), CSV and PNG export. */
export function ChartCard<R>({
  title, sub, children, table, className, extra,
}: {
  title: string;
  sub?: string;
  children: (setChart: (c: ECharts | null) => void) => ReactNode;
  table?: { cols: Column<R>[]; rows: R[] };
  className?: string;
  extra?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const chart = useRef<ECharts | null>(null);
  const name = slug(title);
  return (
    <section className={`card ${className ?? ""}`} aria-label={title}>
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <h3>{title}</h3>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="chart-tools">
          {extra}
          {table && (
            <button className="tool" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}
              title={asTable ? t("View as chart") : t("View as table")} aria-label={asTable ? t("View as chart") : t("View as table")}>
              <IconTable />
            </button>
          )}
          {table && (
            <button className="tool" title={t("Download CSV")} aria-label={t("Download CSV")}
              onClick={() => download(`${name}.csv`, toCsv(table.cols, table.rows))}>
              <IconDownload />
            </button>
          )}
          {!asTable && (
            <button className="tool" title={t("Download image")} aria-label={t("Download image")}
              onClick={() => {
                const c = chart.current;
                if (!c) return;
                const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
                const url = c.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: bg });
                fetch(url).then((r) => r.blob()).then((b) => download(`${name}.png`, b, "image/png"));
              }}>
              <IconImage />
            </button>
          )}
        </div>
      </div>
      {asTable && table ? <DataTable cols={table.cols} rows={table.rows} maxHeight={420} caption={title} /> : children((c) => (chart.current = c))}
    </section>
  );
}

// ───────────────────────── Meter & status ─────────────────────────
export const STATUS_META: Record<Status, { label: string; color: string; icon: "check" | "alert" | "x" | "info" }> = {
  "reached": { label: "Target reached", color: "var(--good)", icon: "check" },
  "on-track": { label: "On track", color: "var(--good)", icon: "check" },
  "behind": { label: "Behind", color: "var(--warning)", icon: "alert" },
  "off-track": { label: "Off track", color: "var(--critical)", icon: "x" },
  "not-started": { label: "Not started", color: "var(--neutral)", icon: "info" },
  "no-target": { label: "No target", color: "var(--neutral)", icon: "info" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_META[status];
  const Icon = s.icon === "check" ? IconCheck : s.icon === "alert" ? IconAlert : s.icon === "x" ? IconX : IconInfo;
  return (
    <span className="status">
      <span style={{ color: s.color, display: "inline-flex" }}><Icon width={14} height={14} /></span>
      {t(s.label)}
    </span>
  );
}

/** Fill colour carries progress; track is a lighter step of the same hue. */
export function Meter({ value, color = "var(--accent)", left, right, label }: { value: number | null; color?: string; left?: ReactNode; right?: ReactNode; label?: string }) {
  const w = value === null ? 0 : Math.min(1, Math.max(0, value)) * 100;
  const text = (n: ReactNode) => (typeof n === "string" || typeof n === "number" ? String(n) : "");
  const name = label ?? [text(left), text(right)].filter(Boolean).join(" · ") ?? t("Achievement");
  const aria = value === null
    ? { "aria-hidden": true as const }
    : { role: "meter" as const, "aria-label": name || t("Achievement"), "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(value * 100), "aria-valuetext": pct(value) };
  return (
    <div className="meter">
      <div className="track" style={{ background: `color-mix(in srgb, ${color} 16%, var(--surface-sunk))` }} {...aria}>
        <div className="fill" style={{ width: `${w}%`, background: color }} />
      </div>
      {(left || right) && <div className="row"><span>{left}</span><span>{right}</span></div>}
    </div>
  );
}

export function MiniMeter({ value, color = "var(--accent)" }: { value: number | null; color?: string }) {
  if (value === null) return <span className="muted">–</span>;
  const w = value === null ? 0 : Math.min(1, Math.max(0, value)) * 100;
  return (
    <span className="mini-meter">
      <span className="track" style={{ background: `color-mix(in srgb, ${color} 16%, var(--surface-sunk))` }}>
        <span className="fill" style={{ width: `${w}%`, background: color }} />
      </span>
      <span>{pct(value)}</span>
    </span>
  );
}

// ───────────────────────── Sparkline ─────────────────────────
export function Sparkline({ values, color, width = 120, height = 32, highlight }: {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
  highlight?: number;
}) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(...pts.map((p) => p[1]), 1e-9);
  const min = Math.min(0, ...pts.map((p) => p[1]));
  const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const area = `${d}L${x(pts[pts.length - 1][0])},${height}L${x(pts[0][0])},${height}Z`;
  const h = highlight !== undefined ? pts.find((p) => p[0] === highlight) ?? pts[pts.length - 1] : pts[pts.length - 1];
  return (
    <svg className="spark" width={width} height={height} aria-hidden>
      <path d={area} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(h[0])} cy={y(h[1])} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

// ───────────────────────── Count-up number ─────────────────────────
export function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return <>{format(shown)}</>;
}

// ───────────────────────── Legend ─────────────────────────
export function Legend({ items, kind = "rect" }: { items: { label: string; color: string }[]; kind?: "rect" | "line" }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          {kind === "rect"
            ? <i className="dot" style={{ background: i.color }} />
            : <i style={{ width: 14, height: 2, borderRadius: 2, background: i.color, display: "inline-block" }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}
