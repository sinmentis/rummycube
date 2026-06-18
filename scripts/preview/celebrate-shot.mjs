import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const errs=[];
function cell(board,col,row){const cw=board.width/32,ch=board.height/9;return {x:board.x+(col+0.5)*cw,y:board.y+(row+0.5)*ch};}
async function dragTileTo(A,sel,fx,fy){
  const t=await sel.boundingBox();
  await A.mouse.move(t.x+t.width/2,t.y+t.height/2); await A.mouse.down();
  await A.mouse.move(t.x+t.width/2+16,t.y-12,{steps:5}); await A.waitForTimeout(70);
  await A.mouse.move(fx,fy,{steps:14}); await A.waitForTimeout(70); await A.mouse.up(); await A.waitForTimeout(420);
}
async function readHand(A){return await A.$$eval('.hand-buttons .tile',els=>els.map(el=>{const x=el.querySelector('.tile-text');const num=parseInt((x?.textContent||'').trim());const cc=[...(x?.classList||[])].find(c=>c.startsWith('tile-')&&c!=='tile-text');return {num,color:cc?cc.replace('tile-',''):null};}));}
function findFirstMeld(hand){
  const byColor={};for(const t of hand){if(!t.color||isNaN(t.num))continue;(byColor[t.color]??=new Map());if(!byColor[t.color].has(t.num))byColor[t.color].set(t.num,t);}
  for(const color of Object.keys(byColor)){const nums=[...byColor[color].keys()].sort((a,b)=>a-b);let run=[nums[0]];const ck=r=>r.length>=3&&r.reduce((a,b)=>a+b,0)>=30;
    for(let i=1;i<nums.length;i++){if(nums[i]===nums[i-1]+1)run.push(nums[i]);else{if(ck(run))return run.map(n=>byColor[color].get(n));run=[nums[i]];}}if(ck(run))return run.map(n=>byColor[color].get(n));}
  const byNum={};for(const t of hand){if(!t.color||isNaN(t.num))continue;(byNum[t.num]??=new Map());if(!byNum[t.num].has(t.color))byNum[t.num].set(t.color,t);}
  for(const num of Object.keys(byNum).map(Number).sort((a,b)=>b-a)){const ts=[...byNum[num].values()];if(ts.length>=3&&num*ts.length>=30)return ts.slice(0,Math.min(4,ts.length));}
  return null;
}
let ok=false,tries=0;
while(!ok&&tries<18){
  tries++;
  const A=await ctx.newPage(); A.on('pageerror',e=>errs.push(String(e)));
  await A.goto(BASE,{waitUntil:'networkidle'});
  await A.getByPlaceholder('Enter username').fill('solo');
  await A.selectOption('#formNumPlayers','0');
  await A.getByRole('button',{name:'Create',exact:true}).click();
  await A.waitForURL(/\/match\//,{timeout:30000}); await A.waitForTimeout(3500);
  const meld=findFirstMeld(await readHand(A));
  if(!meld){await A.close();continue;}
  const board=await A.locator('.ref .grid-container').boundingBox();
  let col=9,placed=true;
  for(const tile of meld){
    const sel=A.locator('.hand-buttons .tile',{has:A.locator(`.tile-text.tile-${tile.color}`,{hasText:String(tile.num)})}).first();
    if(!(await sel.count())){placed=false;break;}
    const c=cell(board,col++,3); await dragTileTo(A,sel,c.x,c.y);
  }
  if(!placed){await A.close();continue;}
  await A.getByRole('button',{name:'End',exact:true}).click();
  await A.waitForTimeout(450);                       // mid-celebration
  const glowing=await A.locator('.tile-celebrate').count();
  await A.screenshot({path:'/tmp/celebrate.png'});
  console.log(`deal ${tries}: meldTiles=${meld.length} glowingTiles=${glowing}`);
  if(glowing>=3){ok=true;}
  await A.close();
}
await b.close();
console.log(`pageErrors=${errs.length}`); if(errs.length) console.log(errs.join('\n'));
if(!ok||errs.length){console.log('CELEBRATE SHOT FAILED');process.exit(1);}
console.log('CELEBRATE OK — formed group lights up gold on a valid submit');
