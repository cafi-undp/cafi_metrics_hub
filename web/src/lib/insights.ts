// "What changed" insights: short statements generated from the data for the selected year,
// each linked to the page that holds the rows behind it. Pure functions, covered by tests.

import { t } from "./i18n";
import { compact, pct } from "./format";
import { byKey, co2Aggregate, indicatorAggs, outcomeAchievement, statusOf, valueAt, type Index } from "./model";
import type { Route } from "./state";
import type { DataRecord, Metrics, Quality } from "./types";

export interface Insight {
  key: string;
  kind: "gain" | "pace" | "target" | "carbon" | "new" | "quality" | "coverage";
  eyebrow: string; // short label, already translated
  text: string; // one or two sentences, already translated
  to: Route; // where the rows behind the statement live
  priority: number; // lower first
}

/** Fill {placeholders} in a translated template. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

const nameOfLang = (x: { name: string; nameFr?: string }, lang: string) => (lang === "fr" && x.nameFr ? x.nameFr : x.name);

export function buildInsights(m: Metrics, ix: Index, records: DataRecord[], yi: number, q: Quality | null, lang: string): Insight[] {
  const year = m.meta.years[yi];
  const out: Insight[] = [];
  const progName = (id: string) => ix.programmes.get(id)?.name ?? id;

  // 1. Largest hectare gain this year, and its share of the portfolio's growth.
  if (yi > 0) {
    const area = records.filter((r) => m.meta.areaIndicators.includes(r.indicator));
    const gains = [...byKey(area, (r) => r.programme).entries()].map(([pid, rs]) => ({
      pid, gain: rs.reduce((s, r) => s + ((valueAt(r.values, yi) ?? 0) - (valueAt(r.values, yi - 1) ?? 0)), 0),
    })).filter((g) => g.gain > 0).sort((a, b) => b.gain - a.gain);
    const total = gains.reduce((s, g) => s + g.gain, 0);
    if (gains.length && total > 0) {
      const g = gains[0];
      out.push({
        key: "gain", kind: "gain", priority: 1, eyebrow: t("Largest gain"),
        text: fill(t("{programme} added {ha} ha this year, {share} of the portfolio's hectare growth."), { programme: progName(g.pid), ha: compact(g.gain), share: pct(g.gain / total) }),
        to: { page: "programme", id: g.pid },
      });
    }
  }

  // 2. Pace: programmes below half of their expected pace, and the longest silence.
  const byProg = byKey(records, (r) => r.programme);
  let off = 0;
  let silent: { pid: string; last: number } | null = null;
  for (const [pid, rs] of byProg) {
    const p = ix.programmes.get(pid);
    if (!p) continue;
    const ach = outcomeAchievement(indicatorAggs(ix, rs, yi));
    if (statusOf(ach, p.start, p.end, year) === "off-track") off++;
    let last = -1;
    rs.forEach((r) => r.values.forEach((v, i) => { if (v !== null && i <= yi) last = Math.max(last, i); }));
    const active = (p.end ?? Infinity) >= year && (p.start ?? -Infinity) <= year;
    if (active && last >= 0 && last < yi - 1 && (!silent || last < silent.last)) silent = { pid, last };
  }
  if (off > 0 || silent) {
    const parts: string[] = [];
    if (off > 0) parts.push(fill(t(off === 1 ? "{n} project is below half of its expected pace" : "{n} projects are below half of their expected pace"), { n: off }));
    if (silent) parts.push(fill(t("{programme} has not reported a result since {year}"), { programme: progName(silent.pid), year: m.meta.years[silent.last] }));
    out.push({ key: "pace", kind: "pace", priority: 2, eyebrow: t("Off track"), text: parts.join("; ") + ".", to: silent ? { page: "programme", id: silent.pid } : { page: "programmes" } });
  }

  // 3. Targets passed this year.
  const aggs = indicatorAggs(ix, records, yi);
  const prev = yi > 0 ? new Map(indicatorAggs(ix, records, yi - 1).map((a) => [a.indicator.code, a.achievement])) : new Map();
  const passed = aggs.filter((a) => a.achievement !== null && a.achievement >= 1 && ((prev.get(a.indicator.code) ?? 0) ?? 0) < 1);
  if (passed.length) {
    const a = passed.sort((x, y) => (y.achievement ?? 0) - (x.achievement ?? 0))[0];
    out.push({
      key: "target", kind: "target", priority: 3, eyebrow: t("Target reached"),
      text: fill(t("{indicator} passed its final target this year, at {pct} across {n} projects."), { indicator: nameOfLang(a.indicator, lang), pct: pct(a.achievement), n: a.programmes }),
      to: { page: "outcome", id: a.indicator.outcome },
    });
  }

  // 4. Carbon: expected net benefit and its largest contributor.
  const co2 = co2Aggregate(records, yi);
  if (co2.intervention.expected > 0) {
    const byInd = m.indicators.filter((i) => i.hasCo2).map((i) => ({ i, v: co2Aggregate(records.filter((r) => r.indicator === i.code), yi).intervention.expected })).sort((a, b) => b.v - a.v);
    const top = byInd[0];
    out.push({
      key: "carbon", kind: "carbon", priority: 4, eyebrow: t("Climate"),
      text: fill(t("Expected net GHG benefit of {x} tCO₂e (p5–p95 {lo}–{hi}); {indicator} is the largest contributor at {share}."), {
        x: compact(co2.intervention.expected, 2), lo: compact(co2.intervention.low, 2), hi: compact(co2.intervention.high, 2),
        indicator: nameOfLang(top.i, lang).toLowerCase(), share: pct(top.v / co2.intervention.expected),
      }),
      to: { page: "climate" },
    });
  }

  // 5. Programmes reporting for the first time this year.
  const first = [...byProg.entries()].filter(([, rs]) => {
    const firstYear = Math.min(...rs.flatMap((r) => r.values.map((v, i) => (v !== null ? i : Infinity))));
    return firstYear === yi;
  }).map(([pid]) => progName(pid));
  if (first.length && yi > 0) {
    out.push({
      key: "new", kind: "new", priority: 5, eyebrow: t("New this year"),
      text: fill(t(first.length === 1 ? "{names} reported results for the first time." : "{n} projects reported results for the first time: {names}."), { n: first.length, names: first.slice(0, 3).join(", ") + (first.length > 3 ? "…" : "") }),
      to: { page: "programmes" },
    });
  }

  // 6. Coverage of the standard indicators.
  const reported = m.indicators.filter((i) => i.reported).length;
  out.push({
    key: "coverage", kind: "coverage", priority: 6, eyebrow: t("Standard indicators"),
    text: fill(t("{reported} of {total} standard indicators are reported; {cats} categories have no results yet."), {
      reported, total: m.indicators.length, cats: m.outcomes.filter((o) => !m.indicators.some((i) => i.outcome === o.id && i.reported)).length,
    }),
    to: { page: "methodology" },
  });

  // 7. Data quality of the last refresh.
  if (q) {
    const defaults = q.checks.find((c) => c.id === "carbon-defaults")?.count ?? 0;
    out.push({
      key: "quality", kind: "quality", priority: 7, eyebrow: t("Data quality"),
      text: fill(t("{e} errors and {w} warnings on the last refresh; {d} carbon defaults await monitoring data."), { e: q.summary.error, w: q.summary.warning, d: defaults }),
      to: { page: "quality" },
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}
