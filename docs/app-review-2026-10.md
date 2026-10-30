# CAFI Metrics Hub — end-to-end review and design direction (October 2026)

Scope: the live site after the five pull requests of 30 October 2026 (standard indicators, portfolio, project classification, carbon method 2.0 phases 1–2). Method: a headless-browser sweep of every page at desktop, tablet and phone widths, light and dark themes, English and French, with an automated WCAG 2.1 AA scan (axe-core) and scripted interaction tests; two independent code audits (pipeline and dashboard); and a design critique. Nothing in this document has been changed in the code yet; section 3 is the proposed order of work.

## 1. What works

- No runtime errors on any page, viewport, theme or language; no NaN or undefined ever rendered; load is light (about 330 kB of gzipped JavaScript, 340 kB of data, first paint well under a second on a normal connection).
- State lives in the URL: year, filters and page survive refresh, back/forward and copy-link; links are real anchors.
- Every chart has a table twin, CSV and PNG export; tooltips are escaped; themes and reduced motion are respected.
- One documented aggregation module with tests; the pipeline is reproducible from git (data, config, factor library all versioned).
- Data quality is visible to users, with Excel row numbers.

## 2. Problems found

Severity: **high** = wrong or broken for some users; **medium** = misleading, inaccessible or fragile; **low** = polish.

### 2.1 Correctness and robustness

| # | Sev. | Finding | Evidence | Fix |
|---|---|---|---|---|
| 1 | high | A malformed hash crashes the app to a blank page: `#/programme/50%` throws `URIError` in the route parser and there is no error boundary. | Reproduced headless: empty body, "URI malformed". `web/src/lib/state.tsx` decodes every segment without a guard. | Wrap decoding in try/catch (fall back to Overview), add a top-level React error boundary with a "reload / report" card. |
| 2 | high | Pervasive non-null assertions (`ix.programmes.get(id)!`, `ix.indicators.get(code)!`) across pages: one inconsistent row in a future workbook turns into a white screen rather than a visible gap. | Overview, OutcomePage, Programmes, coverage. | Fall back to the id and a "missing" badge; covered by the error boundary from #1. |
| 3 | medium | Unknown routes fail silently: `#/nonsense` renders the Overview with no nav item highlighted; `#/outcome/xyz` shows the first outcome. | Sweep, route `badroute`. | Render a not-found card and `replaceState` to a valid route. |
| 4 | medium | The year filter applies on programme and project pages but the filter bar is hidden there, so "As of 2025" cannot be changed without leaving the page. | `App.tsx` hides the bar for those routes. | Show a compact year control on detail pages. |
| 5 | medium | Outcome and programme achievement average indicator ratios without a cap, so one over-achieving indicator (clean cooking at 120 %, individual rows up to 192 %) lifts the average and the status above what the others justify. | `model.ts` `outcomeAchievement`. | Cap each indicator at 100 % in the average (keep the raw figure on the tile) and say so in Methodology. |
| 6 | medium | First-year delta: tiles show "+3 619 vs previous year" in 2020 because the previous value is treated as zero. | OutcomePage tile; Overview already guards it. | Hide the delta when no previous year exists. |
| 7 | medium | Map "Programmes" metric colours countries with zero programmes in the lightest ramp step while the legend says grey means none. | Overview map data keeps value 0 for that metric. | Filter zero values for every metric. |
| 8 | medium | Carbon bands are summed linearly across records (overstates width) and per-record targets double-count the five duplicated rows flagged by data quality. | `model.ts` `co2Aggregate`. | Document the conservative band rule or combine in quadrature; de-duplicate targets per programme × indicator in the pipeline. |
| 9 | medium | Context value and actions are rebuilt every render, so every consumer re-renders on any state change and the year "play" interval is re-created each tick; several heavy loops (outcome trends, climate aggregates, map data) run unmemoised. | `state.tsx`, Overview, Climate. | `useCallback`/`useMemo` the context; memoise the per-page aggregates. |
| 10 | low | Footer shows only the warnings count even when errors exist; `net ÷ anticipated` becomes Infinity if the headline constant is 0; dates use the browser locale rather than the chosen language. | App, Quality. | Small guards; pass the locale. |

### 2.2 Accessibility (WCAG 2.1 AA)

