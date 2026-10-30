import json
import shutil
from pathlib import Path

import pandas as pd
import pytest

from pipeline.build import ROOT, Config, build, carry_forward, co2_for

CONFIG = ROOT / "config"
HEADER = ["Pays", "Programme", "Implementing org.", "Outcome", "Indicator", "Indicator synonym",
          "Unité", "Start year", "End year", "Final target", "2023", "2024", "2025"]


def row(**over):
    base = dict(zip(HEADER, ["DRC", "Prog A", "GIZ", "Agriculture", "01. Subsistance agriculture (ha)",
                             "Cultures vivrières (ha)", "Hectare", 2022, 2026, 100, 10, 20, 40]))
    base.update(over)
    return base


def run(tmp_path: Path, rows: list[dict], projects: Path | None = None):
    xlsx = tmp_path / "in.xlsx"
    pd.DataFrame(rows, columns=HEADER).to_excel(xlsx, sheet_name="CumulResults", index=False)
    out = tmp_path / "out"
    code = build(xlsx, out, CONFIG, projects)
    quality = json.loads((out / "quality.json").read_text())
    metrics = json.loads((out / "metrics.json").read_text()) if (out / "metrics.json").exists() else None
    return code, metrics, {c["id"]: c for c in quality["checks"]}


def test_real_workbook_builds():
    out = ROOT / "web" / "public" / "data"
    assert build(ROOT / "data" / "ProjectData.xlsx", out, CONFIG, ROOT / "data" / "MPTF_Projects.xlsx") == 0
    # Structural checks only: the workbook changes with every reporting round.
    m = json.loads((out / "metrics.json").read_text())
    assert m["records"] and m["programmes"]
    assert m["meta"]["defaultYear"] in m["meta"]["years"]
    assert all(len(r["values"]) == len(m["meta"]["years"]) for r in m["records"])
    names = [p["name"].casefold() for p in m["partners"]]
    assert len(names) == len(set(names))  # spelling variants (KfW / KFW) are merged


def test_whitespace_and_case_are_normalised(tmp_path):
    code, m, checks = run(tmp_path, [
        row(Indicator="07. Number of local land use plans ", Outcome="Land Management",
            **{"Indicator synonym": "PLAT", "Unité": "Nombre"}),
        row(Indicator="07. Number of local land use plans", Outcome="Land management",
            Programme="Prog B", **{"Indicator synonym": "PLAT", "Unité": "Nombre"}),
    ])
    assert code == 0
    assert {r["indicator"] for r in m["records"]} == {"LUT-01"}
    assert "whitespace" in checks and "outcome-case" in checks


def test_unknown_indicator_blocks_build(tmp_path):
    code, m, checks = run(tmp_path, [row(Indicator="99. Something new"), row(Programme="B", Indicator="XYZ-01 Unknown")])
    assert code == 1 and m is None
    assert checks["indicator-unknown"]["severity"] == "error"
    assert checks["indicator-unknown"]["count"] == 2


def test_legacy_codes_are_recoded_to_standard_codes(tmp_path):
    code, m, checks = run(tmp_path, [
        row(),  # "01. Subsistance agriculture" → AGR-01
        row(Programme="B", Indicator="10. Buildings constructed or rehabilitated", **{"Unité": "Nombre", "Indicator synonym": "Bâtiments"}),
        row(Programme="C", Indicator="12. Number of Bridges and/or dalots constructed", **{"Unité": "Nombre", "Indicator synonym": "Ponts/dalots"}),
        row(Programme="D", Indicator="09. Local community forest concession (ha)",
            **{"Indicator synonym": "Superficie Droits Fonciers Communautaires"}),  # label override → LUT-03
    ])
    assert code == 0
    by_prog = {r["programme"]: r for r in m["records"]}
    assert by_prog["prog-a"]["indicator"] == "AGR-01"
    assert by_prog["b"]["indicator"] == by_prog["c"]["indicator"] == "PPL-03"
    assert {by_prog["b"]["type"], by_prog["c"]["type"]} == {"Buildings", "Bridges & culverts"}
    assert by_prog["d"]["indicator"] == "LUT-03"
    assert checks["recoded"]["severity"] == "info"
    reported = {i["code"] for i in m["indicators"] if i["reported"]}
    assert reported == {"AGR-01", "PPL-03", "LUT-03"}
    assert len(m["indicators"]) >= 60  # the whole standard catalogue is published


def test_standard_codes_are_accepted_directly(tmp_path):
    code, m, _ = run(tmp_path, [row(Indicator="GOV-03 Operational local governance structures", **{"Unité": "Nombre"})])
    assert code == 0
    assert m["records"][0]["indicator"] == "GOV-03"


def test_negative_and_text_values_block_build(tmp_path):
    code, _, checks = run(tmp_path, [row(**{"2024": -5}), row(Programme="B", **{"2025": "about 40"})])
    assert code == 1
    assert {"negative", "not-a-number"} <= checks.keys()


def test_cumulative_drop_is_flagged(tmp_path):
    code, _, checks = run(tmp_path, [row(**{"2024": 50, "2025": 0})])
    assert code == 0
    assert checks["cumulative-drop"]["count"] == 1


