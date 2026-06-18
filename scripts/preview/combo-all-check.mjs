import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
function cell(bx,c,r){const cw=bx.width/32,ch=bx.height/9;return {x:bx.x+(c+0.5)*cw,y:bx.y+(r+0.5)*ch};}
async function drag(P,sel,fx,fy){const t=await sel.boundingBox();await P.mouse.move(t.x+t.width/2,t.y+t.height/2);await P.mouse.down();await P.mouse.move(t.x+t.width/2+16,t.y-12,{steps:5});await P.waitForTimeout(70);await P.mouse.move(fx,fy,{steps:14});await P.waitForTimeout(70);await P.mouse.up();await P.waitForTimeout(420);}
async function handFull(P){return P.$$eval('.hand-buttons .tile',els=>els.map(e=>{const x=e.querySelector('.tile-text');const num=parseInt((x?.textContent||'').trim());const cc=[...(x?.classList||[])].find(c=>c.startsWith('tile-')&&c!=='tile-text');return{num,color:cc?cc.replace('tile-',''):null};}));}
function findMeld(h){
  const byColor={};for(const t of h){if(!t.color||isNaN(t.num))continue;(byColor[t.color]??=new Map());if(!byColor[t.color].has(t.num))byColor[t.color].set(t.num,t);}
  for(const c of Object.keys(byColor)){const ns=[...byColor[c].keys()].sort((a,b)=>a-b);let run=[ns[0]];const ok=r=>r.length>=3&&r.reduce((a,b)=>a+b,0)>=30;
    for(let i=1;i<ns.length;i++){if(ns[i]===ns[i-1]+1)run.push(ns[i]);else{if(ok(run))return run.map(n=>byColor[c].get(n));run=[ns[i]];}}if(ok(run))return run.map(n=>byColor[c].get(n));}
  const byNum={};for(const t of h){if(!t.color||isNaN(t.num))continue;(byNum[t.num]??=new Map());if(!byNum[t.num].has(t.color))byNum[t.num].set(t.color,t);}
  for(const n of Object.keys(byNum).map(Number).sort((a,b)=>b-a)){const ts=[...byNum[n].values()];if(ts.length>=3&&n*ts.length>=30)return ts.slice(0,Math.min(4,ts.length));}
  return null;}
const isActive=P=>P.locator('.rack-self .avatar.active').count().then(c=>c>0);

let ok=false,tries=0,errs=0;
while(!ok && tries<16){
  tries++;
  const cA=await b.newContext(), cB=await b.newContext();
  const A=await cA.newPage(), B=await cB.newPage();
  A.on('pageerror',()=>errs++); B.on('pageerror',()=>errs++);
  await A.goto(BASE,{waitUntil:'domcontentloaded'});
  await A.getByPlaceholder('Enter username').fill('alice');
  await A.selectOption('#formNumPlayers','2');
  await A.getByRole('button',{name:'Create',exact:true}).click();
  await A.waitForURL(/\/match\//,{timeout:30000});
  const mid=A.url().split('/match/')[1];
  await B.goto(`${BASE}/join-match/${mid}`,{waitUntil:'domcontentloaded'});
  await B.getByPlaceholder('Enter username').fill('bob');
  await B.getByRole('button',{name:'Join',exact:true}).click();
  await B.waitForURL(/\/match\//,{timeout:30000});
  await A.waitForTimeout(2800);
  // whoever's turn it is becomes the actor; the other observes
  const aAct=await isActive(A), bAct=await isActive(B);
  const actor = aAct?A:bAct?B:null, observer = aAct?B:bAct?A:null;
  const actorName = aAct?'alice':'bob';
  if(!actor){await cA.close();await cB.close();continue;}
  const m=findMeld(await handFull(actor));
  if(!m){await cA.close();await cB.close();continue;}
  const board=await actor.locator('.ref .grid-container').boundingBox();
  let col=9,placed=true;
  for(const tile of m){const sel=actor.locator('.hand-buttons .tile',{has:actor.locator(`.tile-text.tile-${tile.color}`,{hasText:String(tile.num)})}).first();if(!(await sel.count())){placed=false;break;}const c=cell(board,col++,3);await drag(actor,sel,c.x,c.y);}
  if(!placed){await cA.close();await cB.close();continue;}
  await actor.getByRole('button',{name:'End',exact:true}).click();
  await observer.waitForTimeout(700);
  const ov=await observer.locator('.combo-overlay').count();
  const txt=ov?((await observer.locator('.combo-overlay').innerText()).replace(/\s+/g,' ').trim()):'';
  await observer.screenshot({path:'/tmp/combo-all-observer.png'});
  console.log(`deal ${tries}: actor=${actorName} meld=${m.length} observer.comboOverlay=${ov} text="${txt}"`);
  if(ov>=1 && txt.includes(actorName)) ok=true;
  await cA.close();await cB.close();
}
await b.close();
console.log('pageErrors=',errs);
if(!ok||errs){console.log('COMBO-ALL FAILED');process.exit(1);}
console.log('COMBO-ALL OK — the non-acting player also sees the scorer combo');
