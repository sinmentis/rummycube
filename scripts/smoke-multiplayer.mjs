// Two-client end-to-end check: client A creates a 2-player game, client B joins
// via the share link. Asserts both browsers open a WebSocket to the public host
// (socket.io upgrade through Cloudflare) and receive game state frames — i.e.
// real-time online multiplayer actually works end-to-end.
import {chromium} from 'playwright';

const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const HOST = new URL(BASE).host;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});

function track(page) {
  const s = {wsUrl: null, frames: 0, errors: []};
  page.on('websocket', ws => {
    if (!s.wsUrl) s.wsUrl = ws.url();
    ws.on('framereceived', () => { s.frames++; });
  });
  page.on('pageerror', e => s.errors.push(String(e)));
  return s;
}

// Client A — create a 2-player game
const ctxA = await browser.newContext({permissions: ['clipboard-write']});
const pageA = await ctxA.newPage();
const a = track(pageA);
await pageA.goto(BASE, {waitUntil: 'domcontentloaded', timeout: 30000});
await pageA.getByPlaceholder('Enter username').fill('alice');
await pageA.selectOption('#formNumPlayers', '2');
await pageA.getByRole('button', {name: 'Create', exact: true}).click();
await pageA.waitForURL(/\/match\//, {timeout: 30000});
const matchID = pageA.url().split('/match/')[1];
console.log('A created + entered match:', matchID);

// Client B — join via the share link
const ctxB = await browser.newContext();
const pageB = await ctxB.newPage();
const b = track(pageB);
await pageB.goto(`${BASE}/join-match/${matchID}`, {waitUntil: 'domcontentloaded', timeout: 30000});
await pageB.getByPlaceholder('Enter username').fill('bob');
await pageB.getByRole('button', {name: 'Join', exact: true}).click();
await pageB.waitForURL(/\/match\//, {timeout: 30000});
console.log('B joined match');

// let the sockets exchange state
await pageA.waitForTimeout(5000);
await browser.close();

console.log('A:', JSON.stringify(a));
console.log('B:', JSON.stringify(b));

const wsOk = s => s.wsUrl && s.wsUrl.includes(HOST) && s.frames > 0 && s.errors.length === 0;
if (!wsOk(a) || !wsOk(b)) {
  console.log('MULTIPLAYER SMOKE FAILED');
  process.exit(1);
}
console.log('MULTIPLAYER SMOKE OK — two clients connected over WSS through Cloudflare and received game state');