| # | Sev. | Finding | Evidence | Fix |
|---|---|---|---|---|
| 11 | high | Progress meters have no accessible name, and when the value is unknown they lack the required `aria-valuenow`; screen readers announce an unlabeled meter dozens of times per page. | axe: `aria-meter-name` on every page, `aria-required-attr` on programme pages (up to 15 meters per page). | Give `Meter`/`MiniMeter` an `aria-label` built from the row label and value; omit `role=meter` when the value is null. |
| 12 | high | Muted text fails contrast: `--muted #898781` on white is about 3.4:1 and is used for 12 px captions, filter labels and every chart axis label; the ⌘K hint in the dark header fails on every page; category tabs for unreported outcomes are faded to 60 % opacity, which also fails. | axe `color-contrast`: 12–74 nodes per page in light mode, 322 hits on the ⌘K hint across the sweep. | Introduce `--ink-3` (about 5:1) for text, keep `--muted` for decoration; restyle the kbd hint; signal "not reported" with text, not opacity. |
| 13 | medium | Chart interactions are mouse-only: canvas charts are images, bar and treemap clicks navigate with no keyboard equivalent, and the table twins have no links. | Chart, Overview, OutcomePage. | Make programme names in table twins links; add an "open" action to tooltips' table rows. |
| 14 | medium | Command palette and multi-selects: `aria-expanded` always true, no `aria-activedescendant`, options without ids, focus not returned to the trigger on close. | Shell. | Standard combobox wiring; restore focus. |
| 15 | medium | The skip link is never visible to sighted keyboard users (`.sr-only` has no focus rule). | styles.css. | `.sr-only:focus-visible` reveals it. |
| 16 | medium | Tiny click targets: the programme timeline bars are 12 px tall buttons; table sort buttons and chart tool buttons are under 24 px. | Sweep: 12–59 small targets per page. | Minimum 24 × 24 px hit areas (padding, not visual size). |
| 17 | low | Outcome tabs use `role=tablist` without panels or arrow-key handling. | OutcomePage. | Use plain links styled as tabs. |

### 2.3 Layout and responsiveness

| # | Sev. | Finding | Evidence | Fix |
|---|---|---|---|---|
| 18 | high | Horizontal overflow on phones: Outcome page 170 px, Methodology 95 px, Climate 7 px. The ranking selector with five indicator buttons and wide tables push past the viewport. | Sweep at 390 px. | Scrollable segment controls with fade edges; tables wrapped in their own scroll container; `overflow-x: clip` on the page. |
| 19 | high | On phones the indicator tiles are forced into two narrow columns, so names, codes and tier badges wrap into unreadable stacks; outcome cards truncate indicator names to a few letters. | Mobile screenshots of Outcome and Overview. | One column below 480 px; drop the tier badge into a second line; allow two-line indicator names. |
| 20 | medium | The sticky header plus a filter bar that wraps to three rows eat about 40 % of a small phone screen. | Mobile Overview. | Unstick the filter bar below 560 px, or collapse it to a single "Filters" button with a sheet. |
| 21 | medium | Card headers collide with their controls at narrow widths (map card title beside the ha / programmes / CO₂ segment). | Mobile Overview. | Stack title and controls below 700 px. |
| 22 | low | Treemap and 10-row ranking charts are hard to read on phones. | Mobile Overview. | Replace with a horizontal bar list on small screens. |

### 2.4 Content, language and consistency

| # | Sev. | Finding | Fix |
|---|---|---|---|
| 23 | medium | French gaps: "Ledger", "Year", "Outcome", "Total (ha)", "Module", "System", "Map metric", "Menu", "Main", "Filters", not-found messages, palette hints and chart labels are English only; sub-category names, outcome scopes, activity names, MPTF statuses and data-quality titles have no French at all. | Route every string through `t()`; add French columns to the reference workbook for sub-categories, scopes and activities; translate quality titles in the pipeline. |
| 24 | medium | Terminology drifts: Outcome vs Category; Ongoing vs "On Going" vs active; Removals vs Absorbed; "déclaré" vs "renseigné". | One glossary, applied in i18n and the pipeline. |
| 25 | low | Two constants still lack a source on the Overview (direct beneficiaries, anticipated portfolio CO₂). | Add the source or demote them to a footnote until sourced. |

### 2.5 Pipeline and carbon engine

