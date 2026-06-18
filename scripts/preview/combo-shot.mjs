import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const OUT = process.env.OUT || '/tmp/combo-shot.png';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const A = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; A.on('pageerror',e=>errs.push(String(e)));
await A.goto(BASE,{waitUntil:'networkidle'});
await A.getByPlaceholder('Enter username').fill('solo');
await A.selectOption('#formNumPlayers','0');
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
await A.waitForTimeout(3500);
const board = await A.locator('.ref .grid-container').boundingBox();
async function dragHandToBoard(fx, fy) {
  const t = await A.locator('.hand-buttons .tile').first().boundingBox();
  await A.mouse.move(t.x+t.width/2, t.y+t.height/2);
  await A.mouse.down();
  await A.mouse.move(t.x+t.width/2+18, t.y-12, {steps:5});
  await A.waitForTimeout(80);
  await A.mouse.move(fx, fy, {steps:14});
  await A.waitForTimeout(80);
  await A.mouse.up();
  await A.waitForTimeout(450);
}
const row = board.y + board.height*0.28;
await dragHandToBoard(board.x + board.width*0.10, row);
await dragHandToBoard(board.x + board.width*0.20, row);
await dragHandToBoard(board.x + board.width*0.30, row);
// 1) NO live combo mid-turn (the redesign: combo is no longer per-placement)
const midTurnCombo = await A.locator('.combo-overlay').count();
await A.screenshot({path: OUT});
// 2) invalid submit earns no combo
await A.getByRole('button',{name:'End',exact:true}).click();
await A.waitForTimeout(1600);
const afterEndCombo = await A.locator('.combo-overlay').count();
await b.close();
console.log(`midTurnComboOverlays=${midTurnCombo} afterInvalidEndOverlays=${afterEndCombo} pageErrors=${errs.length}`);
if (errs.length) console.log(errs.join('\n'));
if (midTurnCombo!==0 || afterEndCombo!==0 || errs.length) { console.log('COMBO BEHAVIOR FAILED'); process.exit(1); }
console.log('COMBO BEHAVIOR OK — no live mid-turn combo; invalid submit shows no combo');
