// S2-U9 seat-overlap check: create a 4-player match so the three opponent seats
// (top/left/right) render around the felt, then assert none of them (nor the
// self avatar in the rack notch overflowing it) overlaps the wood rack region,
// at 1366x768 and 390x844.
import {chromium} from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:9143';
const VIEWPORTS = [
    {name: '1366x768', width: 1366, height: 768},
    {name: '390x844', width: 390, height: 844},
];

function overlapArea(a, b) {
    const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return w * h;
}

const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
let failed = false;

for (const vp of VIEWPORTS) {
    const ctx = await b.newContext({viewport: {width: vp.width, height: vp.height}});
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));

    await p.goto(BASE, {waitUntil: 'networkidle'});
    await p.getByPlaceholder('Enter username').fill('alice');
    await p.selectOption('#formNumPlayers', '4');
    await p.getByRole('button', {name: 'Create', exact: true}).click();
    await p.waitForURL(/\/match\//, {timeout: 30000});
    await p.locator('.hand-buttons').waitFor({timeout: 30000});
    await p.waitForTimeout(2000);

    const rack = await p.locator('.hand-buttons').boundingBox();

    const seats = await p.locator('.table-seats .seat-slot').evaluateAll(els =>
        els.map(el => {
            const r = el.getBoundingClientRect();
            const cls = el.className;
            return {cls, x: r.x, y: r.y, width: r.width, height: r.height};
        })
    );

    const overlaps = seats
        .map(s => ({cls: s.cls, area: overlapArea(s, rack)}))
        .filter(o => o.area > 1);

    console.log(`\n[${vp.name}] rack x=${rack.x.toFixed(0)} y=${rack.y.toFixed(0)} w=${rack.width.toFixed(0)} h=${rack.height.toFixed(0)}`);
    console.log(`  opponent seats=${seats.length}`);
    seats.forEach(s => console.log(`    ${s.cls.replace('seat-slot ', '')}: x=${s.x.toFixed(0)} y=${s.y.toFixed(0)} w=${s.width.toFixed(0)} h=${s.height.toFixed(0)} overlapRack=${overlapArea(s, rack).toFixed(0)}px2`));
    console.log(`  overlappingRack=${overlaps.length} pageErrors=${errs.length}`);

    if (overlaps.length || errs.length || seats.length < 3) {
        failed = true;
        console.log(`  >>> ${vp.name} FAILED`);
    } else {
        console.log(`  >>> ${vp.name} OK`);
    }
    await ctx.close();
}

await b.close();
if (failed) { console.log('\nU9 SEAT-OVERLAP CHECK FAILED'); process.exit(1); }
console.log('\nU9 SEAT-OVERLAP CHECK OK — three opponent seats render and none overlaps the rack');
