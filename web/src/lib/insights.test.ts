import { describe, expect, it } from "vitest";
import { buildInsights, fill } from "./insights";
import { Index } from "./model";
import type { Metrics, Quality } from "./types";

const metrics = {
  meta: { generatedAt: "2026-10-30T00:00:00Z", source: "x", years: [2023, 2024, 2025], defaultYear: 2025, partialYears: [], recordCount: 3, areaIndicators: ["FOR-01"] },
  outcomes: [{ id: "FOR", name: "Forests", nameFr: "Forêts", full: "Forests", no: 2, scope: "", status: "", slot: 3 }, { id: "FIN", name: "Finance", nameFr: "Finance", full: "Finance", no: 3, scope: "", status: "", slot: 8 }],
  subcategories: [],
  indicators: [
    { code: "FOR-01", name: "Natural regeneration", nameFr: "Régénération", description: "", outcome: "FOR", subcategory: "", tier: "T2", unit: "ha", unitLabel: "ha", unitGroup: "", measurement: "", aggregation: "Sum", summable: true, tags: [], hasCo2: true, reported: true },
    { code: "FIN-01", name: "Co-financing", nameFr: "Cofinancement", description: "", outcome: "FIN", subcategory: "", tier: "T1", unit: "usd", unitLabel: "USD", unitGroup: "", measurement: "", aggregation: "Sum", summable: true, tags: [], hasCo2: false, reported: false },
  ],
  countries: [{ id: "DRC", iso: "180", name: "DR Congo", nameFr: "RD Congo" }],
  partners: [{ id: "x", name: "X" }],
  programmes: [
    { id: "a", name: "Prog A", country: "DRC", partners: ["x"], start: 2020, end: 2027, mptf: [] },
    { id: "b", name: "Prog B", country: "DRC", partners: ["x"], start: 2020, end: 2027, mptf: [] },
  ],
  records: [
    { id: 0, row: 2, programme: "a", partner: "x", indicator: "FOR-01", source: "", type: null, label: "", target: 1000, values: [100, 400, 900], co2: null },
    { id: 1, row: 3, programme: "b", partner: "x", indicator: "FOR-01", source: "", type: null, label: "", target: 1000, values: [50, null, null], co2: null },
  ],
  projects: [], activities: [],
  carbon: { method: "2.0", gwp: { source: "", ch4: 27, n2o: 273 }, factors: [], archetypes: {}, strata: {}, claims: [], monitoring: {}, draws: 1 },
  headline: { beneficiaries: { value: 1, label: "", label_fr: "", source: "" }, anticipatedCo2: { value: 1, label: "", label_fr: "", source: "" } },
} as unknown as Metrics;

const quality = { generatedAt: "", source: "", summary: { error: 0, warning: 2, info: 1 }, checks: [{ id: "carbon-defaults", severity: "info", title: "", description: "", count: 3, items: [] }] } as unknown as Quality;

describe("fill", () => {
  it("replaces placeholders", () => {
    expect(fill("{a} and {b}", { a: 1, b: "two" })).toBe("1 and two");
  });
});

describe("buildInsights", () => {
  const ix = new Index(metrics);
  it("finds the largest gain and its share of growth", () => {
    const ins = buildInsights(metrics, ix, metrics.records, 2, quality, "en");
    const gain = ins.find((i) => i.kind === "gain")!;
    expect(gain.text).toContain("Prog A");
    expect(gain.text).toContain("100%");       // Prog B carried forward: no growth this year
    expect(gain.to).toEqual({ page: "programme", id: "a" });
  });
  it("flags the programme that stopped reporting", () => {
    const ins = buildInsights(metrics, ix, metrics.records, 2, quality, "en");
    const pace = ins.find((i) => i.kind === "pace")!;
    expect(pace.text).toContain("Prog B has not reported a result since 2023");
  });
  it("summarises coverage and data quality and sorts by priority", () => {
    const ins = buildInsights(metrics, ix, metrics.records, 2, quality, "en");
    expect(ins.find((i) => i.kind === "coverage")!.text).toContain("1 of 2 standard indicators");
    expect(ins.find((i) => i.kind === "quality")!.text).toContain("2 warnings");
    expect(ins.map((i) => i.priority)).toEqual([...ins.map((i) => i.priority)].sort((a, b) => a - b));
  });
  it("skips year-on-year statements in the first year", () => {
    const ins = buildInsights(metrics, ix, metrics.records, 0, null, "en");
    expect(ins.some((i) => i.kind === "gain")).toBe(false);
    expect(ins.some((i) => i.kind === "quality")).toBe(false);
  });
});
