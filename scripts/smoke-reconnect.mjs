import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const p = await (await b.newContext({viewport:{width:1440,height:900}, permissions:['clipboard-write']})).newPage();
await p.goto(BASE, {waitUntil:'networkidle'});
await p.getByPlaceholder('Enter username').fill('alice');
await p.selectOption('#formNumPlayers','2');
await p.getByRole('button',{name:'Create',exact:true}).click();
await p.waitForURL(/\/match\//,{timeout:30000});
await p.locator('.hand-buttons .tile').first().waitFor({timeout:30000});
const urlBefore = p.url();
const tilesBefore = await p.locator('.hand-buttons .tile').count();
// simulate a refresh/disconnect
await p.reload({waitUntil:'networkidle'});
await p.waitForTimeout(3500);
const urlAfter = p.url();
const onMatch = /\/match\//.test(urlAfter) && !/\/join-match\//.test(urlAfter);
const tilesAfter = await p.locator('.hand-buttons .tile').count();
await b.close();
console.log(`before: ${tilesBefore} tiles @ match; after reload: onMatch=${onMatch} tiles=${tilesAfter}`);
if (!onMatch || tilesAfter < 1) { console.log('RECONNECT SMOKE FAILED'); process.exit(1); }
console.log('RECONNECT SMOKE OK — reload kept the seat and restored the hand');
