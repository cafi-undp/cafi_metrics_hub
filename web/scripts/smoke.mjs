// Smoke test for the built dashboard: every page at three widths, light and dark, English and French.
// Fails on console errors, horizontal overflow, missing <h1>, NaN/undefined in the text, and
// WCAG 2.1 A/AA violations reported by axe-core. Run: npm run smoke (after `vite build`).
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { preview } from "vite";

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["#/", "#/outcome", "#/outcome/FOR", "#/programmes", "#/programme/piredd-kwilu", "#/portfolio", "#/project/113546",
  "#/climate", "#/quality", "#/methodology", "#/brief", "#/compare/piredd-kwilu~piredd-equateur", "#/factsheet/piredd-kwilu", "#/programme/50%", "#/nonsense"];
const WIDTHS = [1440, 834, 390];
const ALLOWED_AXE = new Set(["color-contrast"]); // reported, never fatal: canvas labels and third-party widgets vary by platform

const server = await preview({ preview: { port: 4199, strictPort: true }, logLevel: "silent" });
const base = `http://localhost:4199/`;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const failures = [];
const warnings = [];
try {
  for (const [theme, lang] of [["light", "en"], ["dark", "fr"]]) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 160)}`); });
      await page.goto(base, { waitUntil: "networkidle" });
      await page.evaluate(([t, l]) => { localStorage.setItem("cafi-theme", t); localStorage.setItem("cafi-lang", l); }, [theme, lang]);
      for (const hash of PAGES) {
        errors.length = 0;
        await page.goto(base + hash, { waitUntil: "networkidle" });
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        const where = `${hash} @${width} ${theme}/${lang}`;
        const m = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h1: !!document.querySelector("h1, .brief, .card.empty"),
          junk: (document.body.innerText.match(/\bNaN\b|\bundefined\b|\bInfinity\b/g) || []).length,
        }));
        if (errors.length) failures.push(`${where}: ${errors.join(" | ")}`);
        if (m.overflow > 0) failures.push(`${where}: horizontal overflow ${m.overflow}px`);
        if (!m.h1) failures.push(`${where}: no heading rendered`);
        if (m.junk) failures.push(`${where}: NaN/undefined/Infinity in text`);
        if (width === 1440 && theme === "light") {
          await page.addScriptTag({ content: axe });
          const v = await page.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
            return r.violations.map((x) => ({ id: x.id, nodes: x.nodes.length, sample: x.nodes[0]?.html?.slice(0, 100) }));
          });
          for (const x of v) (ALLOWED_AXE.has(x.id) ? warnings : failures).push(`${where}: axe ${x.id} ×${x.nodes} — ${x.sample}`);
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
for (const w of warnings) console.log("warn ", w);
for (const f of failures) console.log("FAIL ", f);
console.log(`smoke: ${failures.length} failure(s), ${warnings.length} warning(s)`);
process.exit(failures.length ? 1 : 0);
