import { useMemo, useState } from "react";
import { useApp } from "../lib/state";
import { useFiltered } from "../lib/hooks";
import { nameOf, t } from "../lib/i18n";
import { byKey, indicatorAggs, indicatorCoverage, outcomeAchievement, statusOf, valueAt, type IndicatorAgg } from "../lib/model";
import { compact, num, pct, signed, unitLabel, withUnit } from "../lib/format";
import { outcomeHex, outcomeVar } from "../lib/colors";
import { axisBase, esc, tipRow, tipTitle, tooltipBase } from "../lib/echarts";
import { Chart } from "../components/Chart";
import type { Indicator } from "../lib/types";
import { ChartCard, DataTable, Legend, Meter, MiniMeter, STATUS_META, StatusBadge, type Column } from "../components/ui";

export function OutcomePage({ id }: { id: string }) {
  const { m, ix, lang, navigate } = useApp();
  const { records, yi, year, years } = useFiltered();
  const outcome = m.outcomes.find((o) => o.id === id) ?? m.outcomes[0];
  const color = outcomeVar(m, outcome.id);
  const recs = useMemo(() => records.filter((r) => ix.outcomeOf(r) === outcome.id), [records, ix, outcome.id]);
  const aggs = useMemo(() => indicatorAggs(ix, recs, yi), [ix, recs, yi]);
  const achievement = outcomeAchievement(aggs);
  const [rankInd, setRankInd] = useState<string | null>(null);
  const rankCode = aggs.find((a) => a.indicator.code === rankInd)?.indicator.code ?? aggs[0]?.indicator.code;
  const catalogue = m.indicators.filter((i) => i.outcome === outcome.id);
  const reportedCats = new Set(m.indicators.filter((i) => i.reported).map((i) => i.outcome));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><i className="dot" style={{ background: color }} />{t("Outcomes")} · {t("As of")} {year}</div>
          <h1>{nameOf(outcome)}</h1>
          <p>
            <span className="pill" style={{ marginRight: 8 }}>{outcome.id} · {t("Outcome")} {outcome.no}</span>
            {aggs.length} / {catalogue.length} {t("standard indicators reported")} · {new Set(recs.map((r) => r.programme)).size} {t("programmes")}
            {achievement !== null && <> · {t("Achievement")} <b>{pct(achievement)}</b></>}
          </p>
          {outcome.scope && <p className="small" style={{ marginTop: 6 }}>{outcome.scope}</p>}
        </div>
      </div>
      <div className="seg tabs-scroll" role="tablist" aria-label={t("Outcomes")} style={{ marginBottom: 16 }}>
        {m.outcomes.map((o) => (
          <button key={o.id} role="tab" aria-selected={o.id === outcome.id} onClick={() => navigate({ page: "outcome", id: o.id })}
            title={o.full} style={{ opacity: reportedCats.has(o.id) ? 1 : 0.6 }}>
            <i className="dot" style={{ background: outcomeVar(m, o.id), marginRight: 6, verticalAlign: "-1px" }} />{nameOf(o)}
          </button>
        ))}
      </div>

      {!aggs.length && (
        <div className="card empty">
          {reportedCats.has(outcome.id) ? t("No data for the current filters") : t("No results reported yet for this category.")}
        </div>
      )}

      <div className="grid g-3">
        {aggs.map((a) => <IndicatorTile key={a.indicator.code} a={a} color={color} lang={lang} yi={yi} />)}
      </div>

      {aggs.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t("Trajectory")}</h2><span className="muted small">{t("Cumulative result against final target")}</span></div>
          <div className="grid g-2">
            {aggs.map((a) => <Trajectory key={a.indicator.code} a={a} years={years} year={year} />)}
          </div>
        </section>
      )}

      {aggs.length > 0 && rankCode && (
        <section className="section">
          <Ranking aggs={aggs} code={rankCode} onCode={setRankInd} yi={yi} year={year} />
        </section>
      )}

      {recs.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t("Sub-indicators")}</h2><span className="muted small">{recs.length} {t("rows")}</span></div>
          <DataTable
            initialSort={{ key: "ach", dir: -1 }}
            onRowClick={(r) => navigate({ page: "programme", id: r.programme })}
            rows={recs}
            cols={[
              { key: "p", label: t("Programme"), value: (r) => ix.programmes.get(r.programme)!.name },
              { key: "pa", label: t("Partner"), value: (r) => ix.partners.get(r.partner) ?? "" },
              { key: "i", label: t("Indicator"), value: (r) => nameOf(ix.indicators.get(r.indicator)!) },
              { key: "l", label: t("Detail"), value: (r) => r.label },
              { key: "v", label: t("Result"), numeric: true, value: (r) => valueAt(r.values, yi), render: (r) => num(valueAt(r.values, yi)) },
              { key: "t", label: t("Target"), numeric: true, value: (r) => r.target, render: (r) => (r.target ? num(r.target) : "–") },
              { key: "ach", label: t("Achievement"), numeric: true,
                value: (r) => (r.target ? (valueAt(r.values, yi) ?? 0) / r.target : null),
                render: (r) => <MiniMeter value={r.target ? (valueAt(r.values, yi) ?? 0) / r.target : null} color={color} /> },
              { key: "s", label: t("Status"), value: (r) => r.target ? (valueAt(r.values, yi) ?? 0) / r.target : -1,
                render: (r) => {
                  const p = ix.programmes.get(r.programme)!;
                  return <StatusBadge status={statusOf(r.target ? (valueAt(r.values, yi) ?? 0) / r.target : null, p.start, p.end, year)} />;
                } },
            ] as Column<(typeof recs)[number]>[]}
          />
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{t("Standard indicators")}</h2>
          <span className="muted small">{catalogue.filter((i) => i.reported).length} / {catalogue.length} {t("reported")}</span>
        </div>
        <CatalogueTable rows={catalogue} />
      </section>
    </>
  );
}

