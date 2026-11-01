import { useMemo, useState } from "react";
import { useApp } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { compact, num, pct } from "../lib/format";
import { axisBase, tipRow, tipTitle, tooltipBase } from "../lib/echarts";
import { Chart } from "../components/Chart";
import { Link } from "../components/Shell";
import { ChartCard, CountUp, DataTable, Legend, Meter, MiniMeter, type Column } from "../components/ui";
import { typeShort } from "../components/coverage";
import { coverage, portfolioCounts, projectRecords } from "../lib/model";
import { fill } from "../lib/insights";
import type { Project } from "../lib/types";

// The two trust funds take the first and third palette slots (validated as a pair).
const FUNDS = [
  { id: "CAFI", slot: 0, css: "var(--s1)" },
  { id: "FONAREDD", slot: 2, css: "var(--s3)" },
];
const usd = (v: number) => `$${compact(v)}`;
const isActive = (p: Project) => (p.status ?? "").toLowerCase().startsWith("on going");

export function Portfolio() {
  const { m, ix, filters } = useApp();
  const [fund, setFund] = useState<"" | "CAFI" | "FONAREDD">("");
  const [state, setState] = useState<"" | "active" | "closed">("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const types = useMemo(() => [...new Set(m.projects.map((p) => typeShort(p.projectType)).filter((x) => x !== "–"))].sort(), [m]);
  // Expected (mandatory / required) indicators reported, per project, through its linked programme(s).
  const cov = useMemo(() => new Map(m.projects.map((p) => [p.id, coverage([p], projectRecords(ix, p))])), [m, ix]);

  // Country and programme filters apply; year and partner do not (budgets are life-of-project, MPTF partner names differ).
  const projects = useMemo(() => m.projects.filter((p) =>
    (!filters.countries.length || filters.countries.includes(p.country)) &&
    (!filters.programmes.length || p.programmes.some((x) => filters.programmes.includes(x))) &&
    (!fund || p.fund === fund) &&
    (!state || (state === "active") === isActive(p)) &&
    (!type || typeShort(p.projectType) === type) &&
    (!q.trim() || `${p.name} ${p.short} ${p.id} ${p.orgs.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())),
  ), [m, filters.countries, filters.programmes, fund, state, type, q]);

  // Fund-to-fund transfers (config/portfolio.yml) are listed but never added to totals.
  const counted = projects.filter((p) => !p.passThrough);
  const sum = (k: "approved" | "transferred" | "expenditure") => counted.reduce((s, p) => s + p[k], 0);
  const approved = sum("approved"), transferred = sum("transferred"), spent = sum("expenditure");
  const linked = counted.filter((p) => p.programmes.length).length;
  // Same definitions as the Overview (lib/model.ts portfolioCounts).
  const all = useMemo(() => portfolioCounts(ix, { countries: [], programmes: [] }), [ix]);
  const scope = useMemo(() => portfolioCounts(ix, filters), [ix, filters]);
  const linkedProgrammes = new Set(counted.flatMap((p) => p.programmes)).size;
  const transfers = projects.filter((p) => p.passThrough);
  const expected = counted.filter((p) => p.programmes.length).reduce((s, p) => s + (cov.get(p.id)?.expected ?? 0), 0);
  const reported = counted.filter((p) => p.programmes.length).reduce((s, p) => s + (cov.get(p.id)?.reported ?? 0), 0);

  const byCountry = m.countries.map((c) => ({
    id: c.id, label: nameOf(c),
    funds: FUNDS.map((f) => counted.filter((p) => p.country === c.id && p.fund === f.id).reduce((s, p) => s + p.approved, 0)),
    n: counted.filter((p) => p.country === c.id).length,
  })).filter((r) => r.n).sort((a, b) => b.funds[0] + b.funds[1] - a.funds[0] - a.funds[1]);

  const startYears = [...new Set(counted.map((p) => p.start?.slice(0, 4)).filter(Boolean) as string[])].sort();
  const byYear = startYears.map((y) => ({
    y, funds: FUNDS.map((f) => counted.filter((p) => p.start?.startsWith(y) && p.fund === f.id).reduce((s, p) => s + p.approved, 0)),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">MPTF Gateway · CAFI & FONAREDD · {all.projects.length} {t("projects")}{all.transfers.length ? ` + ${fill(t(all.transfers.length === 1 ? "{n} fund-to-fund transfer" : "{n} fund-to-fund transfers"), { n: all.transfers.length })}` : ""}</div>
          <h1>{t("Portfolio")}</h1>
          <p>{t("Every project financed by the CAFI and FONAREDD trust funds, with budgets and status, linked to the results it reports.")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" type="search" placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)}
            aria-label={t("Search…")} style={{ width: 200 }} />
          <div className="seg" role="group" aria-label={t("Fund")}>
            {(["", "CAFI", "FONAREDD"] as const).map((k) => (
              <button key={k} aria-pressed={fund === k} onClick={() => setFund(k)}>{k || t("All funds")}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label={t("Status")}>
            {(["", "active", "closed"] as const).map((k) => (
              <button key={k} aria-pressed={state === k} onClick={() => setState(k)}>
                {k === "" ? t("All") : k === "active" ? t("Ongoing") : t("Closed")}
              </button>
            ))}
          </div>
          {types.length > 0 && (
            <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label={t("Project type")}>
              <option value="">{t("All types")}</option>
              {types.map((x) => <option key={x} value={x}>{t(x)}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="grid g-4">
        <div className="card tile">
          <div className="l">{t("Projects")}</div>
          <div className="v"><CountUp value={counted.length} format={(v) => num(v)} /></div>
          <div className="d">{counted.filter(isActive).length} {t("ongoing")}</div>
        </div>
        <div className="card tile">
          <div className="l">{t("Approved budget")}</div>
          <div className="v"><CountUp value={approved} format={usd} /></div>
          <div className="d">{t("Transferred")} {usd(transferred)}</div>
        </div>
        <div className="card tile">
          <div className="l">{t("Spent")}</div>
          <div className="v"><CountUp value={spent} format={usd} /></div>
          <Meter value={transferred ? spent / transferred : null} color="var(--accent)"
            left={<>{pct(transferred ? spent / transferred : null)} {t("of transfers")}</>} />
        </div>
        <div className="card tile">
          <div className="l">{t("Reporting results")}</div>
          <div className="v">{linked}<small>/ {counted.length}</small></div>
          <Meter value={counted.length ? linked / counted.length : null} color="var(--accent)"
            left={<>{t("projects linked to a results programme")}</>} />
          <div className="d">{fill(t("through {n} results programmes"), { n: linkedProgrammes })}{scope.unlinked.length > 0 && !fund && !state && !type && !q.trim()
            ? <> · <Link to={{ page: "quality" }}>{fill(t(scope.unlinked.length === 1 ? "{n} programme not linked to a project yet" : "{n} programmes not linked to a project yet"), { n: scope.unlinked.length })}</Link></> : null}</div>
          {expected > 0 && <div className="d">{reported} / {expected} {t("expected indicators reported")}</div>}
        </div>
      </div>

      {transfers.length > 0 && (
        <p className="small ink-2" style={{ marginTop: 12 }}>
          {t("Not counted in the totals, to avoid double counting:")}{" "}
          {transfers.map((p) => `MPTF ${p.id} ($${compact(p.approved)}) — ${p.passThrough}`).join(" · ")}
        </p>
      )}

      <section className="section grid g-12">
        <ChartCard className="span-6" title={t("Approved budget by country")} sub={t("By trust fund, US dollars")}
          table={{
            cols: [
              { key: "c", label: t("Country"), value: (r: (typeof byCountry)[number]) => r.label },
              ...FUNDS.map((f, k) => ({ key: f.id, label: f.id, numeric: true, value: (r: (typeof byCountry)[number]) => Math.round(r.funds[k]) })),
              { key: "n", label: t("Projects"), numeric: true, value: (r: (typeof byCountry)[number]) => r.n },
            ] as Column<(typeof byCountry)[number]>[],
            rows: byCountry,
          }}>
          {(ref) => (
            <>
              <Legend items={FUNDS.map((f) => ({ label: f.id, color: f.css }))} />
              <Chart height={Math.max(180, byCountry.length * 42 + 30)} label="Approved budget by country and fund" chartRef={ref} deps={[byCountry]}
                option={(tk) => ({
                  grid: { left: 8, right: 64, top: 4, bottom: 4, containLabel: true },
                  tooltip: {
                    ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                    formatter: (ps: { dataIndex: number }[]) => {
                      const r = byCountry[ps[0].dataIndex];
                      return tipTitle(`${r.label} · ${r.n} ${t("projects")}`) +
                        FUNDS.map((f, k) => tipRow(tk.series[f.slot], usd(r.funds[k]), f.id, "rect")).join("");
                    },
                  },
                  xAxis: { type: "value", ...axisBase(tk), axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => usd(v) } },
                  yAxis: { type: "category", inverse: true, data: byCountry.map((r) => r.label), ...axisBase(tk), splitLine: { show: false },
                    axisLabel: { ...axisBase(tk).axisLabel, color: tk.ink2 } },
                  series: FUNDS.map((f, k) => ({
                    name: f.id, type: "bar", stack: "b", barMaxWidth: 18,
                    itemStyle: { color: tk.series[f.slot], borderColor: tk.surface, borderWidth: 1, borderRadius: k === FUNDS.length - 1 ? [0, 4, 4, 0] : 0 },
                    label: k === FUNDS.length - 1 ? {
                      show: true, position: "right", color: tk.ink2, fontSize: 12,
                      formatter: (p: { dataIndex: number }) => usd(byCountry[p.dataIndex].funds.reduce((a, b) => a + b, 0)),
                    } : undefined,
                    data: byCountry.map((r) => r.funds[k]),
                  })),
                })} />
            </>
          )}
        </ChartCard>

        <ChartCard className="span-6" title={t("Approved budget by start year")} sub={t("By trust fund, US dollars")}
          table={{
            cols: [
              { key: "y", label: t("Start year"), value: (r: (typeof byYear)[number]) => r.y },
              ...FUNDS.map((f, k) => ({ key: f.id, label: f.id, numeric: true, value: (r: (typeof byYear)[number]) => Math.round(r.funds[k]) })),
            ] as Column<(typeof byYear)[number]>[],
            rows: byYear,
          }}>
          {(ref) => (
            <>
              <Legend items={FUNDS.map((f) => ({ label: f.id, color: f.css }))} />
              <Chart height={300} label="Approved budget by start year and fund" chartRef={ref} deps={[byYear]}
                option={(tk) => ({
                  grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
                  tooltip: {
                    ...tooltipBase(tk), trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: tk.grid, opacity: 0.4 } },
                    formatter: (ps: { dataIndex: number }[]) => {
                      const r = byYear[ps[0].dataIndex];
                      return tipTitle(r.y) + FUNDS.map((f, k) => tipRow(tk.series[f.slot], usd(r.funds[k]), f.id, "rect")).join("");
                    },
                  },
                  xAxis: { type: "category", data: byYear.map((r) => r.y), ...axisBase(tk), splitLine: { show: false } },
                  yAxis: { type: "value", ...axisBase(tk), axisLine: { show: false }, axisLabel: { ...axisBase(tk).axisLabel, formatter: (v: number) => usd(v) } },
                  series: FUNDS.map((f, k) => ({
                    name: f.id, type: "bar", stack: "b", barMaxWidth: 24,
                    itemStyle: { color: tk.series[f.slot], borderColor: tk.surface, borderWidth: 1, borderRadius: k === FUNDS.length - 1 ? [4, 4, 0, 0] : 0 },
                    data: byYear.map((r) => r.funds[k]),
                  })),
                })} />
            </>
          )}
        </ChartCard>
      </section>

      <section className="section">
        <div className="section-head"><h2>{t("Projects")}</h2><span className="muted small">{counted.length} {t(counted.length === 1 ? "project" : "projects")}{transfers.length ? ` + ${fill(t(transfers.length === 1 ? "{n} fund-to-fund transfer" : "{n} fund-to-fund transfers"), { n: transfers.length })}` : ""} · {t("Year and partner filters do not apply to budgets.")}</span></div>
        <DataTable rows={projects} initialSort={{ key: "a", dir: -1 }} cols={[
          { key: "id", label: "MPTF", numeric: true, value: (p) => p.id, width: 70 },
          { key: "n", label: t("Project"), value: (p) => p.short || p.name, render: (p) => (
            <span title={`${p.name} · ${p.orgs.join(", ")}`}>
              <Link to={{ page: "project", id: String(p.id) }}><b>{p.short || p.name}</b></Link>
              {p.passThrough && <> <span className="pill warn" title={p.passThrough}>{t("Transfer — not counted")}</span></>}
            </span>
          ) },
          { key: "f", label: t("Fund"), value: (p) => p.fund },
          { key: "c", label: t("Country"), value: (p) => nameOf(ix.countries.get(p.country) ?? { name: p.countryLabel }) },
          { key: "ty", label: t("Type"), value: (p) => typeShort(p.projectType), render: (p) => (
            <span title={p.projectType ?? p.type ?? ""}>{t(typeShort(p.projectType))}{p.pes && <> <span className="pill pes">PES</span></>}</span>
          ) },
          { key: "s", label: t("Status"), value: (p) => p.status ?? "",
            render: (p) => <span className="status"><span style={{ color: isActive(p) ? "var(--good)" : "var(--neutral)", display: "inline-flex" }}>●</span>{p.status}</span> },
          { key: "a", label: t("Approved budget"), numeric: true, value: (p) => p.approved, render: (p) => usd(p.approved) },
          { key: "d", label: t("Spent / transferred"), numeric: true, value: (p) => (p.transferred ? p.expenditure / p.transferred : null),
            render: (p) => <MiniMeter value={p.transferred ? Math.min(1, p.expenditure / p.transferred) : null} /> },
          { key: "p", label: t("Period"), value: (p) => p.start ?? "", render: (p) => `${p.start?.slice(0, 4) ?? "?"}–${p.end?.slice(0, 4) ?? "?"}` },
          { key: "x", label: t("Indicators"), numeric: true,
            value: (p) => (p.programmes.length && cov.get(p.id)?.expected ? cov.get(p.id)!.reported / cov.get(p.id)!.expected : null),
            render: (p) => {
              const c = cov.get(p.id);
              if (!c || !c.expected || !p.programmes.length) return <span className="muted" title={!c?.expected ? t("No expected indicators") : t("Not linked to a results programme")}>–</span>;
              return <span className="mini-meter" title={`${c.reported} / ${c.expected} ${t("expected indicators reported")}`}>
                <span className="track" style={{ background: "color-mix(in srgb, var(--accent) 16%, var(--surface-sunk))" }}>
                  <span className="fill" style={{ width: `${(c.reported / c.expected) * 100}%`, background: "var(--accent)" }} />
                </span>
                <span>{c.reported}/{c.expected}</span>
              </span>;
            } },
          { key: "r", label: t("Results"), value: (p) => p.programmes.length,
            render: (p) => p.programmes.length
              ? p.programmes.map((id) => <Link key={id} to={{ page: "programme", id }}>{ix.programmes.get(id)?.name}</Link>)
              : <span className="muted">–</span> },
        ] as Column<Project>[]} />
      </section>
    </>
  );
}
