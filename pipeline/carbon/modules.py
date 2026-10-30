"""Quantification modules, one per archetype.

Every module exposes the same two things:

  params(lib, ctx)        -> dict of Factor objects it needs for a context
  per_unit(p)             -> dict of per-unit, full-cycle values (tCO2e per ha
                             or per device) computed from a dict of parameter
                             values. Works on floats and on NumPy arrays alike,
                             so the same code gives the central estimate and
                             the Monte Carlo draws.
  trajectory(p, age)      -> value per unit at a given age (float), used for
                             the realised series cohort by cohort.

Keys of per_unit / trajectory:
  inventory    stock gain in tCO2e (gross removals)
  intervention net GHG benefit in tCO2e after leakage and buffer
  indicative   soil carbon shown separately
  potential    displaced non-renewable fuelwood, ex post only
  emissions    carbon released when a cohort is retired (per unit)
"""

from __future__ import annotations

import numpy as np

from pipeline.carbon.library import CO2_PER_C, Library

ZERO = {"inventory": 0.0, "intervention": 0.0, "indicative": 0.0, "potential": 0.0}


def _dm_agb_to_total_c(g_dm: float | np.ndarray, root_shoot, cf):
    """Above-ground dry-matter growth → total (above + below) carbon growth."""
    return g_dm * (1 + root_shoot) * cf


# ───────────────────────────── ARR ─────────────────────────────
class ARR:
    """Afforestation, reforestation, revegetation, assisted natural regeneration."""

    def __init__(self, spec: dict):
        self.spec = spec

    def params(self, lib: Library, ctx: dict) -> dict:
        s = self.spec
        p = {
            "growth": lib.get(s["growth"], zone=ctx["zone"]),
            "cf": lib.get("cf"),
            "root_shoot": lib.get("root_shoot", zone=ctx["zone"]),
            "horizon": lib.get("horizon"),
            "buffer": lib.get(s["buffer"]),
            "leakage": lib.get(s["leakage"]),
        }
        if s["system"] == "rotational":
            p["rotation"] = lib.get(s["rotation"])
        else:
            if "maturity" in s:
                p["maturity"] = lib.get(s["maturity"])
            if "cap" in s:
                p["cap"] = lib.get(s["cap"])
        if s.get("fuelwood"):
            p["fuel_share"] = lib.get("fuel_share")
            p["fnrb"] = lib.get("fnrb", country=ctx["country"])
            p["leakage_fuelwood"] = lib.get("leakage_fuelwood")
        return p

    def _growth_c(self, v: dict):
        """Total carbon growth tC/ha/yr, whatever unit the growth factor uses."""
        if "d.m." in self.spec_growth_unit:
            return _dm_agb_to_total_c(v["growth"], v["root_shoot"], v["cf"])
        return v["growth"]

    def _cap(self, v: dict):
        g = self._growth_c(v)
        if self.spec["system"] == "rotational":
            return g * v["rotation"] / 2            # long-term average of a harvested stand
        caps = []
        if "maturity" in v:
            caps.append(g * v["maturity"])
        if "cap" in v:
            caps.append(v["cap"])
        return np.minimum.reduce(caps) if len(caps) > 1 else caps[0]

    def per_unit(self, v: dict) -> dict:
        g = self._growth_c(v)
        cap = self._cap(v)
        stock = np.minimum(g * v["horizon"], cap) * CO2_PER_C
        out = {
            "inventory": stock,
            "intervention": stock * (1 - v["leakage"]) * (1 - v["buffer"]),
            "indicative": 0.0 * stock,
            "potential": 0.0 * stock,
        }
        if self.spec.get("fuelwood"):
            annual = self._fuelwood_annual(v)
            years = np.maximum(0.0, v["horizon"] - v["rotation"])
            out["potential"] = annual * years
        return out

    def _fuelwood_annual(self, v: dict):
        g_dm = v["growth"] if "d.m." in self.spec_growth_unit else v["growth"] / v["cf"] / (1 + v["root_shoot"])
        return g_dm * v["fuel_share"] * v["fnrb"] * v["cf"] * CO2_PER_C * (1 - v["leakage_fuelwood"])

    def trajectory(self, v: dict, age: float) -> dict:
        if age <= 0:
            return dict(ZERO)
        g = self._growth_c(v)
        stock = min(g * age, float(self._cap(v))) * CO2_PER_C
        out = {
            "inventory": stock,
            "intervention": stock * (1 - v["leakage"]) * (1 - v["buffer"]),
            "indicative": 0.0,
            "potential": 0.0,
        }
        if self.spec.get("fuelwood"):
            out["potential"] = float(self._fuelwood_annual(v)) * max(0.0, age - v["rotation"])
        return out

    # unit of the growth factor, set by the engine after resolving the factor
    spec_growth_unit: str = ""


