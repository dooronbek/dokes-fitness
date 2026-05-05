// Generates iOS PWA apple-touch-startup-image PNGs for the major iPhone
// portrait sizes. Each image is solid black with the centered "DOKES
// FITNESS" wordmark, matching the look of the in-app SplashScreen so the
// handoff from native splash to React splash is invisible.
//
// Run once after editing: `node scripts/generate-startup-images.mjs`.
// Outputs are committed to repo under public/splash/.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "splash");

// width × height in device pixels (portrait), filename used in <link>.
const DEVICES = [
  { name: "iphone-16-pro-max.png", w: 1290, h: 2796 },
  { name: "iphone-16-pro.png", w: 1179, h: 2556 },
  { name: "iphone-14.png", w: 1170, h: 2532 },
  { name: "iphone-14-plus.png", w: 1284, h: 2778 },
  { name: "iphone-xs-max.png", w: 1242, h: 2688 },
  { name: "iphone-xr.png", w: 828, h: 1792 },
  { name: "iphone-se.png", w: 750, h: 1334 },
];

function svgFor(width, height) {
  // Font size scales with the shorter edge; tracking matches the React
  // splash wordmark (uppercase, 0.3em letter-spacing).
  const fontPx = Math.round(Math.min(width, height) * 0.038);
  const letterSpacing = Math.round(fontPx * 0.3);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <radialGradient id="g" cx="0" cy="0" r="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.04)" />
          <stop offset="60%" stop-color="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#000000" />
      <rect width="100%" height="100%" fill="url(#g)" />
      <text
        x="50%"
        y="50%"
        text-anchor="middle"
        dominant-baseline="central"
        fill="rgba(255,255,255,0.7)"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        font-weight="600"
        font-size="${fontPx}"
        letter-spacing="${letterSpacing}"
      >DOKES FITNESS</text>
    </svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const d of DEVICES) {
    const out = path.join(OUT_DIR, d.name);
    const svg = Buffer.from(svgFor(d.w, d.h));
    await sharp(svg).png({ compressionLevel: 9 }).toFile(out);
    console.log(`wrote ${out} (${d.w}x${d.h})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
