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
  it("sums absorbed, avoided, realised and target", () => {
    const co2 = { absorbed: [10, 20], avoided: [5, 10], realised: [1, 3], targetAbsorbed: 100, targetAvoided: 50 };
    const a = co2Aggregate([rec([1, 2], 10, { co2 }), rec([1], 1)], 1);
    expect(a).toEqual({ absorbed: 20, avoided: 10, committed: 30, realised: 3, target: 150 });
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
