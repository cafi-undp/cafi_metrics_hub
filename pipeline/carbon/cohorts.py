"""Cohorts (vintages) from a cumulative yearly series.

Each year's increase of a cumulative indicator is a new cohort with its own
age. A decrease retires area from the oldest cohorts first (FIFO, which
releases the most stored carbon and is therefore the conservative reading)
and is reported as a reversal. Years without a value change nothing.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Cohort:
    year: int      # index into the years list
    area: float


@dataclass
class CohortState:
    cohorts: list[Cohort] = field(default_factory=list)
    retired: list[tuple[int, Cohort]] = field(default_factory=list)  # (year retired, cohort slice)

    def stock(self) -> float:
        return sum(c.area for c in self.cohorts)

    def apply(self, yi: int, value: float) -> float:
        """Move to the reported cumulative value at year `yi`. Returns the area retired this year."""
        delta = value - self.stock()
        if delta > 1e-9:
            self.cohorts.append(Cohort(yi, delta))
            return 0.0
        retired = 0.0
        need = -delta
        while need > 1e-9 and self.cohorts:
            oldest = self.cohorts[0]
            take = min(need, oldest.area)
            self.retired.append((yi, Cohort(oldest.year, take)))
            oldest.area -= take
            need -= take
            retired += take
            if oldest.area <= 1e-9:
                self.cohorts.pop(0)
        return retired


def walk(values: list[float | None]) -> list[CohortState | None]:
    """Cohort state after each year (None before the first reported value).

    Returned states share one evolving object, so callers must evaluate each
    year before moving on; use `snapshots` for independent copies.
    """
    state = CohortState()
    out: list[CohortState | None] = []
    started = False
    for yi, v in enumerate(values):
        if v is not None:
            started = True
            state.apply(yi, max(0.0, float(v)))
        out.append(state if started else None)
    return out


def snapshots(values: list[float | None]) -> list[list[tuple[int, float]] | None]:
    """Per year: list of (cohort year, area) alive at that year, or None before data starts."""
    state = CohortState()
    out: list[list[tuple[int, float]] | None] = []
    started = False
    for yi, v in enumerate(values):
        if v is not None:
            started = True
            state.apply(yi, max(0.0, float(v)))
        out.append([(c.year, c.area) for c in state.cohorts] if started else None)
    return out


def reversals(values: list[float | None]) -> list[tuple[int, int, float]]:
    """(year retired, cohort year, area) for every retirement in the series."""
    state = CohortState()
    for yi, v in enumerate(values):
        if v is not None:
            state.apply(yi, max(0.0, float(v)))
    return [(y, c.year, c.area) for y, c in state.retired]
