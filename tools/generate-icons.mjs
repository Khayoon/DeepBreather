/**
 * Render Deep Breather's existing golden-lungs vector into Expo icon assets.
 * Run from any directory: node tools/generate-icons.mjs
 * Uses the project's installed Playwright and Expo's transitive pngjs package.
 * Chromium must be installed (npx playwright install chromium).
 */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const assets = new URL('../assets/', import.meta.url);
const NAVY = '#070d18';

// The same geometry and gold gradient used by src/components/BreathingOrb.js.
const lobes = 'M113 48 C102 34 86 46 71 62 C46 88 26 132 24 179 C22 214 37 227 62 217 L104 200 C117 195 120 183 119 166 L117 65 Q117 53 113 48 Z M147 48 C158 34 174 46 189 62 C214 88 234 132 236 179 C238 214 223 227 198 217 L156 200 C143 195 140 183 141 166 L143 65 Q143 53 147 48 Z';
const branches = 'M130 28 L130 83 M130 78 Q114 100 88 115 M130 78 Q146 100 172 115 M88 115 L65 155 M88 115 L91 157 M172 115 L195 155 M172 115 L169 157 M65 155 L49 177 M65 155 L70 188 M195 155 L211 177 M195 155 L190 188';

function vector({ size, opaque = false, scale = 0.82, monochrome = false, backgroundOnly = false }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 260 260">
  <title>Deep Breather — golden lungs</title>
  ${opaque ? `<rect width="260" height="260" fill="${NAVY}"/>` : ''}
  ${backgroundOnly ? '' : `<defs>
    <linearGradient id="lungGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff0b0"/>
      <stop offset="40%" stop-color="#eebf58"/>
      <stop offset="75%" stop-color="#b87821"/>
      <stop offset="100%" stop-color="#f7d77f"/>
    </linearGradient>
  </defs>
  <g transform="translate(130 130) scale(${scale}) translate(-130 -125)">
    <path d="${lobes}" fill="${monochrome ? '#fff' : 'url(#lungGold)'}" stroke="${monochrome ? '#fff' : '#ffe3a0'}" stroke-width="1.5"/>
    <path d="${branches}" fill="none" stroke="${monochrome ? '#fff' : '#664319'}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="${monochrome ? 1 : 0.55}"/>
    ${monochrome ? '' : '<path d="M130 28 L130 76" fill="none" stroke="#eebf58" stroke-width="4" stroke-linecap="round"/>'}
  </g>`}
</svg>`;
}

const variants = [
  { file: 'icon.png', size: 1024, opaque: true },
  { file: 'favicon.png', size: 64, opaque: true, scale: 0.98 },
  { file: 'splash-icon.png', size: 1024, scale: 0.92 },
  // Android adaptive icons reserve a central 66/108 diameter safe circle.
  { file: 'android-icon-foreground.png', size: 1024, scale: 0.56, adaptive: true },
  { file: 'android-icon-background.png', size: 1024, opaque: true, backgroundOnly: true },
  { file: 'android-icon-monochrome.png', size: 1024, scale: 0.56, monochrome: true, adaptive: true },
];

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const variant of variants) {
    await page.setViewportSize({ width: variant.size, height: variant.size });
    await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block}
      </style></head><body>${vector(variant)}</body></html>`);
    const raw = PNG.sync.read(await page.screenshot({ omitBackground: true }));
    let painted = 0;
    let transparent = 0;
    for (let y = 0; y < raw.height; y += 1) {
      for (let x = 0; x < raw.width; x += 1) {
        const i = (y * raw.width + x) * 4;
        const alpha = raw.data[i + 3];
        if (variant.opaque) assert.equal(alpha, 255, `${variant.file} must be opaque`);
        if (!alpha) { transparent += 1; continue; }
        painted += 1;
        if (variant.adaptive) {
          const distance = Math.hypot(x + 0.5 - raw.width / 2, y + 0.5 - raw.height / 2);
          assert(distance <= raw.width * 33 / 108, `${variant.file} exceeds the adaptive safe circle`);
        }
        if (variant.monochrome) {
          assert(raw.data[i] === 255 && raw.data[i + 1] === 255 && raw.data[i + 2] === 255,
            'The themed Android icon must be a white alpha silhouette');
        }
      }
    }
    assert(painted > 0, `${variant.file} must contain pixels`);
    if (!variant.opaque) assert(transparent > 0, `${variant.file} must retain transparency`);
    // RGB output removes the alpha channel entirely from opaque iOS/web icons.
    const png = PNG.sync.write(raw, { colorType: variant.opaque ? 2 : 6, inputColorType: 6 });
    await writeFile(new URL(variant.file, assets), png);
    console.log(`${variant.file}: ${variant.size}×${variant.size}, ${variant.opaque ? 'opaque RGB' : 'transparent RGBA'}`);
  }
  await writeFile(new URL('lungs-icon.svg', assets), `${vector(variants[0])}\n`);
  console.log(`Golden-lungs assets written to ${fileURLToPath(assets)}`);
} finally {
  await browser?.close();
}
