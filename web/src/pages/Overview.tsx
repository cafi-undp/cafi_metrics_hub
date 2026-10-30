import { useMemo, useState } from "react";
import { useApp } from "../lib/state";
import { useFiltered } from "../lib/hooks";
import { nameOf, t } from "../lib/i18n";
import {
  activeIn, byKey, co2Aggregate, indicatorAggs, outcomeAchievement, sumUnit, valueAt,
} from "../lib/model";
import { compact, num, pct, signed, tco2, withUnit } from "../lib/format";
import { outcomeHex, outcomeVar, textOn } from "../lib/colors";
import { axisBase, esc, tipRow, tipTitle, tooltipBase } from "../lib/echarts";
import { Chart } from "../components/Chart";
import { AfricaMap, MapLegend, type MapDatum } from "../components/AfricaMap";
import { Link } from "../components/Shell";
import { ChartCard, CountUp, Meter, Sparkline, type Column } from "../components/ui";
import type { DataRecord, Programme } from "../lib/types";
import { buildInsights, fill } from "../lib/insights";

type MapMetric = "ha" | "programmes" | "co2";

/** The hectare cards only cover the area indicators; most filters outside DRC leave them empty. */
function NoHectares() {
  const { filters, setFilters } = useApp();
  const any = filters.countries.length + filters.partners.length + filters.programmes.length > 0;
  return (
    <div className="empty">
      <div>
        <div>{any ? t("No hectares reported under the current filters.") : t("No hectares reported yet.")}</div>
        <div className="xsmall muted" style={{ marginTop: 4 }}>{t("These cards only count the forest and agriculture area indicators; other results are on the Outcomes page.")}</div>
        {any && <button className="link-btn" onClick={() => setFilters({ countries: [], partners: [], programmes: [] })}>{t("Clear filters")}</button>}
      </div>
    </div>
  );
}

