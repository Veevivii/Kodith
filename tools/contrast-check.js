/* ==========================================================================
   Hero contrast check.

   The hero scrim has to carry text contrast over MOVING video, so checking
   the scrim colour in isolation proves nothing. This samples real frames of
   the encoded loop, composites the scrim layers over each pixel exactly as
   the CSS does, and reports the worst contrast ratio found anywhere text
   actually sits.

   The layer definitions below mirror .hero__scrim in css/styles.css, and
   each region lists only the colours that genuinely appear in it. If you
   change the scrim or move text around, update this file and re-run.

   Run:  node tools/contrast-check.js
   Needs ffmpeg on PATH, or set FFMPEG=/path/to/ffmpeg.
   ========================================================================== */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const VIDEO = path.join(__dirname, "..", "assets", "video", "light-leaks.mp4");

const W = 160, H = 90, FPS = 2;

/* --- tokens, kept in sync with css/styles.css ---------------------------- */
const BG = [11, 14, 20];            /* --bg          #0B0E14 */

const SWATCH = {
  text:  { label: "--text",        rgb: [243, 239, 230], min: 4.5 },
  muted: { label: "--text-muted",  rgb: [169, 166, 156], min: 4.5 },
  warm:  { label: "--accent-warm", rgb: [255, 138,  76], min: 3.0 },  /* graphic */
};

/* --- scrim layers ------------------------------------------------------- */
/* Each layer is (x, y) -> alpha, x/y normalised 0..1 from the top-left.
   All layers are the same colour, so stacking order does not change the
   result: combined alpha = 1 - product of (1 - alpha). */

/* radial-gradient(rx ry at cx cy, alpha 0%, transparent endStop) */
const radial = (rx, ry, cx, cy, a0, end) => (x, y) => {
  const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
  return r >= end ? 0 : a0 * (1 - r / end);
};

const ramp = (stops, p) => {
  if (p <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const [p0, a0] = stops[i - 1], [p1, a1] = stops[i];
      return a0 + (a1 - a0) * ((p - p0) / (p1 - p0));
    }
  }
  return stops[stops.length - 1][1];
};

/* linear-gradient(to top, ...) — stop 0 is the BOTTOM edge */
const toTop = (stops) => (x, y) => ramp(stops, 1 - y);
/* linear-gradient(to bottom, ...) — stop 0 is the TOP edge */
const toBottom = (stops) => (x, y) => ramp(stops, y);

const SCRIM = {
  desktop: [
    toBottom([[0, 0.60], [0.16, 0]]),
    radial(0.78, 0.58, 0.10, 0.32, 0.88, 0.72),
    toTop([[0, 0.94], [0.16, 0.72], [0.44, 0]]),
    toTop([[0, 0.42], [1, 0.24]]),
  ],
  /* @media (max-width: 767px) */
  mobile: [
    toBottom([[0, 0.60], [0.16, 0]]),
    radial(1.25, 0.60, 0.40, 0.34, 0.90, 0.78),
    toTop([[0, 0.95], [0.20, 0.78], [0.50, 0]]),
    toTop([[0, 0.50], [1, 0.30]]),
  ],
};

const combinedAlpha = (layers, x, y) =>
  1 - layers.reduce((acc, layer) => acc * (1 - layer(x, y)), 1);

/* --- WCAG 2.1 relative luminance & contrast ----------------------------- */
const toLinear = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* --- where text actually sits, and in which colour ---------------------- */
/* Desktop assumes the 1120px wrap centred in a wide viewport; mobile assumes
   the full-bleed wrap, where copy can reach either edge. */
const REGIONS = [
  { name: "nav — desktop (transparent over hero)", scrim: "desktop",
    x: [0.12, 0.88], y: [0.010, 0.075], on: ["text"] },

  { name: "wordmark + tagline — desktop", scrim: "desktop",
    x: [0.13, 0.62], y: [0.12, 0.45], on: ["text"] },

  { name: "meta pairs (mono) — desktop", scrim: "desktop",
    x: [0.13, 0.55], y: [0.86, 0.96], on: ["text", "muted"] },

  { name: "nav — mobile", scrim: "mobile",
    x: [0.06, 0.94], y: [0.010, 0.075], on: ["text"] },

  { name: "wordmark + tagline — mobile", scrim: "mobile",
    x: [0.06, 0.94], y: [0.14, 0.52], on: ["text"] },

  { name: "meta pairs (mono) — mobile", scrim: "mobile",
    x: [0.06, 0.94], y: [0.78, 0.96], on: ["text", "muted"] },
];

/* ------------------------------------------------------------------------ */

function grabFrames() {
  const out = path.join(os.tmpdir(), `kodith-frames-${process.pid}.raw`);
  execFileSync(FFMPEG, [
    "-v", "error", "-i", VIDEO,
    "-vf", `fps=${FPS},scale=${W}:${H}`,
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-y", out,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return buf;
}

function run() {
  if (!fs.existsSync(VIDEO)) {
    console.error(`No video at ${VIDEO} — nothing to check.`);
    process.exit(1);
  }

  const buf = grabFrames();
  const frameSize = W * H * 3;
  const frames = Math.floor(buf.length / frameSize);
  console.log(`Sampling ${frames} frames of ${path.basename(VIDEO)} at ${W}x${H}\n`);

  let allPass = true;

  for (const region of REGIONS) {
    const layers = SCRIM[region.scrim];
    const x0 = Math.floor(region.x[0] * W), x1 = Math.ceil(region.x[1] * W);
    const y0 = Math.floor(region.y[0] * H), y1 = Math.ceil(region.y[1] * H);

    /* Track the brightest composited pixel — worst case for light text. */
    const worst = region.on.map(() => ({ ratio: Infinity, bg: null, at: null }));

    for (let f = 0; f < frames; f++) {
      const base = f * frameSize;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const a = combinedAlpha(layers, x / W, y / H);
          const i = base + (y * W + x) * 3;
          const bg = [0, 1, 2].map((c) => buf[i + c] * (1 - a) + BG[c] * a);

          region.on.forEach((key, si) => {
            const r = contrast(SWATCH[key].rgb, bg);
            if (r < worst[si].ratio) {
              worst[si] = { ratio: r, bg: bg.map(Math.round), at: `frame ${f} @ ${x}/${W},${y}/${H}` };
            }
          });
        }
      }
    }

    console.log(region.name);
    region.on.forEach((key, si) => {
      const { label, min } = SWATCH[key];
      const w = worst[si];
      const ok = w.ratio >= min;
      if (!ok) allPass = false;
      const hex = "#" + w.bg.map((c) => c.toString(16).padStart(2, "0")).join("");
      console.log(
        `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(13)} ` +
        `worst ${w.ratio.toFixed(2)}:1 (min ${min})  over ${hex}  ${w.at}`
      );
    });
    console.log("");
  }

  console.log(allPass ? "All regions pass." : "FAILED — deepen the scrim in css/styles.css and here.");
  process.exit(allPass ? 0 : 1);
}

run();
