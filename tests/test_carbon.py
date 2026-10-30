"""Carbon engine v2.0: cohorts, modules, bands. Hand values follow docs/carbon-methodology.md."""

import numpy as np
import pytest

from pipeline.build import ROOT
from pipeline.carbon import CarbonConfig, CarbonEngine
from pipeline.carbon.cohorts import reversals, snapshots
from pipeline.carbon.library import CO2_PER_C

CONFIG = ROOT / "config"
YEARS = [2020, 2021, 2022, 2023, 2024, 2025]


@pytest.fixture(scope="module")
def engine():
    return CarbonEngine(CarbonConfig.load(CONFIG), YEARS)


def central(engine, code, country="DRC", programme="Test"):
    ctx = engine.config.stratum(country, programme)
    mod, factors = engine._resolve(code, ctx)
    v = {k: f.value for k, f in factors.items()}
    return {k: float(np.asarray(x)) for k, x in mod.per_unit(v).items()}, v


def test_cohorts_fifo_retirement():
    assert snapshots([None, 10, 20, None, 15]) == [None, [(1, 10)], [(1, 10), (2, 10)], [(1, 10), (2, 10)], [(1, 5), (2, 10)]]
    assert reversals([None, 10, 20, None, 15]) == [(4, 1, 5)]
    assert reversals([10, 0]) == [(1, 0, 10)]


def test_natural_regeneration_permanent_growth_to_horizon(engine):
    pu, v = central(engine, "FOR-01")
    g = 2.9 * (1 + 0.232) * 0.47          # IPCC 2019 Table 4.9 + root-to-shoot + carbon fraction
    assert pu["inventory"] == pytest.approx(min(g * 20, 87.7) * CO2_PER_C, rel=1e-6)
    assert pu["inventory"] == pytest.approx(123.1, abs=0.2)
    assert pu["intervention"] == pytest.approx(pu["inventory"] * (1 - 0.25), rel=1e-6)   # fire buffer, no leakage


def test_plantation_credited_at_long_term_average(engine):
    pu, v = central(engine, "FOR-02")
    g = 9 * (1 + 0.232) * 0.47
    assert pu["inventory"] == pytest.approx(g * 10 / 2 * CO2_PER_C, rel=1e-6)   # rotation 10 → half the peak
    assert pu["inventory"] == pytest.approx(95.5, abs=0.2)
    assert pu["potential"] > 0 and pu["potential"] == pytest.approx(9 * 0.5 * 0.42 * 0.47 * CO2_PER_C * 0.95 * 10, rel=1e-6)


def test_rainforest_stratum_changes_plantation_growth(engine):
    moist, _ = central(engine, "FOR-02", programme="PIREDD Kwilu")
    rain, _ = central(engine, "FOR-02", programme="PIREDD Equateur")
    assert rain["inventory"] != moist["inventory"]          # 6 vs 9 t d.m./ha/yr, R 0.37 vs 0.232
    anr_moist, _ = central(engine, "FOR-01", programme="PIREDD Kwilu")
    anr_rain, _ = central(engine, "FOR-01", programme="PIREDD Equateur")
    assert anr_rain["inventory"] > anr_moist["inventory"]   # same growth, larger root share in the rainforest zone


def test_perennial_crops_cap_at_maturity(engine):
    pu, _ = central(engine, "AGR-02")
    assert pu["inventory"] == pytest.approx(2.26 * 20 * CO2_PER_C, rel=1e-6)


def test_soil_carbon_is_indicative_only(engine):
    pu, _ = central(engine, "AGR-01")
    assert pu["inventory"] == 0 and pu["intervention"] == 0
    assert pu["indicative"] == pytest.approx(38 * 0.83 * 0.11 * CO2_PER_C, rel=1e-6)


