# RummyCube 优化 · 测试在环与部署校验(DevOps Automator)

**日期:** 2026-06-20 · **作者角色:** DevOps Automator · **状态:** 实现级方案草案
**权威来源:** `docs/optimization/2026-06-20-rummycube-optimization-spec.md`
**约束:** 本机为单 VM、rootless podman、无外部 CI 平台 —— 全部 gate 落到「本地可跑命令/脚本」。GitHub Actions 仅作可选建议并标注前置条件。

> 说明:本文不改任何代码、不 commit。所有数值阈值标 `[PLACEHOLDER]`,由 owner 在落地时定档。论断尽量给 `file:line`,无法确认者标「待核实」。

---

## 0. 现状基线(已核实)

| 事实 | 证据 |
| --- | --- |
| 测试约 84 用例,全部为纯逻辑(node 环境),**无任何 RTL/jsdom 测试** | `src/tests/*.test.js`(grep `testing-library/react` 0 命中);`jest.config.cjs` 未设 `testEnvironment`/`setupFilesAfterEnv` |
| jest 经 `.babelrc` 的 `env.test` 把 ESM 转 CJS | `.babelrc:1`(`@babel/plugin-transform-modules-commonjs`) |
| `setupTests.js` 引入 jest-dom,但**未被 jest 接线** | `src/setupTests.js:1`;`jest.config.cjs` 全为注释默认值 |
| **`npm run build` 当前是坏的** | `package.json:27` = `source .env.production.local && vite build`;`.env.production.local` 不存在,且 npm 用 `/bin/sh` → `sh: 1: source: not found`(实测 exit 127) |
| 规范构建命令为 `npx vite build` | `Dockerfile:7`(stage build 用 `RUN npx vite build`) |
| 产物单 chunk:JS 563115 B、CSS 293965 B | `build/assets/index-ZSJvtAY8.js`、`build/assets/index-C1EFdJ68.css`(与 spec「563KB bundle」一致) |
| 生产 bundle 当前含 `console.log` 与 `RENDER BOARD` | `src/rummikub/components/Board.jsx:27` = `console.log('RENDER BOARD')`;vite 暂无 `esbuild.drop` |
| 容器把 9119 发布到 `127.0.0.1:8093` | `deploy/shunlyu-rummycube.container:6`(`PublishPort=127.0.0.1:8093:9119`) |
| server 端口 `PORT || 9119`,静态服务 `../build` | `src/server.js:18,21` |
| smoke 默认指向**线上** `https://game.shunlyu.com` | 各 `scripts/smoke-*.mjs` 顶部 `process.env.SMOKE_URL \|\| 'https://game.shunlyu.com'`;`smoke-rest.sh:3` 用 `$1` |
| Playwright chromium 缓存路径(版本号会漂移) | `deploy/README.md:51`(`chromium-1228`);`playwright ^1.32.3`(`package.json:62`) |

---

## 1. 当前可用命令清单与前置条件

### 1.1 构建
```bash
# 规范本地构建(与 Dockerfile 一致)—— 不要用 npm run build(已坏,见 §0)
cd ~/work/rummycube && npx vite build      # 产物落 build/(BUILD_PATH 默认 build,vite.config.js:116)
```
- 前置:仓库根;`node_modules` 已装(`npm ci`)。
- 备注:`npm run build`(`package.json:27`)依赖不存在的 `.env.production.local` 且用 `source`,在 sh 下失败 —— **建议修复为 `vite build`**(见 §3.7 开放项),在修复前 CI 一律用 `npx vite build`。

### 1.2 单元测试
```bash
cd ~/work/rummycube && npm test            # = jest,约 84 用例
npx jest src/tests/<file>.test.js          # 单文件
```
- 前置:仓库根;`node_modules`。当前 jest 跑 node 环境(纯逻辑用例够用)。
- ⚠️ WS-4 的 render-count(RTL)需要先把 jest 接上 jsdom + setupTests(见 §2.1)。