/** The standard indicators of one or more categories, with tier, unit and whether results are reported. */
export function CatalogueTable({ rows, showCategory = false }: { rows: Indicator[]; showCategory?: boolean }) {
  const { m, ix, navigate } = useApp();
  const sub = new Map(m.subcategories.map((s) => [s.code, s.name]));
  const cov = useMemo(() => indicatorCoverage(ix), [ix]);
  const hasProjects = cov.size > 0;
  return (
    <DataTable rows={rows} maxHeight={560}
      onRowClick={(i) => { if (i.reported) navigate({ page: "outcome", id: i.outcome }); }}
      cols={[
        { key: "c", label: t("Code"), value: (i) => i.code, width: 80 },
        { key: "n", label: t("Indicator"), value: (i) => nameOf(i),
          render: (i) => <span title={i.description}>{nameOf(i)}</span> },
        ...(showCategory ? [{
          key: "o", label: t("Category"), value: (i: Indicator) => nameOf(m.outcomes.find((o) => o.id === i.outcome)!),
          render: (i: Indicator) => (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <i className="dot" style={{ background: outcomeVar(m, i.outcome) }} />{nameOf(m.outcomes.find((o) => o.id === i.outcome)!)}
            </span>
          ),
        }] : []),
        { key: "s", label: t("Sub-category"), value: (i) => sub.get(i.subcategory) ?? i.subcategory },
        { key: "t", label: t("Tier"), value: (i) => i.tier, render: (i) => <TierBadge tier={i.tier} /> },
        { key: "u", label: t("Unit"), value: (i) => i.unitLabel },
        { key: "a", label: t("Aggregation"), value: (i) => i.aggregation },
        ...(hasProjects ? [{
          key: "p", label: t("Projects"), numeric: true, value: (i: Indicator) => cov.get(i.code)?.expected ?? 0,
          render: (i: Indicator) => {
            const c = cov.get(i.code);
            if (!c) return <span className="muted">–</span>;
            return <span title={`${c.expected} ${t("projects expected to report it")} · ${c.reported} ${t("reporting")} · ${c.optional} ${t("optional")}`}>
              {c.reported}<span className="muted"> / {c.expected}</span>
            </span>;
          },
        }] : []),
        { key: "r", label: t("Reported"), value: (i) => (i.reported ? 1 : 0),
          render: (i) => (i.reported ? <span className="status"><span style={{ color: "var(--good)", display: "inline-flex" }}>●</span>{t("Yes")}</span> : <span className="muted">–</span>) },
      ] as Column<Indicator>[]} />
  );
}

export function TierBadge({ tier }: { tier: string }) {
  const label = tier === "T1" ? t("Core") : tier === "T2" ? t("Headline") : t("Supplementary");
  return <span className={`pill tier tier-${tier.toLowerCase()}`} title={label}>{tier} · {label}</span>;
}