def test_cookstove_per_device_with_fnrb_and_dropoff(engine):
    pu, _ = central(engine, "ENR-01")
    base = 0.5 * 5.3 * 0.35 * (0.42 * 1.747 + 0.143) * 0.95
    usage = [0.75, 0.75, 0.75 * 0.9, 0.75 * 0.8, 0.75 * 0.7]
    assert pu["intervention"] == pytest.approx(base * sum(usage), rel=1e-6)
    assert pu["inventory"] == 0
    gabon, _ = central(engine, "ENR-01", country="Gabon")
    assert gabon["intervention"] < pu["intervention"]      # fNRB 0.18 vs 0.42


def test_avoided_deforestation_per_hectare(engine):
    pu, _ = central(engine, "FOR-04")
    annual = 0.007 * 0.41 * (1 - 0.2) * 466 * (1 - 0.2)
    assert pu["intervention"] == pytest.approx(annual * 20, rel=1e-6)
    assert pu["inventory"] == 0


def test_realised_series_follows_cohort_ages_and_reversals(engine):
    out = engine.compute("FOR-02", [None, 10, 20, 15, None, None], 100, "DRC", "Test")
    inv = out["inventory"]
    pu = out["perUnit"]["inventory"]
    g = 9 * (1 + 0.232) * 0.47
    cap = g * 10 / 2
    assert inv["realised"][0] is None and inv["realised"][1] == 0            # planted this year: no growth yet
    assert inv["realised"][2] == pytest.approx(10 * min(g, cap) * CO2_PER_C, abs=0.1)
    # year 3: 5 ha of the 2021 cohort retired (FIFO); 5 ha aged 2 + 10 ha aged 1 remain
    assert inv["realised"][3] == pytest.approx((5 * 2 * g + 10 * g) * CO2_PER_C, abs=0.1)
    assert inv["emissions"][3] == pytest.approx(5 * 2 * g * CO2_PER_C, abs=0.1)
    assert inv["expected"][3] == pytest.approx(15 * pu, abs=0.1)
    assert inv["realised"][5] == pytest.approx((5 * min(4 * g, cap) + 10 * min(3 * g, cap)) * CO2_PER_C, abs=0.1)
    assert out["target"]["inventory"] == pytest.approx(100 * pu, abs=0.1)
    assert out["potential"] is not None and out["indicative"] is None


def test_bands_bracket_the_central_value(engine):
    out = engine.compute("FOR-02", [None, 10], None, "DRC", "Test")
    lo, hi = out["band"]["inventory"]
    assert lo < 1 < hi
    assert out["band"]["indicative"] == [1.0, 1.0]
    again = CarbonEngine(CarbonConfig.load(CONFIG), YEARS).compute("FOR-02", [None, 10], None, "DRC", "Test")
    assert again["band"] == out["band"]                      # seeded: reproducible


def test_unlisted_indicator_has_no_carbon(engine):
    assert engine.compute("GOV-03", [None, 1], None, "DRC", "Test") is None


def test_library_describe_lists_every_factor(engine):
    rows = engine.config.library.describe()
    ids = {r["id"] for r in rows}
    assert {"cf", "fnrb", "g_anr", "defor_rate", "buffer_arr"} <= ids
    fnrb = next(r for r in rows if r["id"] == "fnrb")
    assert fnrb["values"]["DRC"] == 0.42 and fnrb["by"] == "country"


# ───────────── Phase 2: tier escalation ─────────────
import shutil
import pandas as pd
from pipeline.carbon.engine import Monitored


def frame(rows):
    """Minimal result frame: programme, code, label and one column per year."""
    out = []
    for prog, code, label, vals in rows:
        out.append({"programme": prog, "code": code, "label": label, **dict(zip(YEARS, vals))})
    return pd.DataFrame(out)


