"""Build the dashboard dataset from ProjectData.xlsx and the MPTF project list.

    python -m pipeline.build [--input data/ProjectData.xlsx] [--projects data/MPTF_Projects.xlsx]
                             [--out web/public/data]

Steps: read the CumulResults sheet -> normalise text -> re-code indicators to the
CAFI standard codes (config/reference workbook) -> run quality checks -> run the
carbon engine (config/carbon, docs/carbon-methodology.md) -> link programmes to
MPTF projects and the standard indicators each project is expected to report ->
write metrics.json and quality.json.
Exits with status 1 when a blocking (error-level) check fails, so CI never
publishes a broken dataset.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd
import yaml

from pipeline.carbon import CarbonConfig, CarbonEngine
from pipeline.portfolio import read_projects
from pipeline.quality import QualityReport
from pipeline.reference import load_project_reference, load_reference

ROOT = Path(__file__).resolve().parent.parent
SHEET = "CumulResults"

# Source column -> internal name. Headers are matched case- and space-insensitively.
COLUMNS = {
    "pays": "country",
    "programme": "programme",
    "implementing org.": "partner",
    "outcome": "outcome",
    "indicator": "indicator",
    "indicator synonym": "label",
    "unité": "unit",
    "start year": "start",
    "end year": "end",
    "final target": "target",
}
UNIT_ALIASES = {"hectare": "ha", "nombre": "count", "km": "km"}
# Units in the workbook that are acceptable for a catalogue unit.
UNIT_COMPATIBLE = {"ha": {"ha"}, "km": {"km"}, "count": {"count"}, "people": {"count"}}
STANDARD_CODE = re.compile(r"^([A-Z]{3}-\d{2})\b")
LEGACY_CODE = re.compile(r"^(\d{1,2})\s*[.)]")


@dataclass
class Config:
    categories: list[dict]
    subcategories: list[dict]
    indicators: dict[str, dict]
    colours: dict[str, int | None]
    category_fr: dict[str, str]
    legacy_codes: dict[str, str]
    label_overrides: dict[str, str]
    legacy_types: dict[str, str]
    area_headline: list[str]
    countries: dict[str, dict]
    programmes: dict[str, list[int]]
    pass_through: dict[int, str]
    carbon: CarbonConfig
    headline: dict
    activities: list[dict]
    project_meta: dict[int, dict]
    project_unknown: list[dict]

    @classmethod
    def load(cls, config_dir: Path) -> "Config":
        def y(name):
            path = config_dir / name
            return yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
        ind = y("indicators.yml")
        ref = load_reference(config_dir / ind["reference"])
        proj = load_project_reference(config_dir / ind["reference"], set(ref["indicators"]))
        carbon = CarbonConfig.load(config_dir)
        unknown = [c for c in carbon.archetypes if c not in ref["indicators"]]
        if unknown:
            raise ValueError(f"config/carbon/archetypes.yml: codes not in the reference workbook: {unknown}")
        return cls(
            categories=ref["categories"],
            subcategories=ref["subcategories"],
            indicators=ref["indicators"],
            colours=ind.get("category_colours") or {},
            category_fr=ind.get("category_names_fr") or {},
            legacy_codes={str(k).zfill(2): v for k, v in (ind.get("legacy_codes") or {}).items()},
            label_overrides={clean_text(k): v for k, v in (ind.get("label_overrides") or {}).items()},
            legacy_types={str(k).zfill(2): v for k, v in (ind.get("legacy_types") or {}).items()},
            area_headline=list(ind.get("area_headline") or []),
            countries=ind["countries"],
            programmes={clean_text(k): [int(x) for x in (v or [])] for k, v in (y("programmes.yml") or {}).items()},
            pass_through={int(k): clean_text(v) for k, v in ((y("portfolio.yml") or {}).get("pass_through") or {}).items()},
            carbon=carbon,
            headline=y("headline.yml"),
            activities=proj["activities"],
            project_meta=proj["projects"],
            project_unknown=proj["unknown_indicators"],
        )

    def country_alias(self) -> dict[str, str]:
        """Any spelling (id, display name or alias), case-folded → country id."""
        out = {}
        for cid, c in self.countries.items():
            for name in [cid, c.get("name", ""), *(c.get("aliases") or [])]:
                out[clean_text(name).casefold()] = cid
        return out


@dataclass
class Dataset:
    years: list[int]
    frame: pd.DataFrame
    report: QualityReport = field(default_factory=QualityReport)


def clean_text(value) -> str:
    """Trim, normalise unicode and collapse internal whitespace."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = unicodedata.normalize("NFC", str(value))
    return re.sub(r"\s+", " ", text).strip()


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def year_of(header) -> int | None:
    text = clean_text(header)
    if re.fullmatch(r"(19|20)\d\d(\.0)?", text):
        return int(float(text))
    return None