export function Overview() {
  const { m, ix, filters, setFilters, lang, q } = useApp();
  const { records, yi, year, years } = useFiltered();
  const insights = useMemo(() => buildInsights(m, ix, records, yi, q, lang).slice(0, 3), [m, ix, records, yi, q, lang]);
  const [mapMetric, setMapMetric] = useState<MapMetric>("ha");

  const aggs = useMemo(() => indicatorAggs(ix, records, yi), [ix, records, yi]);
  const prevAggs = useMemo(() => indicatorAggs(ix, records, Math.max(0, yi - 1)), [ix, records, yi]);
  const co2 = useMemo(() => co2Aggregate(records, yi), [records, yi]);
  const hectares = sumUnit(aggs, "ha", m.meta.areaIndicators);
  const hectaresPrev = yi > 0 ? sumUnit(prevAggs, "ha", m.meta.areaIndicators) : 0;
  const progIds = new Set(records.map((r) => r.programme));
  const active = [...progIds].filter((id) => activeIn(ix.programmes.get(id)!, year)).length;
  const partners = new Set(records.map((r) => r.partner)).size;
  const countries = new Set(records.map((r) => ix.countryOf(r))).size;
  const anticipated = m.headline.anticipatedCo2.value;
  const net = co2.intervention.expected;
  const mega = net >= 1e6;
  const filtered = filters.countries.length + filters.partners.length + filters.programmes.length > 0;

  // Outcome summaries (trend = one aggregation per year per outcome, so memoised)
  const outcomes = useMemo(() => m.outcomes.map((o) => {
    const oa = aggs.filter((a) => a.indicator.outcome === o.id);
    const recs = records.filter((r) => ix.outcomeOf(r) === o.id);
    const trend = years.map((_, i) => outcomeAchievement(indicatorAggs(ix, recs, i)));
    return { o, aggs: oa, achievement: outcomeAchievement(oa), trend, recs };
  }).filter((x) => x.aggs.length), [m, ix, aggs, records, years]);

  // Map data per country
  const mapData: MapDatum[] = useMemo(() => {
    const metric = (rs: DataRecord[]) => mapMetric === "ha"
      ? rs.filter((r) => m.meta.areaIndicators.includes(r.indicator)).reduce((s, r) => s + (valueAt(r.values, yi) ?? 0), 0)
      : mapMetric === "programmes" ? new Set(rs.map((r) => r.programme)).size : co2Aggregate(rs, yi).intervention.expected;
    const fmt = (v: number) => mapMetric === "ha" ? `${compact(v)} ha` : mapMetric === "programmes" ? `${v}` : tco2(v);
    const rows = m.countries.filter((c) => c.iso).map((c) => {
      const rc = records.filter((r) => ix.countryOf(r) === c.id);
      const value = metric(rc);
      const progs = new Set(rc.map((r) => r.programme));
      const partners = new Set(rc.map((r) => r.partner)).size;
      const top = [...byKey(rc, (r) => r.programme).entries()].map(([pid, rs]) => ({ pid, v: metric(rs) })).sort((a, b) => b.v - a.v)[0];
      const lines: [string, string][] = [
        [`${progs.size}`, t("programmes")], [`${partners}`, t("partners")],
        ...(top && mapMetric !== "programmes" && top.v > 0 ? [[`${ix.programmes.get(top.pid)?.name ?? top.pid}`, `${t("Largest programme")} · ${fmt(top.v)}`] as [string, string]] : []),
      ];
      return { iso: c.iso!, label: nameOf(c), value, display: fmt(value), lines };
    });
    const total = rows.reduce((s, r) => s + r.value, 0);
    for (const r of rows) if (r.value > 0 && total > 0) r.lines.splice(2, 0, [pct(r.value / total), t("Share of the total shown")]);
    return rows.sort((a, b) => b.value - a.value);
  }, [m, ix, records, yi, mapMetric]);
  const mapMax = mapData[0]?.value ?? 0;
  const mapFmt = (v: number) => mapMetric === "ha" ? `${compact(v)} ha` : mapMetric === "programmes" ? `${v}` : tco2(v);
  const isoToCountry = new Map(m.countries.map((c) => [c.iso, c.id]));
  const mapLabel = mapMetric === "ha" ? t("Hectares planted, restored or protected") : mapMetric === "programmes" ? t("Programmes reporting") : t("Net GHG benefit expected, full cycle");
  const mapEmpty = mapMetric === "ha" ? t("Member state, no hectares reported") : mapMetric === "programmes" ? t("Member state, no programme reporting") : t("Member state, no GHG estimate");
  // Programmes without a country (regional) cannot be placed on the map.
  const regional = useMemo(() => [...new Set(records.filter((r) => !ix.countries.get(ix.countryOf(r))?.iso).map((r) => r.programme))].map((id) => ix.programmes.get(id)).filter(Boolean) as Programme[], [records, ix]);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <img className="hero-photo" src="./hero.jpg" srcSet="./hero-sm.jpg 1000w, ./hero.jpg 2000w" sizes="100vw"
          alt="" aria-hidden="true" decoding="async" fetchPriority="high" />
        <div className="hero-inner">
          <div>
            <div className="eyebrow">{t("As of")} {year}{m.meta.partialYears.includes(year) ? ` · ${t("partial year")}` : ""}</div>
            <h1 id="hero-title">{t("Results across Central Africa")}</h1>
            <p className="lede">{t("Cumulative results reported by CAFI-funded programmes")}.</p>
            <div className="hero-figure">
              <div className="big">
                <CountUp value={net / (mega ? 1e6 : 1e3)} format={(v) => num(v, 1)} /><small>{mega ? "Mt" : "kt"} CO₂e</small>
              </div>
              <div className="cap">{t("Net GHG benefit expected, full cycle")} · {t("range")} {compact(co2.intervention.low, 2)}–{compact(co2.intervention.high, 2)}</div>
              <div className="cap" style={{ marginTop: 2 }}>{t("Removals in the inventory ledger")}: {compact(co2.inventory.expected, 2)} tCO₂e · {t("Realised to date")}: {compact(co2.intervention.realised, 2)}</div>
              <div className="hero-meter">
                <div className="track"><div className="fill" style={{ width: `${anticipated > 0 ? Math.min(100, (net / anticipated) * 100) : 0}%` }} /></div>
                <div className="row">
                  <span>{anticipated > 0 ? pct(net / anticipated, 1) : "–"} {t("of anticipated portfolio total")}</span>
                  <span>{compact(anticipated)} tCO₂e</span>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-tiles">
            <div className="hero-tile">
              <div className="v"><CountUp value={progIds.size} format={(v) => num(v)} /></div>
              <div className="l">{t("Programmes reporting")}</div>
              <div className="d">{active} {t("active in")} {year}</div>
            </div>
            <div className="hero-tile">
              <div className="v"><CountUp value={hectares} format={(v) => compact(v)} /></div>
              <div className="l">{t("Hectares planted, restored or protected")}</div>
              {yi > 0 && <div className="d">{signed(hectares - hectaresPrev, compact)} ha {t("vs previous year")}</div>}
            </div>
            <div className="hero-tile">
              <div className="v"><CountUp value={m.headline.beneficiaries.value} format={(v) => compact(v)} /></div>
              <div className="l">{t("Direct beneficiaries")}</div>
              <div className="d" title={m.headline.beneficiaries.source}>{filtered ? t("Portfolio total — not filtered") : t("Portfolio total")} · {t("Source pending")}</div>
            </div>
            <div className="hero-tile">
              <div className="v"><CountUp value={partners} format={(v) => num(v)} /></div>
              <div className="l">{t("Implementing partners")}</div>
              <div className="d">{countries} {t("Countries").toLowerCase()}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="changed-h">
        <div className="section-head">
          <div>
            <h2 id="changed-h">{t("What changed in")} {year}</h2>
            <p className="muted small">{t("Generated from the data at each refresh; each statement links to the rows behind it.")}</p>
          </div>
          <Link to={{ page: "brief" }} className="small">{t("Open the briefing")} →</Link>
        </div>
        <div className="insights">
          {insights.map((i) => (
            <Link key={i.key} to={i.to} className="insight">
              <div className="k">{i.eyebrow}</div>
              <p>{i.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="outcomes-h">
        <div className="section-head">
          <div>
            <h2 id="outcomes-h">{t("Progress by outcome")}</h2>
            <p className="muted small">{t("Average achievement of each outcome's indicators against final targets")}</p>
          </div>
          {m.outcomes.length > outcomes.length && (
            <Link to={{ page: "methodology" }} className="small">
              {m.outcomes.length - outcomes.length} {t("categories without reported results yet")} →
            </Link>
          )}
        </div>
        <div className="grid g-3">
          {outcomes.map(({ o, aggs: oa, achievement, trend }) => (
            <Link key={o.id} to={{ page: "outcome", id: o.id }} className="card link outcome-card" style={{ ["--c" as string]: outcomeVar(m, o.id) }}>
              <div className="head">
                <h3><i className="dot" style={{ background: outcomeVar(m, o.id) }} />{nameOf(o)}</h3>
                <Sparkline values={trend} color={outcomeVar(m, o.id)} width={96} height={28} highlight={yi} />
              </div>
              <div className="big">{pct(achievement)}</div>
              <div className="big-l">{t("Achievement")} · {oa.length} {t("indicators")}</div>
              <Meter value={achievement} color={outcomeVar(m, o.id)} />
              {oa.slice(0, 3).map((a) => (
                <div className="ind" key={a.indicator.code}>
                  <span title={nameOf(a.indicator)}>{nameOf(a.indicator)}</span>
                  <b className="num">{withUnit(a.value, a.indicator.unit, lang, true)}</b>
                </div>
              ))}
            </Link>
          ))}
        </div>
      </section>

      <section className="section grid g-12">
        <ChartCard className="span-7" title={t("Where programmes work")} sub={`${mapLabel} · ${t("Click a country to filter")}`}
          extra={
            <>
              {filters.countries.length > 0 && (
                <button className="chip-btn" onClick={() => setFilters({ countries: [] })} aria-label={t("Clear country")}>
                  × {filters.countries.map((id) => nameOf(ix.countries.get(id) ?? { name: id })).join(", ")}
                </button>
              )}
              <div className="seg" role="group" aria-label={t("Map metric")} style={{ marginRight: 6 }}>
                {(["ha", "programmes", "co2"] as MapMetric[]).map((k) => (
                  <button key={k} aria-pressed={mapMetric === k} onClick={() => setMapMetric(k)}>
                    {k === "ha" ? t("Hectares") : k === "programmes" ? t("Programmes") : "CO₂"}
                  </button>
                ))}
              </div>
            </>
          }
          table={{
            cols: [
              { key: "c", label: t("Country"), value: (d: MapDatum) => d.label, render: (d: MapDatum) => { const id = isoToCountry.get(d.iso); return id ? <button className="link-btn" style={{ padding: 0 }} onClick={() => setFilters({ countries: [id] })}>{d.label}</button> : d.label; } },
              { key: "v", label: mapLabel, numeric: true, value: (d: MapDatum) => Math.round(d.value), render: (d: MapDatum) => d.display },
            ],
            rows: mapData,
          }}>
          {(ref) => (
            <div className="map-wrap">
              <div className="map-main">
              <AfricaMap data={mapData} metricLabel={mapLabel} emptyLabel={mapEmpty} height={440} chartRef={ref}
                selected={filters.countries.map((id) => ix.countries.get(id)?.iso ?? "").filter(Boolean)}
                onSelect={(iso) => {
                  const id = isoToCountry.get(iso);
                  if (!id) return;
                  setFilters({ countries: filters.countries.includes(id) ? filters.countries.filter((c) => c !== id) : [id] });
                }} />
              </div>
              <aside className="map-side" aria-label={t("Legend")}>
              <MapLegend label={mapLabel} max={mapMax} fmt={mapFmt} emptyLabel={mapEmpty} />
              {regional.length > 0 && (
                <div className="map-note">
                  {fill(t(regional.length === 1 ? "{n} regional programme is not placed on the map:" : "{n} regional programmes are not placed on the map:"), { n: regional.length })}{" "}
                  {regional.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link to={{ page: "programme", id: p.id }}>{p.name}</Link></span>)}
                </div>
              )}
              {mapMax <= 0 && mapMetric === "ha" && records.length > 0 && (
                <div className="map-note">
                  {t("No hectares reported under the current filters.")} <button className="link-btn" onClick={() => setMapMetric("programmes")}>{t("Show programmes instead")}</button>
                </div>
              )}
              </aside>
            </div>
          )}
        </ChartCard>
        <TopProgrammes records={records} yi={yi} />
      </section>

      <section className="section grid g-12">
        <HectaresOverTime records={records} />
        <HectareTreemap records={records} yi={yi} />
      </section>
    </>
  );
}

function TopProgrammes({ records, yi }: { records: DataRecord[]; yi: number }) {
  const { m, ix, navigate } = useApp();
  const rows = useMemo(() => {
    const g = byKey(records.filter((r) => m.meta.areaIndicators.includes(r.indicator)), (r) => r.programme);
    return [...g.entries()].map(([id, rs]) => {
      const byOutcome = new Map<string, number>();
      rs.forEach((r) => byOutcome.set(ix.outcomeOf(r), (byOutcome.get(ix.outcomeOf(r)) ?? 0) + (valueAt(r.values, yi) ?? 0)));
      return { id, name: ix.programmes.get(id)!.name, total: [...byOutcome.values()].reduce((a, b) => a + b, 0), byOutcome };
    }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [records, yi, ix]);
  const usedOutcomes = m.outcomes.filter((o) => rows.some((r) => r.byOutcome.get(o.id)));

  return (
    <ChartCard className="span-5" title={t("Top programmes")}
      sub={`Top 10 · ${t("Hectares planted, restored or protected").toLowerCase()}`}
      table={{
        cols: [
          { key: "p", label: t("Programme"), value: (r: (typeof rows)[number]) => r.name, render: (r: (typeof rows)[number]) => <Link to={{ page: "programme", id: r.id }}>{r.name}</Link> },
          ...usedOutcomes.map((o) => ({ key: o.id, label: nameOf(o), numeric: true, value: (r: (typeof rows)[number]) => Math.round(r.byOutcome.get(o.id) ?? 0) })),
          { key: "t", label: `${t("Total")} (ha)`, numeric: true, value: (r: (typeof rows)[number]) => Math.round(r.total) },
        ] as Column<(typeof rows)[number]>[],
        rows,
      }}>
      {(ref) => rows.length ? (
        <>
          {usedOutcomes.length > 1 && <LegendRow outcomes={usedOutcomes.map((o) => o.id)} />}
          <Chart height={Math.max(220, rows.length * 36 + 30)} label="Top programmes by hectares" chartRef={ref} deps={[rows]}
            onClick={(p) => { const r = rows[p.dataIndex]; if (r) navigate({ page: "programme", id: r.id }); }}
            option={(tk) => ({
              grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
              tooltip: {
                ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                formatter: (ps: { dataIndex: number }[]) => {
                  const r = rows[ps[0].dataIndex];
                  return tipTitle(r.name) + usedOutcomes.filter((o) => r.byOutcome.get(o.id))
                    .map((o) => tipRow(outcomeHex(m, tk, o.id), `${num(r.byOutcome.get(o.id))} ha`, nameOf(o), "rect")).join("") +
                    `<div style="margin-top:6px;opacity:.8">${esc(t("Total"))} <b>${num(r.total)} ha</b></div>`;
                },
              },
              xAxis: { type: "value", ...axisBase(tk), axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) }, splitNumber: 3 },
              yAxis: {
                type: "category", inverse: true, data: rows.map((r) => r.name), ...axisBase(tk), splitLine: { show: false },
                axisLabel: { ...axisBase(tk).axisLabel, color: tk.ink2, width: 150, overflow: "truncate" },
              },
              series: usedOutcomes.map((o, k) => ({
                name: nameOf(o), type: "bar", stack: "ha", barMaxWidth: 18, cursor: "pointer",
                itemStyle: {
                  color: outcomeHex(m, tk, o.id), borderColor: tk.surface, borderWidth: 1,
                  borderRadius: k === usedOutcomes.length - 1 ? [0, 4, 4, 0] : 0,
                },
                emphasis: { focus: "series" },
                label: k === usedOutcomes.length - 1 ? {
                  show: true, position: "right", color: tk.ink2, fontSize: 12,
                  formatter: (p: { dataIndex: number }) => compact(rows[p.dataIndex].total),
                } : undefined,
                data: rows.map((r) => Math.round(r.byOutcome.get(o.id) ?? 0)),
              })),
            })} />
        </>
      ) : <NoHectares />}
    </ChartCard>
  );
}

function LegendRow({ outcomes }: { outcomes: string[] }) {
  const { m } = useApp();
  return (
    <div className="legend">
      {m.outcomes.filter((o) => outcomes.includes(o.id)).map((o) => (
        <span key={o.id}><i className="dot" style={{ background: outcomeVar(m, o.id) }} />{nameOf(o)}</span>
      ))}
    </div>
  );
}

function HectaresOverTime({ records }: { records: DataRecord[] }) {
  const { m, ix, filters } = useApp();
  const years = m.meta.years;
  const series = m.outcomes.map((o) => {
    const rs = records.filter((r) => m.meta.areaIndicators.includes(r.indicator) && ix.outcomeOf(r) === o.id);
    return { o, values: years.map((_, i) => rs.reduce((s, r) => s + (valueAt(r.values, i) ?? 0), 0)) };
  }).filter((s) => s.values.some((v) => v > 0));
  const partial = m.meta.partialYears;

  return (
    <ChartCard className="span-7" title={t("Hectares over time")} sub={t("Cumulative hectares by outcome")}
      table={{
        cols: [
          { key: "y", label: t("Year"), value: (r: { y: number; i: number }) => r.y },
          ...series.map((s) => ({ key: s.o.id, label: nameOf(s.o), numeric: true, value: (r: { y: number; i: number }) => Math.round(s.values[r.i]) })),
        ] as Column<{ y: number; i: number }>[],
        rows: years.map((y, i) => ({ y, i })),
      }}>
      {(ref) => !series.length ? <NoHectares /> : (
        <>
          <LegendRow outcomes={series.map((s) => s.o.id)} />
          <Chart height={320} label="Cumulative hectares by outcome over time" chartRef={ref} deps={[series, filters.year]}
            option={(tk) => ({
              grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
              tooltip: {
                ...tooltipBase(tk), trigger: "axis",
                axisPointer: { type: "line", lineStyle: { color: tk.ink2, width: 1 } },
                formatter: (ps: { dataIndex: number }[]) => {
                  const i = ps[0].dataIndex;
                  const total = series.reduce((s, x) => s + x.values[i], 0);
                  return tipTitle(`${years[i]}${partial.includes(years[i]) ? ` · ${t("partial year")}` : ""}`) +
                    `<div style="font-size:16px;font-weight:700;margin:2px 0 4px">${esc(num(total))} ha</div>` +
                    [...series].reverse().map((s) => tipRow(outcomeHex(m, tk, s.o.id), `${num(s.values[i])} ha`, nameOf(s.o))).join("");
                },
              },
              xAxis: { type: "category", boundaryGap: false, data: years.map(String), ...axisBase(tk), splitLine: { show: false } },
              yAxis: { type: "value", ...axisBase(tk), axisLine: { show: false }, axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) } },
              series: series.map((s, k) => ({
                name: nameOf(s.o), type: "line", stack: "total", smooth: 0.25, symbol: "circle", symbolSize: 8, showSymbol: false,
                lineStyle: { width: 2, color: outcomeHex(m, tk, s.o.id) },
                itemStyle: { color: outcomeHex(m, tk, s.o.id), borderColor: tk.surface, borderWidth: 2 },
                areaStyle: { color: outcomeHex(m, tk, s.o.id), opacity: 0.16 },
                emphasis: { focus: "series" },
                data: s.values,
                markLine: k === 0 ? {
                  symbol: "none", silent: true, label: { show: false },
                  lineStyle: { color: tk.ink2, width: 1, type: "solid" },
                  data: [{ xAxis: String(filters.year) }],
                } : undefined,
                markArea: k === 0 && partial.length ? {
                  silent: true, itemStyle: { color: tk.grid, opacity: 0.35 },
                  label: { show: true, position: "insideTop", color: tk.muted, fontSize: 11, formatter: t("partial year") },
                  data: [[{ xAxis: String(partial[0] - 1) }, { xAxis: String(partial[partial.length - 1]) }]],
                } : undefined,
              })),
            })} />
        </>
      )}
    </ChartCard>
  );
}

