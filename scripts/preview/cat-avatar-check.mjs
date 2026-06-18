import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const errs=[];
const ctxA = await b.newContext({permissions:['clipboard-write']});
const A = await ctxA.newPage(); A.on('pageerror',e=>errs.push('A:'+e));
await A.goto(BASE,{waitUntil:'domcontentloaded'});
await A.getByPlaceholder('Enter username').fill('alice');
await A.selectOption('#formNumPlayers','2');
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
const matchID = A.url().split('/match/')[1];

const ctxB = await b.newContext();
const B = await ctxB.newPage(); B.on('pageerror',e=>errs.push('B:'+e));
await B.goto(`${BASE}/join-match/${matchID}`,{waitUntil:'domcontentloaded'});
await B.getByPlaceholder('Enter username').fill('bob');
await B.getByRole('button',{name:'Join',exact:true}).click();
await B.waitForURL(/\/match\//,{timeout:30000});
await A.waitForTimeout(4000);

// read both avatars' background-image on page A
const bgs = await A.$$eval('.avatar', els =>
  els.map(el => getComputedStyle(el).backgroundImage));
// verify the cat images actually decode (naturalWidth>0)
const loaded = await A.evaluate(async (urls) => {
  const test = u => new Promise(res => { const im = new Image(); im.onload=()=>res(im.naturalWidth>0); im.onerror=()=>res(false); im.src=u; });
  return Promise.all(urls.map(test));
}, bgs.map(s => (s.match(/url\("?(.*?)"?\)/)||[])[1]).filter(Boolean));

await A.screenshot({path:'/tmp/cat-avatars.png'});
await b.close();

const cats = bgs.map(s => (s.match(/cat-(\d{2})\.png/)||[])[1]).filter(Boolean);
console.log(`avatars=${bgs.length} cats=${JSON.stringify(cats)} imagesDecoded=${JSON.stringify(loaded)} pageErrors=${errs.length}`);
if(errs.length) console.log(errs.join('\n'));
const ok = cats.length===2 && cats[0]!==cats[1] && loaded.length===2 && loaded.every(Boolean) && !errs.length;
if(!ok){ console.log('CAT AVATAR CHECK FAILED'); process.exit(1); }
console.log('CAT AVATAR OK — both players show distinct, loaded kitten avatars');
