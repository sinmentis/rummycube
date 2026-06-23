// S2-U9 verification: at 1366x768 and 390x844 (solo), assert the control row
// (Submit/End + Sort/Draw/Undo/Redo) is within the viewport (rect bottom <=
// innerHeight), the wood rack is visible, and no seat avatar overlaps the rack.
import {chromium} from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4319';
const VIEWPORTS = [
    {name: '1366x768', width: 1366, height: 768},
    {name: '390x844', width: 390, height: 844},
];

function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
}
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
    await p.selectOption('#formNumPlayers', '0'); // solo test
    await p.getByRole('button', {name: 'Create', exact: true}).click();
    await p.waitForURL(/\/match\//, {timeout: 30000});
    await p.locator('.hand-buttons').waitFor({timeout: 30000});
    await p.waitForTimeout(2500); // let the deal + avatars settle

    const innerHeight = await p.evaluate(() => window.innerHeight);

    const controls = await p.locator('.controls-wrapper').boundingBox();
    const rack = await p.locator('.hand-buttons').boundingBox();

    // The primary action button: Draw (solo, nothing staged) or Submit meld.
    const actionLoc = p.locator('.controls-wrapper button', {hasText: /Draw|Submit meld|End/}).first();
    const action = await actionLoc.boundingBox();
    const actionText = (await actionLoc.innerText()).trim();

    // Every seat avatar rendered in the table overlay (opponents).
    const seatBoxes = await p.locator('.table-seats .avatar, .table-seats .player-pending').evaluateAll(
        els => els.map(el => {
            const r = el.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
        })
    );

    const controlsBottom = controls.y + controls.height;
    const rackBottom = rack.y + rack.height;
    const controlsOnScreen = controlsBottom <= innerHeight + 0.5;
    const actionOnScreen = (action.y + action.height) <= innerHeight + 0.5;
    const rackVisible = rack.y >= -0.5 && rackBottom <= innerHeight + 0.5;

    const overlaps = seatBoxes
        .map((s, i) => ({i, area: overlapArea(s, rack), hit: intersects(s, rack)}))
        .filter(o => o.hit && o.area > 1);

    console.log(`\n[${vp.name}] innerHeight=${innerHeight}`);
    console.log(`  controls bottom=${controlsBottom.toFixed(1)} onScreen=${controlsOnScreen}`);
    console.log(`  action "${actionText}" bottom=${(action.y + action.height).toFixed(1)} onScreen=${actionOnScreen}`);
    console.log(`  rack y=${rack.y.toFixed(1)} bottom=${rackBottom.toFixed(1)} visible=${rackVisible}`);
    console.log(`  seat avatars=${seatBoxes.length} overlappingRack=${overlaps.length}`);
    seatBoxes.forEach((s, i) => console.log(`    seat[${i}] x=${s.x.toFixed(0)} y=${s.y.toFixed(0)} w=${s.width.toFixed(0)} h=${s.height.toFixed(0)}`));
    console.log(`  pageErrors=${errs.length}`);

    if (!controlsOnScreen || !actionOnScreen || !rackVisible || overlaps.length || errs.length) {
        failed = true;
        console.log(`  >>> ${vp.name} FAILED`);
    } else {
        console.log(`  >>> ${vp.name} OK`);
    }
    await ctx.close();
}

await b.close();
if (failed) { console.log('\nU9 ON-SCREEN CHECK FAILED'); process.exit(1); }
console.log('\nU9 ON-SCREEN CHECK OK — controls + rack on-screen at both sizes; no avatar overlaps the rack');
