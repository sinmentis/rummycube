import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const OUT = process.env.OUT || '/tmp/combo-shot.png';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const A = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; A.on('pageerror',e=>errs.push(String(e)));
await A.goto(BASE,{waitUntil:'networkidle'});
await A.getByPlaceholder('Enter username').fill('solo');
await A.selectOption('#formNumPlayers','0');           // solo test -> 1 player
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
await A.waitForTimeout(3500);                            // deal + enter play phase
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
  await A.waitForTimeout(500);
}
const row = board.y + board.height*0.28;
await dragHandToBoard(board.x + board.width*0.10, row);
await dragHandToBoard(board.x + board.width*0.20, row);
await dragHandToBoard(board.x + board.width*0.30, row);
await A.waitForTimeout(400);
const overlay = await A.locator('.combo-overlay').first();
const visible = await overlay.count() ? await overlay.isVisible() : false;
const text = visible ? (await overlay.innerText()).replace(/\s+/g,' ').trim() : '(none)';
await A.screenshot({path: OUT});
await b.close();
console.log(`comboOverlayVisible=${visible} text="${text}" pageErrors=${errs.length}`);
if (errs.length) console.log(errs.join('\n'));
if (!visible || errs.length) { console.log('COMBO SHOT FAILED'); process.exit(1); }
console.log('COMBO SHOT OK -> '+OUT);
