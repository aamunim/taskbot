// Renders the SVG sources in assets/src into the PNGs the app uses.
// Usage: NODE_PATH=$(npm root -g) node scripts/render-assets.mjs   (needs Playwright's Chromium)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright is a global tool here, not a project dependency; require() honours NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const src = join(root, 'src');

const INDIGO = '#3B32C4';
const NIGHT = '#0E0D1A';
const AMBER = '#F59E0B';

const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#2E2A86"/><stop offset="0.5" stop-color="#4A3FDB"/><stop offset="1" stop-color="#7B4BE8"/>
</linearGradient></defs>`;

// The mark: a message bubble that already holds a tick, with an amber "new from the boss" dot.
const bubble = (fill) => `<path fill="${fill}" stroke="${fill}" stroke-width="40" stroke-linejoin="round" d="M352 292h340a70 70 0 0 1 70 70v220a70 70 0 0 1-70 70H452l-112 98 12-98a70 70 0 0 1-70-70V362a70 70 0 0 1 70-70z"/>`;
const check = (stroke) => `<path fill="none" stroke="${stroke}" stroke-width="62" stroke-linecap="round" stroke-linejoin="round" d="M412 478l78 78 138-150"/>`;
const ring = (fill) => `<circle cx="768" cy="282" r="86" fill="${fill}"/>`;
const dot = (fill) => `<circle cx="768" cy="282" r="58" fill="${fill}"/>`;

const svg = (viewBox, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;
const FULL = '0 0 1024 1024';
// Square crop hugging the mark, shared by the native splash image and the animated layers.
const MARK = '212 170 660 660';
// Adaptive icons are masked to a circle 61% of the canvas; shrink the mark to sit inside it.
const safe = (body) => `<g transform="translate(512 512) scale(0.7) translate(-542 -500)">${body}</g>`;
const centred = (body) => `<g transform="translate(-30 12)">${body}</g>`;

const sources = {
  'icon.svg': svg(FULL, `${gradient}<rect width="1024" height="1024" fill="url(#g)"/>${centred(bubble('#fff') + check(INDIGO) + ring('#5B45E0') + dot(AMBER))}`),
  'adaptive-background.svg': svg(FULL, `${gradient}<rect width="1024" height="1024" fill="url(#g)"/>`),
  'adaptive-foreground.svg': svg(FULL, safe(bubble('#fff') + check(INDIGO) + ring('#4F42DC') + dot(AMBER))),
  'adaptive-monochrome.svg': svg(FULL, `<defs><mask id="m"><rect width="1024" height="1024" fill="#000"/>${safe(bubble('#fff') + check('#000') + ring('#000') + dot('#fff'))}</mask></defs><rect width="1024" height="1024" fill="#fff" mask="url(#m)"/>`),
  'favicon.svg': svg(FULL, `${gradient}<rect width="1024" height="1024" rx="230" fill="url(#g)"/>${centred(bubble('#fff') + check(INDIGO) + ring('#5B45E0') + dot(AMBER))}`),
  'splash-light.svg': svg(MARK, bubble('#fff') + check(INDIGO) + ring(INDIGO) + dot(AMBER)),
  'splash-dark.svg': svg(MARK, bubble('#fff') + check(NIGHT) + ring(NIGHT) + dot(AMBER)),
  'mark-bubble.svg': svg(MARK, bubble('#fff')),
  'mark-check.svg': svg(MARK, check('#fff')),
  'mark-ring.svg': svg(MARK, ring('#fff')),
  'mark-dot.svg': svg(MARK, dot(AMBER)),
};

const outputs = [
  ['icon.svg', 'icon.png', 1024],
  ['adaptive-background.svg', 'android-icon-background.png', 1024],
  ['adaptive-foreground.svg', 'android-icon-foreground.png', 1024],
  ['adaptive-monochrome.svg', 'android-icon-monochrome.png', 1024],
  ['favicon.svg', 'favicon.png', 96],
  ['splash-light.svg', 'splash-light.png', 720],
  ['splash-dark.svg', 'splash-dark.png', 720],
  ['mark-bubble.svg', 'mark-bubble.png', 720],
  ['mark-check.svg', 'mark-check.png', 720],
  ['mark-ring.svg', 'mark-ring.png', 720],
  ['mark-dot.svg', 'mark-dot.png', 720],
];

mkdirSync(src, { recursive: true });
for (const [name, text] of Object.entries(sources)) writeFileSync(join(src, name), text + '\n');

const browser = await chromium.launch();
for (const [from, to, size] of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const markup = readFileSync(join(src, from), 'utf8');
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  await page.screenshot({ path: join(root, to), omitBackground: true });
  await page.close();
  console.log(`${to} (${size}px)`);
}
await browser.close();