export function IndicatorTile({ a, color, lang, yi }: { a: IndicatorAgg; color: string; lang: string; yi: number }) {
  const { m } = useApp();
  const delta = a.value - a.previous;
  const sub = m.subcategories.find((s) => s.code === a.indicator.subcategory)?.name;
  // Several old indicators can feed one standard code (e.g. buildings and bridges): show the split.
  const types = [...byKey(a.records.filter((r) => r.type), (r) => r.type!).entries()]
    .map(([type, rs]) => [type, rs.reduce((s, r) => s + (valueAt(r.values, yi) ?? 0), 0)] as const);
  return (
    <div className="card tile">
      <div className="xsmall muted" style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
        <span>{a.indicator.code}{sub ? ` · ${sub}` : ""}</span><TierBadge tier={a.indicator.tier} />
      </div>
      <div className="l" title={a.indicator.description}>{nameOf(a.indicator)}</div>
      <div className="v">{compact(a.value)}<small>{unitLabel(a.indicator.unit, lang)}</small></div>
      <div className="d">
        {delta !== 0 ? <span className={delta > 0 ? "delta-up" : undefined}>{signed(delta, compact)}</span> : "±0"} {t("vs previous year")}
      </div>
      <Meter value={a.achievement} color={color}
        left={<>{pct(a.achievement)} {t("of target")}</>}
        right={<>{t("target")} {withUnit(a.targeted, a.indicator.unit, lang, true)}</>} />
      {types.length > 1 && (
        <div className="xsmall ink-2" style={{ marginTop: 8 }}>
          {types.map(([type, v]) => `${t(type)} ${compact(v)}`).join(" · ")}
        </div>
      )}
      <div className="xsmall muted" style={{ marginTop: 8 }}>
        {a.programmes} {t("programmes")} · {a.targetedRows}/{a.rows} {t("rows with a target")}
      </div>
    </div>
  );
}

export function Trajectory({ a, years, year }: { a: IndicatorAgg; years: number[]; year: number }) {
  const { m, lang } = useApp();
  const values = years.map((_, i) => a.records.reduce((s, r) => s + (valueAt(r.values, i) ?? 0), 0));
  const target = a.target;
  const unit = unitLabel(a.indicator.unit, lang) ? ` ${unitLabel(a.indicator.unit, lang)}` : "";
  return (
    <ChartCard title={nameOf(a.indicator)} sub={target ? `${t("Target")}: ${withUnit(target, a.indicator.unit, lang)}` : t("No target")}
      table={{
        cols: [
          { key: "y", label: "Year", value: (r: { y: number; v: number }) => r.y },
          { key: "v", label: t("Result"), numeric: true, value: (r: { y: number; v: number }) => Math.round(r.v) },
          { key: "t", label: t("Target"), numeric: true, value: () => target },
        ],
        rows: years.map((y, i) => ({ y, v: values[i] })),
      }}>
      {(ref) => (
        <Chart height={240} label={`${nameOf(a.indicator)} trajectory`} chartRef={ref} deps={[values.join(), target, year]}
          option={(tk) => {
            const c = outcomeHex(m, tk, a.indicator.outcome);
            const yi = years.indexOf(year);
            return {
              grid: { left: 8, right: 70, top: 18, bottom: 4, containLabel: true },
              tooltip: {
                ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "line", lineStyle: { color: tk.ink2, width: 1 } },
                formatter: (ps: { dataIndex: number }[]) => {
                  const i = ps[0].dataIndex;
                  return tipTitle(String(years[i])) + tipRow(c, `${num(values[i])}${unit}`, t("Result")) +
                    tipRow(tk.ink2, `${num(target)}${unit}`, t("Target")) +
                    (target ? `<div style="margin-top:6px;opacity:.8">${esc(pct(values[i] / target))} ${esc(t("of target"))}</div>` : "");
                },
              },
              xAxis: { type: "category", boundaryGap: false, data: years.map(String), ...axisBase(tk), splitLine: { show: false } },
              yAxis: {
                type: "value", ...axisBase(tk), axisLine: { show: false }, max: (v: { max: number }) => Math.max(v.max, target) * 1.08,
                axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) },
              },
              series: [{
                type: "line", data: values, smooth: 0.2, symbol: "circle", symbolSize: 8,
                showSymbol: true, lineStyle: { width: 2, color: c },
                itemStyle: { color: c, borderColor: tk.surface, borderWidth: 2 },
                areaStyle: { color: c, opacity: 0.1 },
                label: {
                  show: true, position: "top", color: tk.ink, fontWeight: 600, fontSize: 12,
                  formatter: (p: { dataIndex: number }) => (p.dataIndex === yi ? compact(values[yi]) : ""),
                },
                markLine: target ? {
                  symbol: "none", silent: true,
                  lineStyle: { color: tk.ink2, width: 1, type: [4, 4] },
                  label: { position: "end", color: tk.ink2, fontSize: 11, formatter: `${t("Target")}\n${compact(target)}` },
                  data: [{ yAxis: target }],
                } : undefined,
              }],
            };
          }} />
      )}
    </ChartCard>
  );
}

