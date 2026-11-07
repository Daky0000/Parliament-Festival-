import QRCode from "qrcode";
import { DAKYX_BLUE_DARK, DAKYX_MARK_DATA_URL } from "./brand/dakyx";

// Guest pass QR codes: drawn in DakyXTech blue with the DakyXTech mark in
// the centre.
//
// The code uses error-correction level H (recovers ~30% damaged modules) and
// the logo badge covers at most LOGO_RATIO of the side (~5% of the area), so
// phones still read it. The SVG is drawn from the module matrix directly, so
// it is crisp at any print size. A unit test decodes the code with the logo
// footprint blanked out to prove it still scans.

export const LOGO_RATIO = 0.22;
const QUIET_ZONE = 4; // modules of white border required by the QR standard
// The darker of the dakyx.com blues: on-brand and high contrast for scanning.
const INK = DAKYX_BLUE_DARK;

export type QrMatrix = { size: number; isDark: (x: number, y: number) => boolean };

export function qrMatrix(content: string): QrMatrix {
  const qr = QRCode.create(content, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  return { size, isDark: (x, y) => !!qr.modules.get(y, x) };
}

/** Square region (in module coordinates, without the quiet zone) hidden by the logo badge. */
export function logoFootprint(size: number): { start: number; end: number } {
  let side = Math.ceil(size * LOGO_RATIO);
  if (side % 2 !== size % 2) side += 1; // keep it centred on whole modules
  const start = (size - side) / 2;
  return { start, end: start + side };
}

/** SVG markup for a pass QR with the centred brand mark. */
export function passQrSvg(content: string, opts: { title?: string } = {}): string {
  const m = qrMatrix(content);
  const total = m.size + QUIET_ZONE * 2;
  const hole = logoFootprint(m.size);

  // One path, run-length encoded per row; modules under the logo are skipped.
  let d = "";
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      const covered = (xx: number) => y >= hole.start && y < hole.end && xx >= hole.start && xx < hole.end;
      if (m.isDark(x, y) && !covered(x)) {
        let run = 1;
        while (x + run < m.size && m.isDark(x + run, y) && !covered(x + run)) run++;
        d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h${run}v1h-${run}z`;
        x += run;
      } else {
        x++;
      }
    }
  }

  const side = hole.end - hole.start;
  const bx = hole.start + QUIET_ZONE;
  const pad = side * 0.14;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="${escapeXml(opts.title ?? "Event pass QR code")}">`,
    `<rect width="${total}" height="${total}" fill="#FFFFFF"/>`,
    `<path fill="${INK}" d="${d}"/>`,
    // Logo badge: white rounded square with the DakyXTech mark.
    `<rect x="${bx}" y="${bx}" width="${side}" height="${side}" rx="${side * 0.18}" fill="#FFFFFF" shape-rendering="geometricPrecision"/>`,
    `<image x="${bx + pad}" y="${bx + pad}" width="${side - pad * 2}" height="${side - pad * 2}" href="${DAKYX_MARK_DATA_URL}" preserveAspectRatio="xMidYMid meet"/>`,
    `</svg>`,
  ].join("");
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
