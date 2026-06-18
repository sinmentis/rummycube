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
await A.waitForTimeout(2500);

// A starts typing (no send yet) -> typing ping -> B should show "alice is typing…"
await A.locator('.chat-input input').pressSequentially('hello bob 123', {delay: 40});
await B.waitForTimeout(700);
const typingText = (await B.locator('.chat-typing').innerText().catch(()=>'')).trim();
const typingSeen = /typing/i.test(typingText) && /alice/i.test(typingText);

// A sends the typed message, a quick phrase, and an emoji
await A.locator('.chat-send').click();
await A.waitForTimeout(300);
await A.locator('.chat-chip', {hasText: 'Nice!'}).click();
await A.waitForTimeout(300);
await A.locator('.chat-emoji-btn').first().click();
await A.locator('.chat-send').click();
await A.waitForTimeout(1500);

const txt = (await B.locator('.chat-messages').innerText()).replace(/\s+/g,' ').trim();
const names = await B.$$eval('.chat-msg .chat-msg-name', els => els.map(e=>e.textContent));
const catBgs = await B.$$eval('.chat-msg .chat-msg-avatar', els => els.map(e=>getComputedStyle(e).backgroundImage));
await B.screenshot({path:'/tmp/chat-typing-B.png'});
await b.close();

console.log('typingText=', JSON.stringify(typingText), 'typingSeen=', typingSeen);
console.log('B sees:', JSON.stringify(txt));
console.log('names=', JSON.stringify(names), 'catBgs=', catBgs.filter(s=>/cat-\d{2}/.test(s)).length, 'errs=', errs.length);
if(errs.length) console.log(errs.join('\n'));
const ok = typingSeen && txt.includes('hello bob 123') && txt.includes('Nice!') && txt.includes('😺')
  && names.includes('alice') && catBgs.some(s=>/cat-\d{2}\.png/.test(s)) && !errs.length;
if(!ok){ console.log('CHAT/TYPING FAILED'); process.exit(1); }
console.log('CHAT/TYPING OK — typing indicator + text/phrase/emoji delivered with name + cat');