function Ranking({ aggs, code, onCode, yi, year }: { aggs: IndicatorAgg[]; code: string; onCode: (c: string) => void; yi: number; year: number }) {
  const { m, ix, navigate, lang } = useApp();
  const a = aggs.find((x) => x.indicator.code === code)!;
  const rows = [...byKey(a.records, (r) => r.programme).entries()].map(([pid, rs]) => {
    const value = rs.reduce((s, r) => s + (valueAt(r.values, yi) ?? 0), 0);
    const target = rs.reduce((s, r) => s + (r.target ?? 0), 0);
    const p = ix.programmes.get(pid)!;
    const ach = target > 0 ? value / target : null;
    return { pid, name: p.name, value, target, ach, status: statusOf(ach, p.start, p.end, year) };
  }).sort((x, y) => y.value - x.value);
  const unit = a.indicator.unit;
  const color = outcomeVar(m, a.indicator.outcome);

  return (
    <ChartCard title={t("Programme ranking")} sub={`${nameOf(a.indicator)} · ${t("Result and achievement by programme")}`}
      table={{
        cols: [
          { key: "p", label: t("Programme"), value: (r: (typeof rows)[number]) => r.name },
          { key: "v", label: t("Result"), numeric: true, value: (r: (typeof rows)[number]) => Math.round(r.value) },
          { key: "t", label: t("Target"), numeric: true, value: (r: (typeof rows)[number]) => r.target },
          { key: "a", label: t("Achievement"), numeric: true, value: (r: (typeof rows)[number]) => (r.ach === null ? null : Math.round(r.ach * 100) / 100) },
        ],
        rows,
      }}
      extra={aggs.length > 1 ? (
        <div className="seg" style={{ marginRight: 6 }}>
          {aggs.map((x) => (
            <button key={x.indicator.code} aria-pressed={x.indicator.code === code} onClick={() => onCode(x.indicator.code)} title={nameOf(x.indicator)}>
              #{x.indicator.code}
            </button>
          ))}
        </div>
      ) : undefined}>
      {(ref) => (<>
        <Legend items={[{ label: t("Result"), color: color }, { label: t("Target"), color: "var(--ink)" }]} />
        <Chart height={Math.max(160, rows.length * 34 + 40)} label="Programme ranking" chartRef={ref} deps={[rows, code]}
          onClick={(p) => { const r = rows[p.dataIndex]; if (r) navigate({ page: "programme", id: r.pid }); }}
          option={(tk) => {
            const c = outcomeHex(m, tk, a.indicator.outcome);
            return {
              grid: { left: 8, right: 120, top: 8, bottom: 4, containLabel: true },
              tooltip: {
                ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                formatter: (ps: { dataIndex: number }[]) => {
                  const r = rows[ps[0].dataIndex];
                  return tipTitle(r.name) + tipRow(c, withUnit(r.value, unit, lang), t("Result"), "rect") +
                    tipRow(tk.ink2, r.target ? withUnit(r.target, unit, lang) : "–", t("Target"), "line") +
                    `<div style="margin-top:6px;opacity:.85">${esc(pct(r.ach))} · ${esc(t(STATUS_META[r.status].label))}</div>`;
                },
              },
              xAxis: { type: "value", ...axisBase(tk), axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) }, splitNumber: 4 },
              yAxis: {
                type: "category", inverse: true, data: rows.map((r) => r.name), ...axisBase(tk), splitLine: { show: false },
                axisLabel: { ...axisBase(tk).axisLabel, color: tk.ink2, width: 170, overflow: "truncate" },
              },
              series: [
                {
                  type: "bar", barMaxWidth: 16, cursor: "pointer",
                  itemStyle: { color: c, borderRadius: [0, 4, 4, 0] },
                  emphasis: { itemStyle: { color: c, opacity: 0.85 } },
                  label: {
                    show: true, position: "right", color: tk.ink2, fontSize: 12,
                    formatter: (p: { dataIndex: number }) => {
                      const r = rows[p.dataIndex];
                      return `${compact(r.value)}${r.ach !== null ? `  ·  ${pct(r.ach)}` : ""}`;
                    },
                  },
                  data: rows.map((r) => r.value),
                },
                {
                  // Target marker: a thin vertical tick at each programme's target.
                  type: "line", symbol: "rect", symbolSize: [2, 20], lineStyle: { opacity: 0 }, silent: true, z: 4,
                  itemStyle: { color: tk.ink },
                  data: rows.map((r) => (r.target > 0 ? [r.target, r.name] : ["-", r.name])),
                },
              ],
            };
          }} />
      </>)}
    </ChartCard>
  );
}

