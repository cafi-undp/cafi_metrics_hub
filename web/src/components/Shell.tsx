import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { hrefFor, useApp, type Route } from "../lib/state";
import { nameOf, t } from "../lib/i18n";
import { outcomeVar } from "../lib/colors";
import {
  IconCheck, IconChevron, IconMenu, IconMoon, IconPause, IconPlay, IconSearch, IconSun,
} from "./icons";

const PAGES: { route: Route; label: string }[] = [
  { route: { page: "" }, label: "Overview" },
  { route: { page: "outcome" }, label: "Outcomes" },
  { route: { page: "programmes" }, label: "Projects" },
  { route: { page: "portfolio" }, label: "Portfolio" },
  { route: { page: "climate" }, label: "Climate impact" },
  { route: { page: "quality" }, label: "Data quality" },
  { route: { page: "methodology" }, label: "Methodology" },
  { route: { page: "brief" }, label: "Brief" },
];

export function Link({ to, children, className, ...rest }: { to: Route; children: ReactNode; className?: string; [k: string]: unknown }) {
  const { navigate, filters, m } = useApp();
  return (
    <a href={hrefFor(to, filters, m)} className={className} {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}>
      {children}
    </a>
  );
}

export function Header({ onSearch }: { onSearch: () => void }) {
  const { route, lang, setLangPref, theme, toggleTheme } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  return (
    <header className="header">
      <Link to={{ page: "" }} className="brand" aria-label="CAFI Metrics Hub — home">
        <img src="./cafi-logo.png" alt="" width={30} height={30} />
        <b>CAFI</b><span>Metrics Hub</span>
      </Link>
      <nav className={`nav ${open ? "open" : ""}`} aria-label={t("Main navigation")}>
        {PAGES.map((p) => (
          <Link key={p.label} to={p.route} aria-current={route.page === p.route.page ? "page" : undefined}>{t(p.label)}</Link>
        ))}
      </nav>
      <div className="header-tools">
        <button className="icon-btn search-btn" onClick={onSearch} aria-label={t("Open search")}>
          <IconSearch /><span className="txt">{t("Search…")}</span><span className="kbd">⌘K</span>
        </button>
        <button className="icon-btn" onClick={() => setLangPref(lang === "en" ? "fr" : "en")} aria-label={t("Language")}
          title={t("Language")}>
          {lang === "en" ? "FR" : "EN"}
        </button>
        <button className="icon-btn" onClick={toggleTheme} aria-label={t("Toggle theme")} title={t("Toggle theme")}>
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
        <button className="icon-btn menu-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t("Menu")}>
          <IconMenu />
        </button>
      </div>
    </header>
  );
}

// ───────────────────────── Multi-select combobox ─────────────────────────
interface Opt { id: string; label: string; meta?: string; color?: string }

