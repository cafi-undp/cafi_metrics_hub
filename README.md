# CAFI Metrics Hub

Interactive dashboard of results reported by CAFI-funded programmes across Central
Africa, rebuilt from the Power BI report as code: version-controlled, tested, and
republished automatically.

```
data/ProjectData.xlsx ───────┐
data/MPTF_Projects.xlsx ─────┼─► pipeline (Python) ──► metrics.json + quality.json ──► dashboard (React + ECharts) ──► GitHub Pages
config/reference/            │   validate · re-code to standard     static site, no server
  CAFI_Standard_Indicators ──┘   indicators · CO₂ · link projects
```

## What's in the dashboard

| Page | What it shows |
|---|---|
| **Overview** | Committed CO₂ against the portfolio target, headline tiles, **What changed in {year}** (three generated statements about the selected year: largest hectare gain, pace and silence, targets reached, climate, first-time reporters), progress per outcome, a map of the six CAFI member states with a circle per country sized by hectares, programmes or CO₂ (click a country to filter; regional programmes are listed under the map), top programmes, hectares over time, and a treemap of where the hectares are |
| **Brief** | Briefing mode: the key figures and the generated insights as full-width slides for a meeting, driven with ← → and Esc |
| **Outcomes** | One tab per standard category (GOV, FOR, FIN, LUT, AGR, ENR, CLM, INC, PPL). Each reported indicator with its standard code, tier, result, target, achievement and year-on-year change; trajectory charts; programme ranking; every sub-indicator row with a status; the category's full list of standard indicators, reported or not |
| **Programmes** | Timeline of all programme periods; cards or table with average achievement, sparkline and on-track status; a detail page per programme, with its MPTF funding (budget, transfers, spending, status) |
| **Compare** | Two programmes side by side (`#/compare/<a>~<b>`): achievement, net GHG benefit, budget, expected indicators, every indicator with its meter, hectares by year |
| **Fact sheet** | One A4 page per programme (`#/factsheet/<id>`): results against targets, expected standard indicators, funding, claims, hectares over time, data-quality items. **Save as PDF** opens the browser's print dialog; the text stays selectable and the links live |
| **Portfolio** | All CAFI and FONAREDD projects from the MPTF list: approved budget, transfers, spending, status, by country and start year, and which ones report results |
| **Climate impact** | Two carbon ledgers (inventory = stock changes; intervention = net benefit after leakage and buffer), expected vs realised with p5–p95 bands, by indicator and country, per-unit values by stratum, the factor library with sources, the claims register |
| **Data quality** | Every check run on the workbook, with the Excel row numbers to fix |
| **Methodology** | How every number is calculated, plus the 67 standard indicators (filter by tier or reported) |

Everywhere:
- **Filters:** year, with a ▶ button that plays through the years; country, partner and programme. Filters are kept in the URL, so any view can be shared as a link.
- **Search:** press ⌘K / Ctrl K (or `/`) to jump to any programme, indicator or country.
- **Every chart:** a table view, CSV download and PNG download.
- **Display:** English / French, light / dark theme, works on mobile, keyboard-accessible, colour-blind-safe colours.
- **Robustness:** a malformed link opens the Overview instead of a blank page; unknown pages and ids show a "not found" card; a rendering error is caught and shows a reload button rather than a white screen.

## Updating the data

The project list lives in `data/MPTF_Projects.xlsx` (the MPTF Gateway export, any extra title rows are fine). Replace it the same way.

New results rows can use the standard codes directly (`GOV-03 Operational local governance structures`); rows with the old numbering are re-coded automatically.

**Option 1: commit the workbook.** Replace `data/ProjectData.xlsx` and push to `main` (or open a pull request). CI validates it, and the site republishes in about 2 minutes.

**Option 2: let it pull from SharePoint daily.** Register an app in Entra ID with the Graph application permission `Sites.Selected`, granted on the CAFI site only. Then add these in the GitHub repo under Settings → Secrets and variables → Actions:

| Kind | Name | Example |
|---|---|---|
| Secret | `AZURE_TENANT_ID` | `b3e5db5e-…` |
| Secret | `AZURE_CLIENT_ID` | app id |
| Secret | `AZURE_CLIENT_SECRET` | client secret |
| Variable | `SHAREPOINT_SITE` | `undp.sharepoint.com:/sites/cafi` |
| Variable | `SHAREPOINT_FILE` | `M&E/CAFI Metrics Hub/ProjectData.xlsx` |

The **Publish dashboard** workflow then fetches the workbook every day at 05:17 UTC. You can also run it by hand from the Actions tab.

### What the checks do

`python -m pipeline.build` reads the `CumulResults` sheet and:

- **Stops the build (errors):**
  - missing or duplicate columns, an empty sheet;
  - two programme names that differ only in punctuation (they would collide in the URL);
  - an indicator code or country that isn't in `config/indicators.yml`;
  - text in a numeric cell;
  - negative values.
- **Fixes automatically and reports (warnings):**
  - stray spaces;
  - "Land Management" vs "Land management";
  - partner spelling variants such as KfW / KFW.
- **Reports only:**
  - duplicate rows;
  - a cumulative value going down;
  - rows with no target;
  - results above twice the target;
  - expected standard indicators (mandatory for the project type, or required by one of its activities) that a linked programme has not reported yet, and reported indicators outside the project's expected set.

All findings appear on the dashboard's **Data quality** page with Excel row numbers.

## Changing labels, indicators or the carbon method

