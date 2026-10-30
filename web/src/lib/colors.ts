import type { Metrics } from "./types";
import type { Tokens } from "./echarts";

/** Category colour = its configured palette slot (config/indicators.yml), never its rank. */
export function outcomeSlot(m: Metrics, outcomeId: string): number | null {
  const s = m.outcomes.find((o) => o.id === outcomeId)?.slot;
  return s ? s - 1 : null;
}

export function outcomeVar(m: Metrics, outcomeId: string): string {
  const s = outcomeSlot(m, outcomeId);
  return s === null ? "var(--neutral)" : `var(--s${s + 1})`;
}

export function outcomeHex(m: Metrics, t: Tokens, outcomeId: string): string {
  const s = outcomeSlot(m, outcomeId);
  return s === null ? t.neutral : t.series[s];
}

/** Ink or white for a label set inside a coloured fill, by the fill's luminance. */
export function textOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#0b0b0b";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.22 ? "#0b0b0b" : "#ffffff";
}
