import { useApp } from "../lib/state";
import { InfoTip } from "./ui";

/**
 * Plain-language explanation of each carbon figure, shown behind a small info icon.
 * Kept in one place so the Overview, Climate, programme and fact-sheet pages say the same thing.
 */
export type CarbonTerm = "net" | "band" | "removals" | "realised" | "expected" | "target" | "indicative" | "potential" | "emissions" | "ledgers";

const EN: Record<CarbonTerm, [string, string]> = {
  net: ["Net GHG benefit, expected, full cycle",
    "What the atmosphere is spared because these programmes happened, compared with the baseline without them. Everything in place as of the selected year is followed over the 20-year horizon: removals and avoided emissions, minus what the baseline would have done anyway, minus leakage (20 % for avoided deforestation, 5 % for cookstoves), minus a 20–25 % non-permanence buffer held back against fire and clearing. This is the intervention ledger, the figure a carbon standard would recognise as the claim. It stays ex ante until programmes report monitoring data (stove usage, fuel savings, observed deforestation), which replace the defaults."],
  band: ["p5–p95 band",
    "The 5th and 95th percentiles of 2,000 Monte Carlo draws over the uncertain inputs: growth rates, fraction of non-renewable biomass, stove usage, buffer. Nine times out of ten the true figure falls inside this range. \"Range\" on the Overview is the same band."],
  removals: ["Removals, inventory ledger",
    "Carbon physically added to trees and soil inside the programme boundary, with no baseline, no leakage and no buffer, the way a corporate GHG inventory reports it (GHG Protocol Land Sector and Removals guidance). Larger than the net benefit because nothing is subtracted. Reversals are booked beside it as emissions. The two ledgers are never added together or netted: one is a stock change, the other a claim against a counterfactual."],
  realised: ["Realised to date",
    "The same calculation, counting only the carbon accumulated so far. A hectare regenerating since 2019 has had six growing seasons; one planted this year has had none. \"Expected\" is what the same hectares reach at the end of the cycle; the gap between the two is time, not a shortfall."],
  expected: ["Expected (full cycle)",
    "The full-cycle value of everything already reported as of the selected year, over the 20-year horizon. It is not a forecast of future planting: hectares and devices that are not yet reported are not counted."],
  target: ["Programme targets, in carbon",
    "The programmes' own final targets for hectares, devices and protected areas, converted with the same factors and rules. It is what the portfolio would deliver if every indicator target were met; the percentage is the expected net benefit divided by it."],
  indicative: ["Indicative: soil carbon",
    "IPCC Tier 1 estimate of the soil carbon gained under improved cropping over the 20-year transition. Shown apart and never added to a headline, because no soil has been sampled; it enters a ledger only with sampling or a validated model."],
  potential: ["Potential: displaced fuelwood",
    "What harvested plantation and agroforestry wood could displace if it replaces charcoal from non-renewable biomass. It needs harvest and sales records to be claimed, so it is shown as a potential only and not added to any total."],
  emissions: ["Emissions booked (reversals)",
    "Carbon lost when a reported area shrinks or a fire or forest-loss alert hits a cohort. The inventory ledger reports it as an emission in the year observed; in the intervention ledger the non-permanence buffer absorbs it."],
  ledgers: ["Two ledgers",
    "Inventory ledger: stock changes inside the boundary, no baseline, no netting. Intervention ledger: net benefit against a baseline, after leakage and the non-permanence buffer. Both come from the same cohorts and are shown side by side, never combined."],
};