# ───────────────────────────── REDD ─────────────────────────────
class REDD:
    """Avoided unplanned deforestation on protected forest."""

    def __init__(self, spec: dict):
        self.spec = spec

    def params(self, lib: Library, ctx: dict) -> dict:
        return {
            "rate": lib.get("defor_rate", country=ctx["country"]),
            "ef": lib.get("ef_deforestation", country=ctx["country"]),
            "effectiveness": lib.get("effectiveness_default"),
            "leakage": lib.get(self.spec["leakage"]),
            "buffer": lib.get(self.spec["buffer"]),
            "horizon": lib.get("horizon"),
        }

    def annual(self, v: dict):
        return v["rate"] * v["effectiveness"] * (1 - v["leakage"]) * v["ef"] * (1 - v["buffer"])

    def per_unit(self, v: dict) -> dict:
        a = self.annual(v)
        return {"inventory": 0.0 * a, "intervention": a * v["horizon"], "indicative": 0.0 * a, "potential": 0.0 * a}

    def trajectory(self, v: dict, age: float) -> dict:
        return {**ZERO, "intervention": float(self.annual(v)) * max(0.0, age)}


# ───────────────────────────── ALM ─────────────────────────────
class ALM:
    """Agricultural land management: soil organic carbon, indicative Tier 1."""

    def __init__(self, spec: dict):
        self.spec = spec

    def params(self, lib: Library, ctx: dict) -> dict:
        return {
            "soc_ref": lib.get("soc_ref", soil=ctx["soil"]),
            "f_lu": lib.get("f_lu_cultivated"),
            "f_i": lib.get("f_i_high"),
            "period": lib.get("soc_period"),
        }

    def rate(self, v: dict):
        return v["soc_ref"] * v["f_lu"] * (v["f_i"] - 1.0) / v["period"]

    def per_unit(self, v: dict) -> dict:
        r = self.rate(v)
        return {"inventory": 0.0 * r, "intervention": 0.0 * r, "indicative": r * v["period"] * CO2_PER_C, "potential": 0.0 * r}

    def trajectory(self, v: dict, age: float) -> dict:
        r = float(self.rate(v))
        return {**ZERO, "indicative": min(r * age, r * v["period"]) * CO2_PER_C if age > 0 else 0.0}


# ───────────────────────────── Cooking ─────────────────────────────
class Cooking:
    """Improved and clean cooking devices: avoided non-renewable biomass emissions."""

    def __init__(self, spec: dict):
        self.spec = spec

    def params(self, lib: Library, ctx: dict) -> dict:
        return {
            "wood_per_capita": lib.get("wood_per_capita"),
            "household_size": lib.get("household_size"),
            "savings": lib.get("fuel_savings"),
            "usage": lib.get("usage"),
            "dropoff": lib.get("usage_dropoff"),
            "life": lib.get("device_life"),
            "fnrb": lib.get("fnrb", country=ctx["country"]),
            "ef_co2": lib.get("ef_wood_co2"),
            "ef_nonco2": lib.get("ef_wood_nonco2"),
            "leakage": lib.get("leakage_cooking"),
        }

    def base(self, v: dict):
        return (v["wood_per_capita"] * v["household_size"] * v["savings"]
                * (v["fnrb"] * v["ef_co2"] + v["ef_nonco2"]) * (1 - v["leakage"]))

    def usage_at(self, v: dict, age: int):
        return v["usage"] * np.maximum(0.0, 1 - v["dropoff"] * max(0, age - 2))

    def per_unit(self, v: dict) -> dict:
        b = self.base(v)
        life = int(np.max(v["life"]))
        total = sum(self.usage_at(v, a) for a in range(1, life + 1)) * b
        return {"inventory": 0.0 * total, "intervention": total, "indicative": 0.0 * total, "potential": 0.0 * total}

    def trajectory(self, v: dict, age: float) -> dict:
        b = float(self.base(v))
        life = int(v["life"])
        years = range(1, int(min(age, life)) + 1)
        return {**ZERO, "intervention": sum(float(self.usage_at(v, a)) for a in years) * b}


MODULES = {"arr": ARR, "redd": REDD, "alm": ALM, "cooking": Cooking}
