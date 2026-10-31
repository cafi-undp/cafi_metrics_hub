"""Read CAFI / FONAREDD indicator annexes ("Annexe 1 - Indicateurs projets à approche territoriale",
"Annexe 2 - Indicateurs transversaux") into one tidy table.

The annexes share a template but every partner edits it: columns move, year headers are relabelled
("2025 (en cumulatif)", "2022-2024", "2026 (au 30/06)"), sub-indicators sit on unlabelled rows under
their parent code, and "N/A" / "N/D" mark missing values. This module only reads; it does not decide
what a value means. Interpretation (cumulative or per-period, which file wins) happens in
`pipeline/merge_annexes.py`, where every decision is logged.
"""
from __future__ import annotations

import re
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

MISSING = re.compile(r"^\s*(n\s*/\s*[ad]|na|nd|-+|—|–|\?|tbd|à déterminer.*|a determiner.*|non applicable|néant|neant|x)\s*$", re.I)
YEAR = re.compile(r"(20[12]\d)")
CODE = re.compile(r"^\s*([A-Z]{1,4}\.?\s?\d{1,2}[a-z]?|\d{1,2})\s*$")


@dataclass
class Column:
    index: int  # 1-based
    header: str  # combined header text
    kind: str  # code | label | unit | theme | target_final | target_mid | target_revised | baseline | plan | value | comment | other
    years: tuple[int, ...] = ()
    cumulative: bool = False
    semester: bool = False


@dataclass
class Row:
    file: str
    sheet: str
    row: int
    family: str  # annexe1 | annexe2
    code: str | None
    parent_code: str | None
    label: str
    unit: str | None
    targets: dict[str, float | None] = field(default_factory=dict)
    values: list[dict] = field(default_factory=list)  # {"header", "years", "cumulative", "semester", "plan", "value", "raw"}
    comment: str | None = None


