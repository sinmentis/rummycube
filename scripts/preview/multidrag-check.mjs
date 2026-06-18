import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const A = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; A.on('pageerror',e=>errs.push(String(e)));
await A.goto(BASE,{waitUntil:'networkidle'});
await A.getByPlaceholder('Enter username').fill('solo');
await A.selectOption('#formNumPlayers','0');
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
await A.waitForTimeout(3500);
await A.getByRole('button',{name:'Sort: runs',exact:true}).click();
await A.waitForTimeout(700);

// read hand tiles in DOM (visual left-to-right) order
const hand = await A.$$eval('.hand-buttons .tile', els => els.map((el,i)=>{
  const x=el.querySelector('.tile-text'); const num=parseInt((x?.textContent||'').trim());
  return {i, num};
}));
// pick first 3 non-joker tiles with distinct numbers
const pick=[]; const seen=new Set();
for(const t of hand){ if(!isNaN(t.num) && !seen.has(t.num)){ pick.push(t); seen.add(t.num); } if(pick.length===3) break; }
if(pick.length<3){ console.log('not enough distinct tiles'); process.exit(2); }
const expected = pick.map(p=>p.num);                 // visual hand order

const boxes = [];
for(const p of pick){ boxes.push(await A.locator('.hand-buttons .tile').nth(p.i).boundingBox()); }
// click to select in SCRAMBLED order: middle, left, right
const order=[1,0,2];
for(const k of order){ const bx=boxes[k]; await A.mouse.click(bx.x+bx.width/2, bx.y+bx.height/2); await A.waitForTimeout(120); }

// drag the selection (grab the left tile) onto the board
const board = await A.locator('.ref .grid-container').boundingBox();
const cw=board.width/32, ch=board.height/9;
const target = {x: board.x + (8+0.5)*cw, y: board.y + (3+0.5)*ch};
const grab = boxes[0];
await A.mouse.move(grab.x+grab.width/2, grab.y+grab.height/2);
await A.mouse.down();
await A.mouse.move(grab.x+grab.width/2+16, grab.y-12, {steps:5});
await A.waitForTimeout(90);
await A.mouse.move(target.x, target.y, {steps:16});
await A.waitForTimeout(90);
await A.mouse.up();
await A.waitForTimeout(700);

// read board tiles in DOM (reading) order
const boardNums = await A.$$eval('.ref .grid-container .tile', els => els.map(el=>{
  const x=el.querySelector('.tile-text'); return parseInt((x?.textContent||'').trim());
}));
await A.screenshot({path:'/tmp/multidrag.png'});
await b.close();
console.log(`expected(hand order)=${JSON.stringify(expected)} board(reading order)=${JSON.stringify(boardNums)} pageErrors=${errs.length}`);
if(errs.length) console.log(errs.join('\n'));
const ok = boardNums.length===3 && expected.every((v,i)=>v===boardNums[i]);
if(!ok || errs.length){ console.log('MULTIDRAG ORDER FAILED'); process.exit(1); }
console.log('MULTIDRAG OK — tiles selected out of order still land in rack order on the board');
