import { useEffect, useState } from "react";

/** Viewport width, so the circles shrink on phones (the chart option cannot read its container). */
function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}
const radiusFor = (w: number) => (w < 700 ? 38 : 54);

/** Shorter country names for phone widths, where the full name would run into a neighbour. */
const SHORT: Record<string, string> = {
  "Republic of Congo": "Congo", "République du Congo": "Congo",
  "Central African Republic": "CAR", "République centrafricaine": "RCA",
  "Equatorial Guinea": "Eq. Guinea", "Guinée équatoriale": "Guinée éq.",
  "Democratic Republic of the Congo": "DR Congo", "République démocratique du Congo": "RD Congo",
};
const shortName = (label: string, narrow: boolean) => (narrow ? SHORT[label] ?? label : label);
/** On phones Equatorial Guinea's label would leave the canvas on the left, so it goes above the symbol. */
const placeFor = (iso: string, narrow: boolean) => (narrow && iso === "226" ? { pos: "top" as const, offset: [0, 0] as [number, number] } : { pos: MEMBERS[iso].pos, offset: MEMBERS[iso].offset ?? [0, 0] as [number, number] });
import type { ECharts } from "echarts/core";
import { echarts, esc, tipRow, tipTitle, tooltipBase } from "../lib/echarts";
import { Chart } from "./Chart";
import { t } from "../lib/i18n";

let loaded: Promise<Map<string, string>> | null = null;

/** Registers a Central-Africa map (Natural Earth 1:110m via world-atlas). Returns ISO numeric → map name. */
function loadMap(): Promise<Map<string, string>> {
  loaded ??= Promise.all([import("topojson-client"), import("world-atlas/countries-110m.json")]).then(([topo, world]) => {
    const w = (world as { default?: unknown }).default ?? world;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = topo.feature(w as any, (w as any).objects.countries) as unknown as GeoJSON.FeatureCollection;
    const inRegion = (f: GeoJSON.Feature) => {
      const pts: number[][] = [];
      const walk = (c: unknown): void => {
        if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]);
        else if (Array.isArray(c)) c.forEach(walk);
      };
      walk((f.geometry as GeoJSON.Polygon).coordinates);
      const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return lon > -2 && lon < 42 && lat > -22 && lat < 22;
    };
    const features = fc.features.filter(inRegion);
    echarts.registerMap("central-africa", { type: "FeatureCollection", features } as never);
    return new Map(features.map((f) => [String(f.id), String(f.properties?.name)]));
  });
  return loaded;
}

/**
 * CAFI member states (ISO 3166-1 numeric): where the symbol sits and where its label goes.
 * The three small coastal states take their labels over the sea so they never collide.
 */
const MEMBERS: Record<string, { at: [number, number]; pos: "left" | "right" | "top" | "bottom"; offset?: [number, number] }> = {
  "180": { at: [23.6, -3.4], pos: "right" }, // DR Congo (label moves inside when the circle is large enough)
  "120": { at: [12.3, 5.4], pos: "top" }, // Cameroon
  "140": { at: [20.8, 6.6], pos: "top" }, // Central African Republic
  "178": { at: [15.4, -1.0], pos: "bottom", offset: [10, 2] }, // Congo
  "266": { at: [11.6, -0.7], pos: "left", offset: [-4, 6] }, // Gabon
  "226": { at: [10.3, 1.7], pos: "left", offset: [-4, -8] }, // Equatorial Guinea
};
export const MEMBER_ISOS = Object.keys(MEMBERS);

/** Frame: the six member states fill the card; neighbours stay as a faint backdrop. */
const FRAME: [[number, number], [number, number]] = [[6, 13.5], [32, -14.5]];

export interface MapDatum {
  iso: string;
  label: string;
  value: number;
  display: string;
  lines?: [string, string][]; // tooltip rows: [value, label]
}

export function symbolDiameter(value: number, max: number, rMax = 54): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(10, 2 * rMax * Math.sqrt(value / max));
}

