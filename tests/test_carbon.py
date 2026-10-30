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
