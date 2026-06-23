// Solo smoke for the non-destructive manual submit (Task U6 / WS-1).
//
// Builds a VALID-but-below-30 first meld (a set or short run worth < 30), clicks
// "Submit meld", and asserts the rejection is NON-DESTRUCTIVE:
//   - the Submit-meld button turns red (end-invalid),
//   - an inline English reason appears and mentions the 30 threshold (BELOW_30),
//   - the staged tiles STAY on the board (no rollback),
//   - the rack is unchanged (no penalty draw), i.e. it's still your turn,
//   - no page errors.
//
// Run (from repo root, against a local build that points the client at :9119):
//   export CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
//   SMOKE_URL=http://127.0.0.1:9119 node scripts/smoke-submit.mjs
import {chromium} from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:9119';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const ctx = await b.newContext({viewport: {width: 1440, height: 900}});
const errs = [];

function cell(board, col, row) {
    const cw = board.width / 32, ch = board.height / 9;
    return {x: board.x + (col + 0.5) * cw, y: board.y + (row + 0.5) * ch};
}
async function dragTileTo(A, sel, fx, fy) {
    const t = await sel.boundingBox();
    await A.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
    await A.mouse.down();
    await A.mouse.move(t.x + t.width / 2 + 16, t.y - 12, {steps: 5});
    await A.waitForTimeout(70);
    await A.mouse.move(fx, fy, {steps: 14});
    await A.waitForTimeout(70);
    await A.mouse.up();
    await A.waitForTimeout(420);
}
async function readHand(A) {
    return await A.$$eval('.hand-buttons .tile', els => els.map(el => {
        const x = el.querySelector('.tile-text');
        const num = parseInt((x?.textContent || '').trim());
        const cc = [...(x?.classList || [])].find(c => c.startsWith('tile-') && c !== 'tile-text');
        return {num, color: cc ? cc.replace('tile-', '') : null};
    }));
}
// A valid meld worth < 30: prefer a set (3 same value, distinct colours — order
// independent), else a run of 3 consecutive same-colour tiles.
function findLowMeld(hand) {
    const byNum = {};
    for (const t of hand) {
        if (!t.color || isNaN(t.num)) continue;
        (byNum[t.num] ??= new Map());
        if (!byNum[t.num].has(t.color)) byNum[t.num].set(t.color, t);
    }
    for (const num of Object.keys(byNum).map(Number).sort((a, b) => a - b)) {
        const tiles = [...byNum[num].values()];
        if (tiles.length >= 3 && num * 3 < 30) return tiles.slice(0, 3);
    }
    const byColor = {};
    for (const t of hand) {
        if (!t.color || isNaN(t.num)) continue;
        (byColor[t.color] ??= new Map());
        if (!byColor[t.color].has(t.num)) byColor[t.color].set(t.num, t);
    }
    for (const color of Object.keys(byColor)) {
        const nums = [...byColor[color].keys()].sort((a, b) => a - b);
        for (let i = 0; i + 2 < nums.length; i++) {
            if (nums[i + 1] === nums[i] + 1 && nums[i + 2] === nums[i] + 2) {
                const sum = nums[i] + nums[i + 1] + nums[i + 2];
                if (sum < 30) return [nums[i], nums[i + 1], nums[i + 2]].map(n => byColor[color].get(n));
            }
        }
    }
    return null;
}

let done = false, tries = 0, summary = '';
while (!done && tries < 20) {
    tries++;
    const A = await ctx.newPage();
    A.on('pageerror', e => errs.push(String(e)));
    await A.goto(BASE, {waitUntil: 'networkidle'});
    await A.getByPlaceholder('Enter username').fill('solo');
    await A.selectOption('#formNumPlayers', '0');
    await A.getByRole('button', {name: 'Create', exact: true}).click();
    await A.waitForURL(/\/match\//, {timeout: 30000});
    await A.waitForTimeout(3500);

    const meld = findLowMeld(await readHand(A));
    if (!meld) { await A.close(); continue; }

    const board = await A.locator('.ref .grid-container').boundingBox();
    let col = 9, placed = true;
    for (const tile of meld) {
        const sel = A.locator('.hand-buttons .tile',
            {has: A.locator(`.tile-text.tile-${tile.color}`, {hasText: String(tile.num)})}).first();
        if (!(await sel.count())) { placed = false; break; }
        const c = cell(board, col++, 3);
        await dragTileTo(A, sel, c.x, c.y);
    }
    if (!placed) { await A.close(); continue; }

    const boardBefore = await A.locator('.ref .grid-container .tile').count();
    const handBefore = await A.locator('.hand-buttons .tile').count();
    if (boardBefore !== meld.length) { await A.close(); continue; }

    // The headline action: submit an invalid (below-30) first meld.
    await A.getByRole('button', {name: 'Submit meld', exact: true}).click();
    await A.waitForTimeout(900);

    const redCount = await A.locator('button.rummikub-button.end-invalid').count();
    const reason = (await A.locator('.submit-reason').textContent().catch(() => '')) || '';
    const boardAfter = await A.locator('.ref .grid-container .tile').count();
    const handAfter = await A.locator('.hand-buttons .tile').count();
    const submitStillThere = await A.getByRole('button', {name: 'Submit meld', exact: true}).count();

    summary = `deal=${tries} red=${redCount} reason="${reason.trim()}" ` +
        `board ${boardBefore}->${boardAfter} hand ${handBefore}->${handAfter} ` +
        `submitBtn=${submitStillThere} pageErrors=${errs.length}`;

    const ok = redCount === 1 &&
        reason.includes('30') &&
        boardAfter === boardBefore &&   // tiles stay = non-destructive
        handAfter === handBefore &&     // no penalty draw
        submitStillThere === 1 &&       // still your turn
        errs.length === 0;
    await A.close();
    done = ok;
    if (ok) break;
    if (errs.length) break;
}
await b.close();

console.log(summary || `no below-30 meld found in ${tries} deals`);
if (errs.length) console.log(errs.join('\n'));
if (!done) {
    console.log('SUBMIT SMOKE FAILED — non-destructive below-30 submit not verified');
    process.exit(1);
}
console.log('SUBMIT SMOKE OK — rejected below-30 submit is non-destructive: red button, ' +
    'inline "30" reason, tiles stay on the board, rack unchanged, still your turn');