| File | Controls |
|---|---|
| `config/reference/CAFI_Standard_Indicators_MetricsHub.xlsx` | The standard indicator catalogue (tabs 01–11: categories, sub-categories, 67 indicators with EN/FR names, tier, unit, aggregation rule, tags) and the project classification (tabs 12–15: activities, project type and PES flag per MPTF project, and the indicators each project is expected to report). Replace the file to update the site |
| `config/indicators.yml` | How old indicator numbers (01–14) in ProjectData.xlsx map to standard codes, sub-indicator overrides, category colours and French names, the hectare headline, countries |
| `config/programmes.yml` | Which MPTF project id(s) each results programme belongs to (lines marked `check` need confirming). The link is what connects a programme's results to its project's budget, type and expected indicators |
| `config/portfolio.yml` | Fund-to-fund transfers left out of portfolio totals |
| `config/carbon/factors.yml` | Carbon factor library: every parameter with value, distribution, tier and source (method 2.0, see `docs/carbon-methodology.md`) |
| `config/carbon/strata.yml` | Ecological zone and soil class per country, with programme overrides |
| `config/carbon/archetypes.yml` | Which quantification module (ARR, REDD, ALM, cooking) each carbon indicator uses |
| `config/carbon/claims.yml` | Claims register: projects whose results are also accounted elsewhere (national programme, company inventory, credits); private-sector projects get a derived entry to confirm |
| `config/carbon/overrides.yml` | Programme-measured carbon parameters (Tier 3), e.g. a kitchen performance test result, which replace the library default for that programme |
| `config/headline.yml` | Figures not in the workbook (beneficiaries, anticipated portfolio CO₂) |

### Calculation rules

- **Results are cumulative.** A year's value is the total reached so far; years are never added together. A missing year carries the last reported value forward.
- **Achievement** = Σ results ÷ Σ targets, over rows that have a target.
  - An outcome's achievement is the average of its indicators.
  - The Power BI report added up per-row percentages instead, which understated progress. For example, it showed 3 % for clean cooking where the correct figure is 120 %.
- **Units are never mixed.** Hectares, counts and km are kept apart.
- **Status** compares achievement with the share of the programme period that has elapsed.
- **Carbon (method 2.0, `docs/carbon-methodology.md`):** one cohort engine, two ledgers that are never netted.
  - *Inventory ledger* = carbon stock changes within the programme boundary (GHG Protocol Land Sector and Removals logic): gross removals, with emissions from reversals booked separately.
  - *Intervention ledger* = net GHG benefit against a baseline, after leakage and a non-permanence buffer (ISO 14064-2; CCP-approved methodologies VM0047, VM0048, TPDDTEC v4 / VM0050; CDM TOOL33 defaults).
  - Each year's increase of an indicator is a *cohort* that accumulates carbon up to a cap; harvested systems are credited at the long-term average stock. *Expected (full cycle)* = stock in place × per-unit value over 20 years; *realised to date* = the cohorts at their age. Monte Carlo bands (p5–p95) from the IPCC uncertainties, centred on the published value and seeded per indicator and stratum, so a band never depends on the order of the rows.
  - Flow indicators (people trained, meetings held, tonnes produced) never retire cohorts when they dip; only stock indicators (hectares, devices in use) do. A CLM-02 series that rises every year is flagged as probably cumulative rather than annual.
  - Soil carbon (indicative) and displaced fuelwood (potential) are shown apart and never added to a headline. Defaults flagged `monitored_by` are replaced automatically when a programme reports ENR-02 (usage), ENR-03 (fuel savings) or CLM-02 (observed deforestation → effectiveness); such figures are labelled *ex post*.

### Changes from the Power BI report — please confirm

1. The Power BI carbon coefficients were replaced by method 2.0 (above). The expected full-cycle figure moves from 31 Mt CO₂e to 13 Mt removals in the inventory ledger and 11 Mt net benefit in the intervention ledger (p5–p95 bands shown on the site) because harvested systems are time-averaged, cookstoves use the national fraction of non-renewable biomass and a five-year device life, and the 50 % avoided-deforestation add-on on agriculture is gone; natural regeneration rises.
2. Beneficiaries and anticipated CO₂ are still constants, now in `config/headline.yml`. They need a source.

## Running locally

```bash
pip install -r requirements.txt
python -m pipeline.build          # → web/public/data/*.json
python -m pytest                  # pipeline tests

cd web
npm install
npm run dev                       # http://localhost:5173
npm test                          # aggregation-rule and insight tests
npm run build                     # → web/dist (static site)
npm run smoke                     # Playwright + axe: 15 routes × 3 widths × 2 themes against web/dist
```

The smoke test fails on console errors, horizontal overflow, a missing `<h1>`, `NaN` or `undefined` in the page, and WCAG A/AA violations found by axe-core (contrast is reported as a warning). CI runs it after the build.

## Publishing (one-time setup)

1. In the GitHub repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Merge to `main`. The **Publish dashboard** workflow builds and deploys to `https://<owner>.github.io/cafi_metrics_hub/`.

GitHub Pages on a private repository needs a paid GitHub plan. You can also deploy the `web/dist` folder to any static host, such as Azure Static Web Apps, Netlify or SharePoint.

## Project layout

```
config/            indicator catalogue, CO₂ factors, headline figures
data/              ProjectData.xlsx (source workbook)
pipeline/          build.py (validate + transform), quality.py, fetch_sharepoint.py
tests/             pipeline tests (pytest)
web/src/lib/       data model + aggregation rules (model.ts, tested), insights.ts (tested), i18n, state/URL sync
web/src/components charts, filters, command palette, tables
web/src/pages/     Overview, Brief, Outcomes, Programmes, Programme detail, Compare, Fact sheet, Portfolio, Climate, Data quality, Methodology
web/scripts/       smoke.mjs (Playwright + axe smoke test of the built site)
.github/workflows/ ci.yml (checks on every push/PR), deploy.yml (publish to Pages)
```