def test_adoption_and_savings_surveys_replace_cookstove_defaults(engine):
    eng = CarbonEngine(engine.config, YEARS)
    eng.observe(frame([
        ("P", "ENR-01", "stoves", [None, 100, 100, 100, 100, 100]),
        ("P", "ENR-02", "adoption", [None, None, 80, None, None, None]),   # per cent
        ("P", "ENR-03", "savings", [None, None, 50, None, None, None]),
    ]))
    assert eng.monitored["P"].usage[2] == pytest.approx(0.8) and eng.monitored["P"].savings[2] == pytest.approx(0.5)
    out = eng.compute("ENR-01", [None, 100, 100, 100, 100, 100], None, "DRC", "P")
    assert out["basis"] == "ex post" and out["monitored"] == {"usage": "ENR-02", "savings": "ENR-03"}
    assert out["tier"] == 3 and "fuel_savings" not in out["defaults"] and "usage" not in out["defaults"]
    base = 0.5 * 5.3 * 0.5 * (0.42 * 1.747 + 0.143) * 0.95        # savings 0.5 from ENR-03
    assert out["intervention"]["realised"][2] == pytest.approx(100 * base * 0.8, abs=0.1)        # one year at usage 0.8
    assert out["intervention"]["realised"][3] == pytest.approx(100 * base * 0.8 * 2, abs=0.1)    # carried forward
    assert out["perUnit"]["intervention"] == pytest.approx(base * 0.8 * 5, abs=0.01)              # flat usage, no drop-off
    # a programme without surveys keeps the defaults
    other = eng.compute("ENR-01", [None, 100, 100, 100, 100, 100], None, "DRC", "Q")
    assert other["basis"] == "ex ante" and "usage" in other["defaults"]


def test_observed_deforestation_replaces_effectiveness(engine):
    eng = CarbonEngine(engine.config, YEARS)
    eng.observe(frame([
        ("P", "FOR-04", "forest", [None, 1000, 1000, 1000, 1000, 1000]),
        ("P", "CLM-02", "observed deforestation", [None, None, 3.5, None, None, None]),  # ha/yr vs 0.7 % × 1000 = 7
    ]))
    out = eng.compute("FOR-04", [None, 1000, 1000, 1000, 1000, 1000], None, "DRC", "P")
    assert out["monitored"] == {"effectiveness": "CLM-02"}
    annual = 0.007 * 0.5 * (1 - 0.2) * 466 * (1 - 0.2)
    assert out["intervention"]["realised"][2] == pytest.approx(1000 * annual, abs=0.5)
    assert out["intervention"]["expected"][2] == pytest.approx(1000 * annual * 20, abs=1)
    # a programme that reports its own baseline row uses it instead of the allocated rate
    eng2 = CarbonEngine(engine.config, YEARS)
    eng2.observe(frame([
        ("P", "FOR-04", "forest", [None, 1000, 1000, 1000, 1000, 1000]),
        ("P", "CLM-02", "observed", [None, None, 3.5, None, None, None]),
        ("P", "CLM-02", "baseline (reference scenario)", [None, None, 10, None, None, None]),
    ]))
    eff = eng2._effectiveness(eng2.monitored["P"], {"rate": 0.007}, 2)
    assert eff == pytest.approx(0.65)


def test_programme_overrides_are_tier_3(tmp_path):
    cfg = tmp_path / "config"
    shutil.copytree(CONFIG, cfg)
    (cfg / "carbon" / "overrides.yml").write_text(
        "programmes:\n  P:\n    fuel_savings: {value: 0.5, rel95: 0.1, source: 'KPT 2026'}\n", encoding="utf-8")
    eng = CarbonEngine(CarbonConfig.load(cfg), YEARS)
    out = eng.compute("ENR-01", [None, 100], None, "DRC", "P")
    assert out["basis"] == "ex post" and out["overrides"] == ["fuel_savings"] and out["tier"] == 3
    base = 0.5 * 5.3 * 0.5 * (0.42 * 1.747 + 0.143) * 0.95
    usage = [0.75, 0.75, 0.75 * 0.9, 0.75 * 0.8, 0.75 * 0.7]
    assert out["perUnit"]["intervention"] == pytest.approx(base * sum(usage), abs=0.01)
    plain = eng.compute("ENR-01", [None, 100], None, "DRC", "Q")
    assert plain["basis"] == "ex ante" and plain["band"] != out["band"] or plain["perUnit"] != out["perUnit"]