| # | Sev. | Finding | Evidence | Fix |
|---|---|---|---|---|
| 26 | high | Monte Carlo bands are mis-centred: percentiles are divided by the draw mean and then applied to the central value. Where a distribution is clipped (fNRB with large standard deviations in Gabon and Congo) the draw mean is far from the central value, so the published band is wrong. | ENR-01 in Gabon: central 1.33, draw mean 3.24; published p5–p95 0.06–4.65, true draw percentiles 0.15–11.3. | Divide by the central per-unit value, and replace clipped normals by beta or truncated distributions for fractions (fNRB, usage, savings). |
| 27 | high | The engine treats every series as a cumulative stock, but the standard marks AGR-01 and CLM-02 as annual flows and ENR-02/03 as "not summed". A flow series that goes down triggers a false "cumulative drop" warning and a false reversal, and the soil-carbon cohorts age as if the same hectares persisted. Real data are monotonic today, so this is latent. | Probe with AGR-01 500/300/500. | Carry the measurement type from the reference workbook; skip drop and reversal logic for flows; decide and document whether the sheet stores cumulated flows (README says results are cumulative) and build cohorts accordingly. |
| 28 | high | CLM-02 ingestion contract undefined: the engine reads the carried value as hectares per year, but in a cumulative sheet the value grows every year and effectiveness collapses to zero while the record is labelled ex post. | Probe with cumulative 3/6/9 ha against a 7 ha/yr baseline: effectiveness 0.57 → 0.14 → 0. | Difference the series year on year when it is cumulative, validate the unit, and state the entry rule for CLM-02 in the indicator note. |
| 29 | medium | Bands depend on row order because one random generator is shared across keys; adding a programme or reordering rows changes every band. | FOR-02 band 0.536–1.509 when drawn first, 0.526–1.528 when drawn after another key. | Seed the generator per key. |
| 30 | medium | The tier shown on a record is the best factor's tier, not the weakest: ENR-01 shows Tier 2 while usage and savings are Tier 1 defaults. | Verified. | Use the minimum tier. |
| 31 | medium | An empty or header-only sheet builds and deploys an empty dashboard with exit code 0. | Code path in `read_workbook`. | Error when no data rows remain; check the content type before a SharePoint download overwrites the committed workbook. |
| 32 | medium | Programme names differing only by case become two programmes with the same id; partners and outcomes are case-merged, programmes are not. | Probe confirmed. | Canonicalise programme names like partners and assert slug uniqueness. |
| 33 | low | `mptf-missing` fires for every linked id when no project list is given; the baseline-label regex for CLM-02 also matches "observée vs référence"; both `defor_rate` and `effectiveness_default` disappear from the defaults list once CLM-02 exists although the rate still sets the baseline; duplicate normalised headers crash with a traceback; unit aliases miss "ha" and plurals. | Audit probes. | Small guards and an explicit keyword list for baseline rows. |
| 34 | low | Documentation drift: the methodology document lists factor ids and files that do not exist and promises correlated draws and a conservativeness deduction that are not implemented; `headline.yml` still publishes a 168 Mt "anticipated CO₂" constant next to the engine's 11 Mt; programme names in strata and overrides are not validated against the workbook. | Read-through. | Regenerate section 6 of the methodology from the library; either implement or remove the two promised features; source or retire the headline constant; validate programme names at build time. |

Test gaps: empty sheet, programme case variants, flow indicators, band centring and order independence, the reversal-above-buffer warning, duplicate headers, SharePoint fetch failures; one test reads the real output directory and depends on test order.

## 3. Proposed fix plan

Four pull requests, in order, each one shippable on its own.

1. **Robustness and accessibility (about a day).** #1 error boundary and hash guard, #2 safe lookups, #3 not-found routes, #11 meter names, #12 contrast tokens and kbd hint, #15 skip link, #16 hit areas, #6, #7, #10. Add a Playwright smoke test that loads every page at three widths and fails on console errors, horizontal overflow and axe violations, so this cannot regress.
2. **Mobile layout (about a day).** #18–#22: scrollable segments, single-column tiles, collapsible filter bar, stacked card headers, phone-friendly chart variants.
3. **Carbon engine corrections (about a day).** #26 band centring and fraction distributions, #29 per-key seeds, #30 tier, #27–#28 flow and CLM-02 contract with a decision recorded in the methodology, #34 documentation regeneration and the headline constant. These change published bands, so they ship with a note on the Climate page.
4. **Method, language and pipeline hygiene (about a day).** #4 year control on detail pages, #5 capped averages with a Methodology note, #8 band and target handling in the dashboard, #9 memoisation, #23–#24 French and glossary, #31–#33 pipeline guards, and the missing tests.

## 4. Design direction: from dashboard to publication

### 4.1 Diagnosis

