"""Read the CAFI standard-indicator reference workbook (config/reference/*.xlsx).

Each tab has a title in row 1 and its header a row or two below; the header is
found by looking for the tab's key column, so extra title or note rows are fine.
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
