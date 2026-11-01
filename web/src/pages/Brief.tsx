import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/state";
import { useFiltered } from "../lib/hooks";
import { t } from "../lib/i18n";
import { compact, num, pct, unitLabel } from "../lib/format";
import { co2Aggregate, indicatorAggs, portfolioCounts, sumUnit, valueAt } from "../lib/model";
import { buildInsights } from "../lib/insights";
import { Link } from "../components/Shell";

/** Briefing mode: the key figures and the generated insights as full-width slides, keyboard-driven. */
export function Brief() {
  const { m, ix, q, lang, navigate, filters } = useApp();
  const { records, yi, year } = useFiltered();
  const aggs = useMemo(() => indicatorAggs(ix, records, yi), [ix, records, yi]);
  const co2 = useMemo(() => co2Aggregate(records, yi), [records, yi]);
  const insights = useMemo(() => buildInsights(m, ix, records, yi, q, lang), [m, ix, records, yi, q, lang]);
  const hectares = sumUnit(aggs, "ha", m.meta.areaIndicators);
  // Programmes that report hectares as of the year, not every programme in the data.
  const progs = new Set(records.filter((r) => m.meta.areaIndicators.includes(r.indicator) && (valueAt(r.values, yi) ?? 0) > 0).map((r) => r.programme)).size;
  const counted = portfolioCounts(ix, filters).projects; // same count as the Portfolio page
  const approved = counted.reduce((s, p) => s + p.approved, 0);
  const spent = counted.reduce((s, p) => s + p.expenditure, 0);

  const slides = [
    { k: t("Hectares"), big: compact(hectares), unit: unitLabel("ha", lang), text: `${t("restored, used sustainably or protected by")} ${progs} ${t(progs === 1 ? "programme" : "programmes")} · ${t("As of")} ${year}`, to: { page: "" } as const },
    { k: t("Climate"), big: compact(co2.intervention.expected, 2), unit: "tCO₂e", text: `${t("Net GHG benefit expected, full cycle")} · ${t("p5–p95 band")} ${compact(co2.intervention.low, 2)}–${compact(co2.intervention.high, 2)} · ${t("Removals in the inventory ledger")} ${compact(co2.inventory.expected, 2)} · ${t("Realised to date")} ${compact(co2.intervention.realised, 2)}`, to: { page: "climate" } as const },
    { k: t("Finance"), big: `$${compact(approved)}`, unit: "", text: `${t("approved across")} ${counted.length} ${t(counted.length === 1 ? "project" : "projects")} · ${pct(approved ? spent / approved : null)} ${t("spent")}`, to: { page: "portfolio" } as const },
    ...insights.map((i) => ({ k: i.eyebrow, big: "", unit: "", text: i.text, to: i.to })),
  ];
  const [k, setK] = useState(0);
  const go = (i: number) => setK((i + slides.length) % slides.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(k + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(k - 1); }
      else if (e.key === "Escape") navigate({ page: "" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [k, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = slides[k];
  return (
    <section className="brief" aria-label={t("Briefing")} aria-live="polite">
      <div className="brief-bar">
        <span>CAFI Metrics Hub · {t("Briefing")} · {t("As of")} {year}{filters.countries.length + filters.partners.length + filters.programmes.length ? ` · ${t("filtered")}` : ""}</span>
        <span className="brief-hint">← → {t("navigate")} · Esc {t("close")}</span>
      </div>
      <div className="brief-slide" key={k}>
        <div className="brief-k">{String(k + 1).padStart(2, "0")} · {s.k}</div>
        {s.big && <div className="brief-big num">{s.big}{s.unit && <small>{s.unit}</small>}</div>}
        <p className={s.big ? "brief-p" : "brief-p brief-p-lg"}>{s.text}</p>
        <Link to={s.to} className="brief-link">{t("Open the detail")} →</Link>
      </div>
      <div className="brief-ctl">
        <button className="brief-btn" onClick={() => go(k - 1)} aria-label={t("Previous")}>← {t("Previous")}</button>
        <div className="brief-dots" aria-hidden="true">{slides.map((_, i) => <i key={i} className={i === k ? "on" : undefined} />)}</div>
        <span className="brief-count num">{k + 1} / {slides.length}</span>
        <button className="brief-btn" onClick={() => go(k + 1)} aria-label={t("Next")}>{t("Next")} →</button>
        <Link to={{ page: "" }} className="brief-btn">{t("Exit")}</Link>
      </div>
      <span className="sr-only">{num(k + 1)} / {num(slides.length)}</span>
    </section>
  );
}