### 1.3 Smoke(Playwright + REST)
```bash
# 公共前置(headless 浏览器类 smoke 全部需要):
export CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
cd ~/work/rummycube                        # 必须在仓库根

# 针对线上(默认):
node scripts/smoke-frontend.mjs            # SPA 加载、root 有子节点、无 console error
node scripts/smoke-multiplayer.mjs         # 两客户端 WSS 互联并收到状态帧(2p)
node scripts/smoke-reconnect.mjs           # 刷新后保座位、手牌恢复(2p)
node scripts/smoke-timer.mjs               # ~15s,10s/回合空闲自动 forceEndTurn(2p)
node scripts/smoke-touch.mjs               # Pixel 7 视口,tile touch-action:none(2p)
./scripts/smoke-rest.sh https://game.shunlyu.com   # lobby REST create/join

# 针对本地容器(部署校验用),改 SMOKE_URL / REST 入参:
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-frontend.mjs
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-multiplayer.mjs
./scripts/smoke-rest.sh http://127.0.0.1:8093
```
- **`solo test` 模式**:CreateGame 下拉 `0 · solo test`(`src/rummikub/components/CreateGame.jsx:75`,`value="0"`,注释 `CreateGame.jsx:22`)= 真单人局,无需第二客户端。spec 多处「Playwright (solo)」验收点应走该模式,避免双客户端时序 flake。**待核实**:现有 smoke 均为 2p;solo 路径尚无脚本,需新增(见 §2.5)。
- 前置汇总:`CHROMIUM_PATH`(否则 reconnect/timer/touch 因 `executablePath: undefined` 找不到浏览器,frontend/multiplayer 会回退系统 chromium —— 不可靠);仓库根;本地校验时 `SMOKE_URL`/REST 入参指向 `http://127.0.0.1:8093`。

### 1.4 部署
```bash
podman build -t shunlyu-rummycube:latest ~/work/rummycube \
  && systemctl --user restart shunlyu-rummycube.service
```
- 前置:Quadlet 单元 `deploy/shunlyu-rummycube.container` 已装入 `~/.config/containers/systemd/`(`deploy/README.md:15`)。
- ⚠️ 仓库根 `deploy.sh` / `restart.sh` 已过时,**勿用**。

### 1.5 验证 curl
```bash
curl -sS http://127.0.0.1:8093/games          # 期望 ["RummyCube"]
curl -sS http://127.0.0.1:8093/api/stats       # 期望 {inProgress,waiting,players}(src/server.js:25+)
curl -sS https://game.shunlyu.com/games        # 经 Cloudflare 的端到端
```

---

## 2. 新增自动化校验的实现方案

### 2.1 render-count 断言(WS-4)

**目标(spec:88):** 一个 dev-only render 计数器(生产构建被剥离)+ jest/RTL 断言:计时器 tick **不**重渲 `GridContainer`;选中一个 tile 只重渲变化的 tile,而非全部 ~330。

**前置改造(必须,当前缺):** `jest.config.cjs` 增加
```js
testEnvironment: 'jest-environment-jsdom',
setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
```
并装 `jest-environment-jsdom`(jest 29 已拆包)。否则 RTL `render()` 无 DOM。

**计数器落点:** 新增 `src/rummikub/devRenderCounter.js`,导出 `bumpRender(name)` / `getRenderCounts()` / `resetRenderCounts()`。在 `Tile`、`GridSlot`、`GridContainer` 渲染体顶部调用:
```js
if (import.meta.env.DEV) bumpRender('GridContainer');
```
- **生产剥离机制(双保险):**
  1. Vite 在生产把 `import.meta.env.DEV` 静态替换为 `false` → 该 `if` 块被死代码消除;
  2. spec:85 要求的 `vite.config` 增 `esbuild: { drop: ['console','debugger'] }` 进一步清掉残留日志。
- **jest 兼容:** jest 不认 `import.meta.env`;用 babel 把测试环境的 `import.meta.env.DEV` 视为 `true`(或在计数器内用 `process.env.NODE_ENV !== 'production'` 作为 jest 可读的等价判定,Vite 端仍走 `import.meta.env.DEV`)。**待核实**:需确认所选写法同时被 `@vitejs/plugin-react` 生产 build 消除、又能在 jest 下计数。

**判定(测试落点 `src/tests/render-count.test.jsx`):**
- 渲染 `GridContainer` 包裹的最小棋盘(构造 fixture 占位,避免随机发牌);
- `resetRenderCounts()` → 触发一次计时器 tick(以受控 prop/假定时器模拟 `<TurnTimer>` 自治后 Board 不变)→ 断言 `getRenderCounts().GridContainer === 0`(tick 后增量为 0);
- `resetRenderCounts()` → 切换单个 tile 的 `isSelected` → 断言只有该 tile 计数 +1,其余 tile 与 `GridContainer` 计数为 0。
- **阈值:** 全量重渲基数 `[PLACEHOLDER]`(spec 提到 ~330);单选重渲上限 `[PLACEHOLDER]`(应为「被选 + 被取消选」的 tile 数,典型 ≤2)。

