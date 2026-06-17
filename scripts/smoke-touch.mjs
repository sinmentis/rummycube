// Mobile touch-readiness smoke. Headless can't reliably drive a synthetic finger
// drag through React + @dnd-kit's document listeners, so this verifies the mobile
// match renders and tiles are drag-ready (touch-action:none, the key requirement
// for @dnd-kit's TouchSensor). The actual finger-drag is verified manually on a
// real phone; mouse dragging is covered by scripts/preview/drag-check.mjs.
import {chromium, devices} from 'playwright';

const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const ctx = await b.newContext({...devices['Pixel 7'], permissions: ['clipboard-write']});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));

await p.goto(BASE, {waitUntil: 'networkidle'});
await p.getByPlaceholder('Enter username').fill('alice');
await p.selectOption('#formNumPlayers', '2');
await p.getByRole('button', {name: 'Create', exact: true}).click();
await p.waitForURL(/\/match\//, {timeout: 30000});

const wrapper = p.locator('.hand-buttons [id]').first(); // the draggable tile wrapper
await wrapper.waitFor({timeout: 30000});
const touchAction = await wrapper.evaluate(el => getComputedStyle(el).touchAction);
const tiles = await p.locator('.tile').count();
await b.close();

console.log(`mobile: tiles=${tiles} tile.touchAction=${touchAction} pageErrors=${errs.length}`);
if (tiles < 1 || touchAction !== 'none' || errs.length) { console.log('TOUCH READINESS FAILED'); process.exit(1); }
console.log('TOUCH READINESS OK — mobile match renders; tiles are touch-action:none (TouchSensor drag-ready)');
