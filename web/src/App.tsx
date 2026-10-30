import { useEffect, useState } from "react";
import { useApp } from "./lib/state";
import { t } from "./lib/i18n";
import { CommandPalette, FilterBar, Header } from "./components/Shell";
import { Overview } from "./pages/Overview";
import { OutcomePage } from "./pages/OutcomePage";
import { Programmes } from "./pages/Programmes";
import { Portfolio } from "./pages/Portfolio";
import { ProgrammeDetail } from "./pages/ProgrammeDetail";
import { Climate } from "./pages/Climate";
import { Quality } from "./pages/Quality";
import { Methodology } from "./pages/Methodology";

export function App() {
  const { route, m, q } = useApp();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (e.key === "/" && !(e.target as HTMLElement).closest("input, textarea")) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showFilters = !["quality", "methodology", "programme"].includes(route.page);
  let page;
  switch (route.page) {
    case "outcome": page = <OutcomePage id={route.id ?? (m.outcomes.find((o) => m.indicators.some((i) => i.reported && i.outcome === o.id)) ?? m.outcomes[0]).id} />; break;
    case "programmes": page = <Programmes />; break;
    case "portfolio": page = <Portfolio />; break;
    case "programme": page = <ProgrammeDetail id={route.id ?? ""} />; break;
    case "climate": page = <Climate />; break;
    case "quality": page = <Quality />; break;
    case "methodology": page = <Methodology />; break;
    default: page = <Overview />;
  }

  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <Header onSearch={() => setPalette(true)} />
      <main id="main">
        {showFilters && <FilterBar />}
        {route.page === "" ? page : <div key={route.page + (route.id ?? "")} style={{ animation: "fade .25s" }}>{page}</div>}
      </main>
      <footer className="footer">
        <span>CAFI Metrics Hub · {t("Data refreshed")} {new Date(m.meta.generatedAt).toLocaleDateString()} · {t("Source")}: {m.meta.source}</span>
        <span>
          {q && (q.summary.warning + q.summary.error > 0) && <>{q.summary.warning} {t("Warnings").toLowerCase()} · </>}
          <a href="#/quality">{t("Data quality")}</a> · <a href="#/methodology">{t("Methodology")}</a>
        </span>
      </footer>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </>
  );
}