### 2.2 生产 bundle 无 console.log / 无 'RENDER BOARD'(WS-4)

**脚本 `scripts/check-bundle-clean.sh`:**
```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="${1:-build/assets}"
fail=0
for pat in 'console\.log' 'RENDER BOARD'; do
  if grep -RIlE "$pat" "$DIR"/*.js >/dev/null 2>&1; then
    echo "FAIL: 命中 '$pat':"; grep -RIlE "$pat" "$DIR"/*.js; fail=1
  fi
done
[ "$fail" -eq 0 ] && echo "BUNDLE CLEAN OK" || exit 1
```
- 前置:先 `npx vite build`。
- 备注:`esbuild.drop:['console']` 会删掉**全部** `console.*`;若只想禁 `console.log` 保留 `console.error`,改用 `pure` 选项或仅 grep `console\.log`。本脚本只硬性卡 `console.log` + `RENDER BOARD`(与 spec:89 字面一致),`console.error`(`src/server.js` 用于 stats)不在前端 bundle,故不受影响。

### 2.3 bundle 体积预算(WS-13)

**脚本 `scripts/check-bundle-budget.mjs`:**
```js
import {readdirSync, statSync} from 'node:fs';
const DIR = 'build/assets';
const LIMIT_MAIN = Number(process.env.MAIN_JS_LIMIT_BYTES || /*[PLACEHOLDER]*/ 0);
const LIMIT_TOTAL = Number(process.env.TOTAL_JS_LIMIT_BYTES || /*[PLACEHOLDER]*/ 0);
const js = readdirSync(DIR).filter(f => f.endsWith('.js'));
const sizes = js.map(f => ({f, b: statSync(`${DIR}/${f}`).size})).sort((a,b)=>b.b-a.b);
const main = sizes[0]?.b ?? 0;
const total = sizes.reduce((s,x)=>s+x.b,0);
console.table(sizes);
console.log('chunks:', js.length, 'main:', main, 'total:', total);
let ok = true;
if (js.length < 2) { console.log('FAIL: 期望 >1 个 chunk(manualChunks 拆分)'); ok = false; }
if (LIMIT_MAIN && main > LIMIT_MAIN) { console.log(`FAIL: 主 chunk ${main} > ${LIMIT_MAIN}`); ok = false; }
if (LIMIT_TOTAL && total > LIMIT_TOTAL) { console.log(`FAIL: 总 JS ${total} > ${LIMIT_TOTAL}`); ok = false; }
process.exit(ok ? 0 : 1);
```
- 基线参考:当前主 chunk 563115 B、单 chunk。spec:150 验收 = 「emits >1 chunk 且主 chunk 明显缩小」。
- **阈值定档建议:** 完成 `manualChunks`(vendor/boardgame.io)+ `React.lazy`(GameOverModal/confetti/ComboOverlay)后量一次真实值,主 chunk 上限设为该值 + ~10% 余量 = `[PLACEHOLDER]`;总 JS 上限 `[PLACEHOLDER]`。CSS 293965 B 另设 `[PLACEHOLDER]`(可选)。

### 2.4 对比度断言(WS-8)

**目标(spec:115):** 橙色数字在象牙 tile 面上对比度 ≥3:1(WCAG 非文本/大字阈值)。

**首选:纯 node WCAG 计算 `scripts/check-contrast.mjs`(无外部依赖):**
```js
// WCAG 2.x 相对亮度 + 对比度比;输入两个 hex
const lin = c => (c/=255, c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4);
const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const hex = h => h.replace('#','').match(/../g).map(x=>parseInt(x,16));
const ratio = (a,b)=>{const l1=L(hex(a)),l2=L(hex(b));const [hi,lo]=l1>l2?[l1,l2]:[l2,l1];return (hi+0.05)/(lo+0.05);};
const ORANGE = process.env.C_ORANGE || '#b5650a';     // spec 建议值;实际取自 CSS 变量
const TILE   = process.env.TILE_FACE || '/*[PLACEHOLDER 象牙色 hex 待核实]*/';
const r = ratio(ORANGE, TILE);
console.log(`contrast(${ORANGE} on ${TILE}) = ${r.toFixed(2)}:1`);
process.exit(r >= 3 ? 0 : 1);   // 阈值 3:1
```
- **待核实:** tile 面象牙色精确 hex 与 `--c-orange` 现值需从 CSS(`src/App.css`/`src/index.css`/styled-components)取出;脚本可改为解析 CSS 变量而非硬编码,避免漂移。
- **次选(端到端真实计算值):** Playwright(solo)取 tile 数字的 `getComputedStyle().color` 与父面 `background-color`,跑同一 `ratio()`,断言 ≥3。可捕捉「变量被覆盖/继承」的真实渲染色,但需浏览器,较慢。
- **可选增强:** 若愿装 `@axe-core/playwright`(前置:`npm i -D`,需联网),可顺带跑 axe 颜色对比规则;但 axe 对「非文本数字」判定不稳,纯计算更可控,作为权威。

