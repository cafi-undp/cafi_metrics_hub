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
                <li>Les résultats sont <b>cumulés</b> : la valeur d'une année est le total atteint depuis le début du programme. Les années ne s'additionnent jamais.</li>
                <li>Si une année n'est pas encore déclarée, la dernière valeur déclarée est reprise.</li>
                <li><b>Taux d'atteinte</b> = Σ résultats / Σ cibles, sur les lignes qui ont une cible. Le taux d'un résultat est la moyenne de ses indicateurs.</li>
                <li>Les valeurs d'unités différentes (ha, nombre, km) ne sont jamais additionnées.</li>
                <li>« Hectares plantés, restaurés ou protégés » regroupe les indicateurs {m.meta.areaIndicators.join(", ")} ; la superficie sous plans d’aménagement (LUT-02) est exclue car elle recoupe les autres.</li>
                <li><b>Statut</b> : le taux d'atteinte est comparé à la part de la période du programme déjà écoulée (≥ 90 % de l'attendu : en bonne voie ; ≥ 50 % : en retard ; sinon hors trajectoire).</li>
              </>
            ) : (
              <>
                <li>Results are <b>cumulative</b>: a year's value is the total reached since the programme started. Years are never added together.</li>
                <li>When a year has not been reported yet, the latest reported value is carried forward.</li>
                <li><b>Achievement</b> = Σ results / Σ targets, over rows that have a target. An outcome's achievement is the average of its indicators.</li>
                <li>Values in different units (ha, count, km) are never added together.</li>
                <li>"Hectares planted, restored or protected" covers indicators {m.meta.areaIndicators.join(", ")}; area under land-use plans (LUT-02) is left out because it overlaps the others.</li>
                <li><b>Status</b> compares achievement with the share of the programme period that has elapsed (≥ 90 % of expected: on track; ≥ 50 %: behind; otherwise off track).</li>
              </>
            )}
          </ul>
        </section>
        <section className="card">
          <h3>{fr ? "Carbone" : "Carbon"}</h3>
          <ul className="small ink-2" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            {fr ? (
              <>
                <li><b>Engagées (cycle complet)</b> = résultat cumulé × facteur annuel × horizon (10 ou 15 ans).</li>
                <li><b>Réalisées à date</b> = chaque année, la superficie (ou les foyers) en place produit une année de bénéfice.</li>
                <li><b>Cible</b> = cible finale × facteur × même horizon que les résultats.</li>
                <li>Les facteurs sont dans <code>config/co2_factors.yml</code> et visibles sur la page Impact climatique.</li>
              </>
            ) : (
              <>
                <li><b>Committed (full cycle)</b> = cumulative result × annual factor × horizon (10 or 15 years).</li>
                <li><b>Realised to date</b> = each year, the area (or stoves) in place delivers one year of benefit.</li>
                <li><b>Target</b> = final target × factor × the same horizon as results.</li>
                <li>Factors live in <code>config/co2_factors.yml</code> and are listed on the Climate impact page.</li>
              </>
            )}
          </ul>
        </section>
      </div>
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
