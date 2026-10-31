import { useMemo } from "react";
import { useApp } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { co2Aggregate, coverage, indicatorAggs, outcomeAchievement, statusOf, valueAt, yearIndex } from "../lib/model";
import { compact, num, pct, tco2, withUnit } from "../lib/format";
import { outcomeVar } from "../lib/colors";
import { Link } from "../components/Shell";
import { MiniMeter, STATUS_META, StatusBadge } from "../components/ui";
import { claimLabel } from "../components/coverage";
import { CarbonTip } from "../components/CarbonTip";

/**
 * One-page programme fact sheet, laid out for A4. "Save as PDF" uses the browser's print dialog,
 * which keeps the text selectable and the links live; the print stylesheet hides the app chrome.
 */
export function FactSheet({ id }: { id: string }) {
  const { m, ix, q, filters, lang } = useApp();
  const p = ix.programmes.get(id);
  const yi = yearIndex(m, filters.year);
  const recs = useMemo(() => m.records.filter((r) => r.programme === id), [m, id]);
  const aggs = useMemo(() => indicatorAggs(ix, recs, yi), [ix, recs, yi]);
  if (!p) return <div className="card empty" style={{ marginTop: 24 }}>{t("Programme not found.")} <Link to={{ page: "programmes" }}>{t("Programmes")}</Link></div>;

  const ach = outcomeAchievement(aggs);
  const status = statusOf(ach, p.start, p.end, filters.year);
  const projects = m.projects.filter((x) => p.mptf.includes(x.id));
  const cov = coverage(projects, recs);
  const co2 = co2Aggregate(recs, yi);
  const quality = (q?.checks ?? []).flatMap((c) => c.items.filter((i) => i.programme === p.name).map((i) => ({ sev: c.severity, title: c.title, detail: i.detail ?? i.value ?? "", row: i.row })))
    .filter((i) => i.sev !== "info").slice(0, 8);
  const claims = projects.map((pr) => m.carbon.claims.find((c) => c.project === pr.id)).filter(Boolean);
  const date = new Date(m.meta.generatedAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB");
  const basis = recs.some((r) => r.co2?.basis === "ex post") ? "ex post" : "ex ante";

  return (
    <article className="factsheet">
      <div className="no-print" style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", margin: "16px 0 8px", flexWrap: "wrap" }}>
        <Link to={{ page: "programme", id: p.id }} className="link-btn">← {p.name}</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="chip-btn" onClick={() => window.print()}>{t("Save as PDF")} ↓</button>
        </div>
      </div>

      <header className="fs-head">
        <div>
          <div className="eyebrow">CAFI Metrics Hub · {t("Programme fact sheet")} · {t("As of")} {filters.year}</div>
          <h1>{p.name}</h1>
          <div className="fs-meta">
            <span>{nameOf(ix.countries.get(p.country) ?? { name: p.country })}</span>
            <span>{p.partners.map((x) => ix.partners.get(x)).join(", ")}</span>
            <span className="num">{p.start}–{p.end}</span>
            {projects.map((pr) => <span key={pr.id}>MPTF {pr.id} · {pr.fund}</span>)}
            <StatusBadge status={status} />
          </div>
        </div>
        <img src="./cafi-logo.png" alt="CAFI" width={48} height={48} style={{ background: "#fff", borderRadius: 10, padding: 3 }} />
      </header>

      <div className="fs-tiles">
        <div><div className="l">{t("Average achievement")}</div><div className="v num">{pct(ach)}</div><div className="d">{aggs.length} {t("indicators")} · {recs.length} {t("rows")} · {t(STATUS_META[status].label)}</div></div>
        <div><div className="l">{t("Net GHG benefit expected, full cycle")} <span className="pill">{t(basis)}</span><CarbonTip term="net" /></div><div className="v num">{co2.intervention.expected ? tco2(co2.intervention.expected) : "–"}</div><div className="d">{t("p5–p95 band")} {compact(co2.intervention.low, 2)}–{compact(co2.intervention.high, 2)} · {t("Realised to date")} {compact(co2.intervention.realised, 2)} · {t("Removals")} {compact(co2.inventory.expected, 2)}</div></div>
        <div><div className="l">{t("Funding (MPTF)")}</div><div className="v num">{projects.length ? `$${compact(projects.reduce((s, x) => s + x.approved, 0))}` : "–"}</div><div className="d">{projects.length ? `${pct(projects.reduce((s, x) => s + x.transferred, 0) ? projects.reduce((s, x) => s + x.expenditure, 0) / projects.reduce((s, x) => s + x.transferred, 0) : null)} ${t("of transfers")} ${t("spent").toLowerCase()}` : t("Not linked to an MPTF project yet (config/programmes.yml).")}</div></div>
        <div><div className="l">{t("Expected indicators reported")}</div><div className="v num">{cov.expected ? `${cov.reported} / ${cov.expected}` : "–"}</div><div className="d">{t("mandatory or required by activity")}{cov.optionalReported ? ` · +${cov.optionalReported} ${t("optional")}` : ""}</div></div>
      </div>

      <section className="fs-sec">
        <h2>{t("Results against targets")}</h2>
        <table className="fs-table">
          <thead><tr><th>{t("Indicator")}</th><th className="n">{t("Result")}</th><th className="n">{t("Target")}</th><th>{t("Achievement")}</th><th className="n">{t("vs previous year")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>
            {aggs.map((a) => (
              <tr key={a.indicator.code}>
                <td><i className="dot" style={{ background: outcomeVar(m, a.indicator.outcome), marginRight: 6 }} /><span className="xsmall muted">{a.indicator.code}</span> {nameOf(a.indicator)}</td>
                <td className="n num">{withUnit(a.value, a.indicator.unit, lang)}</td>
                <td className="n num">{a.targeted ? withUnit(a.targeted, a.indicator.unit, lang) : "–"}</td>
                <td><MiniMeter value={a.achievement} color={outcomeVar(m, a.indicator.outcome)} /></td>
                <td className="n num">{yi > 0 ? (a.value - a.previous >= 0 ? "+" : "−") + compact(Math.abs(a.value - a.previous)) : "–"}</td>
                <td><StatusBadge status={statusOf(a.achievement, p.start, p.end, filters.year)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="fs-two">
        <section className="fs-sec">
          <h2>{t("Expected standard indicators")}</h2>
          <div className="fs-cov">
            {cov.rows.map((r) => (
              <span key={r.code} className={`fs-chip ${r.reported ? "on" : ""} ${r.requirement !== "optional" ? "req" : ""}`} title={`${nameOf(ix.indicators.get(r.code)!)} · ${r.requirement}`}>{r.code}</span>
            ))}
            {!cov.rows.length && <span className="muted small">{t("Not classified in the reference workbook.")}</span>}
          </div>
          <p className="xsmall muted" style={{ marginTop: 6 }}>{t("Filled = reported · outlined = mandatory or required by activity · plain = optional")}{cov.extra.length ? ` · ${t("Also reported, but not in this project's expected set:")} ${cov.extra.join(", ")}` : ""}</p>
        </section>
        <section className="fs-sec">
          <h2>{t("Funding (MPTF)")}</h2>
          {projects.length ? projects.map((pr) => (
            <div key={pr.id} className="fs-proj">
              <b>{pr.short || pr.name}</b> <span className="muted xsmall">MPTF {pr.id} · {pr.fund} · {pr.status}</span>
              <div className="xsmall">{t("Approved budget")} ${compact(pr.approved)} · {t("Transferred")} ${compact(pr.transferred)} · {t("Spent")} ${compact(pr.expenditure)} · {pr.start?.slice(0, 4)}–{pr.end?.slice(0, 4)}</div>
            </div>
          )) : <p className="small muted">{t("Not linked to an MPTF project yet (config/programmes.yml).")}</p>}
          {claims.length > 0 && <p className="xsmall" style={{ marginTop: 6 }}><b>{t("Claims register")}:</b> {claims.map((c) => claimLabel(c!.status) + (c!.confirm ? ` (${t("To confirm").toLowerCase()})` : "")).join(" · ")}</p>}
        </section>
      </div>

      <div className="fs-two">
        <section className="fs-sec">
          <h2>{t("Hectares over time")}</h2>
          <table className="fs-table">
            <thead><tr>{m.meta.years.map((y) => <th key={y} className="n">{y}</th>)}</tr></thead>
            <tbody><tr>{m.meta.years.map((_, i) => <td key={i} className="n num">{compact(recs.filter((r) => m.meta.areaIndicators.includes(r.indicator)).reduce((s, r) => s + (valueAt(r.values, i) ?? 0), 0))}</td>)}</tr></tbody>
          </table>
        </section>
        <section className="fs-sec">
          <h2>{t("Data quality")}</h2>
          {quality.length ? (
            <ul className="fs-list">
              {quality.map((i, k) => <li key={k}><b>{i.title}</b>{i.row ? ` · ${t("Row")} ${num(i.row)}` : ""}{i.detail ? ` · ${i.detail}` : ""}</li>)}
            </ul>
          ) : <p className="small muted">{t("No warnings for this programme on the last refresh.")}</p>}
        </section>
      </div>

      <footer className="fs-foot">
        <span>{t("Source")}: {m.meta.source} · {t("Data refreshed")} {date} · {t("Carbon method")} {m.carbon.method} ({t(basis)}) · {t("Achievement")} = Σ {t("results")} ÷ Σ {t("targets")}</span>
        <span>{location.origin}{location.pathname}#/programme/{p.id}</span>
      </footer>
    </article>
  );
}
