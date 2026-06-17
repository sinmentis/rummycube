import {chromium} from 'playwright';

const URL = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

const resp = await page.goto(URL, {waitUntil: 'networkidle', timeout: 30000});
const status = resp ? resp.status() : 0;
const rootChildren = await page.evaluate(() => document.getElementById('root')?.children.length ?? 0);
await browser.close();

console.log('status:', status, 'rootChildren:', rootChildren, 'consoleErrors:', errors.length);
if (errors.length) console.log(errors.join('\n'));
if (status !== 200 || rootChildren < 1 || errors.length > 0) {
  process.exit(1);
}
console.log('FRONTEND SMOKE OK');
