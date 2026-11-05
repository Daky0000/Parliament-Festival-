// Colours for the invitation email header, taken from the guest's protocol rank.
// The band uses the rank colour; text and logo switch between white and ink,
// whichever reads better on that colour (WCAG contrast).

const INK = "#0D1526";
const WHITE = "#FFFFFF";
const FALLBACK = "#091833"; // brand navy when a guest has no rank colour

import { appBaseUrl } from "../app-url";

const assetBase = () => `${appBaseUrl()}/assets/email`;

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export type RankTheme = {
  "guest.rank_color": string;
  "guest.rank_text": string;
  "guest.rank_text_muted": string;
  "guest.rank_dots": string;
  "guest.rank_mark_url": string;
  "guest.rank_name": string;
  "guest.rank_order": string;
  "guest.rank_label": string;
};

export function rankTheme(
  colourHex: string | null | undefined,
  name?: string | null,
  rankOrder?: number | null
): RankTheme {
  // No rank (or an unreadable colour) -> the default dark navy header
  const rgb = parseHex(colourHex || "") || parseHex(FALLBACK)!;
  const bg = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  const L = luminance(rgb);
  const darkText = contrast(L, luminance(parseHex(INK)!)) > contrast(L, 1);

  return {
    "guest.rank_color": bg,
    "guest.rank_text": darkText ? INK : WHITE,
    "guest.rank_text_muted": darkText ? "rgba(13,21,38,.72)" : "rgba(255,255,255,.78)",
    "guest.rank_dots": darkText ? "rgba(13,21,38,.16)" : "rgba(255,255,255,.18)",
    "guest.rank_mark_url": `${assetBase()}/${darkText ? "mark-navy.png" : "mark-on-navy.png"}`,
    "guest.rank_name": name || "Invited guest",
    "guest.rank_order": rankOrder != null ? String(rankOrder) : "",
    "guest.rank_label": name
      ? rankOrder != null
        ? `Rank ${rankOrder} · ${name}`
        : name
      : "Invited guest",
  };
}
