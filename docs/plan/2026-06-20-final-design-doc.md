# RummyCube 优化 · 最终设计文档(Final Design Doc)

> **给执行者的说明:** 本文档是「优化 spec → 实现计划」的整合产物,配合
> `superpowers:subagent-driven-development`(推荐)或 `superpowers:executing-plans`
> 按任务逐条推进;任务步骤用复选框 `- [ ]` 跟踪。每个任务遵循 TDD(先写失败测试 →
> 最小实现 → 测试通过 → 提交)。

**日期:** 2026-06-20 · **Owner:** @sinmentis · **状态:** 待 owner 评审(draft）
**线上:** https://game.shunlyu.com · **仓库:** github.com/sinmentis/rummycube · **本地:** ~/work/rummycube
**语言说明:** 本文档及同目录 10 份专家报告应 owner 明确要求用**中文**撰写,属本批交付物对「文档默认英文」惯例的有意豁免。

---

## 0. 来源与方法

本文档由「专家团队」把 `docs/optimization/2026-06-20-rummycube-optimization-spec.md`
(WS-1..WS-18,P0–P3,已经 gpt-5.5 rubber-duck)转化为实现计划。10 位专家各出一份中文报告
(同目录,见 §12),均**实读源码**、论断附 `file:line`;本文档是其整合。专家在阅读真实代码与依赖时,
额外发现了若干**超出原 spec 的问题**(§5),已并入计划。

## 1. 目标 / 非目标

**目标:** 在不引入商业化的前提下,提升在线多人 Rummikub 的首局留存与流畅度:让规则盲的新手能顺利完成
满意的第一回合、让牌桌可读、让操作顺滑;并补齐这轮代码审视中暴露的安全与构建短板。

**非目标:** 无登录/账号/变现/增长机制;不新增游戏变体;不推翻「A1 Classic」美术方向;
后端持久化是横切前置,但不阻塞 P0/P1 的 UX 收益。

## 2. 架构与技术栈(优化后目标态)

- **服务器权威**:boardgame.io 0.50,单 Node 进程(`src/server.js`)既跑 WebSocket/lobby
  又托管 `build/` 静态前端,容器端口 9119 → `127.0.0.1:8093` → Cloudflare Tunnel。
- **前端**:React 18 + Vite 6 + @dnd-kit;CSS 动画 + canvas-confetti + Web Audio(juice)。
- **目标态分层**(优化后边界清晰化):
  服务端 **moves 层**(`moves.js`)→ **校验/评分层**(`moveValidation.js` + combo)→
  **持久化层**(新增 FlatFile)→ **连接状态**(新增,写入权威 `G`);
  前端 **渲染层**(memo 化的 Board/Grid/Tile + 抽出的 `<TurnTimer>`)→ **juice 层**(统一门控)。
- **部署:** `podman build -t shunlyu-rummycube:latest ~/work/rummycube && systemctl --user restart shunlyu-rummycube.service`(仓库根 `deploy.sh`/`restart.sh` 已过时,勿用)。

## 3. 全局约束(Global Constraints — 每个任务都隐含遵守)

- **服务器权威与反作弊不退化**:`forceEndTurn` 仅在 `getSecTs() >= G.timerExpireAt` 后允许
  (`moves.js:148-150`),任何新 move 都**不得**放宽该守卫、不得碰 `timerExpireAt`、不得让客户端
  决定合法性。
- **无效提交不再破坏**:手动提交无效时 no-op,牌留原位;回滚+罚抽只保留在 `forceEndTurn`(超时)
  与显式 `forfeitTurn` 两条路径。
- **每个改动都带测试**:jest 和/或 Playwright smoke;juice 全部受 `prefers-reduced-motion` + mute 门控。
- **构建产物在 `build/`**(非 `dist/`);Playwright smoke 需 `export CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome` 且在仓库根运行;solo 模式在创建对局选 `0 · solo test`。
- **代码/标识符/提交信息/文件名一律英文**;Conventional Commits;提交带
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`。
- 数值阈值在落地前一律视为 `[PLACEHOLDER]`,需 playtest 调参。

## 4. 跨切面架构决策

来自 Software Architect / Backend Architect / Database Optimizer 三份报告的收敛结论:

### 4.1 判定与评分收敛到服务端单一路径(WS-1 + WS-9)
- 新增当前玩家 move **`submitMeld`**:无效时严格 no-op(返回 `INVALID_MOVE`,框架丢弃 action,
  `G`/手牌/`tilesPool`/`currentPlayer` 全不动);有效时走抽出的 `applyValidMove`(freeze + 写
  `lastPlay` + `events.endTurn()`)。`endTurn`/`forceEndTurn` 现状逻辑**不动**以护住现有测试。
- 拒绝原因走**纯函数** `submitRejectReason(G,ctx) → {code,score?,required?,group?}`
  (`code ∈ {BELOW_30,RUN_TOO_SHORT,INVALID_GROUP,MIXED_FIRST_MOVE,NO_NEW_TILE,OK}`)。
  因 `INVALID_MOVE` 会丢弃 `G`,「把原因写进 G 回传」是反模式 → **前端 import 同一纯函数**渲染文案,
  服务端只做权威否决;`isFirstMoveValid`/`isMoveValid` 复用其 `code==='OK'`,保证「按钮文案=服务端裁决」单一事实源。
- 新增 **`forfeitTurn`**(显式确认弃权 → 即时回滚+罚抽),**独立**于 `forceEndTurn`。
- **操纵分(manipulation)必须在 `validatePlayerMove` 的有效块内、夹在 `getFormedGroups`
  (`moves.js:235`)与 `freezeTmpTiles`(`:245`)之间计算并写入 `G.lastPlay`**——因为基线
  `prevTilePositions` 在下一个 `onTurnBegin`(`moves.js:267`)即被重置,freeze 后信息丢失。
  这把 WS-9 与 WS-1 钉死在同一服务端代码路径。

### 4.2 连接状态进入权威 state(WS-12,spike 先行)
`onTurnBegin({G,ctx})` 没有 `matchData`/`isConnected`(`moves.js:259`),客户端 `isConnected`
**不可信**。spike 评估三方案,推荐顺序:
- **(C,首选)** 自定义 transport override 的 `onConnectionChange` → 服务端代发一个内部
  `_setConnection` move 写 `G.connected[seat]`(走 action log,天然持久化/重连自洽);
- **(B,优先评估)** boardgame.io 插件;
- **(A,兜底)** Koa 中间件。
三方案在 boardgame.io **0.50 的可用性是 spike 的第一产物【待核实】**。落地后在 `onTurnBegin`
收缩断线座位的 `timerExpireAt`。

### 4.3 持久化:FlatFile 两步走(WS-13)+ 一个必修启动坑
- **推荐先上内置 FlatFile(S),SQLite 留作演进**:单容器单进程低并发,FlatFile 的并发/查询短板基本不触发;
  SQLite 需补 alpine 原生编译链且无现成 0.50 适配器。
- 接入点 `src/server.js:13-17`:`Server({ games, db: new FlatFile({dir: process.env.FLATFILE_DIR}) , ... })`。
- **⚠️ 必修坑(已实测核实):** FlatFile 惰性 `require('node-persist')`,而 `node-persist` 只在
  boardgame.io 的 **devDependencies**(`node_modules/boardgame.io/package.json:121`),本项目
  `package.json` 未列;Docker 运行时阶段 `--omit=dev`(`Dockerfile:14`)不会装它 → **运行时崩溃**。
  **必须把 `node-persist` 加进本项目 `dependencies`**。
- 落盘:容器内 `/app/data`;Quadlet 加 `Environment=FLATFILE_DIR=/app/data` +
  `Volume=rummycube-data:/app/data`(rootless 用命名卷避权限坑)。
- **GC 必做**:FlatFile 不自清,需应用层 `setInterval` + `listMatches({where:{isGameover,updatedBefore}})`
  + `wipe(id)`,避免 N×4 小文件 + node-persist 内存缓存撑爆 512M。
- `/api/stats` 在持久化后是 O(matches) 全表读盘 → 加 5–10s 进程内缓存。

### 4.4 juice 统一门控 + 拥有权缩放(WS-9)
现 `reduced()`(effects.js)与 `muted`(sfx.js)各管各。抽出统一谓词
`resolveJuice({lastPlay, localSeat, isDragging})`:自家出牌全特效;对手出牌静音/无 `fx.kick`/无
win-sting/强度减半;**本地有 active drag/selection 时强制 `kick=false`**;`board-kick` 改
transform-only(挂在 `will-change:transform` 的 wrapper,而非 20-box-shadow 的 `.board` 子树)。

## 5. 专家新增发现(超出原 spec,必须纳入计划)

阅读真实代码/依赖时发现,**spec 未覆盖**但应处理:

| 编号 | 严重度 | 发现 | 证据 | 处置 |
|---|---|---|---|---|
| SEC-1 | 高 | 房间码 + 玩家名经默认路由 `GET /games/rummikub` 全量泄露;`createMatch` 未设 `unlisted:true`,`origins` 只是 CORS,`curl`/Tunnel 可绕过,抵消 `/api/stats` 脱敏 | `lobbyClient.js:10`;bgio server 路由 | **Sprint 1 必做**(加 `unlisted:true`,极廉价) |
| SEC-2 | 高 | 无 `playerView`,完整 `G.tilePositions`(含所有手牌)下发每个客户端 → 改造客户端即可看穿对手,直接抵触反作弊卖点 | 全仓零 `playerView` | Sprint 2 补 `playerView` |
| SEC-3 | 高 | WS-1/WS-11 新 move 需首行 `playerID === ctx.currentPlayer`,否则可代他人弃权/结束 | 对齐 `endTurn` `moves.js:128` | 折入 T1-2/T1-3/T11-1 的 DoD |
| SEC-5 | 中 | 聊天 XSS 不成立(React 转义 `ChatPanel.jsx:125-126`),但**无服务端长度/频率限制**(仅客户端 `quickChat.js:23`)→ 刷屏/超长 DoS | — | Sprint 2 / Backlog |
| BUILD-1 | 高(阻塞) | `npm run build` **已坏**:`source .env.production.local` 文件缺失且 sh 无 `source`(实测 exit 127);Dockerfile 用 `npx vite build` 故线上正常 | `package.json:27` | Sprint 1 修脚本为 `vite build` |
| BUILD-2 | 高(阻塞 WS-4 验收) | jest 全默认(node 环境),84 用例皆纯逻辑、无 RTL/jsdom;render-count 测试跑不了 | `jest.config.cjs` | Sprint 1 接 `jest-environment-jsdom` + `setupFilesAfterEnv` |
| OPS-3 | 中 | Quadlet `Image=...:latest` 固定,**无版本镜像无法回滚** | `shunlyu-rummycube.container:5` | 构建打 `:$(git rev-parse --short HEAD)` 双 tag |

> 这些是本次代码审视的高价值副产物。SEC-1 / BUILD-1 / BUILD-2 建议在 Sprint 1 一并处理。

## 6. 依赖图与关键路径

- **最长链(优化全程):** `WS-1 → WS-9 → WS-13(持久化)→ WS-12(重连存活)`。
- **WS-1 是上游契约**:reason code 喂 WS-5(回合可读)与 WS-8(可达性第二通道)→ Sprint 1 内先落地。
- **WS-4 内部隐形关键路径**:`React.memo` 仅在「`isSelected` 布尔化(T4-2)+ 回调 ref 稳定(T4-3)」
  之后才生效;缺任一即 no-op。
- **跨 Sprint 链**:`T9-1(freeze 前算操纵分)→ T13-1(持久化读 lastPlay)→ T13-2(重连/统计持久)`。
- **WS-12 spike(T12-1)是硬阻塞**,未出方案不估 T12-2/T12-3。
- **持久化(T13-1)是重连(T13-2)与「重启后存活」的前置**,且天然带走 `G.connected` 的持久化。

## 7. Sprint 计划与任务 backlog

任务按 bite-sized(30–60 分钟)拆,每条带依赖/DoD/具体验收命令。完整 DoD 见
`2026-06-20-plan-10-project-manager.md`;下表为整合视图(估时均 `[PLACEHOLDER]`)。

### Sprint 1 — P0:新手「赛前 + 第一回合」安全/可读/可教/顺滑
**退出标准:** 手动无效提交不再回滚/罚抽,且红字内联给出 reason code 解释;计时器 tick 不再重渲染全盘;
生产 bundle 无调试日志;`npm run build` 可用;房间不再公开列出玩家名。**可玩 solo + 2 人本地房;反作弊与服务器权威完好。**

| 任务 | WS | 依赖 | 验收(关键) |
|---|---|---|---|
| **T0-1** 修 `npm run build`→`vite build`(BUILD-1)| — | — | `npm run build` 退出 0 产出 `build/` |
| **T0-2** 接 `jest-environment-jsdom` + `setupFilesAfterEnv→src/setupTests.js`(BUILD-2)| — | — | 一个示例 RTL 测试可跑;现有 84 jest 不回归 |
| **T0-3** `createMatch` 加 `unlisted:true`(SEC-1)| — | — | `GET /games/rummikub` 不再列房间码/玩家名;创建/加入仍可用【核实不影响 `playAgain`】 |
| T1-1 `submitRejectReason(G,ctx)` 纯函数 + 重构两个布尔校验暴露 reason+score | WS-1 | — | jest:各 `code` 正确返回,`BELOW_30` 带 `score`;合法→`OK` |
| T1-2 新增 `submitMeld`(无效 no-op,有效走旧 valid 路径;**首行校验 `playerID===currentPlayer`** SEC-3)| WS-1 | T1-1 | jest:无效后 `tilePositions`/手牌/`tilesPool`/`currentPlayer` 不变;有效则 freeze+`lastPlay`+结束回合 |
| T1-3 新增 `forfeitTurn`(显式回滚+罚抽;**校验当前玩家**);`forceEndTurn` 不变 | WS-1 | T1-1 | jest:截止后 `forceEndTurn` 仍回滚+罚抽不变;`forfeitTurn` 以显式意图回滚+罚抽 |
| T1-4 客户端:`Submit meld` 按钮调 `submitMeld`、内联原因文案、Draw 可见但禁用 | WS-1 | T1-2 | Playwright(solo):放 2 tile→按钮红+内联原因;点击后棋盘不变;无 `pageerror` |
| T2-1 导航栏「How to play」常驻入口 + 轻量规则 modal(静态,中文文案见 GD 报告)| WS-2 | — | Playwright:modal 含「30」与「run」/「set」 |
| T2-2 一次性首回合 coach card(localStorage flag)| WS-2 | — | Playwright:dismiss 后重开对局页不再自动弹 |
| T2-3 joker 悬停/长按标签「Joker (wildcard)」+ lobby hero + 2–3 bullets | WS-2 | — | joker 有 accessible label;lobby 文案存在 |
| T3-1 纯函数 `resolveDropSlot(pointerRect,gridRect,occupancy,selectionLength)`(放 `dndUtil.js`)| WS-3 | — | jest:单 tile 吸附最近空;3 选落 2 空被整体拒;落 3 空连续放 |
| T3-2 牌桌「托盘」框 + 极淡网格(纯 CSS,无 markup 改动)| WS-3 | — | Playwright(solo):托盘边框 + 列可辨;drag smoke 不回归 |
| T3-3 拖拽起始高亮合法空位 + 在 `moveTiles` 前接入 `resolveDropSlot` | WS-3 | T3-1 | Playwright(solo):拖拽中可见 droppable 标记;单 tile 偏移 <半格仍提交 |
| T4-1 抽出 `<TurnTimer>`/avatar-ring(CSS `animation-duration` 驱动或自管 tick)| WS-4 | — | RTL:计时 tick **不**重渲染 `GridContainer` |
| T4-3 用 ref 稳定 `handleTileSelectionCb`/`handleLongPressCb`,删 per-render/per-tick 日志 | WS-4 | T0-2 | RTL:回调 identity 跨多次选择稳定;源码无 `RENDER BOARD`/`console.log(state)` |
| T4-2 `isSelected` 布尔下传 + `Tile`/`GridSlot`/`GridContainer` 包 `React.memo` | WS-4 | T4-3 | RTL:选中单 tile 只重渲染该 tile,非全部 ~330 |
| T4-4 `vite.config` `esbuild.drop:['console','debugger']` + chat 不透明背景 + dev-only render counter | WS-4 | T4-1,T4-2 | Playwright(solo):生产 bundle 无 `console.log`;~5s 空闲无 per-tick 日志 |
| T6-1 等候室核心:遮罩 +「{joined} of {n}」+ 棋盘禁用(含手牌不可拖)| WS-6 | — | Playwright:新建 2 人房显示「1 of 2」;满员前棋盘不可交互 |

> **建议先行**:`T1-1`(解锁 WS-1 链与跨 Sprint 下游)、`T4-3`(解锁 memo 链)。
> T2-* 与 T3-2 是纯前端静态/CSS、零服务器依赖,适合穿插在等服务器评审时做。

### Sprint 2 — P1:回合可读性、移动端、可达性、combo 重设计
**退出标准:** 回合归属/剩余秒数清晰且色觉安全;390px 全手牌可达、chat 不遮 HUD、控件首屏可见;
橙色数字 ≥3:1 且有非颜色第二通道;combo 奖励「操纵」而非囤牌且不惊扰旁观者;对手手牌不再下发(playerView)。

| 任务 | WS | 依赖 | 验收(关键) |
|---|---|---|---|
| **T-SEC-2** 加 `playerView` 只下发本座手牌(SEC-2)| — | — | 客户端 payload 不含他人手牌;现有对局/拖拽不回归 |
| T5-1 回合横幅 +「● 你的回合 /{name}'s turn」+ 环心整秒 + 首回合微文案 + 末段脉冲 | WS-5 | T1-1,T4-1 | Playwright:你的回合横幅读「Your turn」且环心秒数递减;非仅颜色区分 |
| T6-2 invite 面板打磨:room code + 大号 Copy-link + 重标「Need more players? Share this room」| WS-6 | T6-1 | Playwright:房间码与 Copy-link 可见可点 |
| T7-1 可滚动/auto-fit rack(390px 全手牌可达;`HAND_COLS=22` 现固定→需动态定列)| WS-7 | — | Playwright 390×844:无手牌被裁切 |
| T7-2 chat 窄屏折叠为可点气泡/FAB + HUD z-index/预留行 | WS-7 | — | Playwright 390×844:chat 不与「Tiles left」HUD 重叠 |
| T7-3 控件行提到首屏(cap board 高度)+ 4 座 avatar 不裁切/重叠 | WS-7 | — | Playwright(768/390):控件行在视口内可见 |
| T8-1 橙色加深至 ≥3:1(`--c-orange`→`#a85c08`/`#b5650a`,实测取值)+ 提交态/每 tile ✓/✕ 第二通道 | WS-8 | T1-1 | 计算对比度 ≥3:1;灰度下 End 态可辨 |
| T8-2 移动端 hit target 趋 44px + Ctrl+Z/Ctrl+Y 撤销/重做 | WS-8 | — | Playwright:键盘 Undo/Redo 生效 |
| T9-1 在 `validatePlayerMove` 内 **freeze 前**算操纵分写 `G.lastPlay`(新公式见 §4.1/GD 报告)| WS-9 | — | jest:1 张操纵成 2 组 combo 值 > 3 张平铺;`lastPlay` 携带 freeze 前算的操纵分 |
| T9-2 `resolveJuice` 按归属缩放的门控谓词(对手/本地拖拽中无 kick)| WS-9 | — | jest:对手 `lastPlay` 与本地拖拽进行中均「no kick」 |
| T9-3 减少有效提交 paint 尖峰(confetti 或 flash 二选一;board-kick transform-only)| WS-9 | T9-2 | Playwright(solo):提交无明显掉帧/无双重特效;celebrate smoke 不回归 |

### Sprint 3 — P2:降低空闲、joker 深度、断线、网络韧性、输入替代
**退出标准:** 对手回合有「可出牌」提示;joker 可回收且按代表值计分;断线座位走 grace 不耗满整回合;
重启后对局/统计仍在 + 断线显「reconnecting」;bundle 拆分主 chunk 明显变小;支持点选落子兜底。

| 任务 | WS | 依赖 | 验收(关键) |
|---|---|---|---|
| **T0-4** 把 `node-persist` 加进 `dependencies`(DB 启动坑)| — | — | 运行时阶段镜像内存在 node-persist;FlatFile 不在启动崩溃 |
| **OPS-3** 构建镜像打 `:latest` + `:$(git short SHA)` 双 tag(回滚能力)| — | — | 可用历史 tag 重启回滚 |
| T10-1 纯函数 `playableTiles(hand,board)` + 手牌可延展高亮 + 「可出张数」计数 | WS-10 | — | jest:构造盘面单测;Playwright(solo,尽量 seeded):标记渲染 |
| T11-1 joker 回收 move(真牌拖到桌面 joker,仅当回收后棋盘合法;校验当前玩家)| WS-11 | — | jest:满足条件回收成功,否则拒绝(no-op) |
| T11-2 joker 以代表值计入 combo/celebration(修 `moves.js:237` 的 joker=0;终局罚分仍 joker=30)| WS-11 | T11-1,T9-1 | jest:joker 对 `lastPlay.points` 贡献其代表值 |
| T12-1 **架构 spike**:连接状态进权威 state 的方案文档(§4.2)| WS-12 | — | spike 文档评审通过 |
| T12-2 实现:把连接状态镜像进 `G.connected[seat]`(按 spike)| WS-12 | T12-1 | jest/smoke:断线写入 `G.connected[seat]` |
| T12-3 折叠断线座位 grace + 跨 N 回合 vote-skip/forfeit(余牌转最终分)| WS-12 | T12-2 | jest/smoke:断线活动座位在 grace 窗口内自动推进 |
| T13-1 持久化后端 FlatFile(§4.3;接 `db`)| WS-13 | T9-1,T0-4 | 重启后进行中对局 + `/api/stats` 仍在;`server-stats.test.js` 不回归 |
| T13-2 「reconnecting…」横幅 + 提交后「syncing」线索 | WS-13 | T13-1 | Playwright:强制断 socket 显示 reconnecting(参考 `scripts/smoke-reconnect.mjs`) |
| T13-3 bundle 拆分(`manualChunks`)+ 按方法 lodash + `React.lazy` 重组件 + 删未用 bootstrap | WS-13 | — | build 产出 >1 chunk 且主 chunk 明显变小 |
| T14-1 tap-tile → tap-destination 非拖拽落子(复用 `resolveDropSlot`)| WS-14 | — | Playwright:无拖拽两次点击可落子 |
| T14-2 键盘光标 + Enter 落子路径 | WS-14 | T14-1 | Playwright/RTL:键盘路径落子成功 |

> **裁剪/延后**:WS-10 的 full planning overlay(T10-2)默认**降级入 Backlog**(见开放决策 #4);
> Sprint 3 仅做 `playableTiles` 高亮(T10-1)。

### Backlog — P3:打磨
T15-1 视觉打磨(控件 Poppins、rack `fit-content`/居中、self-avatar 进 rack notch + brass-on-ink 徽章、cap board 高度);
T16-1 per-nickname localStorage 统计上首页;T16-2 房内一键重赛 + ready check;
T17-1 首页 hero +「0 players online」文案软化 + 显式「Try solo」入口;
T18-1 清理(统一「Room code」、移除生产 `F8→debugger` `App.jsx:25-31`、cap undo 栈深);
T10-2 对手回合私有 planning overlay(取决开放决策 #4);SEC-5 聊天服务端长度/频率限制。

## 8. 风险登记表

| 风险 | 影响 | 缓解 | 负责域 |
|---|---|---|---|
| boardgame.io 0.50 不支持干净注入自定义 transport/内部 move | WS-12 方案 C 落空 | spike 先行,B/A 兜底;未验证不估时 | Backend/Arch |
| `submitMeld` 与 `endTurn` 长期重复 | 维护负担 | 先并存护测试,稳定后再评估合并 | Backend |
| memo 改造遗漏「布尔化或回调稳定」一环 | 性能 0 收益(no-op) | T4-2 依赖 T4-3;RTL render-count 守门 | Frontend/DevOps |
| FlatFile node-persist 启动坑/内存膨胀 | 重启崩溃 / 撑爆 512M | T0-4 加依赖 + GC + 进程内缓存 | DB/DevOps |
| 重启即清空进行中对局 | 切持久化窗口丢局 | 选低峰切换;持久化后此风险消失 | DB/DevOps |
| 单人维护、无外部 CI | 回归靠人工 | `scripts/verify.sh` 聚合 + 每 Sprint gate 清单 | DevOps |
| Playwright smoke flaky / `CHROMIUM_PATH` 漂移 | 验收不稳 | 串行跑 + 固定 env + 优先 solo 模式 | DevOps |
| `unlisted:true` 影响 `playAgain` | 重赛断裂 | 落地前核实 `lobbyClient.js:39` 链路 | Security/Backend |

## 9. 开放决策(需 owner 拍板)+ 建议默认值

| # | 决策 | 选项 | 建议默认 | 确认时点 |
|---|---|---|---|---|
| 1 | 无效提交(WS-1)| no-op 提交 + 可选显式 forfeit / 仍带惩罚 | **no-op 提交;惩罚只在超时;另给显式 `forfeitTurn`** | Sprint 1 启动前 |
| 2 | combo 重设计(WS-9)| 操纵加权 / 仅去囤牌激励+去旁观 kick | **操纵加权** | Sprint 2 前 |
| 3 | 移动端 chat(WS-7)| 气泡折叠 / 常驻缩小 | **窄屏折叠气泡** | Sprint 2 前 |
| 4 | planning/ghost(WS-10)| 全 overlay / 仅高亮 | **先仅高亮(T10-1),overlay 入 Backlog** | Sprint 3 前 |
| 5 | 持久化后端 | FlatFile / SQLite | **先 FlatFile,SQLite 留演进** | Sprint 3 前 |
| 6 | joker 回收(WS-11)| 1 张真牌 / 2 张真牌 | 默认 **1 张**(经典语义【待核实】)| Sprint 3 前 |
| 7 | combo 是否加权的体感 | — | 与 GD 对齐 `W_GROUP/W_INTEG/W_PLACE` 后 playtest | Sprint 2 中 |

## 10. WS → 任务 可追溯矩阵(18 个 WS 全覆盖,无遗漏)

WS-1→T1-1..1-4;WS-2→T2-1..2-3;WS-3→T3-1..3-3;WS-4→T4-1..4-4;WS-5→T5-1;WS-6→T6-1,T6-2;
WS-7→T7-1..7-3;WS-8→T8-1,T8-2;WS-9→T9-1..9-3;WS-10→T10-1(,T10-2 Backlog);WS-11→T11-1,T11-2;
WS-12→T12-1..12-3;WS-13→T13-1..13-3;WS-14→T14-1,T14-2;WS-15→T15-1;WS-16→T16-1,T16-2;WS-17→T17-1;WS-18→T18-1。
**新增(超 spec):** SEC-1→T0-3;SEC-2→T-SEC-2;SEC-3→折入 T1-2/1-3/11-1;BUILD-1→T0-1;BUILD-2→T0-2;DB 坑→T0-4;OPS-3→Sprint 3。

## 11. 验收与测试策略(测试在环)

- **单元**:`npm test`(先做 T0-1/T0-2 修好构建与 jsdom);纯函数优先(`submitRejectReason`、
  `resolveDropSlot`、`playableTiles`、`resolveJuice`、combo 评分)。
- **组件**:RTL + dev-only `countRender()`(生产被 `esbuild.drop` 剥离)断言「tick 不重渲 `GridContainer`」「选 1 张牌增量 ≤2 而非 ~330」。
- **构建后校验脚本**(DevOps):`check-bundle-clean.sh`(无 `console.log`/`RENDER BOARD`)、
  `check-bundle-budget.mjs`(>1 chunk + 主 chunk 阈值 `[PLACEHOLDER]`)、`check-contrast.mjs`(WCAG ≥3:1)。
- **冒烟**:`scripts/smoke-*.mjs`(需 `CHROMIUM_PATH` + 仓库根 + solo 模式)。
- **聚合**:`scripts/verify.sh`(unit/build/smoke 分层串行);每 Sprint 进入下一个前该 Sprint gate 必须全绿。
- **部署校验**:`podman build → restart → curl /games==["RummyCube"] → 关键 smoke`;回滚靠 OPS-3 的版本 tag。

## 12. 来源报告(同目录)与修订说明

1. `2026-06-20-plan-01-software-architect.md` — 架构骨架 / 依赖图 / 风险
2. `2026-06-20-plan-02-backend-architect.md` — 服务端 moves 设计
3. `2026-06-20-plan-03-game-designer.md` — combo 公式 / joker / 中文规则文案
4. `2026-06-20-plan-04-ux-researcher.md` — 旅程 / 原因码文案 / 等候室 / tap-to-place
5. `2026-06-20-plan-05-ui-designer.md` — 托盘 / 对比度 token / 移动端 / 等候层
6. `2026-06-20-plan-06-frontend-developer.md` — memo / 回调 ref / TurnTimer / bundle
7. `2026-06-20-plan-07-database-optimizer.md` — 持久化选型 / 接入 / GC
8. `2026-06-20-plan-08-devops-automator.md` — 测试在环 / 校验脚本 / 部署
9. `2026-06-20-plan-09-security-architect.md` — 服务器权威/反作弊不退化 / 房间泄露 / playerView / 聊天
10. `2026-06-20-plan-10-project-manager.md` — Sprint 拆解 / 任务 backlog / 可追溯矩阵

**修订说明(v1,2026-06-20):** 由 10 位专家(均 claude-opus-4.8)在阅读真实代码后撰写并整合。
相对原优化 spec,本设计文档新增了一批**经实测核实**的代码级发现(§5):`npm run build` 已坏、
jest 缺 jsdom、FlatFile 的 `node-persist` 启动坑、房间码/玩家名泄露、缺 `playerView`、Quadlet 无回滚 tag,
并把它们排进了 Sprint(T0-* / T-SEC-2 / OPS-3)。所有数值阈值标 `[PLACEHOLDER]`,待 playtest 调参。