The current look is a competent generic analytics dashboard: a hero photo with glass tiles, a grid of white cards, pills everywhere, small grey captions, legends on every chart. It reads as software, not as the authoritative results publication of a multi-donor fund. Three things hold it back: there is no hierarchy of importance (every card is the same weight), numbers are shown without their story (what changed, why it matters, how sure we are), and trust signals (source, method, quality, claims) are scattered rather than attached to each figure.

### 4.2 Principles

1. **Editorial hierarchy.** The home page reads top-down like a briefing: one headline sentence, five key figures with their uncertainty, three generated insights about what changed, then exploration.
2. **Every figure carries its provenance.** A figure component with title, subtitle, note, source rows and method link; data-quality dots on numbers that have open warnings; ex ante / ex post on every carbon number.
3. **Calm, institutional surface.** Warm paper background, hairline rules instead of nested boxes, no shadows, one accent, category colours only where they encode meaning.
4. **Numbers first.** Tabular figures, large display numerals with muted units, bullet charts instead of progress meters, direct labels instead of legends, dot plots with uncertainty instead of plain bars.
5. **Mobile is a first-class layout, not a squeezed desktop.** Single column, collapsible filters, chart variants chosen per width.

### 4.3 Visual system

- **Type.** A display sans with tight tracking for numbers and headings (Inter Tight), an editorial serif for titles and narrative (Newsreader), a mono for codes and the ⌘K hint (IBM Plex Mono). All numerals tabular.
- **Colour.** Paper `#f7f6f2`, ink `#101c1a`, two greys with AA contrast for text, brand teal `#0a5a63` from CAFI's identity (the workbook's `#068290` as the lighter step), one accent `#0c9a8a`. The eight category hues stay (they pass the colour-blind checks) but are used at full strength only on marks, never as card backgrounds. Dark mode is a designed inverse palette, not a dimmed copy.
- **Layout.** 1280 px content column, 8-pt spacing scale, sections separated by rules and generous whitespace, cards reserved for figures. A persistent context bar under the header carries the year scrubber, filters and the ex ante / ex post basis.
- **Navigation.** Grouped: Results (Overview, Outcomes, Programmes), Finance (Portfolio), Climate (Carbon), Data (Quality, Method). A "Brief" action opens the presentation view.

### 4.4 Components and charts

- **Key-figure strip** replacing the hero tiles: value, unit, delta, sparkline or uncertainty band, data-quality dot.
- **Insight blocks** generated at build time from the data (largest gain, programmes off pace, what changed in the method), each linking to the rows behind it.
- **Bullet-chart table** for outcomes: achievement bar, expected-pace band, target tick, indicator count, trend, status. Replaces six cards with meters and sparklines.
- **Proportional-symbol map** with direct country labels and an inset for small countries, instead of a choropleth that hides everything but DR Congo.
- **Dot plots with bands** for rankings; slope charts for year-on-year change; small multiples for trajectories.
- **Figure footer** on every chart: note, source rows link, method link, export tools.
- **Status chips with icons and words**, never colour alone; tier and requirement badges unified in one chip system.

A rendered mockup of the Overview in this direction (desktop and phone) accompanies this document.

### 4.5 Features that make it feel advanced

1. **Briefing mode**: a full-screen, keyboard-driven walk through the five key figures and three insights, for board meetings; exports to PDF.
2. **Programme fact sheet**: a one-page PDF per programme (results, funding, expected indicators, carbon with bands, data-quality items) generated from the same data.
3. **Compare**: two programmes or two years side by side, with differences highlighted.
4. **Sensitivity view on Climate**: drag any factor within its published range and watch the ledgers respond; makes the uncertainty tangible and the defaults debatable in the open.
5. **What changed since the last refresh**: a diff of metrics.json between builds (git history is already there) listing new rows, revised values and status changes.
6. **Annotations**: short notes by the M&E team attached to a programme or indicator, stored in a YAML file, shown as footnotes on figures.
7. **Keyboard-complete charts**: every chart's table twin is navigable and linkable, so no interaction depends on a mouse.

### 4.6 Phasing

- **Phase A (foundation, 2–3 days):** tokens, type, context bar, figure component, key-figure strip, bullet-chart table, grouped navigation, mobile layouts. Delivered together with fix PR 2 above since both touch layout.
- **Phase B (charts, 2 days):** proportional map, dot plots with bands, slope charts, small multiples, chart style guide applied everywhere.
- **Phase C (features, 3–4 days):** insights generator in the pipeline, briefing mode, fact-sheet PDF, compare, sensitivity view, change log.
