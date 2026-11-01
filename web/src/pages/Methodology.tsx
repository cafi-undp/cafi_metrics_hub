import { useState } from "react";
import { useApp } from "../lib/state";
import { t } from "../lib/i18n";
import { CatalogueTable } from "./OutcomePage";

export function Methodology() {
  const { m, lang } = useApp();
  const fr = lang === "fr";
  const [only, setOnly] = useState<"all" | "reported">("all");
  const [tier, setTier] = useState("");
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("Built from")} {m.meta.source} · {m.meta.recordCount} {t("rows")}</div>
          <h1>{t("Methodology")}</h1>
        </div>
      </div>
      <div className="grid g-2">
        <section className="card">
          <h3>{fr ? "Comment lire les chiffres" : "How to read the numbers"}</h3>
          <ul className="small ink-2" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {fr ? (
              <>
                <li>Les résultats sont <b>cumulés</b> : la valeur d'une année est le total atteint depuis le début du projet. Les années ne s'additionnent jamais.</li>
                <li>Si une année n'est pas encore déclarée, la dernière valeur déclarée est reprise.</li>
                <li><b>Taux d'atteinte</b> = Σ résultats / Σ cibles, sur les lignes qui ont une cible. Le taux d'un résultat est la moyenne de ses indicateurs.</li>
                <li>Les valeurs d'unités différentes (ha, nombre, km) ne sont jamais additionnées.</li>
                <li>« Hectares plantés, restaurés ou protégés » regroupe les indicateurs {m.meta.areaIndicators.join(", ")} ; la superficie sous plans d’aménagement (LUT-02) est exclue car elle recoupe les autres.</li>
                <li><b>Statut</b> : le taux d'atteinte est comparé à la part de la période du projet déjà écoulée (≥ 90 % de l'attendu : en bonne voie ; ≥ 50 % : en retard ; sinon hors trajectoire).</li>
              </>
            ) : (
              <>
                <li>Results are <b>cumulative</b>: a year's value is the total reached since the project started. Years are never added together.</li>
                <li>When a year has not been reported yet, the latest reported value is carried forward.</li>
                <li><b>Achievement</b> = Σ results / Σ targets, over rows that have a target. An outcome's achievement is the average of its indicators.</li>
                <li>Values in different units (ha, count, km) are never added together.</li>
                <li>"Hectares planted, restored or protected" covers indicators {m.meta.areaIndicators.join(", ")}; area under land-use plans (LUT-02) is left out because it overlaps the others.</li>
                <li><b>Status</b> compares achievement with the share of the project period that has elapsed (≥ 90 % of expected: on track; ≥ 50 %: behind; otherwise off track).</li>
              </>
            )}
          </ul>
        </section>
        <section className="card">
          <h3>{fr ? "Carbone" : "Carbon"}</h3>
          <ul className="small ink-2" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {fr ? (
              <>
                <li>Méthode {m.carbon.method} : <b>deux registres</b>, jamais compensés l'un par l'autre. <b>Inventaire</b> = variations de stock de carbone dans le périmètre (logique GHG Protocol Land Sector &amp; Removals). <b>Intervention</b> = bénéfice net vs un scénario de référence, après fuites et tampon de non-permanence (ISO 14064-2, méthodologies approuvées CCP : VM0047, VM0048, TPDDTEC v4 / VM0050).</li>
                <li>Chaque hausse annuelle d'un indicateur crée une <b>cohorte</b> qui accumule du carbone jusqu'à un plafond ; les systèmes récoltés (plantations bois-énergie, agroforesterie) sont crédités au <b>stock moyen à long terme</b> (moitié du pic).</li>
                <li><b>Attendu (cycle complet)</b> = stock en place × valeur unitaire sur 20 ans ; <b>réalisé à date</b> = somme des cohortes à leur âge. Bandes p5–p95 par Monte Carlo ({m.carbon.draws} tirages) sur les incertitudes GIEC.</li>
                <li>Carbone du sol (indicatif) et bois-énergie déplacé (potentiel) sont affichés à part. Paramètres, sources et niveaux (Tier) : page Impact climatique et <code>docs/carbon-methodology.md</code>.</li>
              </>
            ) : (
              <>
                <li>Method {m.carbon.method}: <b>two ledgers</b>, never netted against each other. <b>Inventory</b> = carbon stock changes within the boundary (GHG Protocol Land Sector &amp; Removals logic). <b>Intervention</b> = net benefit against a baseline, after leakage and a non-permanence buffer (ISO 14064-2; CCP-approved methodologies VM0047, VM0048, TPDDTEC v4 / VM0050).</li>
                <li>Each year's increase of an indicator is a <b>cohort</b> that accumulates carbon up to a cap; harvested systems (wood-energy plantations, agroforestry) are credited at the <b>long-term average stock</b> (half the peak).</li>
                <li><b>Expected (full cycle)</b> = stock in place × per-unit value over 20 years; <b>realised to date</b> = sum of the cohorts at their age. p5–p95 bands by Monte Carlo ({m.carbon.draws} draws) over the IPCC uncertainties.</li>
                <li>Soil carbon (indicative) and displaced fuelwood (potential) are shown apart. Parameters, sources and tiers: Climate impact page and <code>docs/carbon-methodology.md</code>.</li>
              </>
            )}
          </ul>
        </section>
      </div>
      <section className="section">
        <div className="grid g-2">
          <section className="card">
            <h3>{t("Projects and expected indicators")}</h3>
            <ul className="small ink-2" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
              {fr ? (
                <>
                  <li>Chaque projet MPTF est classé dans le classeur de référence (onglets 12–15) par <b>type</b> (habilitant, AFOLU / intégré, PSE, secteur privé, préparatoire, appui) et par <b>activités</b>.</li>
                  <li><b>Obligatoire</b> = indicateur marqué M pour l'un des types du projet (un PIREDD est AFOLU + PSE et cumule les deux). Les activités déclenchent les indicateurs T1/T2 comme <b>requis</b> et les T3 comme <b>facultatifs</b>.</li>
                  <li>Les subventions préparatoires n'ont pas d'indicateur obligatoire, seulement ceux de leurs activités ; les lignes d'appui / coûts directs n'en ont aucun.</li>
                  <li>« Renseigné » = le projet, via son lien MPTF (config/programmes.yml), a au moins une ligne pour ce code dans ProjectData.xlsx. Les écarts sont listés sur la page Qualité des données.</li>
                </>
              ) : (
                <>
                  <li>Each MPTF project is classified in the reference workbook (tabs 12–15) by <b>type</b> (enabling, AFOLU / integrated, PES, private sector, preparatory, support) and by <b>activities</b>.</li>
                  <li><b>Mandatory</b> = indicator flagged M for one of the project's types (a PIREDD is AFOLU + PES and gets both). Activities trigger T1/T2 indicators as <b>required</b> and T3 indicators as <b>optional</b>.</li>
                  <li>Preparatory grants have no mandatory indicator, only those triggered by their activities; support / direct-cost lines have none.</li>
                  <li>"Reported" = the project, through its MPTF link (config/programmes.yml), has at least one row for that code in ProjectData.xlsx. Gaps are listed on the Data quality page.</li>
                </>
              )}
            </ul>
          </section>
          <section className="card">
            <h3>{t("Activities")}</h3>
            <div className="small ink-2" style={{ display: "grid", gap: 4 }}>
              {m.activities.map((a) => (
                <div key={a.code} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>{a.name}</span><span className="muted num" style={{ textAlign: "right" }}>{a.indicators.join(", ")}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <h2>{t("Standard indicators")}</h2>
            <p className="muted small">
              {m.indicators.filter((i) => i.reported).length} / {m.indicators.length} {t("standard indicators reported")} ·
              {" "}config/reference/CAFI_Standard_Indicators_MetricsHub.xlsx
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="seg" role="group" aria-label={t("Reported")}>
              {(["all", "reported"] as const).map((k) => (
                <button key={k} aria-pressed={only === k} onClick={() => setOnly(k)}>{k === "all" ? t("All") : t("Reported")}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label={t("Tier")}>
              {["", "T1", "T2", "T3"].map((k) => (
                <button key={k} aria-pressed={tier === k} onClick={() => setTier(k)}>{k || t("All")}</button>
              ))}
            </div>
          </div>
        </div>
        <CatalogueTable showCategory
          rows={m.indicators.filter((i) => (only === "all" || i.reported) && (!tier || i.tier === tier))} />
        <p className="xsmall muted" style={{ marginTop: 8 }}>
          {fr
            ? "T1 = socle commun (tous les projets) · T2 = indicateur phare thématique · T3 = complémentaire. Les données de ProjectData.xlsx utilisent encore l’ancienne numérotation (01–14) ; elles sont recodées via config/indicators.yml."
            : "T1 = universal core (every project) · T2 = thematic headline · T3 = supplementary. ProjectData.xlsx still uses the old numbering (01–14); rows are re-coded through config/indicators.yml."}
        </p>
      </section>
    </>
  );
}