def number(v):
    """Parse a cell into a float, or None for blanks and missing markers. Text with digits stays text."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("​", "").replace("\xa0", " ").strip()
    if not s or MISSING.match(s):
        return None
    t = s.replace(" ", "").replace(" ", "")
    if re.fullmatch(r"-?\d+(,\d{3})+(\.\d+)?", t):
        t = t.replace(",", "")
    elif re.fullmatch(r"-?\d+(\.\d{3})+(,\d+)?", t):
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(",", ".")
    t = t.rstrip("%")
    try:
        return float(t)
    except ValueError:
        return None


def _text(v) -> str:
    return re.sub(r"\s+", " ", str(v).replace("​", "")).strip() if v not in (None, "") else ""


def _classify(top: str, sub: str) -> tuple[str, tuple[int, ...], bool, bool]:
    h = f"{top} {sub}".lower()
    years = tuple(int(y) for y in YEAR.findall(sub or top))
    cumulative = "cumul" in h
    semester = bool(re.search(r"30/06|s1\b|semest|au 30", h))
    if re.search(r"^#$|^n°$|^code$|^réf", top.lower()) and not sub:
        return "code", (), False, False
    if re.search(r"commentaire|comment", h):
        return "comment", (), False, False
    if re.search(r"th[ée]m|composante|domaine", top.lower()) and not years:
        return "theme", (), False, False
    if re.search(r"indicateur", top.lower()) and not years and "cible" not in h:
        return "label", (), False, False
    if re.search(r"unit", top.lower()):
        return "unit", (), False, False
    if "ptba" in h or "prévu" in h or "prevu" in h or "plan" in h:
        return "plan", years, cumulative, semester
    if "cible" in h or "target" in h:
        if "mi-parcours" in h or "mi parcours" in h or "mid" in h:
            return "target_mid", (), False, False
        if "révis" in h or "revis" in h:
            return "target_revised", (), False, False
        return "target_final", (), False, False
    if "référence" in h or "reference" in h or "baseline" in h:
        return "baseline", (), False, False
    if years and re.search(r"valeur|r[ée]sultat|r[ée]alis|^20|\b20[12]\d", h):
        return "value", years, cumulative, semester
    return "other", years, cumulative, semester


def _header(ws) -> tuple[int, list[Column]] | None:
    """Find the header block: a row naming the indicator column, plus the row under it (sub-headers)."""
    for r in range(1, min(ws.max_row, 12) + 1):
        row = [_text(ws.cell(r, c).value) for c in range(1, ws.max_column + 1)]
        if not any(re.search(r"^indicateurs?\b|indicateur cl", x, re.I) for x in row):
            continue
        if not any(re.search(r"^unit", x, re.I) for x in row):
            continue  # a banner such as "Indicateurs de produits (4)", not the header row
        nxt = [_text(ws.cell(r + 1, c).value) for c in range(1, ws.max_column + 1)] if r < ws.max_row else [""] * len(row)
        # Forward-fill group headers ("Cible", "Valeur") across the sub-header columns they span.
        cols, group = [], ""
        for i, (top, sub) in enumerate(zip(row, nxt), start=1):
            if top:
                group = top
            elif not sub:
                group = ""
            effective_top = top or group
            sub_used = sub if not re.search(r"^nb\s*:|intitulés", sub, re.I) else ""
            kind, years, cum, sem = _classify(effective_top, sub_used)
            if top and re.search(r"^#$|^réf\.?$|^n°$", top, re.I):
                kind = "code"
            cols.append(Column(i, f"{effective_top} | {sub_used}".strip(" |"), kind, years, cum, sem))
        # A data row may start right after the header when there is no sub-header row.
        has_sub = any(x and not re.search(r"^nb\s*:|intitulés", x, re.I) for x in nxt) and not any(
            CODE.match(x or "") for x in nxt[:3])
        return (r + (2 if has_sub else 1)), cols
    return None


def read_annex(path: str | Path, file_id: str | None = None) -> list[Row]:
    path = Path(path)
    wb = openpyxl.load_workbook(path, data_only=True)
    out: list[Row] = []
    for ws in wb.worksheets:
        name = ws.title.strip()
        if re.search(r"lire en premier|^sheet\d*$|^feuil\d*$", name, re.I) or ws.max_row < 3:
            continue
        found = _header(ws)
        if not found:
            continue
        first, cols = found
        family = "annexe2" if any(c.kind == "theme" for c in cols) and not re.search(r"gouvernance locale|^at\b|foncier|agricult|energie|foresterie", name, re.I) else "annexe1"
        bykind = {}
        for c in cols:
            bykind.setdefault(c.kind, []).append(c)
        code_col = (bykind.get("code") or [None])[0]
        label_col = (bykind.get("label") or [None])[0]
        unit_col = (bykind.get("unit") or [None])[0]
        if label_col is None:
            continue
        parent = None
        blank_run = 0
        for r in range(first, ws.max_row + 1):
            label = _text(ws.cell(r, label_col.index).value)
            code = _text(ws.cell(r, code_col.index).value) if code_col else ""
            if not label and not code:
                blank_run += 1
                if blank_run > 30:
                    break
                continue
            blank_run = 0
            low = label.lower()
            if re.match(r"^(indicateurs? (de |d'|d’)|indicateurs? effet|thème|thématique)", low) or re.match(r"^indicateurs? d", code.lower()):
                continue  # section banner
            if label.lower().startswith("indicateurs") and not code:
                continue
            if code and CODE.match(code):
                parent = code.replace(" ", "")
                this_code = parent
            else:
                this_code = None
            row = Row(str(file_id or path.stem), name, r, family, this_code, parent if not this_code else None,
                      label, _text(ws.cell(r, unit_col.index).value) if unit_col else None)
            for c in cols:
                v = ws.cell(r, c.index).value
                if c.kind in ("target_final", "target_mid", "target_revised", "baseline"):
                    row.targets[c.kind] = number(v)
                    if v not in (None, "") and number(v) is None:
                        row.targets[c.kind + "_text"] = _text(v)[:120]
                elif c.kind in ("value", "plan"):
                    raw = _text(v)
                    row.values.append({"header": c.header, "years": list(c.years), "cumulative": c.cumulative,
                                       "semester": c.semester, "plan": c.kind == "plan", "value": number(v),
                                       "raw": raw[:80]})
                elif c.kind == "comment":
                    t = _text(v)
                    if t:
                        row.comment = t[:300]
            out.append(row)
    return out
