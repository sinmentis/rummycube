import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
async function page(){ return (await b.newContext()).newPage(); }
// A creates a 2p game (waiting), B joins it (in progress)
const A = await page();
await A.goto(BASE,{waitUntil:'domcontentloaded'});
await A.getByPlaceholder('Enter username').fill('alice');
await A.selectOption('#formNumPlayers','2');
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
const mid = A.url().split('/match/')[1];
const B = await page();
await B.goto(`${BASE}/join-match/${mid}`,{waitUntil:'domcontentloaded'});
await B.getByPlaceholder('Enter username').fill('bob');
await B.getByRole('button',{name:'Join',exact:true}).click();
await B.waitForURL(/\/match\//,{timeout:30000});
// C creates a 4p game (waiting room, 1 joined)
const C = await page();
await C.goto(BASE,{waitUntil:'domcontentloaded'});
await C.getByPlaceholder('Enter username').fill('carol');
await C.selectOption('#formNumPlayers','4');
await C.getByRole('button',{name:'Create',exact:true}).click();
await C.waitForURL(/\/match\//,{timeout:30000});
await A.waitForTimeout(2500);

// D opens the homepage and reads the live stats
const D = await page();
await D.goto(BASE,{waitUntil:'domcontentloaded'});
await D.waitForTimeout(1500);
const nums = await D.$$eval('.server-stats .stat-num', els => els.map(e=>e.textContent.trim()));
const labels = await D.$$eval('.server-stats .stat-label', els => els.map(e=>e.textContent.trim()));
await D.screenshot({path:'/tmp/server-stats.png'});
await b.close();
const [inProg, waiting, players] = nums.map(n=>parseInt(n));
console.log('stats:', JSON.stringify(nums), JSON.stringify(labels));
if(!(inProg>=1 && waiting>=1 && players>=3)){ console.log('STATS FAILED'); process.exit(1); }
console.log('SERVER STATS OK — homepage shows live in-progress / waiting / players');
