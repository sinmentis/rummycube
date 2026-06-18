import {chromium, devices} from 'playwright';
const BASE = process.env.SMOKE_URL || 'https://game.shunlyu.com';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});

async function shot(opts, tag) {
  const ctx = await b.newContext({...opts, permissions:['clipboard-write']});
  const p = await ctx.newPage();
  await p.goto(BASE, {waitUntil:'networkidle'});
  await p.waitForTimeout(800);
  await p.screenshot({path:`/tmp/r5-${tag}-lobby.png`, fullPage:false});
  await p.getByPlaceholder('Enter username').fill('alice');
  await p.selectOption('#formNumPlayers','2');
  await p.getByRole('button',{name:'Create',exact:true}).click();
  await p.waitForURL(/\/match\//,{timeout:30000});
  await p.waitForTimeout(3500);
  await p.screenshot({path:`/tmp/r5-${tag}-match.png`, fullPage:false});
  await ctx.close();
  console.log(`shots -> /tmp/r5-${tag}-lobby.png /tmp/r5-${tag}-match.png`);
}
await shot({viewport:{width:1440,height:900}}, 'desktop');
await shot({...devices['Pixel 7']}, 'mobile');
await b.close();
