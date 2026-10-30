"""Read the MPTF project list (CAFI and FONAREDD trust funds).

The export has a few title rows above the header and one row per project ×
organisation, plus a totals row at the bottom. Rows are grouped per project id.
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from pipeline.quality import QualityReport

COLUMNS = {
    "trust fund": "fund",
    "project": "name",
    "project id": "id",
    "type": "type",
    "project status": "status",
    "country": "country",
    "organization": "org",
    "approved budget (real-time)": "approved",
    "transfers": "transferred",
    "refunds": "refunds",
    "expenditures": "expenditure",
    "project start date": "start",
    "project end date": "end",
}
REQUIRED = {"id", "name", "fund", "country", "approved"}


def _clean(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def _date(v) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return pd.Timestamp(v).date().isoformat()
    except (ValueError, TypeError):
        return None


def read_projects(path: Path, country_alias: dict[str, str], report: QualityReport) -> list[dict]:
    raw = pd.read_excel(path, sheet_name=0, header=None, dtype=object)
    header = None
    for i, row in raw.iterrows():
        cells = [_clean(v).casefold() for v in row.values]
        if "trust fund" in cells and "project id" in cells:
            header = i
            break
    if header is None:
        report.error("projects-schema", "Project list: header not found",
                     f"{path.name} needs a header row with 'Trust Fund' and 'Project id'.")
        return []

    cols = {j: COLUMNS[_clean(v).casefold()] for j, v in enumerate(raw.iloc[header].values)
            if _clean(v).casefold() in COLUMNS}
    missing = REQUIRED - set(cols.values())
    if missing:
        report.error("projects-schema", "Project list: columns missing", ", ".join(sorted(missing)))
        return []

    df = raw.iloc[header + 1:, list(cols)].copy()
    df.columns = list(cols.values())
    df = df[pd.to_numeric(df["id"], errors="coerce").notna()]  # drops blank and totals rows
    df["id"] = df["id"].astype(float).astype(int)
    for c in ("approved", "transferred", "refunds", "expenditure"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    unknown, garbled, projects = set(), [], []
    for pid, grp in df.groupby("id", sort=False):
        first = grp.iloc[0]
        raw_country = _clean(first["country"])
        country = country_alias.get(raw_country.casefold())
        if not country:
            unknown.add(raw_country)
        name = _clean(first["name"])
        if re.search(r"\w\?\w", name):
            garbled.append({"value": name, "detail": f"MPTF {pid}"})
        orgs = sorted({_clean(o) for o in grp.get("org", pd.Series(dtype=object)) if _clean(o)})
        money = {c: round(float(grp[c].sum()), 2) for c in ("approved", "transferred", "refunds", "expenditure") if c in grp}
        projects.append({
            "id": int(pid),
            "name": name,
            "fund": _clean(first["fund"]),
            "type": _clean(first.get("type")) or None,
            "status": _clean(first.get("status")) or None,
            "country": country or "Regional",
            "countryLabel": raw_country,
            "orgs": orgs,
            **money,
            "start": _date(first.get("start")),
            "end": _date(first.get("end")),
            "programmes": [],
        })

    if unknown:
        report.warning("projects-country", "Project list: country not recognised",
                       "Add the name as an alias under countries in config/indicators.yml. "
                       "These projects are shown as Regional.",
                       [{"value": c, "field": "Country"} for c in sorted(unknown)])
    if garbled:
        report.info("projects-encoding", "Project list: damaged accents",
                    "Accented letters were lost in the MPTF export (shown as '?'). Fix them at the source.",
                    garbled)
    return projects

