import { useMemo, useState } from "react";
import { useApp } from "../lib/state";
import { useFiltered } from "../lib/hooks";
import { nameOf, t } from "../lib/i18n";
import { byKey, indicatorAggs, outcomeAchievement, statusOf, type Status } from "../lib/model";
import { pct } from "../lib/format";
import { outcomeVar } from "../lib/colors";
import { Link } from "../components/Shell";
import { DataTable, MiniMeter, Sparkline, StatusBadge, type Column } from "../components/ui";
import { IconGrid, IconList } from "../components/icons";
import type { Programme } from "../lib/types";

export interface ProgSummary {
  p: Programme;
  country: string;
  partners: string;
  indicators: number;
  achievement: number | null;
  trend: (number | null)[];
  status: Status;
  outcome: string; // dominant outcome
}

export function useProgrammeSummaries(): ProgSummary[] {
  const { m, ix } = useApp();
  const { records, yi, year, years } = useFiltered();
  return useMemo(() => {
    const g = byKey(records, (r) => r.programme);
    return [...g.entries()].map(([pid, rs]) => {
      const p = ix.programmes.get(pid)!;
      const aggs = indicatorAggs(ix, rs, yi);
      const achievement = outcomeAchievement(aggs);
      const outcomeCounts = byKey(rs, (r) => ix.outcomeOf(r));
      const outcome = [...outcomeCounts.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
      return {
        p,
        country: nameOf(ix.countries.get(p.country)!),
        partners: p.partners.map((x) => ix.partners.get(x)).join(", "),
        indicators: aggs.length,
        achievement,
        trend: years.map((_, i) => outcomeAchievement(indicatorAggs(ix, rs, i))),
        status: statusOf(achievement, p.start, p.end, year),
        outcome,
      };
    });
  }, [m, ix, records, yi, year, years]); // eslint-disable-line react-hooks/exhaustive-deps
}

type SortKey = "name" | "achievement" | "start";

export function Programmes() {
  const { m, navigate, filters } = useApp();
  const all = useProgrammeSummaries();
  const [view, setView] = useState<"grid" | "table">("grid");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("achievement");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const xs = all.filter((s) => !term || `${s.p.name} ${s.country} ${s.partners}`.toLowerCase().includes(term));
    return xs.sort((a, b) =>
      sort === "name" ? a.p.name.localeCompare(b.p.name)
        : sort === "start" ? (a.p.start ?? 0) - (b.p.start ?? 0)
          : (b.achievement ?? -1) - (a.achievement ?? -1));
  }, [all, q, sort]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("As of")} {filters.year}</div>
          <h1>{t("Projects")}</h1>
          <p>{list.length} {t("projects")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Link to={{ page: "compare" }} className="chip-btn">{t("Compare")} ⇄</Link>
          <input className="input" type="search" placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)}
            aria-label={t("Search…")} style={{ width: 220 }} />
          <div className="seg" role="group" aria-label={t("Sort by")}>
            {(["achievement", "name", "start"] as SortKey[]).map((k) => (
              <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>
                {k === "achievement" ? t("Achievement") : k === "name" ? t("Name") : t("Start year")}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="View">
            <button aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label={t("Grid")} title={t("Grid")}><IconGrid /></button>
            <button aria-pressed={view === "table"} onClick={() => setView("table")} aria-label={t("Table")} title={t("Table")}><IconList /></button>
          </div>
        </div>
      </div>

      <Timeline list={list} />

      <section className="section">
        {view === "grid" ? (
          <div className="grid g-3">
            {list.map((s) => (
              <Link key={s.p.id} to={{ page: "programme", id: s.p.id }} className="card link prog-card"
                style={{ borderTop: `3px solid ${outcomeVar(m, s.outcome)}` }}>
                <h3>{s.p.name}</h3>
                <div className="meta">
                  <span className="pill">{s.country}</span>
                  <span className="pill">{s.partners}</span>
                  <span className="pill num">{s.p.start}–{s.p.end}</span>
                </div>
                <div className="foot">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="xsmall muted">{t("Average achievement")} · {s.indicators} {t("indicators")}</div>
                    <MiniMeter value={s.achievement} color={outcomeVar(m, s.outcome)} />
                    <div style={{ marginTop: 6 }}><StatusBadge status={s.status} /></div>
                  </div>
                  <Sparkline values={s.trend} color={outcomeVar(m, s.outcome)} width={90} height={36} />
                </div>
              </Link>
            ))}
            {!list.length && <div className="card empty">{t("No data for the current filters")}</div>}
          </div>
        ) : (
          <DataTable
            rows={list}
            onRowClick={(s) => navigate({ page: "programme", id: s.p.id })}
            cols={[
              { key: "n", label: t("Project"), value: (s) => s.p.name },
              { key: "c", label: t("Country"), value: (s) => s.country },
              { key: "pa", label: t("Partner"), value: (s) => s.partners },
              { key: "pe", label: t("Period"), value: (s) => s.p.start, render: (s) => `${s.p.start}–${s.p.end}` },
              { key: "i", label: t("Indicators"), numeric: true, value: (s) => s.indicators },
              { key: "a", label: t("Average achievement"), numeric: true, value: (s) => s.achievement,
                render: (s) => <MiniMeter value={s.achievement} color={outcomeVar(m, s.outcome)} /> },
              { key: "s", label: t("Status"), value: (s) => s.status, render: (s) => <StatusBadge status={s.status} /> },
            ] as Column<ProgSummary>[]}
          />
        )}
      </section>
    </>
  );
}

function Timeline({ list }: { list: ProgSummary[] }) {
  const { m, filters, navigate } = useApp();
  const rows = [...list].filter((s) => s.p.start && s.p.end).sort((a, b) => (a.p.start! - b.p.start!) || (a.p.end! - b.p.end!));
  if (!rows.length) return null;
  const min = Math.min(...rows.map((s) => s.p.start!), m.meta.years[0]);
  const max = Math.max(...rows.map((s) => s.p.end!), m.meta.years[m.meta.years.length - 1]) + 1;
  const span = max - min;
  const yrs = Array.from({ length: span }, (_, i) => min + i);
  const x = (y: number) => `${((y - min) / span) * 100}%`;
  const label = "200px";
  const used = m.outcomes.filter((o) => rows.some((r) => r.outcome === o.id));

  return (
    <section className="card" aria-label={t("Timeline")}>
      <div className="card-head">
        <div><h3>{t("Timeline")}</h3><div className="sub">{t("Project periods and the selected year")}</div></div>
      </div>
      <div className="legend">
        {used.map((o) => <span key={o.id}><i className="dot" style={{ background: outcomeVar(m, o.id) }} />{nameOf(o)}</span>)}
      </div>
      <div className="timeline-scroll">
      <div className="timeline" style={{ ["--tl-label" as string]: label, marginTop: 24 }}>
        <div className="axis" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>
          {yrs.map((y) => <span key={y}>{span <= 12 || y % 2 === 0 ? y : ""}</span>)}
        </div>
        <div style={{ position: "relative" }}>
          <div className="tl-grid" style={{ gridTemplateColumns: `repeat(${span}, 1fr)` }}>{yrs.map((y) => <span key={y} />)}</div>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: label, right: 0, pointerEvents: "none" }}>
            <div className="tl-now" data-year={filters.year} style={{ left: `calc(${x(filters.year + 0.5)} - 1px)` }} />
          </div>
          {rows.map((s) => (
            <div className="tl-row" key={s.p.id}>
              <span className="name" onClick={() => navigate({ page: "programme", id: s.p.id })} title={s.p.name}>{s.p.name}</span>
              <div className="tl-track">
                <button className="tl-bar" aria-label={`${s.p.name}, ${s.p.start}–${s.p.end}, ${pct(s.achievement)}`}
                  title={`${s.p.name} · ${s.p.start}–${s.p.end} · ${s.country} · ${t("Average achievement")} ${pct(s.achievement)}`}
                  onClick={() => navigate({ page: "programme", id: s.p.id })}
                  style={{ ["--c" as string]: outcomeVar(m, s.outcome), left: x(s.p.start!), width: `calc(${x(s.p.end! + 1)} - ${x(s.p.start!)} - 2px)`, border: 0, padding: 0 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}
