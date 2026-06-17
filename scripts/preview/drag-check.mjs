import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const A = await (await b.newContext({viewport:{width:1440,height:900}, permissions:['clipboard-write']})).newPage();
const errs=[]; A.on('pageerror',e=>errs.push(String(e)));
let moveLogged=false;
A.on('console',m=>{ if(/MOVE TILE/i.test(m.text())) moveLogged=true; });
await A.goto(BASE,{waitUntil:'networkidle'});
await A.getByPlaceholder('Enter username').fill('alice');
await A.selectOption('#formNumPlayers','2');
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
await A.waitForTimeout(3000);
const undo = A.locator('button:has-text("Undo")');
const undoBefore = await undo.isDisabled();              // expect true
const handTiles = A.locator('.hand-buttons .tile');
const src = await handTiles.first().boundingBox();
const handGrid = await A.locator('.hand-buttons .grid-container').boundingBox();
// hand->hand: drag first tile to an empty cell on the right side of the rack
await A.mouse.move(src.x+src.width/2, src.y+src.height/2);
await A.mouse.down();
await A.mouse.move(src.x+src.width/2+18, src.y-12, {steps:5});
await A.waitForTimeout(120);
await A.mouse.move(handGrid.x+handGrid.width*0.85, src.y+src.height/2, {steps:12});
await A.waitForTimeout(120);
await A.mouse.up();
await A.waitForTimeout(900);
const undoAfter = await undo.isDisabled();                // expect false (a move committed)
await b.close();
console.log(`moveLogged=${moveLogged} undo disabled ${undoBefore}->${undoAfter} pageErrors=${errs.length}`);
if (!moveLogged || undoBefore!==true || undoAfter!==false || errs.length) { console.log('DRAG CHECK FAILED'); process.exit(1); }
console.log('DRAG CHECK OK — @dnd-kit drag committed a hand rearrange move (Undo enabled)');
