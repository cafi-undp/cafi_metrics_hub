import { useMemo } from "react";
import { useApp } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { coverage, projectRecords, yearIndex } from "../lib/model";
import { compact, pct } from "../lib/format";
import { Link } from "../components/Shell";
import { Meter } from "../components/ui";
import { IconLeft } from "../components/icons";
import { CoverageTable, typeShort } from "../components/coverage";

const isActive = (status: string | null) => (status ?? "").toLowerCase().startsWith("on going");

export function ProjectDetail({ id }: { id: string }) {
  const { m, ix, filters } = useApp();
  const p = m.projects.find((x) => String(x.id) === id);
  const recs = useMemo(() => (p ? projectRecords(ix, p) : []), [ix, p]);
  const yi = yearIndex(m, filters.year);
  const cov = useMemo(() => (p ? coverage([p], recs) : null), [p, recs]);

  if (!p || !cov) {
    return <div className="card empty" style={{ marginTop: 24 }}>Project not found. <Link to={{ page: "portfolio" }}>{t("Portfolio")}</Link></div>;
  }
  const programmes = p.programmes.map((x) => ix.programmes.get(x)).filter((x): x is NonNullable<typeof x> => !!x);
  const activities = m.activities.filter((a) => p.activities.includes(a.name));
  const classified = p.projectType !== null;
  const title = p.short || p.name;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link to={{ page: "portfolio" }} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><IconLeft width={14} height={14} />{t("Portfolio")}</Link>
            · MPTF {p.id} · {p.fund}
          </div>
          <h1>{title}</h1>
          {title !== p.name && <p>{p.name}</p>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            <span className="pill">{nameOf(ix.countries.get(p.country) ?? { name: p.countryLabel })}</span>
            <span className="status"><span style={{ color: isActive(p.status) ? "var(--good)" : "var(--neutral)", display: "inline-flex" }}>●</span>{p.status}</span>
            <span className="pill num">{p.start?.slice(0, 4) ?? "?"}–{p.end?.slice(0, 4) ?? "?"}</span>
            {p.orgs.map((o) => <span className="pill" key={o}>{o}</span>)}
            {classified && <span className="pill req req-m" title={p.projectType ?? ""}>{t(typeShort(p.projectType))}</span>}
            {p.pes && <span className="pill pes">PES</span>}
            {p.confidence && p.confidence !== "High" && (
              <span className="pill warn" title={p.note}>{t("Classification to confirm")} · {t(p.confidence)}</span>
            )}
            {p.passThrough && <span className="pill warn" title={p.passThrough}>{t("Transfer — not counted")}</span>}
          </div>
          {p.note && <p className="small muted" style={{ marginTop: 8 }}>{p.note}</p>}
        </div>
      </div>

      <div className="grid g-4">
        <div className="card tile">
          <div className="l">{t("Approved budget")}</div>
          <div className="v">${compact(p.approved)}</div>
          <div className="d">{t("Transferred")} ${compact(p.transferred)}</div>
        </div>
        <div className="card tile">
          <div className="l">{t("Spent")}</div>
          <div className="v">${compact(p.expenditure)}</div>
          <Meter value={p.transferred ? Math.min(1, p.expenditure / p.transferred) : null} color="var(--accent)"
            left={<>{pct(p.transferred ? p.expenditure / p.transferred : null)} {t("of transfers")}</>} />
        </div>
        <div className="card tile">
          <div className="l">{t("Expected indicators reported")}</div>
          <div className="v">{classified ? <>{cov.reported}<small>/ {cov.expected}</small></> : "–"}</div>
          {classified
            ? <Meter value={cov.expected ? cov.reported / cov.expected : null} color="var(--accent)"
                left={<>{t("mandatory or required by activity")}</>} right={cov.optionalReported ? <>+{cov.optionalReported} {t("optional")}</> : undefined} />
            : <div className="d">{t("Not classified in the reference workbook.")}</div>}
        </div>
        <div className="card tile">
          <div className="l">{t("Results programme")}</div>
          {programmes.length
            ? programmes.map((pr) => <div key={pr.id} style={{ marginTop: 6 }}><Link to={{ page: "programme", id: pr.id }}><b>{pr.name}</b></Link></div>)
            : <div className="d" style={{ marginTop: 8 }}>{t("Not linked to a results programme yet (config/programmes.yml).")}</div>}
          {programmes.length > 0 && <div className="d">{recs.length} {t("rows")} · {new Set(recs.map((r) => r.indicator)).size} {t("indicators")}</div>}
        </div>
      </div>

      {activities.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t("Activities")}</h2><span className="muted small">{t("Each activity triggers the indicators it lists")}</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {activities.map((a) => (
              <span className="pill" key={a.code} title={a.indicators.join(", ")} style={{ padding: "6px 12px" }}>
                {a.name} <span className="muted xsmall">{a.indicators.join(" · ")}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{t("Expected standard indicators")}</h2>
          <span className="muted small">{t("As of")} {filters.year} · {cov.rows.length} {t("indicators")}</span>
        </div>
        {classified
          ? <CoverageTable rows={cov.rows} yi={yi} showProgrammes={programmes.length > 1} />
          : <div className="card small muted">{t("Not classified in the reference workbook.")}</div>}
        {cov.extra.length > 0 && (
          <p className="small ink-2" style={{ marginTop: 10 }}>
            {t("Also reported, but not in this project's expected set:")}{" "}
            {cov.extra.map((c) => `${c} ${nameOf(ix.indicators.get(c)!)}`).join(" · ")}
          </p>
        )}
      </section>
    </>
  );
}