export function AfricaMap({ data, metricLabel, emptyLabel, height, onSelect, selected, chartRef }: {
  data: MapDatum[];
  metricLabel: string;
  emptyLabel: string;
  height: number;
  onSelect: (iso: string) => void;
  selected: string[];
  chartRef: (c: ECharts | null) => void;
}) {
  const [names, setNames] = useState<Map<string, string> | null>(null);
  const rMax = radiusFor(useViewportWidth());
  useEffect(() => { loadMap().then(setNames); }, []);
  if (!names) return <div className="empty" style={{ height }}>…</div>;

  const byIso = new Map(data.map((d) => [d.iso, d]));
  const byName = new Map(data.map((d) => [names.get(d.iso) ?? d.label, d]));
  const max = Math.max(1, ...data.map((d) => d.value));
  const sel = new Set(selected);

  return (
    <Chart height={height} label={`${t("Where programmes work")}: ${metricLabel}`} chartRef={chartRef}
      deps={[data, metricLabel, emptyLabel, selected.join(), rMax]}
      onClick={(p) => {
        const d = byName.get(p.name);
        if (d) onSelect(d.iso);
      }}
      option={(tk) => {
        const narrow = rMax < 54;
        const circles = data.filter((d) => d.value > 0).map((d) => {
          const m = placeFor(d.iso, narrow);
          const size = symbolDiameter(d.value, max, rMax);
          const inside = size >= 76;
          return {
            name: names.get(d.iso) ?? d.label,
            value: [...MEMBERS[d.iso].at, d.value] as [number, number, number],
            symbolSize: size,
            itemStyle: { color: sel.has(d.iso) ? tk.ink : tk.map[4], borderColor: tk.surface, borderWidth: 1.5, opacity: 0.92 },
            label: {
              show: true,
              position: inside ? "inside" : m.pos,
              offset: inside ? [0, 0] : m.offset,
              distance: 6,
              formatter: `{b|${shortName(d.label, narrow)}}\n{v|${d.display}}`,
              rich: {
                b: { fontWeight: 650, fontSize: 12, color: inside ? tk.surface : tk.ink, textBorderColor: inside ? "transparent" : tk.surface, textBorderWidth: 3, align: inside ? "center" : undefined },
                v: { fontSize: 11, color: inside ? tk.surface : tk.ink2, textBorderColor: inside ? "transparent" : tk.surface, textBorderWidth: 3, align: inside ? "center" : undefined, padding: [2, 0, 0, 0] },
              },
            },
          };
        });
        const empties = MEMBER_ISOS.filter((iso) => (byIso.get(iso)?.value ?? 0) <= 0).map((iso) => ({
          name: names.get(iso) ?? iso,
          value: [...MEMBERS[iso].at, 0] as [number, number, number],
          symbolSize: 1, itemStyle: { color: "transparent", borderWidth: 0 },
          label: {
            // The coastal three keep their data-label placement so an empty name never sits on a neighbour's circle.
            show: true, position: ["left", "bottom"].includes(placeFor(iso, narrow).pos) ? placeFor(iso, narrow).pos : "inside",
            offset: ["left", "bottom"].includes(placeFor(iso, narrow).pos) ? placeFor(iso, narrow).offset : [0, 0], distance: 4,
            formatter: shortName(byIso.get(iso)?.label ?? names.get(iso) ?? iso, narrow),
            fontSize: 11, color: tk.muted, textBorderColor: tk.surface, textBorderWidth: 3,
          },
        }));
        const regions = [...names.entries()].map(([iso, name]) => {
          const member = iso in MEMBERS;
          const has = (byIso.get(iso)?.value ?? 0) > 0;
          return {
            name,
            silent: !member,
            itemStyle: member
              ? { areaColor: tk.map[0], borderColor: has ? tk.border : tk.muted, borderWidth: has ? 1 : 1, borderType: has ? "solid" : "dashed" }
              : { areaColor: tk.surface2, borderColor: tk.surface, borderWidth: 1 },
            emphasis: { itemStyle: member ? { areaColor: tk.map[0], borderColor: tk.ink, borderWidth: 1.5 } : { areaColor: tk.surface2 }, label: { show: false } },
          };
        });
        return {
          tooltip: {
            ...tooltipBase(tk),
            trigger: "item",
            formatter: (p: { name: string }) => {
              const d = byName.get(p.name);
              if (!d) return "";
              if (d.value <= 0) return `${tipTitle(d.label)}<span style="opacity:.7">${esc(emptyLabel)}</span>`;
              return tipTitle(d.label) + tipRow(tk.map[4], d.display, metricLabel, "rect") +
                (d.lines ?? []).map(([v, l]) => `<div style="display:flex;gap:6px;margin-top:3px;font-size:12px"><b style="font-weight:600">${esc(v)}</b><span style="opacity:.7">${esc(l)}</span></div>`).join("") +
                `<div style="opacity:.6;margin-top:6px;font-size:11px">${esc(t("Click to filter the dashboard"))}</div>`;
            },
          },
          geo: {
            map: "central-africa", roam: false, silent: false, aspectScale: 1,
            boundingCoords: FRAME, layoutCenter: ["50%", "50%"], layoutSize: "100%",
            selectedMode: false,
            itemStyle: { areaColor: tk.surface2, borderColor: tk.surface, borderWidth: 1 },
            emphasis: { label: { show: false }, itemStyle: { areaColor: tk.surface2 } },
            label: { show: false },
            regions,
          },
          series: [
            {
              // Carries the member regions' names and values so hovering a country, not just its circle, shows the tooltip.
              type: "map", map: "central-africa", geoIndex: 0, name: "regions",
              data: MEMBER_ISOS.map((iso) => ({ name: names.get(iso) ?? iso, value: byIso.get(iso)?.value ?? 0 })),
              tooltip: { show: true },
            },
            { type: "scatter", coordinateSystem: "geo", name: "empty", silent: true, data: empties, z: 3, animation: false },
            {
              type: "scatter", coordinateSystem: "geo", name: "values", data: circles, z: 4,
              emphasis: { scale: 1.04, itemStyle: { borderColor: tk.ink, borderWidth: 2 } },
              labelLayout: { hideOverlap: false },
            },
          ],
        };
      }}
    />
  );
}

