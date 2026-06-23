// U10 live drag check: during a drag the empty board cells carry the .slot-valid
// droppable cue, and a single-tile drop near (not exactly on) an empty cell still
// commits (Undo enabled). Solo test mode; run from repo root with CHROMIUM_PATH.
//   CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome \
//   SMOKE_URL=http://127.0.0.1:9119 node scripts/preview/u10-drop-cue-check.mjs
import {chromium} from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:9119';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const A = await (await b.newContext({viewport: {width: 1440, height: 900}, permissions: ['clipboard-write']})).newPage();
const errs = [];
A.on('pageerror', e => errs.push(String(e)));

await A.goto(BASE, {waitUntil: 'networkidle'});
await A.getByPlaceholder('Enter username').fill('alice');
await A.selectOption('#formNumPlayers', '0'); // solo test
await A.getByRole('button', {name: 'Create', exact: true}).click();
await A.waitForURL(/\/match\//, {timeout: 30000});
await A.waitForTimeout(3000);

const undo = A.locator('button:has-text("Undo")');
const undoBefore = await undo.isDisabled(); // expect true (nothing moved yet)

// no cue before any drag
const cueIdle = await A.locator('.grid-item.slot-valid').count();

const handTiles = A.locator('.hand-buttons .tile');
const src = await handTiles.first().boundingBox();
const boardGrid = await A.locator('.ref .grid-container').boundingBox();

// Start a drag from a hand tile and move over the empty board, then sample the
// droppable cue mid-flight before releasing.
await A.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
await A.mouse.down();
await A.mouse.move(src.x + src.width / 2 + 14, src.y - 16, {steps: 5});
await A.waitForTimeout(120);
// hover an empty board cell, but land a few px OFF the exact cell centre so the
// resolver has to snap.
const targetX = boardGrid.x + boardGrid.width * 0.4 + 9;
const targetY = boardGrid.y + boardGrid.height * 0.4 + 7;
await A.mouse.move(targetX, targetY, {steps: 12});
await A.waitForTimeout(150);
const cueDuringDrag = await A.locator('.ref .grid-item.slot-valid').count();
await A.mouse.up();
await A.waitForTimeout(900);

const undoAfter = await undo.isDisabled(); // expect false (a move committed)
const cueAfter = await A.locator('.grid-item.slot-valid').count(); // expect 0 (drag over)
await b.close();

console.log(`cueIdle=${cueIdle} cueDuringDrag=${cueDuringDrag} cueAfter=${cueAfter} undo ${undoBefore}->${undoAfter} pageErrors=${errs.length}`);
const ok = cueIdle === 0 && cueDuringDrag > 0 && cueAfter === 0
    && undoBefore === true && undoAfter === false && errs.length === 0;
if (!ok) { console.log('U10 DROP CUE CHECK FAILED'); process.exit(1); }
console.log('U10 DROP CUE CHECK OK — empty board cells cue .slot-valid during a drag; off-centre single drop snapped and committed (Undo enabled)');
