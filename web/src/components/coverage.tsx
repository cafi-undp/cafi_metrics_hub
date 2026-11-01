// Project ↔ standard-indicator coverage: which indicators a project is expected
// to report (reference workbook, tabs 12-14) and which its programme(s) report.
import { useApp } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { withUnit } from "../lib/format";
import { outcomeVar } from "../lib/colors";
import { valueAt, type CoverageRow } from "../lib/model";
import type { Requirement } from "../lib/types";
import { DataTable, type Column } from "./ui";
import { TierBadge } from "../pages/OutcomePage";

export const REQ_META: Record<Requirement, { label: string; cls: string }> = {
  mandatory: { label: "Mandatory", cls: "req-m" },
  required: { label: "Required by activity", cls: "req-r" },
  optional: { label: "Optional", cls: "req-o" },
};

export function RequirementBadge({ r, basis }: { r: Requirement; basis?: string }) {
  return <span className={`pill req ${REQ_META[r].cls}`} title={basis}>{t(REQ_META[r].label)}</span>;
}

/** English labels for the carbon claims register statuses and engine modules (translated through t()). */
export const CLAIM_LABEL: Record<string, string> = {
  cafi_contribution: "CAFI contribution",
  national_programme: "National programme (FREL / ERPA)",
  corporate_inventory: "Corporate inventory (Scope 3)",
  inset_unit: "Inset unit",
  credit: "Carbon credit",
  article6: "Article 6 (corresponding adjustment)",
};
export const MODULE_LABEL: Record<string, string> = {
  arr: "ARR (planting / regeneration)",
  redd: "REDD (avoided deforestation)",
  alm: "ALM (soil carbon)",
  cooking: "Clean cooking",
};
export const claimLabel = (s: string) => t(CLAIM_LABEL[s] ?? s);
export const moduleLabel = (s: string) => t(MODULE_LABEL[s] ?? s);

/** Short label for the workbook's project types ("Preparatory / feasibility grant" → "Preparatory"). */
export function typeShort(type: string | null): string {
  if (!type) return "–";
  return type.replace(/\s*\(.*\)$/, "").replace("Preparatory / feasibility grant", "Preparatory").replace("Support / direct cost", "Support");
}

/** Expected indicators with requirement and what is reported as of the selected year. */
export function CoverageTable({ rows, yi, showProgrammes = false }: { rows: CoverageRow[]; yi: number; showProgrammes?: boolean }) {
  const { m, ix, navigate, lang } = useApp();
  const value = (r: CoverageRow) => r.records.reduce((s, x) => s + (valueAt(x.values, yi) ?? 0), 0);
  return (
    <DataTable rows={rows} maxHeight={600}
      onRowClick={(r) => { if (r.reported) navigate({ page: "outcome", id: ix.indicators.get(r.code)!.outcome }); }}
      cols={[
        { key: "c", label: t("Code"), value: (r) => r.code, width: 80 },
        { key: "n", label: t("Indicator"), value: (r) => nameOf(ix.indicators.get(r.code)!),
          render: (r) => <span title={ix.indicators.get(r.code)!.description}>{nameOf(ix.indicators.get(r.code)!)}</span> },
        { key: "o", label: t("Category"), value: (r) => nameOf(m.outcomes.find((o) => o.id === ix.indicators.get(r.code)!.outcome)!),
          render: (r) => {
            const o = m.outcomes.find((x) => x.id === ix.indicators.get(r.code)!.outcome)!;
            return <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i className="dot" style={{ background: outcomeVar(m, o.id) }} />{nameOf(o)}</span>;
          } },
        { key: "t", label: t("Tier"), value: (r) => ix.indicators.get(r.code)!.tier, render: (r) => <TierBadge tier={ix.indicators.get(r.code)!.tier} /> },
        { key: "q", label: t("Requirement"), value: (r) => r.requirement, render: (r) => <RequirementBadge r={r.requirement} basis={r.basis} /> },
        { key: "b", label: t("Basis"), value: (r) => r.basis.replace(/^(Type|Activity): /, (_, k) => `${t(k)}: `) },
        ...(showProgrammes ? [{
          key: "p", label: t("Project"),
          value: (r: CoverageRow) => [...new Set(r.records.map((x) => ix.programmes.get(x.programme)?.name ?? ""))].join(", "),
        }] : []),
        { key: "r", label: t("Reported"), numeric: true, value: (r) => (r.reported ? value(r) : null),
          render: (r) => r.reported
            ? <span className="status" style={{ justifyContent: "flex-end" }}>
                <span style={{ color: "var(--good)", display: "inline-flex" }}>●</span>
                {withUnit(value(r), ix.indicators.get(r.code)!.unit, lang, true)}
                <span className="muted xsmall">· {r.records.length} {t("rows")}</span>
              </span>
            : <span className="muted">–</span> },
      ] as Column<CoverageRow>[]} />
  );
}
