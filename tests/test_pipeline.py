import json
import shutil
from pathlib import Path

import pandas as pd
import pytest

from pipeline.build import ROOT, Config, build

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


def test_cumulative_drop_is_flagged_for_stocks_only(tmp_path):
    stock = dict(Indicator="07. Number of local land use plans", **{"Unité": "Nombre", "2024": 50, "2025": 0})
    code, _, checks = run(tmp_path, [row(**stock), row(Programme="B", **{"2024": 50, "2025": 0})])  # B: AGR-01 is a flow
    assert code == 0
    assert checks["cumulative-drop"]["count"] == 1 and checks["cumulative-drop"]["items"][0]["programme"] == "Prog A"


def test_records_carry_two_ledger_carbon_series():
    out = ROOT / "web" / "public" / "data"
    assert build(ROOT / "data" / "ProjectData.xlsx", out, CONFIG, ROOT / "data" / "MPTF_Projects.xlsx") == 0
    m = json.loads((out / "metrics.json").read_text())
    assert m["carbon"]["method"] == "2.0" and m["carbon"]["factors"] and m["carbon"]["claims"]
    with_c = [r for r in m["records"] if r["co2"]]
    assert with_c
    for r in with_c:
        c = r["co2"]
        assert {"inventory", "intervention", "band", "perUnit", "target", "stratum"} <= c.keys()
        assert len(c["inventory"]["realised"]) == len(m["meta"]["years"])
    assert {i["code"] for i in m["indicators"] if i["hasCo2"]} == {"FOR-01", "FOR-02", "AGR-01", "AGR-02", "AGR-03", "ENR-01", "FOR-04"}


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


def test_project_reference_tabs_load():
    from pipeline.reference import load_project_reference, load_reference
    path = CONFIG / "reference" / "CAFI_Standard_Indicators_MetricsHub.xlsx"
    ref = load_project_reference(path, set(load_reference(path)["indicators"]))
    assert len(ref["activities"]) >= 20 and len(ref["projects"]) >= 80
    assert ref["unknown_indicators"] == []
    energie = ref["projects"][113546]
    assert energie["projectType"] == "Private sector" and "Clean cooking" in energie["activities"]
    links = {l["code"]: l["requirement"] for l in energie["indicators"]}
    assert links["ENR-01"] == "required" and links["FIN-01"] == "mandatory" and links["ENR-02"] == "optional"


def test_projects_carry_expected_indicators_and_coverage_checks():
    out = ROOT / "web" / "public" / "data"
    assert build(ROOT / "data" / "ProjectData.xlsx", out, CONFIG, ROOT / "data" / "MPTF_Projects.xlsx") == 0
    m = json.loads((out / "metrics.json").read_text())
    checks = {c["id"]: c for c in json.loads((out / "quality.json").read_text())["checks"]}
    projects = {p["id"]: p for p in m["projects"]}
    assert m["activities"] and all("indicators" in p for p in m["projects"])
    energie = projects[113546]
    assert energie["programmes"] == ["programme-energie"] and energie["pes"] is False
    assert any(l["code"] == "ENR-01" for l in energie["indicators"])
    # Programme Energie reports ENR-01, so it is not listed as missing; its mandatory FIN-01 is.
    missing = {(i["programme"], i["indicator"]) for i in checks["coverage-missing"]["items"]}
    assert ("Programme Energie", "FIN-01") in missing and ("Programme Energie", "ENR-01") not in missing
    assert all("optional" not in i["detail"] for i in checks["coverage-missing"]["items"])
    assert checks["coverage-extra"]["severity"] == "info"


def test_empty_sheet_blocks_the_build(tmp_path):
    code, m, checks = run(tmp_path, [])
    assert code == 1 and m is None and checks["schema"]["severity"] == "error"


def test_programme_case_variants_are_merged(tmp_path):
    code, m, checks = run(tmp_path, [row(Programme="Prog A"), row(Programme="prog a", Indicator="07. Number of local land use plans", **{"Unité": "Nombre"})])
    assert code == 0
    assert len(m["programmes"]) == 1 and "programme-case" in checks


def test_duplicate_mapped_headers_are_a_schema_error(tmp_path):
    xlsx = tmp_path / "in.xlsx"
    pd.DataFrame([row()], columns=HEADER).rename(columns={"Final target": "final target"}).assign(**{"Final Target ": [100]}).to_excel(xlsx, sheet_name="CumulResults", index=False)
    out = tmp_path / "out"
    assert build(xlsx, out, CONFIG, None) == 1
    checks = {c["id"]: c for c in json.loads((out / "quality.json").read_text())["checks"]}
    assert "Two columns map" in checks["schema"]["title"]


def test_unit_alias_ha_is_accepted(tmp_path):
    code, _, checks = run(tmp_path, [row(**{"Unité": "ha"})])
    assert code == 0 and "unit-mismatch" not in checks


def test_no_mptf_missing_without_a_project_list(tmp_path):
    code, _, checks = run(tmp_path, [row(Programme="PIREDD Kwilu")])   # linked in programmes.yml, no --projects given
    assert code == 0 and "mptf-missing" not in checks