### 2.5 a11y / 可见性(WS-3/6/7)Playwright 断点断言

复用 `smoke-touch.mjs` 的 `devices['Pixel 7']`(390×844 近似),新增 **solo** smoke(避免双客户端 flake),断言点:

- **WS-3 棋盘可读(solo):** 拖拽开始时空 `.grid-item` 出现 droppable 标记类/状态(`expect(locator('.grid-item.<droppable-class>')).toHaveCount(>0)`);单 tile 偏移 < 半格仍提交(Undo 变可用)。**待核实**:droppable 标记类名待 WS-3 实现确定。
- **WS-6 等待室(2p 或 solo 不适用 → 用 2p):** 新建 2p 局即出现等待遮罩含 "1 of 2";第二人加入前棋盘不可交互(`board` 上有 disabled/dim 态)。
- **WS-7 移动布局(390×844):** 每张手牌都在可滚动 rack 内(无裁剪 —— 比较 tile `boundingBox` 是否落在 rack 容器内);chat 不遮挡 "Tiles left" HUD(z-index/留行 —— 断两者 bounding box 不相交);控制行(Sort/Draw/Submit/Undo/Redo)在首屏内(`boundingBox().y + height <= viewport.height`);`pageerror === 0`。
- **断点矩阵建议:** 390×844(手机)、768×1024(平板/笔电,UI-5 控制行被推到底的回归点)、1440×900(现有 reconnect/timer 用)。脚本以 `VIEWPORT` 环境变量参数化。

---

## 3. 每个 Sprint 的 CI gate 与 verify 聚合脚本

### 3.0 verify 聚合脚本设想

新增 `scripts/verify.sh`(本地一键,无需 CI 平台),按层次跑、`set -e` 任一失败即红:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CHROMIUM_PATH="${CHROMIUM_PATH:-$HOME/.cache/ms-playwright/chromium-1228/chrome-linux/chrome}"
LEVEL="${1:-unit}"   # unit | build | smoke | all

echo "== jest =="; npm test
if [ "$LEVEL" = unit ]; then exit 0; fi

echo "== build =="; npx vite build
echo "== bundle clean =="; scripts/check-bundle-clean.sh
echo "== bundle budget =="; node scripts/check-bundle-budget.mjs
echo "== contrast =="; node scripts/check-contrast.mjs
if [ "$LEVEL" = build ]; then exit 0; fi

URL="${SMOKE_URL:-http://127.0.0.1:8093}"
echo "== rest smoke =="; scripts/smoke-rest.sh "$URL"
echo "== frontend smoke =="; SMOKE_URL="$URL" node scripts/smoke-frontend.mjs
echo "== multiplayer smoke =="; SMOKE_URL="$URL" node scripts/smoke-multiplayer.mjs
echo "VERIFY OK ($LEVEL)"
```
并在 `package.json` 加 npm script(同时**修复 build**):
```json
"build": "vite build",
"verify": "scripts/verify.sh unit",
"verify:build": "scripts/verify.sh build",
"verify:smoke": "scripts/verify.sh smoke",
"verify:all": "scripts/verify.sh all"
```
> 注:smoke 层默认打本地容器(`127.0.0.1:8093`),需先 §4 部署起服务;也可 `SMOKE_URL=https://game.shunlyu.com` 打线上。

