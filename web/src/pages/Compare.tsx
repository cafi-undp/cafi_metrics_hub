import { useMemo, type ReactNode } from "react";
import { useApp } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { co2Aggregate, coverage, indicatorAggs, outcomeAchievement, statusOf, valueAt, yearIndex, type IndicatorAgg } from "../lib/model";
import { compact, pct, tco2, withUnit } from "../lib/format";
import { outcomeVar } from "../lib/colors";
import { Link } from "../components/Shell";
import { MiniMeter, StatusBadge } from "../components/ui";
import type { Programme } from "../lib/types";
import { CarbonTip } from "../components/CarbonTip";

/** Two programmes side by side. Route: #/compare/<idA>~<idB> */
export function Compare({ id }: { id: string }) {
  const { m, ix, filters, lang, navigate } = useApp();
  const [a, b] = (id || "").split("~");
  const yi = yearIndex(m, filters.year);
  const pa = ix.programmes.get(a ?? "");
  const pb = ix.programmes.get(b ?? "");
  const options = useMemo(() => [...m.programmes].sort((x, y) => x.name.localeCompare(y.name)), [m]);
  const set = (side: "a" | "b", v: string) => navigate({ page: "compare", id: side === "a" ? `${v}~${b ?? ""}` : `${a ?? ""}~${v}` });

  const side = (p: Programme | undefined) => {
    if (!p) return null;
    const recs = m.records.filter((r) => r.programme === p.id);
    const aggs = indicatorAggs(ix, recs, yi);
    const ach = outcomeAchievement(aggs);
    const projects = m.projects.filter((x) => p.mptf.includes(x.id));
    const cov = coverage(projects, recs);
    const co2 = co2Aggregate(recs, yi);
    return {
      p, recs, aggs, ach, status: statusOf(ach, p.start, p.end, filters.year), projects, cov, co2,
      approved: projects.reduce((s, x) => s + x.approved, 0), spent: projects.reduce((s, x) => s + x.expenditure, 0),
      byCode: new Map(aggs.map((x) => [x.indicator.code, x])),
    };
  };
  const A = side(pa), B = side(pb);
  const codes = [...new Set([...(A?.aggs ?? []), ...(B?.aggs ?? [])].map((x) => x.indicator.code))]
    .map((c) => ix.indicators.get(c)!).filter(Boolean).sort((x, y) => x.outcome.localeCompare(y.outcome) || x.code.localeCompare(y.code));

  const Cell = ({ agg }: { agg: IndicatorAgg | undefined }) => agg
    ? <div><b className="num">{withUnit(agg.value, agg.indicator.unit, lang, true)}</b><div><MiniMeter value={agg.achievement} color={outcomeVar(m, agg.indicator.outcome)} /></div></div>
    : <span className="muted">–</span>;

  const Tile = ({ l, v, d, tip }: { l: string; v: string; d?: string; tip?: ReactNode }) => (
    <div className="card tile"><div className="l">{l}{tip}</div><div className="v">{v}</div>{d && <div className="d">{d}</div>}</div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("Projects")} · {t("As of")} {filters.year}</div>
          <h1>{t("Compare projects")}</h1>
          <p>{t("Two projects side by side: results, pace, funding and expected indicators.")}</p>
        </div>
      </div>
      <div className="cmp-pick">
        {(["a", "b"] as const).map((s) => (
          <label key={s} className="cmp-select">
            <span className="xsmall muted">{s === "a" ? "A" : "B"}</span>
            <select className="input" value={(s === "a" ? a : b) ?? ""} onChange={(e) => set(s, e.target.value)} aria-label={`${t("Project")} ${s.toUpperCase()}`}>
              <option value="">{t("Choose a project…")}</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ))}
      </div>

      {!(A && B) && <div className="card empty" style={{ marginTop: 16 }}>{t("Choose two projects to compare.")}</div>}

      {A && B && (
        <>
          <div className="cmp-grid">
            {[A, B].map((S, i) => (
              <section key={S.p.id} className="cmp-col" aria-label={S.p.name}>
                <div className="cmp-head">
                  <div className="eyebrow">{i === 0 ? "A" : "B"} · {nameOf(ix.countries.get(S.p.country) ?? { name: S.p.country })} · {S.p.partners.map((x) => ix.partners.get(x)).join(", ")}</div>
                  <h2><Link to={{ page: "programme", id: S.p.id }}>{S.p.name}</Link></h2>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <span className="pill num">{S.p.start}–{S.p.end}</span><StatusBadge status={S.status} />
                    {S.projects.map((pr) => <Link key={pr.id} to={{ page: "project", id: String(pr.id) }} className="pill">MPTF {pr.id} · {pr.fund}</Link>)}
                  </div>
                </div>
                <div className="grid g-2" style={{ marginTop: 12 }}>
                  <Tile l={t("Average achievement")} v={pct(S.ach)} d={`${S.aggs.length} ${t("indicators")} · ${S.recs.length} ${t("rows")}`} />
                  <Tile tip={<CarbonTip term="net" />} l={t("Net GHG benefit expected, full cycle")} v={S.co2.intervention.expected ? tco2(S.co2.intervention.expected) : "–"} d={`${t("Realised to date")}: ${S.co2.intervention.realised ? tco2(S.co2.intervention.realised) : "–"}`} />
                  <Tile l={t("Approved budget")} v={S.approved ? `$${compact(S.approved)}` : "–"} d={S.approved ? `${pct(S.spent / S.approved)} ${t("spent")}` : t("Not linked to an MPTF project yet (config/programmes.yml).")} />
                  <Tile l={t("Expected indicators reported")} v={S.cov.expected ? `${S.cov.reported} / ${S.cov.expected}` : "–"} d={t("mandatory or required by activity")} />
                </div>
              </section>
            ))}
          </div>

          <section className="section">
            <div className="section-head"><h2>{t("Indicators")}</h2><span className="muted small">{t("Result as of")} {filters.year} · {t("achievement against final target")}</span></div>
            <div className="table-wrap" tabIndex={0}>
              <table className="data">
                <thead><tr><th>{t("Indicator")}</th><th>{A.p.name}</th><th>{B.p.name}</th></tr></thead>
                <tbody>
                  {codes.map((ind) => (
                    <tr key={ind.code}>
                      <td><span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><i className="dot" style={{ background: outcomeVar(m, ind.outcome) }} /><span><span className="xsmall muted">{ind.code}</span><br />{nameOf(ind)}</span></span></td>
                      <td><Cell agg={A.byCode.get(ind.code)} /></td>
                      <td><Cell agg={B.byCode.get(ind.code)} /></td>
                    </tr>
                  ))}
                  {!codes.length && <tr><td colSpan={3}><div className="empty">{t("No data for the current filters")}</div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2>{t("Trajectory")}</h2><span className="muted small">{t("Cumulative hectares by year, area indicators only")}</span></div>
            <div className="table-wrap" tabIndex={0}>
              <table className="data">
                <thead><tr><th>{t("Year")}</th><th className="n">{A.p.name} (ha)</th><th className="n">{B.p.name} (ha)</th></tr></thead>
                <tbody>
                  {m.meta.years.map((y, i) => (
                    <tr key={y}>
                      <td>{y}</td>
                      {[A, B].map((S) => <td key={S.p.id} className="n num">{compact(S.recs.filter((r) => m.meta.areaIndicators.includes(r.indicator)).reduce((s, r) => s + (valueAt(r.values, i) ?? 0), 0))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
