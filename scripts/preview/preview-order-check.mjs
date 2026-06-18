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

const hand = await A.$$eval('.hand-buttons .tile', els => els.map((el,i)=>{
  const x=el.querySelector('.tile-text'); return {i, num: parseInt((x?.textContent||'').trim())};
}));
const pick=[]; const seen=new Set();
for(const t of hand){ if(!isNaN(t.num)&&!seen.has(t.num)){ pick.push(t); seen.add(t.num);} if(pick.length===3) break; }
if(pick.length<3){ console.log('not enough distinct tiles'); process.exit(2); }
const expected = pick.map(p=>p.num);                  // rack (visual) order

const boxes=[];
for(const p of pick){ boxes.push(await A.locator('.hand-buttons .tile').nth(p.i).boundingBox()); }
for(const k of [1,0,2]){ const bx=boxes[k]; await A.mouse.click(bx.x+bx.width/2, bx.y+bx.height/2); await A.waitForTimeout(120); }

// start dragging the grabbed (left) tile, but DON'T release — inspect the overlay
const g = boxes[0];
await A.mouse.move(g.x+g.width/2, g.y+g.height/2);
await A.mouse.down();
await A.mouse.move(g.x+g.width/2+20, g.y-40, {steps:8});
await A.waitForTimeout(150);
const overlayNums = await A.$$eval('.tile-lift .tile-text', els => els.map(e=>parseInt((e.textContent||'').trim())));
await A.screenshot({path:'/tmp/preview-order.png'});
await A.mouse.up();
await b.close();
console.log(`expected(rack order)=${JSON.stringify(expected)} overlay(preview order)=${JSON.stringify(overlayNums)} pageErrors=${errs.length}`);
if(errs.length) console.log(errs.join('\n'));
const ok = overlayNums.length===3 && expected.every((v,i)=>v===overlayNums[i]);
if(!ok || errs.length){ console.log('PREVIEW ORDER FAILED'); process.exit(1); }
console.log('PREVIEW ORDER OK — drag preview shows tiles in rack order, not tap order');
