"""Runs the modules over records: strata, tier escalation, Monte Carlo bands, claims.

Tier escalation (docs/carbon-methodology.md §5): a monitored indicator reported
by the programme replaces the library default for that programme —
ENR-02 → usage, ENR-03 → fuel savings, CLM-02 → effectiveness of forest
protection — and a programme-measured value in config/carbon/overrides.yml
replaces any factor (Tier 3). Records then carry basis "ex post".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from pipeline.carbon.cohorts import reversals, snapshots
from pipeline.carbon.library import Dist, Factor, Library
from pipeline.carbon.modules import MODULES, Cooking, REDD

LEDGERS = ("inventory", "intervention", "indicative", "potential")
N_DRAWS = 2000
SEED = 20261030

# Monitored indicator → (parameter it replaces, how rows are combined, kind)
MONITORS = {
    "ENR-02": ("usage", "mean", "fraction"),
    "ENR-03": ("savings", "mean", "fraction"),
    "CLM-02": ("deforestation", "sum", "area"),
}
PRIVATE_TYPES = ("private sector",)


def carry(series: list[float | None], yi: int) -> float | None:
    for k in range(min(yi, len(series) - 1), -1, -1):
        if series[k] is not None:
            return series[k]
    return None


@dataclass
class CarbonConfig:
    library: Library
    strata_countries: dict[str, dict]
    strata_programmes: dict[str, dict]
    archetypes: dict[str, dict]
    claims: dict[int, dict]
    overrides: dict[str, dict[str, dict]] = field(default_factory=dict)

    @classmethod
    def load(cls, config_dir: Path) -> "CarbonConfig":
        d = config_dir / "carbon"

        def y(name):
            p = d / name
            return (yaml.safe_load(p.read_text(encoding="utf-8")) or {}) if p.exists() else {}

        strata, claims = y("strata.yml"), y("claims.yml")
        return cls(
            library=Library.load(d / "factors.yml"),
            strata_countries=strata.get("countries") or {},
            strata_programmes=strata.get("programmes") or {},
            archetypes=y("archetypes.yml"),
            claims={int(k): v for k, v in claims.items()},
            overrides={str(k): v or {} for k, v in (y("overrides.yml").get("programmes") or {}).items()},
        )

    def stratum(self, country: str, programme: str) -> dict:
        base = dict(self.strata_countries.get(country) or self.strata_countries.get("Regional") or {"zone": "moist", "soil": "lac"})
        base.update(self.strata_programmes.get(programme) or {})
        return {"country": country, **base}


@dataclass
class Monitored:
    """Series reported by a programme that replace defaults (values per year index)."""
    usage: list[float | None] | None = None
    savings: list[float | None] | None = None
    defor_observed: list[float | None] | None = None   # ha/yr in the project area
    defor_baseline: list[float | None] | None = None   # ha/yr, if the programme reports its own baseline
    protected_area: list[float | None] | None = None   # Σ FOR-04 rows, cumulative ha

    def indicators(self) -> dict[str, str]:
        out = {}
        if self.usage: out["usage"] = "ENR-02"
        if self.savings: out["savings"] = "ENR-03"
        if self.defor_observed: out["effectiveness"] = "CLM-02"
        return out


@dataclass
class CarbonEngine:
    config: CarbonConfig
    years: list[int]
    monitored: dict[str, Monitored] = field(default_factory=dict)
    _bands: dict = field(default_factory=dict)
    _rng: np.random.Generator = field(default_factory=lambda: np.random.default_rng(SEED))

    # ── monitored indicators ──
    def observe(self, df: pd.DataFrame) -> None:
        """Collect ENR-02, ENR-03, CLM-02 and the protected area per programme from the result rows."""
        n = len(self.years)

        def series(rows: pd.DataFrame, how: str) -> list[float | None] | None:
            if rows.empty:
                return None
            out: list[float | None] = []
            for y in self.years:
                vals = pd.to_numeric(rows[y], errors="coerce").dropna()
                out.append(None if vals.empty else float(vals.mean() if how == "mean" else vals.sum()))
            return out if any(v is not None for v in out) else None

        def fraction(s: list[float | None] | None):
            if s is None:
                return None
            mx = max(v for v in s if v is not None)
            return [None if v is None else (v / 100 if mx > 1 else v) for v in s]

        for prog, g in df.groupby("programme", sort=False):
            m = Monitored()
            m.usage = fraction(series(g[g["code"] == "ENR-02"], "mean"))
            m.savings = fraction(series(g[g["code"] == "ENR-03"], "mean"))
            clm = g[g["code"] == "CLM-02"]
            is_base = clm["label"].str.casefold().str.contains("baseline|référence|reference|contrefactuel|counterfactual", regex=True)
            m.defor_observed = series(clm[~is_base], "sum")
            m.defor_baseline = series(clm[is_base], "sum")
            prot = g[g["code"] == "FOR-04"]
            if not prot.empty:
                raw = series(prot, "sum")
                m.protected_area = [carry(raw, i) for i in range(n)] if raw else None
            if m.indicators():
                self.monitored[str(prog)] = m

    # ── parameter resolution ──
    def module_for(self, code: str):
        spec = self.config.archetypes.get(code)
        return MODULES[spec["module"]](spec) if spec else None

    def _resolve(self, code: str, ctx: dict, programme: str | None = None):
        mod = self.module_for(code)
        factors = mod.params(self.config.library, ctx)
        if hasattr(mod, "spec_growth_unit") and "growth" in factors:
            mod.spec_growth_unit = factors["growth"].unit
        over = self.config.overrides.get(programme or "", {})
        for key, f in list(factors.items()):
            o = over.get(f.id)
            if o is None:
                continue
            dist = Dist("normal", rel95=float(o["rel95"])) if o.get("rel95") else Dist("fixed")
            factors[key] = Factor(id=f.id, value=float(o["value"]), dist=dist, unit=f.unit, tier=3,
                                  source=str(o.get("source", "programme measurement")), key=f.key, note="override")
        return mod, factors

    # ── Monte Carlo bands per (indicator, stratum, overrides) ──
    def band(self, code: str, ctx: dict, programme: str | None = None) -> dict:
        over = repr(sorted(self.config.overrides.get(programme or "", {}).items())) if programme in self.config.overrides else ""
        key = (code, ctx["country"], ctx["zone"], ctx["soil"], over)
        if key in self._bands:
            return self._bands[key]
        mod, factors = self._resolve(code, ctx, programme)
        draws = {k: f.sample(N_DRAWS, self._rng) for k, f in factors.items()}
        if "fnrb" in draws:
            draws["fnrb"] = np.clip(draws["fnrb"], 0.02, 0.95)
        pu = mod.per_unit(draws)
        out = {}
        for ledger in LEDGERS:
            arr = np.asarray(pu[ledger], dtype=float)
            mean = float(arr.mean()) if arr.size else 0.0
            out[ledger] = [1.0, 1.0] if mean <= 0 else [round(float(np.percentile(arr, 5)) / mean, 3), round(float(np.percentile(arr, 95)) / mean, 3)]
        self._bands[key] = out
        return out

    # ── monitored parameter values at a year ──
    def _effectiveness(self, mon: Monitored, v: dict, yi: int) -> float | None:
        obs = carry(mon.defor_observed, yi) if mon.defor_observed else None
        if obs is None:
            return None
        base = carry(mon.defor_baseline, yi) if mon.defor_baseline else None
        if base is None:
            area = carry(mon.protected_area, yi) if mon.protected_area else None
            base = v["rate"] * area if area else None
        if not base or base <= 0:
            return None
        return float(min(1.0, max(0.0, 1 - obs / base)))

    # ── per record ──
    def compute(self, code: str, values: list[float | None], target: float | None, country: str, programme: str) -> dict | None:
        if code not in self.config.archetypes:
            return None
        ctx = self.config.stratum(country, programme)
        mod, factors = self._resolve(code, ctx, programme)
        v = {k: f.value for k, f in factors.items()}
        pu_default = {k: float(np.asarray(x)) for k, x in mod.per_unit(v).items()}
        mon = self.monitored.get(programme, Monitored())
        used: dict[str, str] = {}
        n = len(values)
        snaps = snapshots(values)

        # Per-year contribution of one unit of age `age` at year `yi`, and per-unit full cycle at `yi`.
        def contribution(age: int, yi: int) -> dict:
            if isinstance(mod, Cooking) and (mon.usage or mon.savings):
                total, life = 0.0, int(v["life"])
                for k in range(1, min(age, life) + 1):
                    y = yi - age + k
                    sav = carry(mon.savings, y) if mon.savings else None
                    use = carry(mon.usage, y) if mon.usage else None
                    if sav is not None: used["savings"] = "ENR-03"
                    if use is not None: used["usage"] = "ENR-02"
                    vv = {**v, "savings": sav if sav is not None else v["savings"]}
                    u = use if use is not None else float(mod.usage_at(v, k))
                    total += float(mod.base(vv)) * u
                return {"inventory": 0.0, "intervention": total, "indicative": 0.0, "potential": 0.0}
            if isinstance(mod, REDD) and mon.defor_observed:
                total = 0.0
                for k in range(1, max(age, 0) + 1):
                    y = yi - age + k
                    eff = self._effectiveness(mon, v, y)
                    if eff is not None: used["effectiveness"] = "CLM-02"
                    total += float(mod.annual({**v, "effectiveness": eff if eff is not None else v["effectiveness"]}))
                return {"inventory": 0.0, "intervention": total, "indicative": 0.0, "potential": 0.0}
            return mod.trajectory(v, age)

        def per_unit_at(yi: int) -> dict:
            if isinstance(mod, Cooking) and (mon.usage or mon.savings):
                sav = carry(mon.savings, yi) if mon.savings else None
                use = carry(mon.usage, yi) if mon.usage else None
                if sav is None and use is None:
                    return pu_default
                vv = {**v, "savings": sav if sav is not None else v["savings"]}
                life = int(v["life"])
                usage_sum = use * life if use is not None else sum(float(mod.usage_at(v, a)) for a in range(1, life + 1))
                return {**pu_default, "intervention": float(mod.base(vv)) * usage_sum}
            if isinstance(mod, REDD) and mon.defor_observed:
                eff = self._effectiveness(mon, v, yi)
                if eff is None:
                    return pu_default
                return {**pu_default, "intervention": float(mod.annual({**v, "effectiveness": eff})) * v["horizon"]}
            return pu_default

        series = {l: {"realised": [None] * n, "expected": [None] * n} for l in LEDGERS}
        emissions = [None] * n
        retired_by_year: dict[int, float] = {}
        for y_ret, y_cohort, area in reversals(values):
            retired_by_year[y_ret] = retired_by_year.get(y_ret, 0.0) + area * mod.trajectory(v, y_ret - y_cohort)["inventory"]
        cum_em = 0.0
        for yi in range(n):
            alive = snaps[yi]
            if alive is None:
                continue
            stock = sum(a for _, a in alive)
            realised = {l: 0.0 for l in LEDGERS}
            for y_c, area in alive:
                tr = contribution(yi - y_c, yi)
                for l in LEDGERS:
                    realised[l] += area * tr[l]
            pu = per_unit_at(yi)
            for l in LEDGERS:
                series[l]["realised"][yi] = round(realised[l], 1)
                series[l]["expected"][yi] = round(stock * pu[l], 1)
            cum_em += retired_by_year.get(yi, 0.0)
            emissions[yi] = round(cum_em, 1)

        spec = self.config.archetypes[code]
        ledger = spec.get("ledger", "intervention")
        tgt = float(target or 0)
        pu_last = per_unit_at(n - 1)
        overridden = [f.id for f in factors.values() if f.note == "override"]
        last_real = next((x for x in reversed(series["inventory"]["realised"]) if x is not None), 0.0) or 0.0
        last_em = next((x for x in reversed(emissions) if x is not None), 0.0) or 0.0
        buffer = float(v.get("buffer", 0.0))
        return {
            "archetype": spec["module"],
            "ledger": ledger,
            "stratum": f"{ctx['country']}/{ctx['zone']}/{ctx['soil']}",
            "basis": "ex post" if (used or overridden) else "ex ante",
            "monitored": used,
            "overrides": overridden,
            "inventory": {**series["inventory"], "emissions": emissions},
            "intervention": series["intervention"],
            "indicative": series["indicative"] if ledger == "indicative" else None,
            "potential": series["potential"] if spec.get("fuelwood") else None,
            "target": {"inventory": round(tgt * pu_last["inventory"], 1), "intervention": round(tgt * pu_last["intervention"], 1)},
            "perUnit": {l: round(pu_last[l], 3) for l in LEDGERS},
            "band": self.band(code, ctx, programme),
            "tier": 3 if (used or overridden) else max(f.tier for f in factors.values()),
            "defaults": sorted(f.id for f in factors.values() if f.monitored_by and f.monitored_by not in used.values()),
            "reversal": {"released": round(last_em, 1), "share": round(last_em / (last_real + last_em), 3) if last_em else 0.0,
                         "buffer": buffer} if last_em else None,
        }

    # ── metadata for the dashboard ──
    def claims(self, projects: list[dict]) -> list[dict]:
        """Explicit register entries plus statuses derived from the project classification."""
        out = []
        for p in projects:
            pid = p["id"]
            if pid in self.config.claims:
                out.append({"project": pid, **self.config.claims[pid]})
            elif (p.get("projectType") or "").casefold().startswith(PRIVATE_TYPES):
                out.append({"project": pid, "status": "corporate_inventory", "confirm": True, "derived": True,
                            "note": "Private-sector project type: partner companies may report these hectares in their Scope 3 FLAG inventory. Confirm with the partner."})
        return sorted(out, key=lambda c: c["project"])

    def describe(self, programmes: list[dict], projects: list[dict]) -> dict:
        lib = self.config.library
        return {
            "method": lib.version,
            "gwp": lib.gwp,
            "factors": lib.describe(),
            "archetypes": {code: dict(spec) for code, spec in self.config.archetypes.items()},
            "strata": {p["id"]: self.config.stratum(p["country"], p["name"]) for p in programmes},
            "claims": self.claims(projects),
            "monitoring": {
                prog: {"indicators": m.indicators(), "overrides": sorted(self.config.overrides.get(prog, {}).keys())}
                for prog, m in sorted(self.monitored.items())
            } | {
                prog: {"indicators": {}, "overrides": sorted(o.keys())}
                for prog, o in sorted(self.config.overrides.items()) if o and prog not in self.monitored
            },
            "draws": N_DRAWS,
        }
