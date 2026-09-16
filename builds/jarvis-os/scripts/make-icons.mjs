/**
 * Generates PWA icons in public/icons from src/app/icon.svg.
 * Run: node scripts/make-icons.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const svg = readFileSync(path.join(root, "src/app/icon.svg"));
const outDir = path.join(root, "public/icons");
mkdirSync(outDir, { recursive: true });

// The maskable icon needs ~20% safe-zone padding so Android's circular crop
// never clips the artwork. We scale the artwork down and center it on the
// full-bleed background color.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#020617"/>
  <g transform="translate(6.4 6.4) scale(0.8)">
    <path d="M14 14 h14 v6 h-8 v24 h8 v6 H14z" fill="#22d3ee"/>
    <path d="M50 14 H36 v6 h8 v24 h-8 v6 h14z" fill="#22d3ee"/>
    <rect x="28" y="28" width="8" height="8" fill="#67e8f9"/>
  </g>
</svg>`;

const targets = [
  { name: "icon-192.png", size: 192, source: svg },
  { name: "icon-512.png", size: 512, source: svg },
  { name: "icon-maskable-512.png", size: 512, source: Buffer.from(maskableSvg) },
  { name: "apple-touch-icon.png", size: 180, source: svg },
];

for (const t of targets) {
  await sharp(t.source)
    .resize(t.size, t.size)
    .png()
    .toFile(path.join(outDir, t.name));
  console.log(`✓ ${t.name} (${t.size}×${t.size})`);
}
