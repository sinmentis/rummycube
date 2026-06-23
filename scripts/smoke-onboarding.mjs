// Onboarding smoke: the navbar "How to play" modal on the home/lobby page.
// Run from the repo root with a browser available, e.g.:
//   export CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
//   SMOKE_URL=http://localhost:4173 node scripts/smoke-onboarding.mjs
// (point SMOKE_URL at a running build/preview; defaults to the live site).
import {chromium} from 'playwright';

const URL = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

function fail(msg) {
    console.log('ONBOARDING SMOKE FAILED:', msg);
    if (errors.length) console.log(errors.join('\n'));
    browser.close().finally(() => process.exit(1));
}

await page.goto(URL, {waitUntil: 'networkidle', timeout: 30000});

// Lobby hero copy is present on the home page.
const heroText = await page.locator('.lobby-hero').innerText().catch(() => '');
if (!/rummy tiles/i.test(heroText)) fail(`lobby hero missing, got: ${JSON.stringify(heroText)}`);

// Open the modal from the navbar trigger.
const trigger = page.getByRole('button', {name: 'How to play'});
await trigger.click();
const dialog = page.getByRole('dialog');
await dialog.waitFor({state: 'visible', timeout: 5000});

const modalText = await dialog.innerText();
for (const needle of ['30', 'run', 'set']) {
    if (!modalText.includes(needle)) fail(`modal text missing "${needle}"`);
}

// Esc closes it.
await page.keyboard.press('Escape');
await dialog.waitFor({state: 'hidden', timeout: 5000});

// Re-open, then backdrop click closes it.
await trigger.click();
await page.getByRole('dialog').waitFor({state: 'visible', timeout: 5000});
await page.locator('.howto-backdrop').click({position: {x: 5, y: 5}});
await page.getByRole('dialog').waitFor({state: 'hidden', timeout: 5000});

if (errors.length) fail(`pageerror(s): ${errors.length}`);

await browser.close();
console.log('ONBOARDING SMOKE OK — hero present; modal opens, has 30/run/set, Esc + backdrop close, no pageerror');