### 3.1 Sprint 1(P0:WS-1/2/3/4/6)进入下一 Sprint 前必须绿
```bash
npm test                                   # WS-1 submitRejectReason/submitMeld/forfeitTurn;WS-3 resolveDropSlot;render-count
npx vite build                             # 必须成功(且 esbuild.drop 生效)
scripts/check-bundle-clean.sh              # WS-4:无 console.log / RENDER BOARD
node scripts/render-count(经 npm test 覆盖)  # WS-4 RTL 断言
# 起本地容器后:
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-frontend.mjs   # 无 console error / per-tick 日志
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-multiplayer.mjs
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-touch.mjs       # WS-3 既有拖拽未回归
# 新增 solo smoke:WS-1 红按钮+内联原因不改板;WS-3 droppable 标记;WS-6 等待遮罩 1 of 2
```
gate 命中 spec 验收:WS-4 render-count(:88)、bundle 无 console(:89);WS-1 jest(:49-52);WS-3 jest+solo(:74-76);WS-6 等待室(:105)。

### 3.2 Sprint 2(P1:WS-5/7/8/9)
```bash
npm test                                   # WS-9 combo/juice-gating jest(:124-125)
npx vite build && scripts/check-bundle-clean.sh
node scripts/check-contrast.mjs            # WS-8 ≥3:1(:115)
# smoke:
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-mobile-390.mjs  # 新增,WS-7(:110)
... node scripts/smoke-turn-banner.mjs     # 新增,WS-5「Your turn」+ 递减秒数(:99)
... 既有 frontend/multiplayer/touch 全绿
```

### 3.3 Sprint 3(P2:WS-10/11/12/13/14)
```bash
npm test                                   # WS-10 playableTiles;WS-11 joker 取回/计分;WS-12 grace 推进
npx vite build
node scripts/check-bundle-budget.mjs       # WS-13:>1 chunk 且主 chunk 缩小(:150)
node scripts/check-bundle-clean.sh
# smoke:
... node scripts/smoke-reconnect.mjs       # WS-13 reconnecting 横幅 + 持久化后重启重连
... node scripts/smoke-input-tap.mjs        # 新增,WS-14 两次 tap 放置(:155)
```
> WS-12 先交「连接态→权威状态」spike 文档(spec:145)方可估时与写 gate。

---

## 4. 部署校验流程与回滚

### 4.1 标准发布流水(本地命令)
```bash
# 1) 构建镜像(多阶段,内部 npx vite build —— 与本地 build gate 同源)
podman build -t shunlyu-rummycube:latest ~/work/rummycube

# 2) 重启服务(Quadlet)
systemctl --user restart shunlyu-rummycube.service
sleep 2

# 3) 冒烟 gate(必须按序绿)
test "$(curl -sS http://127.0.0.1:8093/games)" = '["RummyCube"]'   # 健康探针
./scripts/smoke-rest.sh http://127.0.0.1:8093                       # lobby REST
export CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-frontend.mjs
SMOKE_URL=http://127.0.0.1:8093 node scripts/smoke-multiplayer.mjs

# 4) 端到端(经 Cloudflare,可选但建议)
curl -sS https://game.shunlyu.com/games                            # 期望 ["RummyCube"]
node scripts/smoke-frontend.mjs                                    # 默认线上
```
建议把上述固化为 `scripts/deploy-verify.sh`(build→restart→curl→关键 smoke),失败即非零退出并提示回滚。

### 4.2 回滚

当前 `Image=localhost/shunlyu-rummycube:latest`(`deploy/shunlyu-rummycube.container:5`)始终指 `latest`,**无版本化镜像 → 无法直接回退上一构建**。缓解方案(建议落地):
1. **构建即打双标签:** `podman build -t shunlyu-rummycube:latest -t shunlyu-rummycube:$(git rev-parse --short HEAD) ~/work/rummycube`;`podman images` 保留近 N 个 SHA tag。
2. **回滚:** 把 Quadlet `Image=` 临时改指上一个 SHA(或 `podman tag <prev-sha> shunlyu-rummycube:latest`)→ `systemctl --user daemon-reload && systemctl --user restart shunlyu-rummycube.service` → 重跑 §4.1 step 3 探针。
3. **快速兜底(无版本镜像时):** `git checkout <上个good commit> && podman build ... && systemctl --user restart`(代码回滚重建)。
4. **重启即恢复:** 因 InMemory(见 §5),`restart` 会清空在途对局 —— 回滚窗口应避开活跃对局或提前公告。

---

## 5. 持久化(WS-13)引入后对部署的影响

