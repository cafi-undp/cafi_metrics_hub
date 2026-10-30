import { useMemo } from "react";
import { useApp } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { co2Aggregate, indicatorAggs, outcomeAchievement, statusOf, valueAt, yearIndex } from "../lib/model";
import { compact, num, pct, tco2 } from "../lib/format";
import { outcomeVar } from "../lib/colors";
import { Link } from "../components/Shell";
import { DataTable, Meter, MiniMeter, StatusBadge, type Column } from "../components/ui";
import { IconLeft } from "../components/icons";
import { IndicatorTile, Trajectory } from "./OutcomePage";
import type { DataRecord } from "../lib/types";

export function ProgrammeDetail({ id }: { id: string }) {
  const { m, ix, filters, lang } = useApp();
  const p = ix.programmes.get(id);
  // A programme page shows the whole programme, whatever the global filters are.
  const recs = useMemo(() => m.records.filter((r) => r.programme === id), [m, id]);
  const yi = yearIndex(m, filters.year);
  const aggs = useMemo(() => indicatorAggs(ix, recs, yi), [ix, recs, yi]);

  if (!p) {
    return <div className="card empty" style={{ marginTop: 24 }}>Programme not found. <Link to={{ page: "programmes" }}>{t("Programmes")}</Link></div>;
  }
  const achievement = outcomeAchievement(aggs);
  const status = statusOf(achievement, p.start, p.end, filters.year);
  const co2 = co2Aggregate(recs, yi);
  const span = p.start && p.end ? p.end - p.start + 1 : null;
  const elapsed = span && p.start ? Math.min(span, Math.max(0, filters.year - p.start + 1)) : null;
  const projects = m.projects.filter((x) => p.mptf.includes(x.id));
  const mainOutcome = aggs[0]?.indicator.outcome ?? m.outcomes[0].id;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link to={{ page: "programmes" }} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconLeft width={14} height={14} />{t("Programmes")}</Link>
            · {t("As of")} {filters.year}
          </div>
          <h1>{p.name}</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            <span className="pill">{nameOf(ix.countries.get(p.country)!)}</span>
            {p.partners.map((x) => <span className="pill" key={x}>{ix.partners.get(x)}</span>)}
            <span className="pill num">{p.start}–{p.end}</span>
            <StatusBadge status={status} />
          </div>
        </div>
      </div>

      <div className="grid g-4">
        <div className="card tile">
          <div className="l">{t("Average achievement")}</div>
          <div className="v">{pct(achievement)}</div>
          <Meter value={achievement} color={outcomeVar(m, mainOutcome)} />
        </div>
        <div className="card tile">
          <div className="l">{t("Period")}</div>
          <div className="v num">{elapsed ?? "–"}<small>/ {span ?? "–"} {t("years elapsed")}</small></div>
          <Meter value={span && elapsed !== null ? elapsed / span : null} color="var(--neutral)" />
        </div>
        <div className="card tile">
          <div className="l">{t("Indicators reported")}</div>
          <div className="v">{aggs.length}</div>
          <div className="d">{recs.length} {t("rows")}</div>
        </div>
        <div className="card tile">
          <div className="l">{t("Committed (full cycle)")}</div>
          <div className="v">{co2.committed ? tco2(co2.committed) : "–"}</div>
          <div className="d">{t("Realised to date")}: {co2.realised ? tco2(co2.realised) : "–"}</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head"><h2>{t("Funding (MPTF)")}</h2></div>
        {projects.length ? (
          <div className="grid g-2">
            {projects.map((pr) => (
              <div className="card" key={pr.id}>
                <div className="xsmall muted">MPTF {pr.id} · {pr.fund}{pr.type ? ` · ${pr.type}` : ""}</div>
                <h3 style={{ fontSize: 15, marginTop: 4 }}>{pr.name}</h3>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <span className="status"><span style={{ color: pr.status?.toLowerCase().startsWith("on going") ? "var(--good)" : "var(--neutral)", display: "inline-flex" }}>●</span>{pr.status}</span>
                  <span className="pill num">{pr.start?.slice(0, 4)}–{pr.end?.slice(0, 4)}</span>
                  {pr.orgs.map((o) => <span className="pill" key={o}>{o}</span>)}
                </div>
                <div className="grid g-3" style={{ marginTop: 12, gap: 8 }}>
                  <div><div className="xsmall muted">{t("Approved budget")}</div><b>${compact(pr.approved)}</b></div>
                  <div><div className="xsmall muted">{t("Transferred")}</div><b>${compact(pr.transferred)}</b></div>
                  <div><div className="xsmall muted">{t("Spent")}</div><b>${compact(pr.expenditure)}</b></div>
                </div>
                <Meter value={pr.transferred ? Math.min(1, pr.expenditure / pr.transferred) : null} color="var(--accent)"
                  left={<>{pct(pr.transferred ? pr.expenditure / pr.transferred : null)} {t("of transfers")}</>} />
              </div>
            ))}
          </div>
        ) : <div className="card small muted">{t("Not linked to an MPTF project yet (config/programmes.yml).")}</div>}
      </section>

      <section className="section">
        <div className="section-head"><h2>{t("Indicators")}</h2></div>
        <div className="grid g-3">
          {aggs.map((a) => <IndicatorTile key={a.indicator.code} a={a} color={outcomeVar(m, a.indicator.outcome)} lang={lang} yi={yi} />)}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>{t("Trajectory")}</h2><span className="muted small">{t("Cumulative result against final target")}</span></div>
        <div className="grid g-2">
          {aggs.map((a) => <Trajectory key={a.indicator.code} a={a} years={m.meta.years} year={filters.year} />)}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>{t("Sub-indicators")}</h2></div>
        <DataTable rows={recs} cols={[
          { key: "i", label: t("Indicator"), value: (r) => nameOf(ix.indicators.get(r.indicator)!) },
          { key: "l", label: t("Detail"), value: (r) => r.label },
          { key: "pa", label: t("Partner"), value: (r) => ix.partners.get(r.partner) ?? "" },
          ...m.meta.years.map((y, i) => ({
            key: String(y), label: String(y), numeric: true,
            value: (r: DataRecord) => r.values[i], render: (r: DataRecord) => (r.values[i] === null ? "–" : num(r.values[i])),
          })),
          { key: "t", label: t("Target"), numeric: true, value: (r) => r.target, render: (r) => (r.target ? num(r.target) : "–") },
          { key: "a", label: t("Achievement"), numeric: true, value: (r) => (r.target ? (valueAt(r.values, yi) ?? 0) / r.target : null),
            render: (r) => <MiniMeter value={r.target ? (valueAt(r.values, yi) ?? 0) / r.target : null} color={outcomeVar(m, ix.outcomeOf(r))} /> },
          { key: "row", label: t("Row"), numeric: true, value: (r) => r.row },
        ] as Column<DataRecord>[]} />
      </section>
    </>
  );
}
