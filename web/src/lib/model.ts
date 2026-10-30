// Aggregation rules for the dashboard. Every chart and number goes through here,
// so the definitions live in one place (and are covered by model.test.ts).
//
//  * Results are CUMULATIVE. The value "as of" a year is the latest reported
//    value at or before that year — never a sum across years.
//  * Values with different units are never added together.
//  * Achievement = Σ results / Σ targets, over rows that have a target > 0.
//    (The Power BI report summed per-row percentages instead, which is wrong.)
//  * An outcome's achievement is the average of its indicators' achievements.

import type { DataRecord, Indicator, Metrics, Programme, Unit } from "./types";

export interface Filters {
  year: number;
  countries: string[];
  partners: string[];
  programmes: string[];
}

export function yearIndex(m: Metrics, year: number): number {
  const i = m.meta.years.indexOf(year);
  return i === -1 ? m.meta.years.length - 1 : i;
}

/** Latest non-null value at or before index `yi` (carry-forward). */
export function valueAt(values: (number | null)[], yi: number): number | null {
  for (let i = Math.min(yi, values.length - 1); i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

export class Index {
  readonly programmes: Map<string, Programme>;
  readonly indicators: Map<string, Indicator>;
  readonly partners: Map<string, string>;
  readonly countries: Map<string, Metrics["countries"][number]>;

  constructor(readonly m: Metrics) {
    this.programmes = new Map(m.programmes.map((p) => [p.id, p]));
    this.indicators = new Map(m.indicators.map((i) => [i.code, i]));
    this.partners = new Map(m.partners.map((p) => [p.id, p.name]));
    this.countries = new Map(m.countries.map((c) => [c.id, c]));
  }

  countryOf(r: DataRecord): string {
    return this.programmes.get(r.programme)?.country ?? "";
  }

  outcomeOf(r: DataRecord): string {
    return this.indicators.get(r.indicator)?.outcome ?? "";
  }
}

export function applyFilters(ix: Index, f: Omit<Filters, "year">, records = ix.m.records): DataRecord[] {
  const c = new Set(f.countries);
  const p = new Set(f.partners);
  const g = new Set(f.programmes);
  return records.filter(
    (r) =>
      (!c.size || c.has(ix.countryOf(r))) &&
      (!p.size || p.has(r.partner)) &&
      (!g.size || g.has(r.programme)),
  );
}

export interface Agg {
  value: number; // Σ as-of values (all rows)
  target: number; // Σ targets (all rows)
  achieved: number; // Σ as-of values over rows that have a target
  targeted: number; // Σ targets > 0
  achievement: number | null; // achieved / targeted
  targetedRows: number; // rows with a target > 0
  previous: number; // Σ as-of values one year earlier
  rows: number;
  programmes: number;
}

export function aggregate(records: DataRecord[], yi: number): Agg {
  let value = 0, target = 0, achieved = 0, targeted = 0, previous = 0, targetedRows = 0;
  const progs = new Set<string>();
  for (const r of records) {
    const v = valueAt(r.values, yi) ?? 0;
    value += v;
    previous += yi > 0 ? valueAt(r.values, yi - 1) ?? 0 : 0;
    target += r.target ?? 0;
    if (r.target && r.target > 0) {
      achieved += v;
      targeted += r.target;
      targetedRows++;
    }
    progs.add(r.programme);
  }
  return {
    value, target, achieved, targeted, previous, targetedRows,
    achievement: targeted > 0 ? achieved / targeted : null,
    rows: records.length,
    programmes: progs.size,
  };
}

export function byKey<T>(records: DataRecord[], key: (r: DataRecord) => T): Map<T, DataRecord[]> {
  const out = new Map<T, DataRecord[]>();
  for (const r of records) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** One series per year of Σ as-of values. */
export function yearlySeries(records: DataRecord[], years: number[]): number[] {
  return years.map((_, yi) => records.reduce((s, r) => s + (valueAt(r.values, yi) ?? 0), 0));
}

export function yearlyAchievement(records: DataRecord[], years: number[]): (number | null)[] {
  return years.map((_, yi) => aggregate(records, yi).achievement);
}

export interface IndicatorAgg extends Agg {
  indicator: Indicator;
  records: DataRecord[];
}

export function indicatorAggs(ix: Index, records: DataRecord[], yi: number): IndicatorAgg[] {
  const groups = byKey(records, (r) => r.indicator);
  return ix.m.indicators
    .filter((i) => groups.has(i.code))
    .map((i) => ({ indicator: i, records: groups.get(i.code)!, ...aggregate(groups.get(i.code)!, yi) }));
}

export function outcomeAchievement(aggs: IndicatorAgg[]): number | null {
  const vals = aggs.map((a) => a.achievement).filter((a): a is number => a !== null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

export function sumUnit(aggs: IndicatorAgg[], unit: Unit, codes?: string[]): number {
  return aggs
    .filter((a) => a.indicator.unit === unit && (!codes || codes.includes(a.indicator.code)))
    .reduce((s, a) => s + a.value, 0);
}

export interface Co2Agg {
  absorbed: number;
  avoided: number;
  committed: number;
  realised: number;
  target: number;
}

export function co2Aggregate(records: DataRecord[], yi: number): Co2Agg {
  let absorbed = 0, avoided = 0, realised = 0, target = 0;
  for (const r of records) {
    if (!r.co2) continue;
    absorbed += valueAt(r.co2.absorbed, yi) ?? 0;
    avoided += valueAt(r.co2.avoided, yi) ?? 0;
    realised += valueAt(r.co2.realised, yi) ?? 0;
    target += r.co2.targetAbsorbed + r.co2.targetAvoided;
  }
  return { absorbed, avoided, committed: absorbed + avoided, realised, target };
}

export type Status = "reached" | "on-track" | "behind" | "off-track" | "not-started" | "no-target";

/**
 * Compare achievement with the share of the programme period that has elapsed.
 * A programme half-way through its period at 50 % of target is on track.
 */
export function statusOf(achievement: number | null, start: number | null, end: number | null, year: number): Status {
  if (achievement === null) return "no-target";
  if (achievement >= 1) return "reached";
  if (start !== null && year < start) return "not-started";
  const span = start !== null && end !== null ? Math.max(1, end - start + 1) : null;
  const expected = span === null ? 1 : Math.min(1, Math.max(0, (year - start! + 1) / span));
  if (achievement >= expected * 0.9) return "on-track";
  if (achievement >= expected * 0.5) return "behind";
  return "off-track";
}

export function activeIn(p: Programme, year: number): boolean {
  return (p.start ?? -Infinity) <= year && year <= (p.end ?? Infinity);
}