/** Proportional-symbol legend: three nested reference circles, then the two fill states. */
export function MapLegend({ max, fmt, label, emptyLabel }: { max: number; fmt: (v: number) => string; label: string; emptyLabel: string }) {
  const rMax = radiusFor(useViewportWidth());
  const refs = max > 0 ? [max, max / 4, max / 16].map(nice).filter((v, i, a) => v > 0 && a.indexOf(v) === i) : [];
  const D = symbolDiameter(refs[0] ?? 1, max || 1, rMax);
  const W = D + 84;
  const PAD = 9;
  return (
    <div className="map-legend">
      <span className="map-legend-k">{label}</span>
      {refs.length > 0 && (
        <svg width={W} height={D + PAD + 3} viewBox={`0 0 ${W} ${D + PAD + 3}`} aria-hidden="true" className="map-legend-circles">
          {refs.map((v) => {
            const d = symbolDiameter(v, max, rMax);
            const cy = D + PAD - d / 2;
            return (
              <g key={v}>
                <circle cx={D / 2 + 2} cy={cy} r={d / 2} />
                <line x1={D / 2 + 2} y1={cy - d / 2} x2={D + 12} y2={cy - d / 2} />
                <text x={D + 15} y={cy - d / 2 + 3.5}>{fmt(v)}</text>
              </g>
            );
          })}
        </svg>
      )}
      <span className="map-legend-swatch"><i className="member" /> {t("Member state")}</span>
      <span className="map-legend-swatch"><i className="member none" /> {emptyLabel}</span>
      <span className="map-legend-swatch"><i className="other" /> {t("Not a CAFI country")}</span>
    </div>
  );
}

/** Round a reference value to 1, 2 or 5 × 10ⁿ so the legend reads cleanly. */
export function nice(v: number): number {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}