function MultiSelect({ label, options, selected, onChange }: {
  label: string;
  options: Opt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = `ms-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const shown = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const summary = selected.length === 1 ? options.find((o) => o.id === selected[0])?.label : null;

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button ref={trigger} className="chip-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen((v) => !v)}>
        <span className="label">{label}</span>
        <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{summary ?? (selected.length ? "" : t("All"))}</span>
        {selected.length > 1 && <span className="count">{selected.length}</span>}
        <IconChevron />
      </button>
      {open && (
        <div className="popover" onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); close(); }
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter" && shown[active]) { e.preventDefault(); toggle(shown[active].id); }
        }}>
          <input ref={input} type="search" placeholder={t("Search…")} value={query} onChange={(e) => setQuery(e.target.value)}
            aria-label={`${t("Filter by")} ${label}`} role="combobox" aria-expanded aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={shown[active] ? `${listId}-${shown[active].id}` : undefined} />
          <ul className="option-list" role="listbox" id={listId} aria-multiselectable aria-label={label}>
            {shown.map((o, i) => (
              <li key={o.id} id={`${listId}-${o.id}`} className="option" role="option" aria-selected={selected.includes(o.id)} data-active={i === active}
                onMouseEnter={() => setActive(i)} onClick={() => toggle(o.id)}>
                <span className="check">{selected.includes(o.id) && <IconCheck />}</span>
                {o.color && <i className="dot" style={{ background: o.color }} />}
                <span>{o.label}</span>
                {o.meta && <span className="meta">{o.meta}</span>}
              </li>
            ))}
          </ul>
          <div className="popover-foot">
            <span className="muted xsmall" style={{ alignSelf: "center" }}>{selected.length} {t("selected")}</span>
            <button className="link-btn" onClick={() => onChange([])}>{t("Clear filters")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Filter bar ─────────────────────────
export function FilterBar({ yearOnly = false }: { yearOnly?: boolean }) {
  const { m, ix, filters, setFilters } = useApp();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const ys = m.meta.years;
    const id = setInterval(() => {
      const i = ys.indexOf(filters.year);
      if (i >= ys.length - 1) { setPlaying(false); return; }
      setFilters({ year: ys[i + 1] });
    }, 1100);
    return () => clearInterval(id);
  }, [playing, filters.year, m, setFilters]);

  const countByProg = (key: (p: (typeof m.programmes)[number]) => string[]) => {
    const c = new Map<string, number>();
    m.programmes.forEach((p) => key(p).forEach((k) => c.set(k, (c.get(k) ?? 0) + 1)));
    return c;
  };
  const cCount = countByProg((p) => [p.country]);
  const pCount = countByProg((p) => p.partners);
  const any = filters.countries.length + filters.partners.length + filters.programmes.length > 0;

  // Programme options narrow to the chosen countries / partners.
  const progOpts = m.programmes
    .filter((p) => (!filters.countries.length || filters.countries.includes(p.country)) &&
      (!filters.partners.length || p.partners.some((x) => filters.partners.includes(x))))
    .map((p) => ({ id: p.id, label: p.name, meta: nameOf(ix.countries.get(p.country)!) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="filterbar" role="region" aria-label={t("Filters")}>
      <div className="years" role="group" aria-label={t("As of")}>
        <span className="lbl">{t("As of")}</span>
        <button className="play" onClick={() => {
          if (!playing && filters.year === m.meta.years[m.meta.years.length - 1]) setFilters({ year: m.meta.years[0] });
          setPlaying((v) => !v);
        }} aria-label={playing ? t("Pause") : t("Play")} title={playing ? t("Pause") : t("Play")}>
          {playing ? <IconPause width={14} height={14} /> : <IconPlay width={14} height={14} />}
        </button>
        {m.meta.years.map((y) => (
          <button key={y} aria-pressed={filters.year === y} className={m.meta.partialYears.includes(y) ? "partial" : undefined}
            title={m.meta.partialYears.includes(y) ? `${y} — ${t("partial year")}` : String(y)}
            onClick={() => { setPlaying(false); setFilters({ year: y }); }}>
            {y}
          </button>
        ))}
      </div>
      {!yearOnly && <>
      <MultiSelect label={t("Country")} selected={filters.countries} onChange={(countries) => setFilters({ countries })}
        options={m.countries.map((c) => ({ id: c.id, label: nameOf(c), meta: `${cCount.get(c.id) ?? 0}` }))} />
      <MultiSelect label={t("Partner")} selected={filters.partners} onChange={(partners) => setFilters({ partners })}
        options={m.partners.map((p) => ({ id: p.id, label: p.name, meta: `${pCount.get(p.id) ?? 0}` }))} />
      <MultiSelect label={t("Project")} selected={filters.programmes} onChange={(programmes) => setFilters({ programmes })}
        options={progOpts} />
      </>}
      {yearOnly && <span className="small muted">{t("This page shows the whole project; only the year applies.")}</span>}
      {any && !yearOnly && (
        <button className="link-btn" onClick={() => setFilters({ countries: [], partners: [], programmes: [] })}>
          {t("Clear filters")}
        </button>
      )}
      <span className="spacer" />
      {m.meta.partialYears.includes(filters.year) && (
        <span className="pill warn" title={t("partial year")}>{filters.year}: {t("partial year")}</span>
      )}
    </div>
  );
}

// ───────────────────────── Command palette ─────────────────────────
interface Cmd { group: string; label: string; meta?: string; color?: string; run: () => void }

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { m, ix, navigate, setFilters } = useApp();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all: Cmd[] = useMemo(() => [
    ...PAGES.map((p) => ({ group: t("Pages"), label: t(p.label), run: () => navigate(p.route) })),
    { group: t("Pages"), label: t("Compare projects"), run: () => navigate({ page: "compare" }) },
    ...m.outcomes.map((o) => ({ group: t("Outcomes"), label: nameOf(o), color: outcomeVar(m, o.id), run: () => navigate({ page: "outcome", id: o.id }) })),
    ...m.programmes.map((p) => ({
      group: t("Projects"), label: p.name, meta: nameOf(ix.countries.get(p.country)!),
      run: () => navigate({ page: "programme", id: p.id }),
    })),
    ...m.indicators.map((i) => ({
      group: t("Indicators"), label: nameOf(i), meta: `${i.code} · ${i.tier}`, color: outcomeVar(m, i.outcome),
      run: () => navigate({ page: "outcome", id: i.outcome }),
    })),
    ...m.projects.map((p) => ({
      group: t("Portfolio"), label: p.short || p.name, meta: `MPTF ${p.id}${p.short && p.short !== p.name ? ` · ${p.name}` : ""}`,
      run: () => navigate({ page: "project", id: String(p.id) }),
    })),
    ...m.countries.map((c) => ({
      group: t("Countries"), label: `${t("Filter by")} ${nameOf(c)}`, run: () => setFilters({ countries: [c.id] }),
    })),
    ...m.partners.map((p) => ({
      group: t("Partners"), label: `${t("Filter by")} ${p.name}`, run: () => setFilters({ partners: [p.id] }),
    })),
  ], [m, ix, navigate, setFilters]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = all.filter((c) => terms.every((w) => `${c.label} ${c.meta ?? ""} ${c.group}`.toLowerCase().includes(w)));
    return hits.slice(0, 40);
  }, [all, q]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c: Cmd) => { onClose(); c.run(); };
  let lastGroup = "";
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("Search…")}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter" && shown[active]) run(shown[active]);
        }}>
        <input autoFocus placeholder={t("Search projects, indicators, countries…")} value={q} onChange={(e) => setQ(e.target.value)}
          role="combobox" aria-expanded aria-controls="cmd-list" aria-autocomplete="list" aria-activedescendant={shown[active] ? `cmd-${active}` : undefined} />
        <ul id="cmd-list" ref={listRef} role="listbox">
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? <li className="grp" role="presentation" key={`g-${c.group}`}>{c.group}</li> : null;
            lastGroup = c.group;
            return [
              head,
              <li key={`${c.group}-${c.label}-${c.meta ?? ""}`} id={`cmd-${i}`} role="option" aria-selected={i === active} data-active={i === active}
                onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
                {c.color && <i className="dot" style={{ background: c.color }} />}
                <span>{c.label}</span>
                {c.meta && <span className="meta">{c.meta}</span>}
              </li>,
            ];
          })}
          {!shown.length && <li className="empty">{t("No match")}</li>}
        </ul>
        <div className="hint"><span>↑↓ {t("navigate")}</span><span>↵ {t("open")}</span><span>esc {t("close")}</span></div>
      </div>
    </>
  );
}
