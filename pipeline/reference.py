"""Read the CAFI standard-indicator reference workbook (config/reference/*.xlsx).

Each tab has a title in row 1 and its header a row or two below; the header is
found by looking for the tab's key column, so extra title or note rows are fine.

Tabs 01-03 are the indicator catalogue (load_reference). Tabs 12-14 classify
every CAFI / FONAREDD project by type and activities and list the standard
indicators each project is expected to report (load_project_reference).
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

# UnitGroup in the workbook → unit key used by the dashboard.
UNIT_GROUPS = {
    "area (ha)": "ha",
    "count": "count",
    "people": "people",
    "length (km)": "km",
    "finance (usd)": "usd",
    "volume (t)": "t",
    "percent": "pct",
    "ratio": "ratio",
    "qualitative": "score",
    "carbon (tco2e)": "tco2e",
}


def _sheet(path: Path, name: str, key: str) -> pd.DataFrame:
    raw = pd.read_excel(path, sheet_name=name, header=None, dtype=object)
    for i, row in raw.iterrows():
        if key in [str(v).strip() for v in row.values]:
            df = raw.iloc[i + 1:].copy()
            df.columns = [str(c).strip() for c in raw.iloc[i]]
            df = df.loc[:, [c for c in df.columns if c and c != "nan"]]
            return df.dropna(subset=[key]).reset_index(drop=True)
    raise ValueError(f"{path.name}: tab '{name}' has no '{key}' header")


def _text(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def _summable(rule: str) -> bool:
    r = rule.casefold()
    return not ("not summed" in r or r.startswith("derived"))


def load_reference(path: Path) -> dict:
    """Categories, sub-categories and indicators, ready for the dashboard."""
    cats = _sheet(path, "01_Categories", "CategoryCode")
    subs = _sheet(path, "02_Subcategories", "SubcategoryCode")
    inds = _sheet(path, "03_Indicators", "IndicatorCode")

    categories = [
        {
            "code": _text(r["CategoryCode"]),
            "name": _text(r["Category"]),
            "short": _text(r.get("CategoryShort")) or _text(r["Category"]),
            "no": int(r["OutcomeNo"]) if _text(r.get("OutcomeNo")) else None,
            "scope": _text(r.get("Scope")),
            "status": _text(r.get("Status")),
        }
        for _, r in cats.iterrows()
    ]
    categories.sort(key=lambda c: (c["no"] is None, c["no"]))

    subcategories = [
        {"code": _text(r["SubcategoryCode"]), "category": _text(r["CategoryCode"]), "name": _text(r["Subcategory"])}
        for _, r in subs.iterrows()
    ]

    indicators = {}
    for _, r in inds.iterrows():
        code = _text(r["IndicatorCode"])
        group = _text(r.get("UnitGroup"))
        rule = _text(r.get("AggregationRule"))
        indicators[code] = {
            "code": code,
            "name": _text(r["IndicatorName"]),
            "nameFr": _text(r.get("IndicatorNameFR")) or _text(r["IndicatorName"]),
            "description": _text(r.get("Description")),
            "category": _text(r["CategoryCode"]),
            "subcategory": _text(r.get("SubcategoryCode")),
            "tier": _text(r.get("Tier")),
            "unitLabel": _text(r.get("Unit")),
            "unitGroup": group,
            "unit": UNIT_GROUPS.get(group.casefold(), "count"),
            "measurement": _text(r.get("MeasurementType")),
            "aggregation": rule,
            "summable": _summable(rule),
            "tags": [t.strip() for t in _text(r.get("Tags")).split(";") if t.strip()],
            "sort": int(r["SortOrder"]) if _text(r.get("SortOrder")) else 999,
        }
    return {"categories": categories, "subcategories": subcategories, "indicators": indicators}


# Requirement wording in 14_ProjectIndicators → short key used by the dashboard.
REQUIREMENTS = {"mandatory": "mandatory", "required (activity)": "required", "optional": "optional"}


def _split(v, sep=";") -> list[str]:
    return [x.strip() for x in _text(v).split(sep) if x.strip()]


def load_project_reference(path: Path, indicator_codes: set[str]) -> dict:
    """Project types, activities and the project ↔ indicator bridge (tabs 12-14).

    Older copies of the workbook have no project tabs; they load as empty.
    """
    try:
        acts = _sheet(path, "12_Activities", "ActivityCode")
        projs = _sheet(path, "13_Projects", "ProjectID")
        links = _sheet(path, "14_ProjectIndicators", "ProjectID")
    except ValueError:
        return {"activities": [], "projects": {}, "unknown_indicators": []}

    activities = [
        {"code": _text(r["ActivityCode"]), "name": _text(r["Activity"]),
         "indicators": [c for c in _split(r.get("TriggeredIndicators"), ",") if c in indicator_codes]}
        for _, r in acts.iterrows()
    ]

    projects: dict[int, dict] = {}
    for _, r in projs.iterrows():
        pid = int(float(r["ProjectID"]))
        projects[pid] = {
            "short": _text(r.get("ProjectShort")),
            "projectType": _text(r.get("ProjectType")),
            "pes": _text(r.get("PESProject")).casefold() == "yes",
            "activities": _split(r.get("Activities")),
            "confidence": _text(r.get("ClassificationConfidence")),
            "note": _text(r.get("Note")),
            "indicators": [],
        }

    unknown = []
    for _, r in links.iterrows():
        pid, code = int(float(r["ProjectID"])), _text(r["IndicatorCode"])
        if code not in indicator_codes:
            unknown.append({"value": code, "detail": f"MPTF {pid}"})
            continue
        if pid not in projects:
            continue
        req = REQUIREMENTS.get(_text(r.get("Requirement")).casefold(), "optional")
        projects[pid]["indicators"].append({"code": code, "requirement": req, "basis": _text(r.get("Basis"))})
    return {"activities": activities, "projects": projects, "unknown_indicators": unknown}