**现状:** `src/server.js` 未配 `db` → boardgame.io 用 InMemory(spec:167)。**每次 `podman build` 后 `restart` 都会清空在途对局 + `/api/stats` 计数,重启窗口内 reconnect 必失败。** 这直接影响 §4 的回滚窗口与 WS-13 reconnect smoke 的可信度。

**引入 FlatFile / SQLite 后:**
- **Quadlet 增 Volume:** 在 `deploy/shunlyu-rummycube.container` 增 `Volume=shunlyu-rummycube-data:/data`(或绑定 `~/work/rummycube-data:/data:Z`,rootless 注意 SELinux `:Z`/`:U` 与 uid 映射);server 写 `/data` 下的 FlatFile 目录或 `*.sqlite`。
- **重启窗口:** 持久化后 `restart` **保留**在途对局,reconnect 在重启后可恢复 → 回滚/发布对玩家近乎无感(仍有几秒 socket 断线,由 WS-13「reconnecting…」横幅承接)。
- **新增部署校验点:** 部署后断言 Volume 已挂载且可写(`podman volume inspect` / 容器内 `test -w /data`);升级时若 DB schema 变化需迁移步骤(SQLite 比 FlatFile 更需要)。
- **备份:** Volume 纳入备份;回滚镜像时**不要**回滚 DB(数据向前兼容),否则丢已存对局。
- **资源:** SQLite 文件增长 + WAL 需关注 `MemoryMax=512M`(`shunlyu-rummycube.container:19`)外的磁盘;FlatFile 多文件对 inode/IO 友好度较低但最简单(spec 开放问题 5)。
- **选型建议(承 spec:187):** 先 FlatFile(挂卷文件、零依赖)解锁 reconnect/stats 持久;若后续需查询则迁 SQLite。

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **Flaky smoke**(多客户端 WS 时序、`waitForTimeout` 固定等待) | CI gate 假红、阻塞 sprint | spec 验收尽量走 **solo test 模式**(`CreateGame.jsx:75`)去掉双客户端竞态;固定等待改 `waitForSelector`/`expect.poll`;关键 smoke 加 1 次重试包装(retry-once),仍红才判失败;timer smoke(14s)单独跑、不并入快路径 |
| **CHROMIUM_PATH 漂移**(`chromium-1228` 随 Playwright 升级变目录) | 所有浏览器 smoke 找不到 chrome | verify 脚本启动时探测 `[ -x "$CHROMIUM_PATH" ]`,否则 `ls ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | tail -1` 自动取最新并告警;或 `npx playwright install chromium` 并改用 Playwright 默认解析(去掉硬编码路径) |
| **`npm run build` 已坏** | 误用导致 CI 永红 | 修 `package.json:27` 为 `vite build`(§3.0);在修复前所有文档/脚本统一用 `npx vite build` |
| **jest 无 jsdom** | WS-4 RTL render-count 无法运行 | Sprint 1 起手先接 `testEnvironment: jsdom` + `setupFilesAfterEnv`,装 `jest-environment-jsdom`,作为 WS-4 前置任务 |
| **podman 资源上限**(`MemoryMax=512M`,`CPUQuota=100%`) | build/smoke 与服务争内存,OOM 杀容器;并发 Playwright 吃内存 | smoke 串行跑(verify 已串行);build 与 restart 错峰;监控 `systemctl --user status` 的 OOM;必要时临时调高 `MemoryMax` 仅用于带持久化的实例 |
| **单 VM 无 CI 隔离** | 本地校验污染运行实例(如 smoke 创建残留对局) | smoke 用本地容器 + InMemory(restart 自动清);引入持久化后 smoke 改打**独立测试实例/独立 Volume**,勿污染生产数据 |
| **bundle 阈值锁太紧** | 正常依赖升级即破预算、假红 | 阈值设「实测值 + ~10% 余量」并用环境变量可调(§2.3);拆分落地后再定档,不要先验拍死 |
| **对比度色值漂移** | 改 CSS 变量后断言失效或漏判 | check-contrast 解析 CSS 变量而非硬编码;tile 面/橙色精确值「待核实」需在 WS-8 落地时锁定 |

---

## 7. 工作量 / 依赖 / 开放问题

