"""Factor library: parameters with provenance and distributions (config/carbon/factors.yml)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml

CO2_PER_C = 44 / 12


@dataclass(frozen=True)
class Dist:
    type: str = "fixed"
    sd: float | None = None
    rel95: float | None = None
    low: float | None = None
    high: float | None = None

    def sample(self, value: float, n: int, rng: np.random.Generator) -> np.ndarray:
        if self.type == "fixed":
            return np.full(n, value)
        if self.type == "normal":
            sd = self.sd if self.sd is not None else value * (self.rel95 or 0) / 1.96
            return np.clip(rng.normal(value, sd, n), 0, None)
        if self.type == "triangular":
            return rng.triangular(self.low, value, self.high, n)
        raise ValueError(f"unknown distribution {self.type}")


@dataclass(frozen=True)
class Factor:
    id: str
    value: float
    dist: Dist
    unit: str
    tier: int
    source: str
    key: str | None = None      # which context value was picked (country, zone, soil)
    confirm: bool = False
    monitored_by: str | None = None
    note: str = ""

    def sample(self, n: int, rng: np.random.Generator) -> np.ndarray:
        return self.dist.sample(self.value, n, rng)


@dataclass
class Library:
    version: str
    gwp: dict
    raw: dict[str, dict] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> "Library":
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return cls(version=str(data["version"]), gwp=data.get("gwp") or {}, raw=data["factors"])

    def get(self, fid: str, *, country: str | None = None, zone: str | None = None, soil: str | None = None) -> Factor:
        """Resolve a factor for a context. Context-dependent factors fall back to `default`."""
        if fid not in self.raw:
            raise KeyError(f"factors.yml has no factor '{fid}'")
        f = self.raw[fid]
        entry, key = f, None
        for by, ctx in (("by_country", country), ("by_zone", zone), ("by_soil", soil)):
            if by in f:
                table = f[by]
                if ctx in table:
                    entry, key = table[ctx], ctx
                elif "default" in table:
                    entry, key = table["default"], "default"
                else:
                    raise KeyError(f"factor '{fid}' has no value for {by[3:]} '{ctx}' and no default")
                break
        d = entry.get("dist") or f.get("dist") or {"type": "fixed"}
        return Factor(
            id=fid, value=float(entry["value"]), dist=Dist(**d), unit=str(f.get("unit", "")),
            tier=int(f.get("tier", 1)), source=str(f.get("source", "")), key=key,
            confirm=bool(f.get("confirm", False)), monitored_by=f.get("monitored_by"), note=str(f.get("note", "")),
        )

    def describe(self) -> list[dict]:
        """Flat list for the dashboard's factor table (all context values shown)."""
        out = []
        for fid, f in self.raw.items():
            by = next((k for k in ("by_country", "by_zone", "by_soil") if k in f), None)
            row = {
                "id": fid, "unit": f.get("unit", ""), "tier": int(f.get("tier", 1)), "source": f.get("source", ""),
                "note": f.get("note", ""), "confirm": bool(f.get("confirm", False)), "monitoredBy": f.get("monitored_by"),
                "dist": (f.get("dist") or {}).get("type", "fixed") if not by else "by " + by[3:],
            }
            if by:
                row["values"] = {k: float(v["value"]) for k, v in f[by].items()}
                row["by"] = by[3:]
            else:
                row["value"] = float(f["value"])
            out.append(row)
        return out
