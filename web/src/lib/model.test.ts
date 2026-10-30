import { describe, expect, it } from "vitest";
import { aggregate, co2Aggregate, outcomeAchievement, statusOf, valueAt, type IndicatorAgg } from "./model";
import type { DataRecord } from "./types";

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
