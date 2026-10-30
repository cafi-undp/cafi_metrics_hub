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

export interface Co2Series {
  absorbed: (number | null)[];
  avoided: (number | null)[];
  realised: (number | null)[];
  targetAbsorbed: number;
  targetAvoided: number;
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
  co2: Co2Series | null;
}

export interface Co2Factor {
  indicator: string;
  component: "absorbed" | "avoided";
  rate: number;
  horizon: number;
  formula: string;
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
  co2Factors: Co2Factor[];
  headline: { beneficiaries: HeadlineFigure; anticipatedCo2: HeadlineFigure };
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