### 工作量(S/M/L)
| 项 | 估时 | 依赖 |
| --- | --- | --- |
| jest 接 jsdom + setupTests 接线 | **S** | 无(WS-4 render-count 前置) |
| `devRenderCounter` + RTL render-count 测试 | **M** | jsdom 接线;WS-4 的 memo/isSelected 重构(spec:83) |
| `check-bundle-clean.sh` | **S** | `esbuild.drop` 落地(spec:85) |
| `check-bundle-budget.mjs` | **S** | WS-13 manualChunks/lazy 落地后定档 |
| `check-contrast.mjs` | **S** | tile/橙色 hex 待核实 |
| solo smoke 套件(WS-1/3/6 + 移动/banner/tap) | **M-L** | 各 WS UI 类名/文案稳定后写;`CHROMIUM_PATH` |
| `verify.sh` 聚合 + `deploy-verify.sh` + 修 `npm run build` | **S-M** | 上述脚本就位 |
| 镜像版本化 tag + 回滚流程 | **S** | podman；改 Quadlet |
| 持久化部署改造(Volume + 校验点) | **M** | WS-13 选型(FlatFile/SQLite,spec 开放问题 5) |

### 跨专业依赖
- **WS-4 render-count 依赖前端先做** memo + `isSelected` 布尔 + 回调 ref 稳定化(spec:83-84,178),否则 memo 无效、断言无意义。
- **bundle budget 阈值依赖 WS-13** 拆分先落地才能定档。
- **对比度脚本依赖 UI(WS-8)** 给出最终橙色/象牙 hex。
- **solo smoke 依赖各 WS** 暴露稳定的 DOM 选择器/文案;建议各 WS 落地时同步约定 `data-testid`。
- **持久化部署依赖 owner 选型**(spec 开放问题 5)与 WS-13 server 改造。

### 开放问题(给 owner)
1. **build 命令是否就地修复为 `vite build`?**(移除坏的 `source .env.production.local`,生产 env 已由 Quadlet 注入 / `.env.production` 提供)—— 建议:是。
2. **render-count 的 dev 判定写法**:`import.meta.env.DEV`(Vite 友好)vs `process.env.NODE_ENV`(jest 友好)如何统一,使生产确实被剥离又能在 jest 计数?(§2.1 待核实)
3. **smoke 是否引入 axe-core**(需联网装包)还是只用纯计算对比度?建议:纯计算为权威,axe 可选。
4. **是否接受镜像版本化 tag**(双 tag + 保留近 N 个)以获得真正可回滚?当前 `latest` 不可回退。
5. **持久化选型**:FlatFile(最简,挂卷文件)vs SQLite(可查询)—— 承接 spec 开放问题 5,直接影响 Volume/迁移/备份策略。
6. **是否值得引入 GitHub Actions**(可选):前置需 self-hosted runner(本 VM)或把 unit+build gate 放云端 runner、smoke 仍留本机(线上 URL)。无 runner 时一切以 `scripts/verify.sh` 为准。

---

## 附:验收点 → gate 命令速查

| WS | spec 验收 | 本方案 gate |
| --- | --- | --- |
| WS-1 | :49-52 jest + solo smoke | `npm test` + solo「红按钮不改板」smoke |
| WS-3 | :74-76 jest + solo + 既有拖拽 | `npm test`(resolveDropSlot)+ solo droppable + `smoke-touch` |
| WS-4 | :88-90 render-count + 无 console + 既有全绿 | RTL render-count(`npm test`)+ `check-bundle-clean.sh` + 全量 smoke |
| WS-6 | :105 等待室 | 2p 等待遮罩「1 of 2」smoke |
| WS-5 | :99 banner + 递减秒数 | `smoke-turn-banner.mjs` |
| WS-7 | :110 390×844 不裁剪/不遮挡 | `smoke-mobile-390.mjs` |
| WS-8 | :115 ≥3:1 + 灰度可辨 + 键盘 Undo/Redo | `check-contrast.mjs` + jest/smoke |
| WS-9 | :124-125 combo/juice jest | `npm test` |
| WS-10 | :134 playableTiles jest + solo | `npm test` + solo marker |
| WS-11 | :139 joker jest | `npm test` |
| WS-12 | :145 spike 文档 + grace smoke | spike doc(前置)+ jest/smoke |
| WS-13 | :150 >1 chunk + reconnect 横幅 | `check-bundle-budget.mjs` + `smoke-reconnect.mjs` |
| WS-14 | :155 两次 tap 放置 | `smoke-input-tap.mjs` |
| WS-18 | :164 undo 栈上限 / 无 F8 / 文案 | `npm test` + `check-bundle-clean`(grep F8/debugger) |
