import { describe, expect, it } from "vitest";
import { aggregate, co2Aggregate, coverage, expectedIndicators, outcomeAchievement, statusOf, valueAt, type IndicatorAgg } from "./model";
import type { DataRecord, Project } from "./types";

const rec = (values: (number | null)[], target: number | null, extra: Partial<DataRecord> = {}): DataRecord => ({
  id: 0, row: 2, programme: "p", partner: "x", indicator: "AGR-01", source: "", type: null, label: "", target, values, co2: null, ...extra,
});

describe("valueAt", () => {
  it("carries the latest reported value forward", () => {
    expect(valueAt([1, null, 3, null], 3)).toBe(3);
    expect(valueAt([null, 5, null], 2)).toBe(5);
    expect(valueAt([null, null], 1)).toBeNull();
  });
});

describe("aggregate", () => {
  it("uses the as-of value, never a sum across years", () => {
    const a = aggregate([rec([10, 20, 30], 100)], 2);
    expect(a.value).toBe(30);
  });

  it("computes achievement as Σ results / Σ targets, not Σ of ratios", () => {
    // Two programmes: 96/50 and 0/100. Power BI summed ratios (1.92 → shown as 1.9 %); correct is 96/150.
    const a = aggregate([rec([96], 50), rec([0], 100)], 0);
    expect(a.achievement).toBeCloseTo(96 / 150);
  });

  it("leaves rows without a target out of achievement but keeps them in the total", () => {
    const a = aggregate([rec([500], 0), rec([20], 40)], 0);
    expect(a.value).toBe(520);
    expect(a.achievement).toBeCloseTo(0.5);
    expect(a.targetedRows).toBe(1);
  });

  it("reports the previous year for deltas", () => {
    const a = aggregate([rec([5, 8], 10)], 1);
    expect(a.value - a.previous).toBe(3);
  });
});

describe("outcomeAchievement", () => {
  it("averages indicator achievements and ignores indicators without targets", () => {
    const mk = (achievement: number | null) => ({ achievement }) as IndicatorAgg;
    expect(outcomeAchievement([mk(0.5), mk(1), mk(null)])).toBeCloseTo(0.75);
    expect(outcomeAchievement([mk(null)])).toBeNull();
  });
  it("caps each indicator at 100 % so an over-achiever cannot carry the others", () => {
    const mk = (achievement: number | null) => ({ achievement }) as IndicatorAgg;
    expect(outcomeAchievement([mk(5), mk(0.1)])).toBeCloseTo(0.55);
  });
});

describe("statusOf", () => {
  it("compares achievement with the elapsed share of the programme", () => {
    expect(statusOf(1.2, 2020, 2025, 2022)).toBe("reached");
    expect(statusOf(0.5, 2020, 2025, 2022)).toBe("on-track"); // 3 of 6 years elapsed
    expect(statusOf(0.3, 2020, 2025, 2022)).toBe("behind");
    expect(statusOf(0.1, 2020, 2025, 2022)).toBe("off-track");
    expect(statusOf(0, 2026, 2030, 2025)).toBe("not-started");
    expect(statusOf(null, 2020, 2025, 2022)).toBe("no-target");
  });
});

describe("co2Aggregate", () => {
  const co2 = {
    archetype: "arr" as const, ledger: "intervention" as const, stratum: "DRC/moist/lac", basis: "ex ante" as const, monitored: {}, overrides: [], reversal: null,
    inventory: { expected: [100, 200], realised: [0, 50], emissions: [0, 5] },
    intervention: { expected: [80, 160], realised: [0, 40] },
    indicative: null, potential: { expected: [10, 20], realised: [0, 0] },
    target: { inventory: 1000, intervention: 800 },
    perUnit: { inventory: 10, intervention: 8, indicative: 0, potential: 1 },
    band: { inventory: [0.5, 1.5] as [number, number], intervention: [0.5, 1.5] as [number, number], indicative: [1, 1] as [number, number], potential: [0.1, 2] as [number, number] },
    tier: 1, defaults: [],
  };
  it("sums each ledger separately and never nets them", () => {
    const a = co2Aggregate([rec([1, 2], 10, { co2 }), rec([1], 1)], 1);
    expect(a.inventory.expected).toBe(200);
    expect(a.inventory.realised).toBe(50);
    expect(a.intervention.expected).toBe(160);
    expect(a.intervention.low).toBe(80);
    expect(a.intervention.high).toBe(240);
    expect(a.intervention.target).toBe(800);
    expect(a.potential.expected).toBe(20);
    expect(a.emissions).toBe(5);
    expect(a.records).toBe(1);
  });
  it("carries the latest value forward", () => {
    expect(co2Aggregate([rec([1], 1, { co2: { ...co2, inventory: { expected: [100, null], realised: [0, null], emissions: [0, null] } } })], 1).inventory.expected).toBe(100);
  });
});

const project = (indicators: Project["indicators"], programmes = ["p"]): Project => ({
  id: 1, name: "P", fund: "CAFI", type: null, status: null, country: "DRC", countryLabel: "", orgs: [], approved: 0, transferred: 0,
  refunds: 0, expenditure: 0, start: null, end: null, programmes, passThrough: null, short: "P", projectType: "Enabling", pes: false,
  activities: [], confidence: "High", note: "", indicators,
});

describe("coverage", () => {
  it("keeps the strongest requirement when several projects expect the same indicator", () => {
    const a = project([{ code: "GOV-01", requirement: "optional", basis: "Activity: Capacity building" }]);
    const b = project([{ code: "GOV-01", requirement: "mandatory", basis: "Type: Enabling" }]);
    expect(expectedIndicators([a, b]).get("GOV-01")?.requirement).toBe("mandatory");
  });

  it("counts reported mandatory/required indicators and lists unexpected ones", () => {
    const p = project([
      { code: "GOV-01", requirement: "mandatory", basis: "Type: Enabling" },
      { code: "GOV-02", requirement: "required", basis: "Activity: Policy & regulatory support" },
      { code: "GOV-05", requirement: "optional", basis: "Activity: Policy & regulatory support" },
    ]);
    const c = coverage([p], [rec([1], 1, { indicator: "GOV-01" }), rec([1], 1, { indicator: "GOV-05" }), rec([1], 1, { indicator: "FOR-01" })]);
    expect(c.expected).toBe(2);
    expect(c.reported).toBe(1);
    expect(c.optionalReported).toBe(1);
    expect(c.extra).toEqual(["FOR-01"]);
    expect(c.rows.map((r) => r.code)).toEqual(["GOV-01", "GOV-02", "GOV-05"]); // mandatory, required, optional
  });
});
