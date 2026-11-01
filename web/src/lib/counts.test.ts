import { describe, expect, it } from "vitest";
import { countryCount, Index, portfolioCounts } from "./model";
import type { Metrics } from "./types";

const project = (id: number, country: string, programmes: string[], passThrough: string | null = null) =>
  ({ id, name: `P${id}`, fund: "CAFI", country, programmes, passThrough, approved: 1, transferred: 1, expenditure: 1, indicators: [] });

const m = {
  meta: { years: [2025] },
  countries: [{ id: "DRC", iso: "180", name: "DR Congo" }, { id: "Gabon", iso: "266", name: "Gabon" }, { id: "Regional", iso: null, name: "Regional" }],
  programmes: [
    { id: "a", name: "A", country: "DRC", mptf: [1] },
    { id: "b", name: "B", country: "DRC", mptf: [] },          // not linked yet
    { id: "c", name: "C", country: "Gabon", mptf: [3] },
    { id: "r", name: "R", country: "Regional", mptf: [] },
  ],
  projects: [
    project(1, "DRC", ["a"]),
    project(2, "DRC", []),
    project(3, "Gabon", ["c"]),
    project(4, "DRC", [], "Fund-to-fund transfer"),            // listed, never counted
  ],
  indicators: [], partners: [], records: [],
} as unknown as Metrics;

describe("portfolioCounts", () => {
  const ix = new Index(m);
  it("leaves fund-to-fund transfers out of the project count", () => {
    const c = portfolioCounts(ix, { countries: [], programmes: [] });
    expect(c.projects.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(c.transfers.map((p) => p.id)).toEqual([4]);
    expect(c.linked.map((p) => p.id)).toEqual([1, 3]);
    expect(c.unlinked).toEqual(["b", "r"]);
  });
  it("applies the country and programme filters the same way to projects and programmes", () => {
    const drc = portfolioCounts(ix, { countries: ["DRC"], programmes: [] });
    expect(drc.projects.map((p) => p.id)).toEqual([1, 2]);
    expect(drc.programmes).toEqual(["a", "b"]);
    expect(drc.unlinked).toEqual(["b"]);
    const one = portfolioCounts(ix, { countries: [], programmes: ["c"] });
    expect(one.projects.map((p) => p.id)).toEqual([3]);
    expect(one.linked.length).toBe(1);
  });
});

describe("countryCount", () => {
  it("does not count Regional as a country", () => {
    expect(countryCount(new Index(m), ["DRC", "Gabon", "Regional", "DRC"])).toEqual({ countries: 2, regional: true });
    expect(countryCount(new Index(m), ["DRC"])).toEqual({ countries: 1, regional: false });
  });
});
