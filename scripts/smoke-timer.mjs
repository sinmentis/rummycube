// Slow E2E (~15s): two players join a 10s-per-turn game and nobody acts. The
// server-validated forceEndTurn must auto-advance the turn (a forced draw fires).
import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const A = await (await b.newContext({viewport:{width:1440,height:900}, permissions:['clipboard-write']})).newPage();
let forcedDraw = 0, turnBegins = 0;
A.on('console', m => { const t=m.text(); if (/tiles pool/i.test(t)) forcedDraw++; if (/ON TURN BEGIN/i.test(t)) turnBegins++; });
await A.goto(BASE, {waitUntil:'networkidle'});
await A.getByPlaceholder('Enter username').fill('alice');
await A.selectOption('#formNumPlayers','2');
await A.selectOption('#timePerTurn','10');   // shortest turn timer
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
const mid = A.url().split('/match/')[1];
const B = await (await b.newContext()).newPage();
await B.goto(`${BASE}/join-match/${mid}`,{waitUntil:'networkidle'});
await B.getByPlaceholder('Enter username').fill('bob');
await B.getByRole('button',{name:'Join',exact:true}).click();
await B.waitForURL(/\/match\//,{timeout:30000});
// nobody acts; wait past the 10s deadline
const tb0 = turnBegins;
await A.waitForTimeout(14000);
await b.close();
console.log(`after idle: turnBegins ${tb0}->${turnBegins}, forcedDraw logs=${forcedDraw}`);
if (turnBegins <= tb0 && forcedDraw < 1) { console.log('TIMER SMOKE FAILED — turn did not auto-advance'); process.exit(1); }
console.log('TIMER SMOKE OK — idle turn auto-advanced via server-validated forceEndTurn');
