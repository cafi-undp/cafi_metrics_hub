"""Carbon accounting engine, method version 2.0 (docs/carbon-methodology.md).

One engine, two ledgers:
  * inventory    — stock changes within the programme boundary
                   (GHG Protocol Land Sector and Removals logic);
  * intervention — net GHG benefit against a baseline, after leakage and a
                   non-permanence buffer (ISO 14064-2 / CCP-approved methodologies).

`compute(...)` takes the yearly result series of each record, builds cohorts
(vintages) from the year-on-year increases, runs the module of the indicator's
archetype and returns per-record series plus Monte Carlo bands.
"""

from pipeline.carbon.engine import CarbonConfig, CarbonEngine

__all__ = ["CarbonConfig", "CarbonEngine"]