def test_claims_derived_from_private_sector_type(engine):
    projects = [
        {"id": 1, "projectType": "Private sector + PES"},
        {"id": 2, "projectType": "Enabling"},
        {"id": 103850, "projectType": "AFOLU / integrated + PES"},
    ]
    claims = {c["project"]: c for c in engine.claims(projects)}
    assert claims[1]["status"] == "corporate_inventory" and claims[1]["derived"] is True
    assert 2 not in claims
    assert claims[103850]["status"] == "national_programme" and "derived" not in claims[103850]
    meta = engine.describe([], projects)
    assert "monitoring" in meta and meta["claims"]


# ───────────── Review fixes ─────────────
def test_bands_are_centred_on_the_library_value_and_order_independent(engine):
    # Gabon fNRB has a wide spread: the clipped normal used to pull the draw mean far from 0.18.
    e1 = CarbonEngine(engine.config, YEARS)
    ctx = engine.config.stratum("Gabon", "X")
    mod, f = e1._resolve("ENR-01", ctx)
    central = float(np.asarray(mod.per_unit({k: x.value for k, x in f.items()})["intervention"]))
    rng = np.random.default_rng([20261030, 0])
    draws = {k: x.sample(20000, rng) for k, x in f.items()}
    arr = np.asarray(mod.per_unit(draws)["intervention"])
    lo, hi = e1.band("ENR-01", ctx)["intervention"]
    assert abs(lo - np.percentile(arr, 5) / central) < 0.08 and abs(hi - np.percentile(arr, 95) / central) < 0.25
    assert abs(float(arr.mean()) / central - 1) < 0.1          # beta keeps the mean at the central value
    # order independence: computing another key first changes nothing
    e2 = CarbonEngine(engine.config, YEARS)
    e2.band("FOR-02", engine.config.stratum("DRC", "X"))
    assert e2.band("ENR-01", ctx) == e1.band("ENR-01", ctx)


def test_tier_is_the_weakest_input(engine):
    out = engine.compute("ENR-01", [None, 100], None, "DRC", "X")
    assert out["tier"] == 1            # usage and savings are Tier 1 defaults even if fNRB is Tier 2


def test_flow_indicators_never_retire_cohorts(engine):
    eng = CarbonEngine(engine.config, YEARS, measurement={"AGR-01": "Annual / Flow"})
    out = eng.compute("AGR-01", [None, 500, 300, 500, None, None], None, "DRC", "X")
    assert out["flow"] is True
    assert out["inventory"]["emissions"][3] == 0 and out["reversal"] is None
    assert out["indicative"]["expected"][2] == out["indicative"]["expected"][1]   # running maximum, no drop


def test_clm02_running_total_is_flagged_and_baseline_labels_are_anchored(engine):
    eng = CarbonEngine(engine.config, YEARS)
    eng.observe(frame([
        ("P", "FOR-04", "forest", [None, 1000, 1000, 1000, 1000, 1000]),
        ("P", "CLM-02", "Déforestation observée vs référence", [None, 3, 6, 9, None, None]),
    ]))
    assert eng.monitored["P"].defor_observed is not None and eng.monitored["P"].defor_baseline is None
    assert eng.notes and eng.notes[0]["indicator"] == "CLM-02"
    eng2 = CarbonEngine(engine.config, YEARS)
    eng2.observe(frame([("P", "CLM-02", "Référence (scénario sans projet)", [None, 10, None, None, None, None]),
                        ("P", "CLM-02", "observed", [None, 4, None, None, None, None])]))
    assert eng2.monitored["P"].defor_baseline[1] == 10 and eng2.monitored["P"].defor_observed[1] == 4


def test_defor_rate_stays_a_default_after_clm02(engine):
    eng = CarbonEngine(engine.config, YEARS)
    eng.observe(frame([("P", "FOR-04", "f", [None, 1000, 1000, 1000, 1000, 1000]), ("P", "CLM-02", "obs", [None, None, 3.5, None, None, None])]))
    out = eng.compute("FOR-04", [None, 1000, 1000, 1000, 1000, 1000], None, "DRC", "P")
    assert "effectiveness_default" not in out["defaults"]
