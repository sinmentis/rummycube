import {chromium} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const errs=[];
const A = await (await b.newContext()).newPage(); A.on('pageerror',e=>errs.push('A:'+e));
await A.goto(BASE,{waitUntil:'domcontentloaded'});
await A.getByPlaceholder('Enter username').fill('alice');
await A.selectOption('#formNumPlayers','2');
await A.getByRole('button',{name:'Create',exact:true}).click();
await A.waitForURL(/\/match\//,{timeout:30000});
const matchID = A.url().split('/match/')[1];

const B = await (await b.newContext()).newPage(); B.on('pageerror',e=>errs.push('B:'+e));
await B.goto(`${BASE}/join-match/${matchID}`,{waitUntil:'domcontentloaded'});
await B.getByPlaceholder('Enter username').fill('bob');
await B.getByRole('button',{name:'Join',exact:true}).click();
await B.waitForURL(/\/match\//,{timeout:30000});
await A.waitForTimeout(3000);

// A: open chat, send a typed message, a quick phrase, and an emoji
await A.locator('.chat-toggle').click();
await A.locator('.chat-input input').fill('hello bob 123');
await A.locator('.chat-send').click();
await A.waitForTimeout(400);
await A.locator('.chat-chip', {hasText: 'Nice!'}).click();        // quick phrase -> sends immediately
await A.waitForTimeout(400);
await A.locator('.chat-emoji-btn').first().click();               // append 😺 to input
await A.locator('.chat-send').click();                            // send the emoji
await A.waitForTimeout(1500);

// B: open chat and read what arrived
await B.locator('.chat-toggle').click();
await B.waitForTimeout(600);
const txt = (await B.locator('.chat-messages').innerText()).replace(/\s+/g,' ').trim();
const names = await B.$$eval('.chat-msg .chat-msg-name', els => els.map(e=>e.textContent));
const avatarBgs = await B.$$eval('.chat-msg .chat-msg-avatar', els => els.map(e=>getComputedStyle(e).backgroundImage));
await B.screenshot({path:'/tmp/chat-B.png'});
await A.screenshot({path:'/tmp/chat-A.png'});
await b.close();

console.log('B sees:', JSON.stringify(txt));
console.log('names:', JSON.stringify(names), 'catBgs:', avatarBgs.filter(s=>/cat-\d{2}/.test(s)).length);
console.log('pageErrors=', errs.length); if(errs.length) console.log(errs.join('\n'));
const ok = txt.includes('hello bob 123') && txt.includes('Nice!') && txt.includes('😺')
  && names.includes('alice') && avatarBgs.some(s=>/cat-\d{2}\.png/.test(s)) && !errs.length;
if(!ok){ console.log('CHAT CHECK FAILED'); process.exit(1); }
console.log('CHAT OK — typed text, quick phrase and emoji delivered with sender name + cat');