def read_workbook(path: Path, config: Config) -> Dataset:
    raw = pd.read_excel(path, sheet_name=SHEET, dtype=object)
    report = QualityReport()

    rename, years = {}, []
    for col in raw.columns:
        key = clean_text(col).lower()
        if key in COLUMNS:
            rename[col] = COLUMNS[key]
        elif (y := year_of(col)) is not None:
            rename[col] = y
            years.append(y)
    missing = sorted(set(COLUMNS.values()) - set(rename.values()))
    if missing:
        report.error("schema", "Required columns missing",
                     f"Sheet '{SHEET}' is missing: {', '.join(missing)}.")
        return Dataset(years=[], frame=pd.DataFrame(), report=report)
    if not years:
        report.error("schema", "No year columns", "Expected columns named like 2020, 2021, …")
        return Dataset(years=[], frame=pd.DataFrame(), report=report)

    df = raw.rename(columns=rename)[list(COLUMNS.values()) + sorted(years)].copy()
    df = df.dropna(how="all", subset=["programme", "indicator"])
    df.insert(0, "row", df.index + 2)  # Excel row number (header is row 1)
    return Dataset(years=sorted(years), frame=df.reset_index(drop=True), report=report)


def normalise(ds: Dataset, config: Config) -> Dataset:
    df, rep = ds.frame, ds.report
    text_cols = ["country", "programme", "partner", "outcome", "indicator", "label", "unit"]

    padded = []
    for col in text_cols:
        before = df[col].map(lambda v: "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v))
        after = df[col].map(clean_text)
        for i in df.index[before != after]:
            padded.append({"row": int(df.at[i, "row"]), "field": col, "value": before[i]})
        df[col] = after
    if padded:
        rep.warning("whitespace", "Extra spaces in text",
                    "Leading, trailing or double spaces make identical labels count as different "
                    "items. They were removed automatically.",
                    padded)

    # Partner spelling: group case-insensitively, keep the most frequent spelling.
    canon = {}
    for _, grp in df.groupby(df["partner"].str.casefold()):
        spellings = grp["partner"].value_counts()
        if len(spellings) > 1:
            rep.warning("partner-spelling", "Inconsistent partner spelling",
                        "The same implementing organisation is written in more than one way.",
                        [{"value": " / ".join(spellings.index), "field": "partner"}])
        for s in spellings.index:
            canon[s] = spellings.index[0]
    df["partner"] = df["partner"].map(canon)

    # Indicator code: a standard code ("GOV-03 …") or an old number ("06. …")
    # re-coded through config/indicators.yml.
    def resolve(ind: str, label: str) -> tuple[str | None, str | None]:
        if m := STANDARD_CODE.match(ind):
            return m.group(1), None
        if m := LEGACY_CODE.match(ind):
            legacy = m.group(1).zfill(2)
            return config.label_overrides.get(label) or config.legacy_codes.get(legacy), legacy
        return None, None

    resolved = [resolve(r.indicator, r.label) for r in df.itertuples()]
    df["code"] = [c for c, _ in resolved]
    df["legacy"] = [l for _, l in resolved]
    unknown = df[df["code"].isna() | ~df["code"].isin(config.indicators)]
    if len(unknown):
        rep.error("indicator-unknown", "Indicator not recognised",
                  "Use a standard code from the reference workbook (e.g. 'GOV-03 …'), or map the old "
                  "number in legacy_codes in config/indicators.yml.",
                  [{"row": int(r.row), "programme": r.programme, "indicator": r.indicator}
                   for r in unknown.itertuples()])

    recoded = (df.dropna(subset=["legacy", "code"])
               .groupby(["legacy", "indicator", "code"]).size().reset_index(name="rows"))
    if len(recoded):
        rep.info("recoded", "Old indicator numbers re-coded to standard codes",
                 "ProjectData.xlsx still uses the old numbering. Each row was re-coded with "
                 "legacy_codes / label_overrides in config/indicators.yml.",
                 [{"indicator": r.indicator, "value": r.code,
                   "detail": f"{r.rows} rows → {r.code} {config.indicators[r.code]['name']}"}
                  for r in recoded.itertuples()])

    case_variants = df.groupby(df["outcome"].str.casefold())["outcome"].nunique()
    for key in case_variants[case_variants > 1].index:
        variants = sorted(df.loc[df["outcome"].str.casefold() == key, "outcome"].unique())
        rep.warning("outcome-case", "Outcome written in different cases",
                    "In Power BI these appear as separate outcomes and rows get dropped.",
                    [{"value": " / ".join(variants), "field": "outcome"}])

    alias = config.country_alias()
    df["country"] = [alias.get(c.casefold(), c) for c in df["country"]]
    unk_country = sorted(set(df["country"]) - set(config.countries))
    if unk_country:
        rep.error("country-unknown", "Country not in catalogue",
                  "Add the country to config/indicators.yml (countries).",
                  [{"value": c, "field": "country"} for c in unk_country])

    # Numbers.
    bad_num = []
    for col in ["start", "end", "target", *ds.years]:
        num = pd.to_numeric(df[col], errors="coerce")
        bad = df[col].notna() & num.isna()
        for i in df.index[bad]:
            bad_num.append({"row": int(df.at[i, "row"]), "field": str(col), "value": str(df.at[i, col])})
        df[col] = num
    if bad_num:
        rep.error("not-a-number", "Text in a numeric column",
                  "These cells must contain numbers.", bad_num)

    negatives = []
    for col in ["target", *ds.years]:
        for i in df.index[df[col] < 0]:
            negatives.append({"row": int(df.at[i, "row"]), "programme": df.at[i, "programme"],
                              "field": str(col), "value": str(df.at[i, col])})
    if negatives:
        rep.error("negative", "Negative values", "Results and targets cannot be negative.", negatives)

    df["unit_norm"] = df["unit"].str.casefold().map(UNIT_ALIASES)
    unit_mism = []
    for r in df.itertuples():
        meta = config.indicators.get(r.code)
        if meta and meta["unit"] in UNIT_COMPATIBLE and r.unit_norm not in UNIT_COMPATIBLE[meta["unit"]]:
            unit_mism.append({"row": int(r.row), "programme": r.programme, "indicator": r.indicator,
                              "detail": f"Sheet unit '{r.unit}', standard unit '{meta['unitLabel']}' ({r.code})"})
    if unit_mism:
        rep.warning("unit-mismatch", "Unit differs from the standard indicator",
                    "The standard unit is used on the dashboard.", unit_mism)
    return ds


def quality_checks(ds: Dataset, config: Config) -> None:
    df, rep, years = ds.frame, ds.report, ds.years

    dup = df[df.duplicated(["programme", "partner", "code", "label"], keep=False)]
    if len(dup):
        rep.warning("duplicate", "Duplicate rows",
                    "Same programme, partner, indicator and sub-indicator appear more than once; "
                    "both are kept and added together.",
                    [{"row": int(r.row), "programme": r.programme, "indicator": r.indicator,
                      "detail": r.label} for r in dup.itertuples()])

    no_target = df[(df["target"].fillna(0) == 0)]
    if len(no_target):
        rep.info("no-target", "No final target",
                 "Rows with a target of 0 or blank are excluded from achievement rates.",
                 [{"row": int(r.row), "programme": r.programme, "indicator": r.indicator,
                   "detail": r.label} for r in no_target.itertuples()])

    drops = []
    for i in df.index:
        prev = None
        for y in years:
            v = df.at[i, y]
            if pd.isna(v):
                continue
            if prev is not None and v < prev[1]:
                drops.append({"row": int(df.at[i, "row"]), "programme": df.at[i, "programme"],
                              "indicator": df.at[i, "indicator"],
                              "detail": f"{prev[0]}: {prev[1]:,.0f} → {y}: {v:,.0f}"})
            prev = (y, v)
    if drops:
        rep.warning("cumulative-drop", "Cumulative value goes down",
                    "Results are cumulative, so a decrease usually means a data-entry error.", drops)

    over = []
    for i in df.index:
        t = df.at[i, "target"]
        last = df.loc[i, years].dropna()
        if t and t > 0 and len(last) and last.iloc[-1] > 2 * t:
            over.append({"row": int(df.at[i, "row"]), "programme": df.at[i, "programme"],
                         "indicator": df.at[i, "indicator"],
                         "detail": f"{last.iloc[-1]:,.0f} vs target {t:,.0f} ({last.iloc[-1] / t:.0%})"})
    if over:
        rep.info("over-target", "More than double the target",
                 "Not necessarily wrong, but worth checking the target or the unit.", over)

    bad_dates = df[df["end"] < df["start"]]
    if len(bad_dates):
        rep.warning("dates", "End year before start year", "",
                    [{"row": int(r.row), "programme": r.programme,
                      "detail": f"{r.start:.0f} – {r.end:.0f}"} for r in bad_dates.itertuples()])


def default_year(df: pd.DataFrame, years: list[int]) -> int:
    """Latest year that at least half of the rows report on."""
    complete = [y for y in years if df[y].notna().mean() >= 0.5]
    return complete[-1] if complete else years[-1]


def link_projects(programmes: list[dict], projects: list[dict], config: Config, rep: QualityReport) -> None:
    by_id = {p["id"]: p for p in projects}
    unlinked, missing = [], []
    for prog in programmes:
        ids = config.programmes.get(prog["name"], [])
        prog["mptf"] = [i for i in ids if i in by_id]
        for i in ids:
            if i in by_id:
                by_id[i]["programmes"].append(prog["id"])
            else:
                missing.append({"programme": prog["name"], "value": str(i)})
        if not ids:
            unlinked.append({"programme": prog["name"]})
    if missing:
        rep.warning("mptf-missing", "MPTF project id not found",
                    "config/programmes.yml links these programmes to an id that is not in the project list.",
                    missing)
    if unlinked and projects:
        rep.info("mptf-unlinked", "Programmes not linked to an MPTF project",
                 "Add the MPTF project id in config/programmes.yml to show budget and status.", unlinked)


PROJECT_DEFAULTS = {"short": "", "projectType": None, "pes": False, "activities": [],
                    "confidence": None, "note": "", "indicators": []}


def classify_projects(projects: list[dict], config: Config, rep: QualityReport) -> None:
    """Attach type, activities and expected indicators (reference workbook, tabs 12-14)."""
    seen = set()
    for p in projects:
        meta = config.project_meta.get(p["id"])
        p.update({**PROJECT_DEFAULTS, **(meta or {})})
        if meta:
            seen.add(p["id"])
    if not config.project_meta:
        return
    unknown = sorted(set(config.project_meta) - seen)
    if unknown:
        rep.info("project-ref-unknown", "Project in the reference workbook but not in the MPTF list",
                 "13_Projects lists an id that the MPTF export does not have. Check the id or refresh the export.",
                 [{"value": str(i), "detail": config.project_meta[i]["short"]} for i in unknown])
    unclassified = [p for p in projects if p["id"] not in seen and not p.get("passThrough")]
    if unclassified:
        rep.info("project-unclassified", "MPTF project not classified in the reference workbook",
                 "Add the project to 13_Projects (type, activities) so its expected indicators are known.",
                 [{"value": str(p["id"]), "detail": p["name"]} for p in unclassified])
    if config.project_unknown:
        rep.warning("project-ref-indicator", "Project ↔ indicator link uses an unknown code",
                    "14_ProjectIndicators refers to a code that is not in 03_Indicators. The link was ignored.",
                    config.project_unknown)


def coverage_checks(df: pd.DataFrame, programmes: list[dict], projects: list[dict], config: Config,
                    rep: QualityReport) -> None:
    """Compare what a programme reports with what its MPTF project(s) are expected to report."""
    by_id = {p["id"]: p for p in projects}
    reported_by_prog = df.groupby("programme")["code"].agg(lambda s: set(s))
    missing, extra = [], []
    for prog in programmes:
        linked = [by_id[i] for i in prog["mptf"] if by_id[i]["indicators"]]
        if not linked:
            continue
        expected = {}
        for pr in linked:
            for link in pr["indicators"]:
                # keep the strongest requirement across linked projects
                rank = {"mandatory": 0, "required": 1, "optional": 2}
                if link["code"] not in expected or rank[link["requirement"]] < rank[expected[link["code"]]]:
                    expected[link["code"]] = link["requirement"]
        reported = reported_by_prog.get(prog["name"], set())
        for code, req in sorted(expected.items()):
            if req != "optional" and code not in reported:
                missing.append({"programme": prog["name"], "indicator": code,
                                "detail": f"{config.indicators[code]['name']} — {req}"})
        for code in sorted(reported - set(expected)):
            extra.append({"programme": prog["name"], "indicator": code,
                          "detail": f"{config.indicators[code]['name']} — not expected for "
                                    f"{', '.join(pr['short'] or str(pr['id']) for pr in linked)}"})
    if missing:
        rep.info("coverage-missing", "Expected standard indicators not yet reported",
                 "Indicators that are mandatory for the project's type, or required by one of its activities "
                 "(reference workbook, 14_ProjectIndicators), with no row yet in ProjectData.xlsx.",
                 missing)
    if extra:
        rep.info("coverage-extra", "Reported indicators outside the project's expected set",
                 "The programme reports an indicator that its MPTF project is not classified for. "
                 "Either the classification (13_Projects activities) or the programme link needs a check.",
                 extra)


def carbon_checks(records: list[dict], df: pd.DataFrame, years: list[int], config: Config, rep: QualityReport) -> None:
    """Data-quality notes from the carbon engine: reversals, monitored data in use, defaults still in use."""
    from pipeline.carbon.cohorts import reversals
    rev, over_buffer, used, monitored = [], [], {}, {}
    for rec, (_, row) in zip(records, df.iterrows()):
        c = rec["co2"]
        if not c:
            continue
        for y_ret, y_c, area in reversals(rec["values"]):
            rev.append({"row": rec["row"], "programme": row["programme"], "indicator": row["indicator"],
                        "detail": f"{area:,.0f} units of the {years[y_c]} cohort retired in {years[y_ret]}; "
                                  f"the stock released is booked as an emission"})
        r = c.get("reversal")
        if r and r["share"] > r["buffer"] > 0:
            over_buffer.append({"row": rec["row"], "programme": row["programme"], "indicator": row["indicator"],
                                "detail": f"{r['share']:.0%} of the stock released, above the {r['buffer']:.0%} non-permanence buffer"})
        for fid in c["defaults"]:
            used.setdefault((row["code"], fid), set()).add(row["programme"])
        for param, ind in c["monitored"].items():
            monitored.setdefault((row["programme"], f"{param} ← {ind}"), 0)
            monitored[(row["programme"], f"{param} ← {ind}")] += 1
        for fid in c.get("overrides", []):
            monitored.setdefault((row["programme"], f"{fid} ← overrides.yml"), 0)
            monitored[(row["programme"], f"{fid} ← overrides.yml")] += 1
    if rev:
        rep.info("carbon-reversal", "Carbon: reported area decreased (reversal)",
                 "A cumulative result went down. The carbon engine retires the oldest cohorts and books the "
                 "released stock as an emission in that year. Check whether the decrease is a data-entry error.",
                 rev)
    if over_buffer:
        rep.warning("carbon-reversal-buffer", "Carbon: reversal larger than the non-permanence buffer",
                    "The stock released by the decrease exceeds the share set aside as buffer, so the net benefit "
                    "of earlier years is overstated until the area recovers.", over_buffer)
    if monitored:
        rep.info("carbon-monitored", "Carbon: monitored data replacing defaults (ex post)",
                 "These programmes report ENR-02, ENR-03 or CLM-02, or have measured values in config/carbon/overrides.yml; "
                 "their carbon figures use them instead of the defaults.",
                 [{"programme": p, "value": what, "detail": f"{n} row(s)"} for (p, what), n in sorted(monitored.items())])
    if used:
        lib = config.carbon.library
        rep.info("carbon-defaults", "Carbon: defaults waiting for monitoring data",
                 "These parameters use a default until the monitored indicator is reported for the programme.",
                 [{"indicator": code, "value": fid,
                   "detail": f"default {lib.raw[fid].get('value', lib.raw[fid].get('by_country', {}).get('default', {}).get('value', '—'))} "
                             f"→ replaced by {lib.raw[fid]['monitored_by']} · {len(progs)} programme(s)"}
                  for (code, fid), progs in sorted(used.items())])


def to_payload(ds: Dataset, config: Config, source_name: str, projects: list[dict]) -> dict:
    df, years = ds.frame, ds.years
    df = df[df["code"].isin(config.indicators)]
    dyear = default_year(df, years)

    partners = sorted(df["partner"].unique(), key=str.casefold)
    partner_id = {p: slugify(p) or f"partner-{i}" for i, p in enumerate(partners)}

    programmes = []
    for name, grp in df.groupby("programme", sort=False):
        programmes.append({
            "id": slugify(name),
            "name": name,
            "country": grp["country"].mode().iloc[0],
            "partners": sorted({partner_id[p] for p in grp["partner"]}),
            "start": int(grp["start"].min()) if grp["start"].notna().any() else None,
            "end": int(grp["end"].max()) if grp["end"].notna().any() else None,
        })
    link_projects(programmes, projects, config, ds.report)
    coverage_checks(df, programmes, projects, config, ds.report)
    prog_id = {p["name"]: p["id"] for p in programmes}

    # Several old indicators feeding one standard code keep their type (e.g. buildings / bridges).
    sources = df.groupby("code")["legacy"].nunique()
    prog_country = {p["name"]: p["country"] for p in programmes}
    engine = CarbonEngine(config.carbon, years)
    engine.observe(df)
    records = []
    for i in range(len(df)):
        row = df.iloc[i]
        values = [None if pd.isna(row[y]) else float(row[y]) for y in years]
        target = None if pd.isna(row["target"]) else float(row["target"])
        legacy = row["legacy"]
        records.append({
            "id": i,
            "row": int(row["row"]),
            "programme": prog_id[row["programme"]],
            "partner": partner_id[row["partner"]],
            "indicator": row["code"],
            "source": row["indicator"],
            "type": config.legacy_types.get(legacy) if legacy and sources.get(row["code"], 0) > 1 else None,
            "label": row["label"],
            "target": target,
            "values": values,
            "co2": engine.compute(row["code"], values, target, prog_country[row["programme"]], row["programme"]),
        })
    carbon_checks(records, df, years, config, ds.report)

    reported = set(df["code"])
    country_ids = set(df["country"]) | {p["country"] for p in projects}
    order = {cid: i for i, cid in enumerate(config.countries)}
    return {
        "meta": {
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": source_name,
            "years": years,
            "defaultYear": dyear,
            "partialYears": [y for y in years if y > dyear and df[y].notna().any()],
            "recordCount": len(records),
            "areaIndicators": [c for c in config.area_headline if c in config.indicators],
        },
        "outcomes": [
            {"id": c["code"], "name": c["short"], "nameFr": config.category_fr.get(c["code"], c["short"]),
             "full": c["name"], "no": c["no"], "scope": c["scope"], "status": c["status"],
             "slot": config.colours.get(c["code"])}
            for c in config.categories
        ],
        "subcategories": config.subcategories,
        "indicators": [
            {**{k: v for k, v in ind.items() if k not in ("category", "sort")},
             "outcome": ind["category"], "hasCo2": code in config.carbon.archetypes, "reported": code in reported}
            for code, ind in sorted(config.indicators.items(), key=lambda kv: (kv[1]["category"], kv[1]["sort"], kv[0]))
        ],
        "countries": [
            {"id": c, "iso": config.countries[c]["iso"], "name": config.countries[c]["name"],
             "nameFr": config.countries[c]["name_fr"]}
            for c in sorted(country_ids, key=lambda c: order.get(c, 99))
        ],
        "partners": [{"id": partner_id[p], "name": p} for p in partners],
        "programmes": programmes,
        "records": records,
        "projects": projects,
        "activities": config.activities,
        "carbon": engine.describe(programmes, projects),
        "headline": {
            "beneficiaries": config.headline["beneficiaries"],
            "anticipatedCo2": config.headline["anticipated_co2"],
        },
    }


def build(input_path: Path, out_dir: Path, config_dir: Path, projects_path: Path | None = None) -> int:
    config = Config.load(config_dir)
    ds = read_workbook(input_path, config)
    if not ds.report.has_errors:
        normalise(ds, config)
    if not ds.report.has_errors:
        quality_checks(ds, config)
    projects = []
    if projects_path and projects_path.exists():
        projects = read_projects(projects_path, config.country_alias(), ds.report)
        for p in projects:
            p["passThrough"] = config.pass_through.get(p["id"])
        classify_projects(projects, config, ds.report)

    payload = None if ds.report.has_errors else to_payload(ds, config, input_path.name, projects)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "quality.json").write_text(
        json.dumps(ds.report.to_json(source=input_path.name), ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(ds.report.summary_text())
    if payload is None:
        print("Build stopped: fix the errors above in the workbook or config.", file=sys.stderr)
        return 1
    (out_dir / "metrics.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(payload['records'])} records for {len(payload['programmes'])} programmes "
          f"and {len(projects)} MPTF projects → {out_dir / 'metrics.json'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", type=Path, default=ROOT / "data" / "ProjectData.xlsx")
    ap.add_argument("--projects", type=Path, default=ROOT / "data" / "MPTF_Projects.xlsx")
    ap.add_argument("--out", type=Path, default=ROOT / "web" / "public" / "data")
    ap.add_argument("--config", type=Path, default=ROOT / "config")
    args = ap.parse_args(argv)
    return build(args.input, args.out, args.config, args.projects)


if __name__ == "__main__":
    sys.exit(main())
