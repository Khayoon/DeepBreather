/** Real-browser checks: npm run build:web:test && npm run test:e2e. */
import { chromium } from 'playwright';
import { startStaticServer } from '../tools/serve-web.mjs';

const results = [];
const errors = [];
const check = (name, pass) => {
  results.push({ name, pass });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}`);
};
const button = (page, name) => page.getByRole('button', { name, exact: true });
const idle = (page) => button(page, 'Start session').isVisible();
const soundButton = (page) => button(page, 'Sound and motion settings');
const blur = (page) => page.evaluate(() => document.activeElement?.blur());
const noOverflow = (page) => page.evaluate(
  () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
);
const observeErrors = (page, label = '') => {
  page.on('pageerror', (error) => errors.push(`${label}pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}console: ${message.text()}`);
  });
  page.setDefaultTimeout(10000);
};
const reachable = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ trial: true });
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= -1 && rect.left >= -1 && rect.bottom <= innerHeight + 1
      && rect.right <= innerWidth + 1;
  });
};
const closeWithEscape = async (page, title) => {
  await page.keyboard.press('Escape');
  await page.getByText(title, { exact: true }).waitFor({ state: 'hidden' });
};

let server;
let browser;
try {
  server = await startStaticServer({ directory: process.env.DIST || 'dist-test' });
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Observe real, possibly detached audio elements without mocking playback.
  await ctx.addInitScript(() => {
    window.__playedMedia = new Set();
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      window.__playedMedia.add(this);
      return play.apply(this, args);
    };
  });
  const page = await ctx.newPage();
  observeErrors(page);
  await page.goto(server.url, { waitUntil: 'networkidle' });
  await button(page, 'Start session').waitFor();
  check('first session needs no acknowledgement', (await page.getByText('I understand').count()) === 0);
  check('inline safety reminder is visible', await page.getByText(/Practise seated or lying down/).isVisible());
  await button(page, 'Safety information').click();
  check('safety details open on request', await page.getByText('Breath holding has real risks').isVisible());
  await blur(page);
  await page.keyboard.press('Space');
  check('Space in safety details does not start a session', await idle(page));
  await closeWithEscape(page, 'Breath holding has real risks');
  check('Escape closes safety details', await idle(page));

  await soundButton(page).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Sound & motion', { exact: true }).waitFor();
  check('keyboard opens sound settings without starting a session', await idle(page));
  await blur(page);
  await page.keyboard.press('Space');
  check('Space in sound settings does not start a session', await idle(page));
  const calm = page.getByRole('switch', { name: 'Calm mode', exact: true });
  await calm.focus();
  await page.keyboard.press('Space');
  check('keyboard toggles calm mode without starting a session',
    (await calm.getAttribute('aria-checked')) === 'true' && await idle(page));
  await page.keyboard.press('Space');
  const volume = page.getByRole('slider', { name: 'Music volume', exact: true });
  const oldVolume = Number(await volume.inputValue());
  await volume.focus();
  await page.keyboard.press('ArrowRight');
  check('keyboard can adjust music volume', Number(await volume.inputValue()) > oldVolume);
  // Keep the sheet open while rotating: its translation must follow its new
  // height, rather than leaving the header above the smaller viewport.
  await page.setViewportSize({ width: 568, height: 320 });
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Sound and motion settings"]');
    const done = dialog?.querySelector('[aria-label="Close sound and motion settings"]');
    if (!dialog || !done) return false;
    const panelBounds = dialog.getBoundingClientRect();
    const buttonBounds = done.getBoundingClientRect();
    return panelBounds.height > 0 && panelBounds.top >= -1 && panelBounds.bottom <= innerHeight + 1
      && buttonBounds.height > 0 && buttonBounds.top >= -1 && buttonBounds.left >= -1
      && buttonBounds.bottom <= innerHeight + 1 && buttonBounds.right <= innerWidth + 1;
  }, undefined, { timeout: 2000 }).catch((error) => {
    // Report the two actual geometry assertions below if the layout never
    // settles; an unrelated browser error must still abort this workflow.
    if (error.name !== 'TimeoutError') throw error;
  });
  const resizedSoundBounds = await page.getByRole('dialog', { name: 'Sound and motion settings', exact: true }).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const done = el.querySelector('[aria-label="Close sound and motion settings"]').getBoundingClientRect();
    return {
      dialogOnscreen: rect.top >= -1 && rect.bottom <= innerHeight + 1,
      doneOnscreen: done.top >= -1 && done.left >= -1
        && done.bottom <= innerHeight + 1 && done.right <= innerWidth + 1,
    };
  });
  check('open sound dialog stays inside the resized viewport', resizedSoundBounds.dialogOnscreen);
  check('open sound Done button stays reachable after rotation', resizedSoundBounds.doneOnscreen);
  await page.setViewportSize({ width: 390, height: 844 });
  await closeWithEscape(page, 'Sound & motion');
  check('Escape closes sound settings from the slider', await idle(page));

  // Timed phases use EXPO_PUBLIC_TEST_TIMINGS; retention uses real elapsed time.
  await button(page, 'Start session').click();
  await button(page, 'Pause session').waitFor();
  check('session leaves the idle screen', /Breathe in|Let go|Hold —/.test(await page.locator('body').innerText()));
  await button(page, 'Pause session').click();
  check('pause shows the paused tag', await page.getByText('PAUSED', { exact: true }).isVisible());
  await page.setViewportSize({ width: 1440, height: 900 });
  check('resizing into desktop keeps the paused session', await button(page, 'Resume session').isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  check('resizing back to phone keeps the paused session', await button(page, 'Resume session').isVisible());
  await button(page, 'Resume session').click();

  let sawRetention = false;
  let sawRecovery = false;
  let completed = false;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const text = await page.locator('body').innerText();
    if (/Hold — lungs empty/.test(text)) {
      sawRetention = true;
      await page.waitForTimeout(9000); // Three holds clear the minimum logging duration.
      await button(page, 'I need to breathe — end the hold and start recovery').click();
    }
    if (/Hold — lungs full/.test(text)) sawRecovery = true;
    if (/Session complete/.test(text)) {
      completed = true;
      break;
    }
    await page.waitForTimeout(100);
  }
  check('reaches the empty-lung retention', sawRetention);
  check('reaches the recovery hold', sawRecovery);
  check('session runs to completion', completed);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('@deep_breather/history/v1') || '[]').length > 0);
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('@deep_breather/history/v1')));
  check('completed session is logged', history.length === 1 && history[0].completed);
  check('retention times are recorded for every round',
    history[0]?.plannedRounds === 3 && history[0]?.retentions?.length === 3
    && history[0].retentions.every((seconds) => Number.isFinite(seconds) && seconds >= 8));

  await soundButton(page).click();
  await page.getByText('Sound & motion', { exact: true }).waitFor();
  check('sound sheet opens', await page.getByText('Sound & motion', { exact: true }).isVisible());
  await page.getByRole('radio', { name: 'Calm Drift background loop', exact: true }).click();
  await page.waitForFunction(() => [...window.__playedMedia].some(
    (media) => !media.paused && !media.ended && media.currentTime > 0
  ));
  check('selecting a track starts real audio without errors', errors.length === 0);
  await button(page, 'Close sound and motion settings').click();
  await page.getByText('Sound & motion', { exact: true }).waitFor({ state: 'hidden' });
  check('sound sheet closes', (await page.getByText('Sound & motion', { exact: true }).count()) === 0);
  await button(page, 'Practice history').click();
  check('history panel opens', await page.getByText('Your practice', { exact: true }).isVisible());
  check('history panel shows the logged session', (await page.getByText('best hold', { exact: true }).count()) > 0);
  await closeWithEscape(page, 'Your practice');
  check('Escape closes practice history', (await page.getByText('Your practice', { exact: true }).count()) === 0);

  await button(page, 'Start another session').click();
  for (const panel of [
    { label: 'Sound and motion settings', title: 'Sound & motion' },
    { label: 'Practice history', title: 'Your practice' },
    { label: 'Safety information', title: 'Breath holding has real risks' },
  ]) {
    await button(page, panel.label).click();
    await page.getByText(panel.title, { exact: true }).waitFor();
    check(`${panel.label} pauses an active session`, await page.getByText('PAUSED', { exact: true }).isVisible());
    await blur(page);
    await page.keyboard.press('Space');
    check(`${panel.label} blocks the session shortcut`, await page.getByText('PAUSED', { exact: true }).isVisible());
    await closeWithEscape(page, panel.title);
    check(`closing ${panel.label} preserves the paused session`, await button(page, 'Resume session').isVisible());
    await button(page, 'Resume session').click();
  }
  await blur(page);
  await page.keyboard.press('Escape');
  await button(page, 'Start session').waitFor();
  check('Escape resets the session', await idle(page));
  check('Escape reset stops previously playing audio', await page.evaluate(
    () => window.__playedMedia.size > 0 && [...window.__playedMedia].every((media) => media.paused)
  ));
  check('no horizontal overflow at phone width', await noOverflow(page));

  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    const label = `${viewport.width}×${viewport.height}`;
    check(`Start is reachable at ${label}`, await reachable(button(page, 'Start session')));
    await soundButton(page).click();
    await page.getByText('Sound & motion', { exact: true }).waitFor();
    check(`sound settings scroll to calm mode at ${label}`, await reachable(page.getByRole('switch', { name: 'Calm mode', exact: true })));
    await closeWithEscape(page, 'Sound & motion');
    await button(page, 'Safety information').click();
    check(`safety close is reachable at ${label}`, await reachable(button(page, 'Close safety notice')));
    await button(page, 'Close safety notice').click();
    await button(page, 'Practice history').click();
    check(`history close is reachable at ${label}`, await reachable(button(page, 'Close practice history')));
    await button(page, 'Close practice history').click();
    check(`no horizontal overflow at ${label}`, await noOverflow(page));
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await button(page, 'Start session').waitFor();
  await soundButton(page).click();
  await page.getByRole('slider', { name: 'Music volume', exact: true }).waitFor();
  check('music volume survives reload', Number(await page.getByRole('slider', { name: 'Music volume', exact: true }).inputValue()) > oldVolume);
  await closeWithEscape(page, 'Sound & motion');
  await button(page, 'Practice history').click();
  check('history survives reload', (await page.getByText('best hold', { exact: true }).count()) > 0);

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await desktop.newPage();
  observeErrors(dp, 'desktop ');
  await dp.goto(server.url, { waitUntil: 'networkidle' });
  await dp.getByText('Source on GitHub', { exact: true }).waitFor();
  check('desktop shows the landing column', await dp.getByText('Source on GitHub', { exact: true }).isVisible());
  check('no horizontal overflow on desktop', await noOverflow(dp));
  const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const rp = await rm.newPage();
  observeErrors(rp, 'reduced-motion ');
  await rp.goto(server.url, { waitUntil: 'networkidle' });
  await button(rp, 'Start session').click();
  await button(rp, 'Pause session').waitFor();
  check('runs with reduced motion', /Breathe in|Let go|Hold —/.test(await rp.locator('body').innerText()));

  // An unavailable loop must remain a recoverable settings error. This fresh
  // context intentionally produces a resource console error; only its uncaught
  // exceptions are collected, while every other context keeps strict logging.
  const failedAudio = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const audioPageErrors = [];
  let abortedAudioRequests = 0;
  await failedAudio.route('**/*.mp3', (route) => {
    abortedAudioRequests += 1;
    return route.abort('failed');
  });
  const fp = await failedAudio.newPage();
  fp.setDefaultTimeout(10000);
  fp.on('pageerror', (error) => audioPageErrors.push(error.message));
  await fp.goto(server.url, { waitUntil: 'networkidle' });
  await button(fp, 'Start session').waitFor();
  await soundButton(fp).click();
  await fp.getByRole('radio', { name: 'Calm Drift background loop', exact: true }).click();
  const audioAlert = fp.getByRole('alert').filter({ hasText: 'Music could not play' });
  await audioAlert.waitFor();
  check('failed audio shows a recoverable message', abortedAudioRequests > 0 && await audioAlert.isVisible());
  await closeWithEscape(fp, 'Sound & motion');
  await button(fp, 'Start session').click();
  await button(fp, 'Pause session').waitFor();
  check('session starts after audio playback fails',
    /Breathe in|Let go|Hold —/.test(await fp.locator('body').innerText()));
  check('failed audio causes no uncaught exceptions', audioPageErrors.length === 0);
  audioPageErrors.forEach((error) => errors.push(`failed-audio pageerror: ${error}`));
  await failedAudio.close();
  check('no console or page errors', errors.length === 0);
} catch (error) {
  console.error(error);
  check('browser workflow completes', false);
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
  }
}
errors.slice(0, 10).forEach((error) => console.log('   ', error));
const failed = results.filter((result) => !result.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
