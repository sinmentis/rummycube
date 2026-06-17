import {chromium} from 'playwright';
const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH});
const p = await (await b.newContext({viewport:{width:1180,height:820}, deviceScaleFactor:2})).newPage();
await p.goto('file://' + process.cwd() + '/scripts/preview/board-preview.html', {waitUntil:'networkidle'});
await p.waitForTimeout(900);
await p.screenshot({path:'/tmp/rc-preview.png'});
await b.close();
console.log('preview shot -> /tmp/rc-preview.png');
