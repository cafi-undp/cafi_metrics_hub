// Shape of public/data/metrics.json and quality.json (written by pipeline/build.py).

export type Unit = "ha" | "count" | "km" | "people" | "usd" | "t" | "pct" | "ratio" | "score" | "tco2e";

/** A standard-indicator category (= Metrics Hub outcome), e.g. FOR. */
export interface Outcome {
  id: string;
  name: string; // short name
  nameFr: string;
  full: string;
  no: number | null;
  scope: string;
  status: string;
  slot: number | null; // palette slot 1–8, null = neutral
}

export interface Subcategory {
  code: string;
  category: string;
  name: string;
}

export interface Indicator {
  code: string; // standard code, e.g. GOV-03
  name: string;
  nameFr: string;
  description: string;
  outcome: string; // category code
  subcategory: string;
  tier: string; // T1 | T2 | T3
  unit: Unit;
  unitLabel: string;
  unitGroup: string;
  measurement: string;
  aggregation: string;
  summable: boolean;
  tags: string[];
  hasCo2: boolean;
  reported: boolean;
}

export interface Country {
  id: string;
  iso: string | null;
  name: string;
  nameFr: string;
}

export interface Partner {
  id: string;
  name: string;
}

export interface Programme {
  id: string;
  name: string;
  country: string;
  partners: string[];
  start: number | null;
  end: number | null;
  mptf: number[];
}

/** A project from the MPTF list (CAFI / FONAREDD trust funds). */
export interface Project {
  id: number;
  name: string;
  fund: string;
  type: string | null;
  status: string | null;
  country: string;
  countryLabel: string;
  orgs: string[];
  approved: number;
  transferred: number;
  refunds: number;
  expenditure: number;
  start: string | null;
  end: string | null;
  programmes: string[];
  passThrough: string | null; // set for fund-to-fund transfers, left out of totals
  // Classification from the reference workbook (tabs 12-14)
  short: string;
  projectType: string | null; // Enabling · AFOLU / integrated · PES · Private sector · Preparatory · Support
  pes: boolean;
  activities: string[];
  confidence: string | null; // High · Medium · Low
  note: string;
  indicators: ExpectedIndicator[];
}

export type Requirement = "mandatory" | "required" | "optional";

/** A standard indicator a project is expected to report, and why. */
export interface ExpectedIndicator {
  code: string;
  requirement: Requirement;
  basis: string; // "Type: AFOLU / integrated" or "Activity: Clean cooking"
}

/** A project activity and the indicators it triggers (tab 12_Activities). */
export interface Activity {
  code: string;
  name: string;
  indicators: string[];
}

export type Ledger = "inventory" | "intervention" | "indicative" | "potential";

export interface LedgerSeries {
  realised: (number | null)[]; // cumulative tCO2e delivered by the cohorts alive, as of each year
  expected: (number | null)[]; // stock as of each year × per-unit full-cycle value (ex ante)
}

/** Carbon results of one record, method 2.0 (docs/carbon-methodology.md). */
export interface Carbon {
  archetype: "arr" | "redd" | "alm" | "cooking";
  ledger: "inventory" | "intervention" | "indicative";
  stratum: string; // country/zone/soil
  basis: "ex ante" | "ex post"; // ex post when a monitored indicator or an override replaced a default
  monitored: Record<string, string>; // parameter → indicator that supplied it (usage ← ENR-02, …)
  overrides: string[]; // factor ids taken from config/carbon/overrides.yml
  reversal: { released: number; share: number; buffer: number } | null;
  inventory: LedgerSeries & { emissions: (number | null)[] };
  intervention: LedgerSeries;
  indicative: LedgerSeries | null; // soil carbon without sampling
  potential: LedgerSeries | null; // displaced fuelwood, ex post only
  target: { inventory: number; intervention: number };
  perUnit: Record<Ledger, number>;
  band: Record<Ledger, [number, number]>; // p5 / mean, p95 / mean
  tier: number;
  defaults: string[]; // factor ids still on a default that a monitored indicator will replace
}

export interface CarbonFactor {
  id: string;
  unit: string;
  tier: number;
  source: string;
  note: string;
  confirm: boolean;
  monitoredBy: string | null;
  dist: string;
  value?: number;
  values?: Record<string, number>;
  by?: string;
}

export interface CarbonMeta {
  method: string;
  gwp: { source: string; ch4: number; n2o: number };
  factors: CarbonFactor[];
  archetypes: Record<string, { module: string; label: string; system?: string; reference?: string; ledger?: string; fuelwood?: boolean }>;
  strata: Record<string, { country: string; zone: string; soil: string }>;
  claims: { project: number; status: string; note?: string; confirm?: boolean; derived?: boolean }[];
  monitoring: Record<string, { indicators: Record<string, string>; overrides: string[] }>;
  draws: number;
}

export interface DataRecord {
  id: number;
  row: number;
  programme: string;
  partner: string;
  indicator: string;
  source: string; // indicator text as written in the workbook
  type: string | null; // e.g. "Buildings" when several old indicators feed one code
  label: string;
  target: number | null;
  values: (number | null)[];
  co2: Carbon | null;
}

export interface HeadlineFigure {
  value: number;
  label: string;
  label_fr: string;
  source: string;
  unit?: string;
}

export interface Metrics {
  meta: {
    generatedAt: string;
    source: string;
    years: number[];
    defaultYear: number;
    partialYears: number[];
    recordCount: number;
    areaIndicators: string[];
  };
  outcomes: Outcome[];
  subcategories: Subcategory[];
  indicators: Indicator[];
  countries: Country[];
  partners: Partner[];
  programmes: Programme[];
  records: DataRecord[];
  projects: Project[];
  activities: Activity[];
  carbon: CarbonMeta;
  headline: { beneficiaries: HeadlineFigure };
}

export interface QualityItem {
  row?: number;
  programme?: string;
  indicator?: string;
  field?: string;
  value?: string;
  detail?: string;
}

export interface QualityCheck {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  items: QualityItem[];
}

export interface Quality {
  generatedAt: string;
  source: string;
  summary: { error: number; warning: number; info: number };
  checks: QualityCheck[];
}
