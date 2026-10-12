/** Production timing check: npm run build:web && node e2e/pacing.mjs */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startStaticServer } from '../tools/serve-web.mjs';

let server;
let browser;
try {
  server = await startStaticServer({ directory: process.env.DIST || 'dist' });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.setDefaultTimeout(10000);
  await page.goto(server.url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start session', exact: true }).waitFor();
  const lungs = page.locator('svg[viewBox="0 0 260 260"]').locator('..');
  const scale = () => lungs.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  // Observe each rendered frame so individual browser commands cannot miss
  // the short full expansion/contraction at a phase boundary.
  const heading = await page.getByRole('heading', { name: 'Deep Breather', exact: true }).elementHandle();
  await lungs.evaluate((el, phaseHeading) => {
    window.__breathFrames = [];
    const sample = () => {
      window.__breathFrames.push({
        at: performance.now(),
        phase: phaseHeading.textContent,
        paused: document.body.innerText.includes('PAUSED'),
        scale: new DOMMatrix(getComputedStyle(el).transform).a,
      });
      window.__breathFrameId = requestAnimationFrame(sample);
    };
    sample();
  }, heading);
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/golden-lungs-idle.png' });
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await page.waitForTimeout(1400);
  assert(await page.getByRole('heading', { name: 'Breathe in', exact: true }).isVisible(),
    'Inhale lasts more than 1.4 seconds');
  await page.getByRole('button', { name: 'Pause session', exact: true }).click();
  await page.getByText('PAUSED', { exact: true }).waitFor();
  const frozen = await scale();
  await page.waitForTimeout(650);
  assert(Math.abs(await scale() - frozen) < 0.02, 'Pause freezes lungs');
  await page.getByRole('button', { name: 'Resume session', exact: true }).click();
  await page.waitForFunction(() => window.__breathFrames.some(
    (frame) => frame.phase === 'Breathe in' && frame.scale >= 0.99
  ));
  await page.screenshot({ path: 'docs/screenshots/golden-lungs-full.png' });
  await page.getByRole('heading', { name: 'Let go', exact: true }).waitFor();
  await page.waitForTimeout(1400);
  assert(await page.getByRole('heading', { name: 'Let go', exact: true }).isVisible(),
    'Exhale lasts more than 1.4 seconds');
  await page.getByRole('heading', { name: 'Breathe in', exact: true }).waitFor();
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__breathFrameId);
    return window.__breathFrames;
  });
  const inhaleStart = frames.findIndex((frame) => frame.phase === 'Breathe in');
  const exhaleStart = frames.findIndex((frame) => frame.phase === 'Let go');
  const nextInhale = frames.findIndex((frame, i) => i > exhaleStart && frame.phase === 'Breathe in');
  assert(inhaleStart >= 0 && exhaleStart > inhaleStart && nextInhale > exhaleStart,
    'Observed both complete production breathing phases');
  const inhale = frames.slice(inhaleStart, exhaleStart);
  const exhale = frames.slice(exhaleStart, nextInhale);
  const pausedMs = inhale.reduce((sum, frame, i) => sum + (
    frame.paused ? frames[inhaleStart + i + 1].at - frame.at : 0
  ), 0);
  const inhaleMs = frames[exhaleStart].at - frames[inhaleStart].at - pausedMs;
  const exhaleMs = frames[nextInhale].at - frames[exhaleStart].at;
  assert(inhaleMs >= 2750 && inhaleMs <= 3500,
    `Inhale stays near 3 seconds excluding pause (${Math.round(inhaleMs)}ms)`);
  assert(exhaleMs >= 2750 && exhaleMs <= 3500,
    `Exhale stays near 3 seconds (${Math.round(exhaleMs)}ms)`);
  assert(Math.max(...inhale.map((frame) => frame.scale)) >= 0.99,
    'Lungs reach full size after resume');
  assert(Math.min(...exhale.map((frame) => frame.scale)) <= 0.64,
    'Lungs fully contract');
  assert.deepEqual(errors, [], 'No browser errors during production pacing');
  console.log('Production pacing, full expansion/contraction, and pause/resume passed.');
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
  }
}