const FR: Record<CarbonTerm, [string, string]> = {
  net: ["Bénéfice net de GES, attendu, cycle complet",
    "Ce que l'atmosphère est épargnée parce que ces programmes ont eu lieu, par rapport au scénario de référence sans eux. Tout ce qui est en place à l'année sélectionnée est suivi sur l'horizon de 20 ans : absorptions et émissions évitées, moins ce que la référence aurait fait de toute façon, moins les fuites (20 % pour la déforestation évitée, 5 % pour les foyers améliorés), moins une réserve de non-permanence de 20 à 25 % retenue contre le feu et le défrichement. C'est le registre d'intervention, le chiffre qu'un standard carbone reconnaîtrait comme la créance. Il reste ex ante tant que les programmes n'ont pas déclaré de données de suivi (usage des foyers, économies de combustible, déforestation observée), qui remplacent les valeurs par défaut."],
  band: ["Bande p5–p95",
    "Les 5e et 95e centiles de 2 000 tirages Monte-Carlo sur les paramètres incertains : taux de croissance, fraction de biomasse non renouvelable, usage des foyers, réserve. Neuf fois sur dix, la vraie valeur se situe dans cet intervalle. « Fourchette » sur la vue d'ensemble désigne la même bande."],
  removals: ["Absorptions, registre d'inventaire",
    "Le carbone réellement ajouté aux arbres et aux sols à l'intérieur du périmètre du programme, sans référence, sans fuites ni réserve, comme le déclarerait un inventaire GES d'entreprise (guide Secteur des terres et absorptions du GHG Protocol). Plus grand que le bénéfice net parce que rien n'est soustrait. Les renversements sont comptabilisés à côté comme émissions. Les deux registres ne sont jamais additionnés ni compensés : l'un est une variation de stock, l'autre une créance contre un contrefactuel."],
  realised: ["Réalisé à date",
    "Le même calcul, en ne comptant que le carbone accumulé jusqu'ici. Un hectare en régénération depuis 2019 a connu six saisons de croissance ; un hectare planté cette année aucune. « Attendu » est ce que les mêmes hectares atteindront en fin de cycle ; l'écart entre les deux est du temps, pas un retard."],
  expected: ["Attendu (cycle complet)",
    "La valeur sur le cycle complet de tout ce qui est déjà déclaré à l'année sélectionnée, sur l'horizon de 20 ans. Ce n'est pas une prévision de plantations futures : les hectares et équipements non encore déclarés ne sont pas comptés."],
  target: ["Cibles des programmes, en carbone",
    "Les cibles finales des programmes eux-mêmes en hectares, équipements et surfaces protégées, converties avec les mêmes facteurs et règles. C'est ce que le portefeuille livrerait si chaque cible d'indicateur était atteinte ; le pourcentage est le bénéfice net attendu divisé par cette valeur."],
  indicative: ["Indicatif : carbone du sol",
    "Estimation IPCC de niveau 1 du carbone du sol gagné sous cultures améliorées sur la transition de 20 ans. Présentée à part et jamais ajoutée à un chiffre clé, car aucun sol n'a été échantillonné ; elle n'entre dans un registre qu'avec un échantillonnage ou un modèle validé."],
  potential: ["Potentiel : bois-énergie déplacé",
    "Ce que le bois récolté des plantations et de l'agroforesterie pourrait déplacer s'il remplace du charbon issu de biomasse non renouvelable. Il faut des relevés de récolte et de vente pour le revendiquer ; il est donc présenté comme potentiel seulement et n'est ajouté à aucun total."],
  emissions: ["Émissions comptabilisées (renversements)",
    "Le carbone perdu quand une surface déclarée diminue ou qu'une alerte feu ou perte de forêt touche une cohorte. Le registre d'inventaire le déclare comme émission l'année observée ; dans le registre d'intervention, la réserve de non-permanence l'absorbe."],
  ledgers: ["Deux registres",
    "Registre d'inventaire : variations de stock dans le périmètre, sans référence ni compensation. Registre d'intervention : bénéfice net contre une référence, après fuites et réserve de non-permanence. Les deux viennent des mêmes cohortes et sont présentés côte à côte, jamais combinés."],
};

export function carbonInfo(term: CarbonTerm, lang: string): { title: string; text: string } {
  const [title, text] = (lang === "fr" ? FR : EN)[term];
  return { title, text };
}

/** Small info icon that explains one carbon figure. */
export function CarbonTip({ term, light = false }: { term: CarbonTerm; light?: boolean }) {
  const { lang } = useApp();
  const { title, text } = carbonInfo(term, lang);
  return <InfoTip title={title} text={text} light={light} />;
}