def test_carry_forward():
    assert carry_forward([None, 1, None, 3, None]) == [None, 1, 1, 3, 3]


@pytest.mark.parametrize("code,results,expected_absorbed,expected_avoided", [
    # Expressions copied from the Power BI calculated columns Absorbed_Res1 / Avoided_Res1
    # (old codes 01, 02, 03, 04 → AGR-01, AGR-02, AGR-03, FOR-01).
    ("AGR-01", 100, 0.8 * 3.667 * 100 * 10, 0.8 * 3.667 * (100 / 2) * 10),
    ("AGR-02", 100, (5.09 + 1.22) * 3.667 * 100 * 10, (5.09 + 1.22) * 3.667 * (100 / 2) * 10),
    ("AGR-03", 100, (5.09 + 1.22) * 3.667 * 100 * 10, (5.09 + 1.22) * 3.667 * (100 / 2) * 10),
    ("FOR-01", 100, (0.62 + (19 * 0.25 / 100)) * 3.667 * 100 * 15,
     (0.62 + (19 * 0.25 / 100)) * 3.667 * (100 * (0.5 / 100)) * 15),
])
def test_co2_matches_power_bi_formulas(code, results, expected_absorbed, expected_avoided):
    factors = Config.load(CONFIG).factors
    out = co2_for(code, [results], None, factors)
    assert out["absorbed"][0] == pytest.approx(expected_absorbed, abs=0.1)
    assert out["avoided"][0] == pytest.approx(expected_avoided, abs=0.1)


def test_clean_cooking_total_matches_power_bi():
    # Power BI booked it as absorbed: (5.5*(2533/1000)*R)*0.75*0.35*10; here it is avoided.
    out = co2_for("ENR-01", [1000], None, Config.load(CONFIG).factors)
    assert out["absorbed"][0] + out["avoided"][0] == pytest.approx(5.5 * 2.533 * 1000 * 0.75 * 0.35 * 10, abs=0.1)


def test_realised_co2_accrues_yearly():
    factors = {"AGR-01": [{"component": "absorbed", "rate": 2.0, "horizon": 10}]}
    out = co2_for("AGR-01", [None, 10, 20], 50, factors)
    assert out["realised"] == [None, 20.0, 60.0]
    assert out["targetAbsorbed"] == 1000.0


def make_projects(tmp_path: Path) -> Path:
    head = ["", "Trust Fund", "Project", "Project id", "Type", "Project status", "Country", "Organization",
            "Approved Budget (real-time)", "Transfers", "Refunds", "Expenditures", "Project Start date", "Project End date"]
    rows = [["MPTF export"] + [None] * 13, [None] * 14, head,
            [None, "CAFI", "Prog A project", 111, "Direct drivers", "On Going", "Congo (the Democratic Republic of the)",
             "GIZ", 1000, 800, 0, 300, "2022-01-01", "2026-12-31"],
            [None, "CAFI", "Prog A project", 111, "Direct drivers", "On Going", "Congo (the Democratic Republic of the)",
             "AFD", 500, 500, -100, 200, "2022-01-01", "2026-12-31"],
            [None, "FONAREDD", "Somewhere", 222, None, "Project Closed", "Atlantis", "UNDP", 10, 10, 0, 10, None, None],
            [None, None, None, None, None, None, None, None, 1510, 1310, -100, 510, None, None]]  # totals row
    path = tmp_path / "projects.xlsx"
    pd.DataFrame(rows).to_excel(path, header=False, index=False)
    return path


def test_project_list_is_grouped_and_checked(tmp_path):
    config = tmp_path / "config"
    shutil.copytree(CONFIG, config)
    (config / "programmes.yml").write_text("Prog A: [111, 999]\n", encoding="utf-8")
    xlsx, out = tmp_path / "in.xlsx", tmp_path / "out"
    pd.DataFrame([row()], columns=HEADER).to_excel(xlsx, sheet_name="CumulResults", index=False)

    assert build(xlsx, out, config, make_projects(tmp_path)) == 0
    m = json.loads((out / "metrics.json").read_text())
    checks = {c["id"]: c for c in json.loads((out / "quality.json").read_text())["checks"]}
    projects = {p["id"]: p for p in m["projects"]}
    assert set(projects) == {111, 222}  # totals row dropped
    assert projects[111]["approved"] == 1500 and projects[111]["orgs"] == ["AFD", "GIZ"]
    assert projects[111]["country"] == "DRC" and projects[111]["programmes"] == ["prog-a"]
    assert projects[222]["country"] == "Regional"
    assert "projects-country" in checks and "mptf-missing" in checks  # Atlantis; id 999
    assert m["programmes"][0]["mptf"] == [111]
    assert projects[111]["passThrough"] is None


def test_pass_through_transfer_is_flagged():
    m = json.loads((ROOT / "web" / "public" / "data" / "metrics.json").read_text())
    flagged = [p["id"] for p in m["projects"] if p["passThrough"]]
    assert flagged == [103702]  # CAFI → FONAREDD transfer, not a project of its own