function HectareTreemap({ records, yi }: { records: DataRecord[]; yi: number }) {
  const { m, ix, navigate } = useApp();
  const tree = useMemo(() => m.outcomes.map((o) => {
    const inds = m.indicators.filter((i) => i.outcome === o.id && m.meta.areaIndicators.includes(i.code)).map((i) => {
      const g = byKey(records.filter((r) => r.indicator === i.code), (r) => r.programme);
      const children = [...g.entries()].map(([pid, rs]) => ({
        name: ix.programmes.get(pid)!.name, id: `${i.code}|${pid}`,
        value: rs.reduce((s, r) => s + (valueAt(r.values, yi) ?? 0), 0),
      })).filter((c) => c.value > 0);
      return { name: nameOf(i), id: i.code, value: children.reduce((s, c) => s + c.value, 0), children };
    }).filter((i) => i.value > 0);
    return { name: nameOf(o), id: o.id, outcome: o.id, value: inds.reduce((s, i) => s + i.value, 0), children: inds };
  }).filter((o) => o.value > 0), [m, ix, records, yi]);
  const grand = tree.reduce((s, o) => s + o.value, 0) || 1;
  const flat = tree.flatMap((o) => o.children.flatMap((i) => i.children.map((p) => ({ o: o.name, i: i.name, p: p.name, v: p.value }))));

  return (
    <ChartCard className="span-5" title={t("Where the hectares are")} sub={t("By outcome, indicator and programme")}
      table={{
        cols: [
          { key: "o", label: t("Outcome"), value: (r: (typeof flat)[number]) => r.o },
          { key: "i", label: t("Indicator"), value: (r: (typeof flat)[number]) => r.i },
          { key: "p", label: t("Programme"), value: (r: (typeof flat)[number]) => r.p },
          { key: "v", label: "ha", numeric: true, value: (r: (typeof flat)[number]) => Math.round(r.v) },
        ] as Column<(typeof flat)[number]>[],
        rows: flat,
      }}>
      {(ref) => tree.length ? (
        <Chart height={360} label="Treemap of hectares by outcome, indicator and programme" chartRef={ref} deps={[tree]}
          onClick={(p) => {
            const id = (p.data as { id?: string })?.id ?? "";
            if (id.includes("|")) navigate({ page: "programme", id: id.split("|")[1] });
          }}
          option={(tk) => ({
            tooltip: {
              ...tooltipBase(tk),
              formatter: (p: { treePathInfo: { name: string }[]; value: number }) => {
                const path = p.treePathInfo.slice(1).map((x) => x.name);
                return tipTitle(path.slice(0, -1).join(" › ")) + `<b>${esc(path[path.length - 1])}</b><div style="font-size:15px;font-weight:700;margin-top:4px">${esc(num(p.value))} ha</div>`;
              },
            },
            series: [{
              type: "treemap", roam: false, nodeClick: "zoomToNode", width: "100%", height: "88%", top: 0,
              breadcrumb: {
                show: true, bottom: 0, left: 0, height: 22,
                itemStyle: { color: tk.surface2, borderColor: tk.border, textStyle: { color: tk.ink2 } },
                emphasis: { itemStyle: { color: tk.grid } },
              },
              // Tiles under ~2.5 % of the total stay unlabelled (tooltip + table carry them).
              label: { show: true, fontSize: 12, fontWeight: 600, overflow: "truncate",
                formatter: (p: { name: string; value: number }) => (p.value / grand >= 0.025 ? `${p.name}\n${compact(p.value)} ha` : "") },
              upperLabel: { show: true, height: 22, fontWeight: 650, fontSize: 12,
                formatter: (p: { name: string; value: number }) => (p.value / grand >= 0.04 ? p.name : "") },
              itemStyle: { borderColor: tk.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
              levels: [
                { itemStyle: { borderWidth: 0, gapWidth: 3 }, upperLabel: { show: false } },
                { itemStyle: { gapWidth: 2, borderColor: tk.surface } },
                { itemStyle: { gapWidth: 2, borderColor: tk.surface, borderWidth: 1 } },
              ],
              data: tree.map((o) => {
                const c = outcomeHex(m, tk, o.outcome);
                const ink = textOn(c);
                return { ...o, itemStyle: { color: c }, label: { color: ink }, upperLabel: { color: ink } };
              }),
            }],
          })} />
      ) : <NoHectares />}
    </ChartCard>
  );
}

