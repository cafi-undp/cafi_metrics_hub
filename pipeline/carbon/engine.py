"""Runs the modules over records, with strata, Monte Carlo bands and the claims register."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml

from pipeline.carbon.cohorts import reversals, snapshots
from pipeline.carbon.library import Library
from pipeline.carbon.modules import MODULES

LEDGERS = ("inventory", "intervention", "indicative", "potential")
N_DRAWS = 2000
SEED = 20261030


@dataclass
class CarbonConfig:
    library: Library
    strata_countries: dict[str, dict]
    strata_programmes: dict[str, dict]
    archetypes: dict[str, dict]
    claims: dict[int, dict]

    @classmethod
    def load(cls, config_dir: Path) -> "CarbonConfig":
        d = config_dir / "carbon"
        strata = yaml.safe_load((d / "strata.yml").read_text(encoding="utf-8")) or {}
        claims = yaml.safe_load((d / "claims.yml").read_text(encoding="utf-8")) or {}
        return cls(
            library=Library.load(d / "factors.yml"),
            strata_countries=strata.get("countries") or {},
            strata_programmes=strata.get("programmes") or {},
            archetypes=yaml.safe_load((d / "archetypes.yml").read_text(encoding="utf-8")) or {},
            claims={int(k): v for k, v in claims.items()},
        )

    def stratum(self, country: str, programme: str) -> dict:
        base = dict(self.strata_countries.get(country) or self.strata_countries.get("Regional") or {"zone": "moist", "soil": "lac"})
        base.update(self.strata_programmes.get(programme) or {})
        return {"country": country, **base}


@dataclass
class CarbonEngine:
    config: CarbonConfig
    years: list[int]
    _bands: dict = field(default_factory=dict)
    _rng: np.random.Generator = field(default_factory=lambda: np.random.default_rng(SEED))

    # ── setup ──
    def module_for(self, code: str):
        spec = self.config.archetypes.get(code)
        if not spec:
            return None
        return MODULES[spec["module"]](spec)

    def _resolve(self, code: str, ctx: dict):
        mod = self.module_for(code)
        factors = mod.params(self.config.library, ctx)
        if hasattr(mod, "spec_growth_unit") and "growth" in factors:
            mod.spec_growth_unit = factors["growth"].unit
        return mod, factors

    # ── Monte Carlo bands per (indicator, stratum) ──
    def band(self, code: str, ctx: dict) -> dict:
        key = (code, ctx["country"], ctx["zone"], ctx["soil"])
        if key in self._bands:
            return self._bands[key]
        mod, factors = self._resolve(code, ctx)
        draws = {k: f.sample(N_DRAWS, self._rng) for k, f in factors.items()}
        if "fnrb" in draws:
            draws["fnrb"] = np.clip(draws["fnrb"], 0.02, 0.95)
        pu = mod.per_unit(draws)
        out = {}
        for ledger in LEDGERS:
            arr = np.asarray(pu[ledger], dtype=float)
            mean = float(arr.mean()) if arr.size else 0.0
            if mean <= 0:
                out[ledger] = [1.0, 1.0]
            else:
                out[ledger] = [round(float(np.percentile(arr, 5)) / mean, 3), round(float(np.percentile(arr, 95)) / mean, 3)]
        self._bands[key] = out
        return out

    # ── per record ──
    def compute(self, code: str, values: list[float | None], target: float | None, country: str, programme: str) -> dict | None:
        if code not in self.config.archetypes:
            return None
        ctx = self.config.stratum(country, programme)
        mod, factors = self._resolve(code, ctx)
        v = {k: f.value for k, f in factors.items()}
        pu = {k: float(np.asarray(x)) for k, x in mod.per_unit(v).items()}
        snaps = snapshots(values)
        n = len(values)

        series = {l: {"realised": [None] * n, "expected": [None] * n} for l in LEDGERS}
        emissions = [None] * n
        retired_by_year: dict[int, float] = {}
        for y_ret, y_cohort, area in reversals(values):
            age = y_ret - y_cohort
            retired_by_year[y_ret] = retired_by_year.get(y_ret, 0.0) + area * mod.trajectory(v, age)["inventory"]
        cum_em = 0.0
        for yi in range(n):
            alive = snaps[yi]
            if alive is None:
                continue
            stock = sum(a for _, a in alive)
            realised = {l: 0.0 for l in LEDGERS}
            for y_c, area in alive:
                tr = mod.trajectory(v, yi - y_c)
                for l in LEDGERS:
                    realised[l] += area * tr[l]
            for l in LEDGERS:
                series[l]["realised"][yi] = round(realised[l], 1)
                series[l]["expected"][yi] = round(stock * pu[l], 1)
            cum_em += retired_by_year.get(yi, 0.0)
            emissions[yi] = round(cum_em, 1)

        spec = self.config.archetypes[code]
        ledger = spec.get("ledger", "intervention")
        tgt = float(target or 0)
        return {
            "archetype": spec["module"],
            "ledger": ledger,
            "stratum": f"{ctx['country']}/{ctx['zone']}/{ctx['soil']}",
            "inventory": {**series["inventory"], "emissions": emissions},
            "intervention": series["intervention"],
            "indicative": series["indicative"] if ledger == "indicative" else None,
            "potential": series["potential"] if spec.get("fuelwood") else None,
            "target": {"inventory": round(tgt * pu["inventory"], 1), "intervention": round(tgt * pu["intervention"], 1)},
            "perUnit": {l: round(pu[l], 3) for l in LEDGERS},
            "band": self.band(code, ctx),
            "tier": max(f.tier for f in factors.values()),
            "defaults": sorted(f.id for f in factors.values() if f.monitored_by),
        }

    # ── metadata for the dashboard ──
    def describe(self, programmes: list[dict]) -> dict:
        lib = self.config.library
        return {
            "method": lib.version,
            "gwp": lib.gwp,
            "factors": lib.describe(),
            "archetypes": {
                code: {k: v for k, v in spec.items()} for code, spec in self.config.archetypes.items()
            },
            "strata": {p["id"]: self.config.stratum(p["country"], p["name"]) for p in programmes},
            "claims": [{"project": pid, **c} for pid, c in sorted(self.config.claims.items())],
            "draws": N_DRAWS,
        }
