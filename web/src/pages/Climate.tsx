import { useMemo, useState } from "react";
import { useApp } from "../lib/state";
import { CarbonTip } from "../components/CarbonTip";
import { useFiltered } from "../lib/hooks";
import { nameOf, t } from "../lib/i18n";
import { byKey, co2Aggregate, type LedgerTotals } from "../lib/model";
import { compact, num, pct, tco2 } from "../lib/format";
import { axisBase, esc, tipRow, tipTitle, tooltipBase } from "../lib/echarts";
import { Chart } from "../components/Chart";
import { Link } from "../components/Shell";
import { TierBadge } from "./OutcomePage";
import { claimLabel, moduleLabel } from "../components/coverage";
import { ChartCard, CountUp, DataTable, Legend, Meter, type Column } from "../components/ui";
import type { CarbonFactor } from "../lib/types";

type LedgerKey = "intervention" | "inventory";
type Basis = "expected" | "realised";

// Intervention = slot 1 (blue), inventory = slot 3 (aqua): both in the validated first three.
const LEDGER_SLOT: Record<LedgerKey, number> = { intervention: 0, inventory: 2 };
const LEDGER_CSS: Record<LedgerKey, string> = { intervention: "var(--s1)", inventory: "var(--s3)" };

const pick = (l: LedgerTotals, b: Basis) => (b === "expected" ? l.expected : l.realised);
const band = (l: LedgerTotals, b: Basis): [number, number] => (b === "expected" ? [l.low, l.high] : [l.realisedLow, l.realisedHigh]);

