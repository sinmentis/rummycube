import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const errs=[];

async function newSoloGame() {
  const A = await ctx.newPage();
  A.on('pageerror',e=>errs.push(String(e)));
  await A.goto(BASE,{waitUntil:'networkidle'});
  await A.getByPlaceholder('Enter username').fill('solo');
  await A.selectOption('#formNumPlayers','0');
  await A.getByRole('button',{name:'Create',exact:true}).click();
  await A.waitForURL(/\/match\//,{timeout:30000});
  await A.waitForTimeout(3500);
  return A;
}
function cell(board, col, row){
  const cw=board.width/32, ch=board.height/9;
  return {x: board.x+(col+0.5)*cw, y: board.y+(row+0.5)*ch};
}
async function dragTileTo(A, sel, fx, fy){
  const t = await sel.boundingBox();
  await A.mouse.move(t.x+t.width/2, t.y+t.height/2);
  await A.mouse.down();
  await A.mouse.move(t.x+t.width/2+16, t.y-12, {steps:5});
  await A.waitForTimeout(70);
  await A.mouse.move(fx, fy, {steps:14});
  await A.waitForTimeout(70);
  await A.mouse.up();
  await A.waitForTimeout(420);
}
async function readHand(A){
  return await A.$$eval('.hand-buttons .tile', els => els.map(el=>{
    const txt=el.querySelector('.tile-text');
    const num=parseInt((txt?.textContent||'').trim());
    const cc=[...(txt?.classList||[])].find(c=>c.startsWith('tile-')&&c!=='tile-text');
    return {num, color: cc?cc.replace('tile-',''):null};
  }));
}
function findFirstMeld(hand){
  const byColor={};
  for(const t of hand){ if(!t.color||isNaN(t.num)) continue; (byColor[t.color]??=new Map()); if(!byColor[t.color].has(t.num)) byColor[t.color].set(t.num,t); }
  for(const color of Object.keys(byColor)){
    const nums=[...byColor[color].keys()].sort((a,b)=>a-b);
    let run=[nums[0]];
    const check=r=>{const s=r.reduce((a,b)=>a+b,0); return r.length>=3&&s>=30;};
    for(let i=1;i<nums.length;i++){
      if(nums[i]===nums[i-1]+1) run.push(nums[i]);
      else { if(check(run)) return run.map(n=>byColor[color].get(n)); run=[nums[i]]; }
    }
    if(check(run)) return run.map(n=>byColor[color].get(n));
  }
  const byNum={};
  for(const t of hand){ if(!t.color||isNaN(t.num)) continue; (byNum[t.num]??=new Map()); if(!byNum[t.num].has(t.color)) byNum[t.num].set(t.color,t); }
  for(const num of Object.keys(byNum).map(Number).sort((a,b)=>b-a)){
    const tiles=[...byNum[num].values()];
    if(tiles.length>=3 && num*tiles.length>=30) return tiles.slice(0,Math.min(4,tiles.length));
  }
  return null;
}
const cls = (A)=>A.locator('button.rummikub-button.end-valid, button.rummikub-button.end-invalid').count();
const hasClass=(A,c)=>A.locator(`button.rummikub-button.${c}`).count();

// ---- RED: place 2 tiles -> a length-2 sequence is invalid ----
let A = await newSoloGame();
let board = await A.locator('.ref .grid-container').boundingBox();
for(let i=0;i<2;i++){ const c=cell(board, 10+i, 3); await dragTileTo(A, A.locator('.hand-buttons .tile').first(), c.x, c.y); }
const redInvalid = await hasClass(A,'end-invalid');
const redValid   = await hasClass(A,'end-valid');
await A.screenshot({path:'/tmp/end-red.png'});
console.log(`RED phase: end-invalid=${redInvalid} end-valid=${redValid}`);
await A.close();

// ---- GREEN: find a >=30 first meld across deals ----
let green=false, tries=0;
while(!green && tries<18){
  tries++;
  A = await newSoloGame();
  const hand = await readHand(A);
  const meld = findFirstMeld(hand);
  if(!meld){ await A.close(); continue; }
  board = await A.locator('.ref .grid-container').boundingBox();
  let col=8, placed=true;
  for(const tile of meld){
    const sel = A.locator('.hand-buttons .tile', {has: A.locator(`.tile-text.tile-${tile.color}`, {hasText: String(tile.num)})}).first();
    if(!(await sel.count())){ placed=false; break; }
    const c=cell(board, col++, 3);
    await dragTileTo(A, sel, c.x, c.y);
  }
  if(!placed){ await A.close(); continue; }
  const gv = await hasClass(A,'end-valid');
  if(gv){ await A.screenshot({path:'/tmp/end-green.png'}); green=true;
    console.log(`GREEN phase: found >=30 meld on deal ${tries}, end-valid=${gv}`); }
  await A.close();
}
await b.close();
console.log(`pageErrors=${errs.length}`);
if(errs.length) console.log(errs.join('\n'));
if(redInvalid!==1 || redValid!==0 || errs.length){ console.log('END HIGHLIGHT RED FAILED'); process.exit(1); }
if(!green){ console.log(`END HIGHLIGHT: green not captured in ${tries} deals (first-move >=30 is rng); red verified`); process.exit(2); }
console.log('END HIGHLIGHT OK — invalid board => red End button, valid >=30 submit => green End button');
