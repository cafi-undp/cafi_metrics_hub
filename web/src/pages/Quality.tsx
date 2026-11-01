import { useApp } from "../lib/state";
import { t } from "../lib/i18n";
import { DataTable, download, toCsv, type Column } from "../components/ui";
import { IconAlert, IconDownload, IconError, IconInfo, IconRight } from "../components/icons";
import type { QualityCheck, QualityItem } from "../lib/types";

const SEV = {
  error: { label: "Errors", color: "var(--critical)", Icon: IconError },
  warning: { label: "Warnings", color: "var(--warning)", Icon: IconAlert },
  info: { label: "Notes", color: "var(--neutral)", Icon: IconInfo },
} as const;

const qualityCols = (): Column<QualityItem>[] => [
  { key: "row", label: t("Row"), numeric: true, value: (i) => i.row ?? null },
  { key: "programme", label: t("Project"), value: (i) => i.programme ?? "" },
  { key: "indicator", label: t("Indicator"), value: (i) => i.indicator ?? i.field ?? "" },
  { key: "detail", label: t("Detail"), value: (i) => i.detail ?? i.value ?? "" },
];

export function Quality() {
  const { q, lang } = useApp();
  if (!q) return <div className="card empty" style={{ marginTop: 24 }}>{t("The data-quality report is not available.")}</div>;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("Data refreshed")} {new Date(q.generatedAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB")} · {q.source}</div>
          <h1>{t("Data quality checks")}</h1>
          <p>{t("Every refresh of the workbook is checked before publishing. Errors stop the publication; warnings and notes are listed here so they can be fixed at the source.")}</p>
        </div>
        <div className="q-sum">
          {(Object.keys(SEV) as (keyof typeof SEV)[]).map((s) => {
            const { Icon } = SEV[s];
            return (
              <div className="q-badge" key={s}>
                <span style={{ color: SEV[s].color, display: "inline-flex" }}><Icon width={18} height={18} /></span>
                <b>{q.summary[s]}</b><span className="ink-2">{t(SEV[s].label)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {q.checks.map((c) => <CheckBlock key={c.id} c={c} />)}
    </>
  );
}

function CheckBlock({ c }: { c: QualityCheck }) {
  const { Icon, color } = SEV[c.severity];
  return (
    <details className="q" open={c.severity !== "info"}>
      <summary>
        <span style={{ color, display: "inline-flex" }}><Icon width={18} height={18} /></span>
        <div>
          <b>{c.title}</b> <span className="pill" style={{ marginLeft: 6 }}>{c.count}</span>
          <div className="small ink-2">{c.description}</div>
        </div>
        <span className="chev"><IconRight /></span>
      </summary>
      <div className="body">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="link-btn" onClick={() => download(`quality-${c.id}.csv`, toCsv(qualityCols(), c.items))}>
            <IconDownload width={14} height={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />{t("Download CSV")}
          </button>
        </div>
        <DataTable cols={qualityCols()} rows={c.items} maxHeight={320} />
      </div>
    </details>
  );
}