export function Climate() {
  const { m, ix } = useApp();
  const { records, yi, year, years } = useFiltered();
  const [ledger, setLedger] = useState<LedgerKey>("intervention");
  const [basis, setBasis] = useState<Basis>("expected");
  const co2Recs = useMemo(() => records.filter((r) => r.co2), [records]);
  const total = co2Aggregate(co2Recs, yi);
  const sel = total[ledger];
  const other: Basis = basis === "expected" ? "realised" : "expected";
  const [lo, hi] = band(sel, basis);

  const byInd = m.indicators.filter((i) => i.hasCo2).map((i) => {
    const a = co2Aggregate(co2Recs.filter((r) => r.indicator === i.code), yi);
    return { i, a, v: pick(a[ledger], basis), band: band(a[ledger], basis), target: a[ledger].target };
  }).filter((x) => x.v > 0 || x.target > 0 || x.a.indicative.expected > 0 || x.a.potential.expected > 0).sort((a, b) => b.v - a.v);

  const byCountry = [...byKey(co2Recs, (r) => ix.countryOf(r)).entries()].map(([c, rs]) => {
    const a = co2Aggregate(rs, yi);
    return { c: nameOf(ix.countries.get(c)!), v: pick(a[ledger], basis), band: band(a[ledger], basis) };
  }).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);

  const series = years.map((_, i) => co2Aggregate(co2Recs, i)[ledger]);

  // Per-unit values actually used, one row per indicator × stratum present in the data.
  const perUnit = useMemo(() => {
    const seen = new Map<string, { code: string; stratum: string; inv: number; int: number; pot: number; tier: number; n: number; basis: string }>();
    for (const r of co2Recs) {
      const c = r.co2!;
      const k = `${r.indicator}|${c.stratum}|${c.basis}`;
      const e = seen.get(k) ?? { code: r.indicator, stratum: c.stratum, inv: c.perUnit.inventory, int: c.perUnit.intervention, pot: c.perUnit.potential + c.perUnit.indicative, tier: c.tier, n: 0, basis: c.basis };
      e.n++;
      seen.set(k, e);
    }
    return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code) || a.stratum.localeCompare(b.stratum));
  }, [co2Recs]);

  const claims = m.carbon.claims.map((c) => ({ ...c, p: m.projects.find((p) => p.id === c.project) }));
  const exPost = co2Recs.filter((r) => r.co2!.basis === "ex post").length;
  const monitoring = Object.entries(m.carbon.monitoring).map(([name, v]) => ({ name, p: m.programmes.find((p) => p.name === name), ...v }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("Climate impact")} · {t("As of")} {year} · {t("Method")} {m.carbon.method}</div>
          <h1>{t("Climate impact")}</h1>
          <p>
            {t("Net GHG benefit expected, full cycle")}: <b>{tco2(total.intervention.expected)}</b> ({t("p5–p95 band")} {compact(total.intervention.low, 2)}–{compact(total.intervention.high, 2)}) ·{" "}
            {total.intervention.target > 0 ? pct(total.intervention.expected / total.intervention.target, 1) : "–"} {t("of what the programmes' final targets would deliver")} ({compact(total.intervention.target)} tCO₂e)<CarbonTip term="target" />.
          </p>
          <p className="small" style={{ marginTop: 6 }}>
            {ledger === "inventory" ? t("Stock changes within the boundary, no baseline, no netting") : t("Net benefit against a baseline, after leakage and non-permanence buffer")}.<CarbonTip term="ledgers" />
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div className="seg" role="group" aria-label={t("Ledger")}>
            {(["intervention", "inventory"] as LedgerKey[]).map((k) => (
              <button key={k} aria-pressed={ledger === k} onClick={() => setLedger(k)}>
                <i className="dot" style={{ background: LEDGER_CSS[k], marginRight: 6, verticalAlign: "-1px" }} />{t(k === "inventory" ? "Inventory ledger" : "Intervention ledger")}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label={t("Basis")}>
            {(["expected", "realised"] as Basis[]).map((k) => (
              <button key={k} aria-pressed={basis === k} onClick={() => setBasis(k)}>{k === "expected" ? t("Expected (full cycle)") : t("Realised to date")}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g-4">
        <div className="card tile" style={{ borderTop: `3px solid ${LEDGER_CSS[ledger]}` }}>
          <div className="l">{t(ledger === "inventory" ? "Removals" : "Net GHG benefit")}<CarbonTip term={ledger === "inventory" ? "removals" : "net"} /> · {basis === "expected" ? t("Expected") : t("Realised")}<CarbonTip term={basis} /></div>
          <div className="v"><CountUp value={pick(sel, basis)} format={(v) => compact(v, 2)} /><small>tCO₂e</small></div>
          <div className="d">{t("p5–p95 band")}: {compact(lo, 2)} – {compact(hi, 2)}<CarbonTip term="band" /></div>
          <Meter value={sel.target ? pick(sel, basis) / sel.target : null} color={LEDGER_CSS[ledger]}
            left={<>{pct(sel.target ? pick(sel, basis) / sel.target : null)} {t("of target")}<CarbonTip term="target" /></>} right={<>{compact(sel.target)}</>} />
        </div>
        <div className="card tile">
          <div className="l">{t(ledger === "inventory" ? "Removals" : "Net GHG benefit")} · {other === "expected" ? t("Expected") : t("Realised")}<CarbonTip term={other} /></div>
          <div className="v">{compact(pick(sel, other), 2)}<small>tCO₂e</small></div>
          <div className="d">{t("p5–p95 band")}: {compact(band(sel, other)[0], 2)} – {compact(band(sel, other)[1], 2)}</div>
        </div>
        <div className="card tile">
          <div className="l">{ledger === "inventory" ? t("Net GHG benefit") : t("Removals")}<CarbonTip term={ledger === "inventory" ? "net" : "removals"} /> · {basis === "expected" ? t("Expected") : t("Realised")}</div>
          <div className="v">{compact(pick(total[ledger === "inventory" ? "intervention" : "inventory"], basis), 2)}<small>tCO₂e</small></div>
          <div className="d">{t("Emissions booked (reversals)")}: {compact(total.emissions, 2)} tCO₂e<CarbonTip term="emissions" /></div>
        </div>
        <div className="card tile">
          <div className="l">{t("not in the headline")}</div>
          <div className="small" style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>{t("Indicative: soil carbon")}<CarbonTip term="indicative" /></span><b>{compact(basis === "expected" ? total.indicative.expected : total.indicative.realised, 2)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span>{t("Potential: displaced fuelwood")}<CarbonTip term="potential" /></span><b>{compact(basis === "expected" ? total.potential.expected : total.potential.realised, 2)}</b></div>
          </div>
        </div>
      </div>

      <section className="section grid g-12">
        <ChartCard className="span-7" title={t("By indicator")} sub={`${t(ledger === "inventory" ? "Inventory ledger" : "Intervention ledger")} · ${basis === "expected" ? t("Expected (full cycle)") : t("Realised to date")}`}
          table={{
            cols: [
              { key: "i", label: t("Indicator"), value: (r: (typeof byInd)[number]) => `${r.i.code} ${nameOf(r.i)}` },
              { key: "v", label: "tCO₂e", numeric: true, value: (r: (typeof byInd)[number]) => Math.round(r.v) },
              { key: "lo", label: "p5", numeric: true, value: (r: (typeof byInd)[number]) => Math.round(r.band[0]) },
              { key: "hi", label: "p95", numeric: true, value: (r: (typeof byInd)[number]) => Math.round(r.band[1]) },
              { key: "t", label: t("Target"), numeric: true, value: (r: (typeof byInd)[number]) => Math.round(r.target) },
            ],
            rows: byInd,
          }}>
          {(ref) => (
            <>
              <Legend items={[{ label: t(ledger === "inventory" ? "Removals" : "Net GHG benefit"), color: LEDGER_CSS[ledger] }, { label: t("Target"), color: "var(--ink)" }]} />
              <Chart height={Math.max(220, byInd.length * 46 + 30)} label="CO2 by indicator" chartRef={ref} deps={[byInd, ledger, basis]}
                option={(tk) => ({
                  grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
                  tooltip: {
                    ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                    formatter: (ps: { dataIndex: number }[]) => {
                      const r = byInd[ps[0].dataIndex];
                      return tipTitle(`${r.i.code} ${nameOf(r.i)}`) + tipRow(tk.series[LEDGER_SLOT[ledger]], tco2(r.v), t(ledger === "inventory" ? "Removals" : "Net GHG benefit"), "rect") +
                        `<div style="opacity:.8">${esc(t("p5–p95 band"))}: ${esc(compact(r.band[0], 2))} – ${esc(compact(r.band[1], 2))}</div>` +
                        (r.target ? tipRow(tk.ink, tco2(r.target), t("Target")) : "") +
                        (r.a.indicative.expected ? `<div style="opacity:.8">${esc(t("Indicative: soil carbon"))}: ${esc(tco2(basis === "expected" ? r.a.indicative.expected : r.a.indicative.realised))}</div>` : "") +
                        (r.a.potential.expected ? `<div style="opacity:.8">${esc(t("Potential: displaced fuelwood"))}: ${esc(tco2(basis === "expected" ? r.a.potential.expected : r.a.potential.realised))}</div>` : "");
                    },
                  },
                  // Scale on values and bands; targets far beyond them stay in the tooltip and table.
                  xAxis: { type: "value", max: Math.max(1, ...byInd.map((r) => Math.max(r.v, r.band[1]))) * 1.15, ...axisBase(tk), axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) } },
                  yAxis: { type: "category", inverse: true, data: byInd.map((r) => nameOf(r.i)), ...axisBase(tk), splitLine: { show: false },
                    axisLabel: { ...axisBase(tk).axisLabel, color: tk.ink2, width: 170, overflow: "truncate" } },
                  series: [
                    { type: "bar", barMaxWidth: 18, data: byInd.map((r) => r.v), itemStyle: { color: tk.series[LEDGER_SLOT[ledger]], borderRadius: [0, 4, 4, 0] },
                      label: { show: true, position: "right", color: tk.ink2, fontSize: 12, formatter: (p: { dataIndex: number }) => compact(byInd[p.dataIndex].v) } },
                    { // p5–p95 band as a thin bar behind
                      type: "custom", silent: true, z: 1,
                      renderItem: (params: { dataIndex: number }, api: { coord: (v: [number, number]) => [number, number]; size: (v: [number, number]) => [number, number] }) => {
                        const r = byInd[params.dataIndex];
                        const [x0, y] = api.coord([r.band[0], params.dataIndex]);
                        const [x1] = api.coord([r.band[1], params.dataIndex]);
                        return { type: "rect", shape: { x: x0, y: y - 2, width: Math.max(0, x1 - x0), height: 4 }, style: { fill: tk.ink2, opacity: 0.35 } };
                      },
                      data: byInd.map((r) => r.v),
                    },
                    { type: "line", symbol: "rect", symbolSize: [2, 22], lineStyle: { opacity: 0 }, silent: true, z: 5, clip: true,
                      itemStyle: { color: tk.ink }, data: byInd.map((r) => [r.target || "-", nameOf(r.i)]) },
                  ],
                })} />
            </>
          )}
        </ChartCard>

        <ChartCard className="span-5" title={t("Expected and realised over time")} sub={t("Full cycle of what is in place each year, with the p5–p95 band")}
          table={{
            cols: [
              { key: "y", label: t("Year"), value: (r: { y: number; i: number }) => r.y },
              { key: "e", label: t("Expected"), numeric: true, value: (r: { y: number; i: number }) => Math.round(series[r.i].expected) },
              { key: "lo", label: "p5", numeric: true, value: (r: { y: number; i: number }) => Math.round(series[r.i].low) },
              { key: "hi", label: "p95", numeric: true, value: (r: { y: number; i: number }) => Math.round(series[r.i].high) },
              { key: "r", label: t("Realised"), numeric: true, value: (r: { y: number; i: number }) => Math.round(series[r.i].realised) },
            ] as Column<{ y: number; i: number }>[],
            rows: years.map((y, i) => ({ y, i })),
          }}>
          {(ref) => (
            <>
              <Legend kind="line" items={[{ label: t("Expected"), color: LEDGER_CSS[ledger] }, { label: t("Realised"), color: "var(--ink)" }]} />
              <Chart height={300} label="Expected and realised over time" chartRef={ref} deps={[series, year, ledger]}
                option={(tk) => ({
                  grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
                  tooltip: {
                    ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "line", lineStyle: { color: tk.ink2, width: 1 } },
                    formatter: (ps: { dataIndex: number }[]) => {
                      const i = ps[0].dataIndex;
                      return tipTitle(String(years[i])) + tipRow(tk.series[LEDGER_SLOT[ledger]], tco2(series[i].expected), t("Expected")) +
                        `<div style="opacity:.8">${esc(t("p5–p95 band"))}: ${esc(compact(series[i].low, 2))} – ${esc(compact(series[i].high, 2))}</div>` +
                        tipRow(tk.ink, tco2(series[i].realised), t("Realised"));
                    },
                  },
                  xAxis: { type: "category", boundaryGap: false, data: years.map(String), ...axisBase(tk), splitLine: { show: false } },
                  yAxis: { type: "value", ...axisBase(tk), axisLine: { show: false }, axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) } },
                  series: [
                    { name: "p5", type: "line", stack: "band", silent: true, symbol: "none", lineStyle: { opacity: 0 }, data: series.map((s) => s.low) },
                    { name: "band", type: "line", stack: "band", silent: true, symbol: "none", lineStyle: { opacity: 0 },
                      areaStyle: { color: tk.series[LEDGER_SLOT[ledger]], opacity: 0.12 }, data: series.map((s) => Math.max(0, s.high - s.low)) },
                    { name: t("Expected"), type: "line", smooth: 0.2, symbolSize: 8, data: series.map((s) => s.expected),
                      lineStyle: { width: 2, color: tk.series[LEDGER_SLOT[ledger]] }, itemStyle: { color: tk.series[LEDGER_SLOT[ledger]], borderColor: tk.surface, borderWidth: 2 },
                      markLine: { symbol: "none", silent: true, label: { show: false }, lineStyle: { color: tk.ink2, width: 1, type: "solid" }, data: [{ xAxis: String(year) }] } },
                    { name: t("Realised"), type: "line", smooth: 0.2, symbolSize: 8, data: series.map((s) => s.realised),
                      lineStyle: { width: 2, color: tk.ink }, itemStyle: { color: tk.ink, borderColor: tk.surface, borderWidth: 2 } },
                  ],
                })} />
            </>
          )}
        </ChartCard>
      </section>

      <section className="section grid g-12">
        <ChartCard className="span-5" title={t("CO₂ by country")} sub={`${t(ledger === "inventory" ? "Inventory ledger" : "Intervention ledger")} · ${basis === "expected" ? t("Expected (full cycle)") : t("Realised to date")}`}
          table={{
            cols: [
              { key: "c", label: t("Country"), value: (r: (typeof byCountry)[number]) => r.c },
              { key: "v", label: "tCO₂e", numeric: true, value: (r: (typeof byCountry)[number]) => Math.round(r.v) },
              { key: "lo", label: "p5", numeric: true, value: (r: (typeof byCountry)[number]) => Math.round(r.band[0]) },
              { key: "hi", label: "p95", numeric: true, value: (r: (typeof byCountry)[number]) => Math.round(r.band[1]) },
            ],
            rows: byCountry,
          }}>
          {(ref) => (
            <Chart height={Math.max(160, byCountry.length * 40 + 20)} label="CO2 by country" chartRef={ref} deps={[byCountry, ledger, basis]}
              option={(tk) => ({
                grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
                tooltip: {
                  ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                  formatter: (ps: { dataIndex: number }[]) => {
                    const r = byCountry[ps[0].dataIndex];
                    return tipTitle(r.c) + tipRow(tk.map[3], tco2(r.v), t(ledger === "inventory" ? "Removals" : "Net GHG benefit"), "rect") +
                      `<div style="opacity:.8">${esc(t("p5–p95 band"))}: ${esc(compact(r.band[0], 2))} – ${esc(compact(r.band[1], 2))}</div>`;
                  },
                },
                xAxis: { type: "value", ...axisBase(tk), axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => compact(v) } },
                yAxis: { type: "category", inverse: true, data: byCountry.map((r) => r.c), ...axisBase(tk), splitLine: { show: false },
                  axisLabel: { ...axisBase(tk).axisLabel, color: tk.ink2 } },
                series: [{
                  type: "bar", barMaxWidth: 18, data: byCountry.map((r) => r.v), itemStyle: { color: tk.map[3], borderRadius: [0, 4, 4, 0] },
                  label: { show: true, position: "right", color: tk.ink2, fontSize: 12, formatter: (p: { value: number }) => compact(p.value) },
                }],
              })} />
          )}
        </ChartCard>

        <section className="card span-7" aria-label={t("Per-unit values")}>
          <div className="card-head"><div><h3>{t("Per-unit values")}</h3><div className="sub">{t("tCO₂e per hectare or device over the full cycle, by stratum")}</div></div></div>
          <DataTable rows={perUnit} maxHeight={360} cols={[
            { key: "c", label: t("Indicator"), value: (r) => r.code, render: (r) => <span title={nameOf(ix.indicators.get(r.code)!)}>{r.code}</span>, width: 70 },
            { key: "a", label: t("Archetype"), value: (r) => moduleLabel(m.carbon.archetypes[r.code]?.module ?? ""), render: (r) => <span className="xsmall">{moduleLabel(m.carbon.archetypes[r.code]?.module ?? "")}</span> },
            { key: "s", label: t("Stratum"), value: (r) => r.stratum, render: (r) => <span className="xsmall">{r.stratum}</span> },
            { key: "inv", label: t("Inventory"), numeric: true, value: (r) => r.inv, render: (r) => (r.inv ? num(r.inv, 1) : "–") },
            { key: "int", label: t("Intervention"), numeric: true, value: (r) => r.int, render: (r) => (r.int ? num(r.int, 1) : "–") },
            { key: "pot", label: t("Other"), numeric: true, value: (r) => r.pot, render: (r) => (r.pot ? <span title={`${t("Indicative: soil carbon")} / ${t("Potential: displaced fuelwood")}`}>{num(r.pot, 1)}</span> : "–") },
            { key: "t", label: t("Tier"), numeric: true, value: (r) => r.tier, render: (r) => <TierBadge tier={`T${r.tier}`} /> },
            { key: "b", label: t("Basis"), value: (r) => r.basis, render: (r) => <span className={`pill ${r.basis === "ex post" ? "req req-m" : ""}`}>{t(r.basis)}</span> },
            { key: "n", label: t("rows"), numeric: true, value: (r) => r.n },
          ] as Column<(typeof perUnit)[number]>[]} />
        </section>
      </section>

      <section className="section">
        <div className="section-head">
          <div><h2>{t("Monitoring status")}</h2><p className="muted small">{t("Tier escalation: ENR-02 → usage, ENR-03 → fuel savings, CLM-02 → effectiveness of forest protection; measured values in config/carbon/overrides.yml")}</p></div>
          <span className="muted small">{exPost} / {co2Recs.length} {t("rows")} {t("ex post")}</span>
        </div>
        {monitoring.length ? (
          <DataTable rows={monitoring} cols={[
            { key: "p", label: t("Programme"), value: (r) => r.name, render: (r) => (r.p ? <Link to={{ page: "programme", id: r.p.id }}>{r.name}</Link> : r.name) },
            { key: "i", label: t("Monitored"), value: (r) => Object.entries(r.indicators).map(([k, v]) => `${v} → ${k}`).join(", ") || "–" },
            { key: "o", label: t("Overrides"), value: (r) => r.overrides.join(", ") || "–" },
          ] as Column<(typeof monitoring)[number]>[]} />
        ) : <div className="card small muted">{t("No programme reports ENR-02, ENR-03 or CLM-02 yet, and config/carbon/overrides.yml is empty: every carbon figure is an ex-ante default.")}</div>}
      </section>

      <section className="section">
        <div className="section-head">
          <div><h2>{t("Factor library")}</h2><p className="muted small">{t("Every parameter with its value, tier, uncertainty and source")} · config/carbon/factors.yml · GWP: {m.carbon.gwp.source}</p></div>
        </div>
        <DataTable rows={m.carbon.factors} maxHeight={520} cols={[
          { key: "id", label: t("Parameter"), value: (f) => f.id, render: (f) => <span title={f.note}><code>{f.id}</code>{f.confirm && <> <span className="pill warn">{t("To confirm")}</span></>}</span> },
          { key: "v", label: t("Value"), value: (f) => f.value ?? Object.values(f.values ?? {})[0] ?? null,
            render: (f) => f.values ? <span className="xsmall">{Object.entries(f.values).map(([k, v]) => `${k}: ${num(v, 3)}`).join(" · ")}</span> : num(f.value, 4) },
          { key: "u", label: t("Unit"), value: (f) => f.unit },
          { key: "d", label: t("Distribution"), value: (f) => f.dist },
          { key: "t", label: t("Tier"), numeric: true, value: (f) => f.tier, render: (f) => <TierBadge tier={`T${f.tier}`} /> },
          { key: "m", label: t("Reported"), value: (f) => f.monitoredBy ?? "", render: (f) => (f.monitoredBy ? <span className="xsmall">{t("replaced by")} {f.monitoredBy}</span> : <span className="muted">–</span>) },
          { key: "s", label: t("Source"), value: (f) => f.source, render: (f) => <span className="xsmall">{f.source}</span> },
        ] as Column<CarbonFactor>[]} />
      </section>

      <section className="section">
        <div className="section-head">
          <div><h2>{t("Claims register")}</h2><p className="muted small">{t("Who else accounts for these results, so a tonne is never counted twice")} · config/carbon/claims.yml</p></div>
        </div>
        {claims.length ? (
          <div className="grid g-3">
            {claims.map((c) => (
              <div className="card" key={c.project}>
                <div className="xsmall muted">MPTF {c.project}</div>
                <h3 style={{ fontSize: 15, marginTop: 4 }}>{c.p ? <Link to={{ page: "project", id: String(c.p.id) }}>{c.p.short || c.p.name}</Link> : c.project}</h3>
                <div style={{ marginTop: 8 }}><span className="pill req req-m">{claimLabel(c.status)}</span>{c.confirm && <> <span className="pill warn">{t("To confirm")}</span></>}{c.derived && <> <span className="pill">{t("derived from project type")}</span></>}</div>
                {c.note && <p className="small ink-2" style={{ marginTop: 8 }}>{c.note}</p>}
              </div>
            ))}
          </div>
        ) : <div className="card small muted">{t("No claim registered beyond CAFI's contribution.")}</div>}
      </section>

      <section className="section">
        <div className="section-head"><h2>{t("Archetype")}s</h2><span className="muted small">{t("Reference")}</span></div>
        <DataTable rows={Object.entries(m.carbon.archetypes).map(([code, a]) => ({ code, ...a }))} cols={[
          { key: "c", label: t("Indicator"), value: (r) => `${r.code} ${nameOf(ix.indicators.get(r.code)!)}` },
          { key: "l", label: t("Archetype"), value: (r) => r.label },
          { key: "m", label: t("Module"), value: (r) => moduleLabel(r.module) },
          { key: "s", label: t("System"), value: (r) => r.system ?? (r.ledger ?? "") },
          { key: "r", label: t("Reference"), value: (r) => r.reference ?? "", render: (r) => <span className="xsmall">{r.reference}</span> },
        ] as Column<{ code: string; module: string; label: string; system?: string; reference?: string; ledger?: string }>[]} />
      </section>
    </>
  );
}

