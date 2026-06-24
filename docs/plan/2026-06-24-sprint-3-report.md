# RummyCube 优化 · Sprint 3 实施报告（stage report）

**日期:** 2026-06-24 · **分支:** `feat/optimization-sprint3`（基于 `main` @ 1f849f1，未推送）· **owner:** @sinmentis
**计划来源:** `docs/plan/2026-06-20-final-design-doc.md`（Sprint 3 = P2）

## 1. 结果概述

Sprint 3 全部 8 个执行单元（S3-U1…U8）+ 1 个架构 spike + 2 个由终审/自验发现的修复，已实现、逐个评审通过并整合。

- **覆盖的 workstream:** WS-13（FlatFile 持久化 + 拆包）、WS-11（joker 深度:represented-value 计分 + retrieveJoker）、
  WS-12（断线处理:先 spike 后落地,自定义 transport 把连接状态写入权威 G）、WS-10（降低空闲:可出牌高亮）、
  WS-14（tap-to-place）、WS-13b（重连提示）。
- **owner 决策（本轮锁定）:** WS-10 = 仅高亮（不自动放置）;WS-13 持久化 = FlatFile;WS-11 joker 取回 = 需 2 张牌。
- **测试:** jest **197 → 231**（+34）,全绿;生产 `npm run build` 成功且产物无 `console.log`;入口 bundle 573→206 kB。
- **提交:** 13 个 commit（见 §3）。Conventional Commits + Co-authored-by trailer,未推送。
- **终审 + 自验:** YES-WITH-FIXES —— 跨分支不变量核实干净;自验抓到 1 个生产启动崩溃（既有类型回归,见 §4）,
  终审抓到 1 个 Medium「仅高亮」bug（见 §4）,两者均已修复并复验。

## 2. 执行方式

沿用 subagent-driven-development:每单元一个全新 implementer（TDD）+ 一个 reviewer（规范 + 质量双判）,
Critical/Important 必修。全部子代理 `claude-opus-4.8`。文件不冲突的单元做了流水化;Board.jsx/board.css 密集的尾段串行。
WS-12 因风险高,先出一个独立 spike（GO 才落地）。进度写入 `.git/sdd/progress.md` ledger。

## 3. 完成的工作（按单元）

| 单元 | 内容 | WS | commit |
|---|---|---|---|
| S3-U1 | FlatFile 持久化（`node-persist` 入 dependencies）+ 空闲对局 GC + `/api/stats` 缓存 | WS-13a | 189ad09 |
| S3-U6 | WS-12 断线架构 spike（结论 GO,推荐 Option C 自定义 transport） | WS-12 | fc8cbee |
| S3-U5 | joker 按其代表值计分（修「joker=0」）+ `retrieveJoker` 非破坏性取回（两张牌规则,常量可调） | WS-11 | 3feb030, ef45d20 |
| S3-U3 | 拆包:vendor 分块 + `React.lazy`（GameOverModal/ComboOverlay）+ 动态 confetti + 去 bootstrap + 按方法 lodash | WS-13c | 69f60a8 |
| S3-U7 | 自定义 transport `ConnAwareSocketIO` 把连接状态镜像进权威 `G.connected[seat]`（座位服务端解析）+ 宽限/弃权 | WS-12 | 8cdb7bb, 8408714 |
| S3-U2 | 由连接状态派生「reconnecting / syncing」提示 | WS-13b | e039e8d |
| S3-U4 | 纯函数 `playableTiles` + 牌架可出牌高亮（色觉安全标记） | WS-10 | 196a802 |
| S3-U8 | tap-to-place 非拖拽放置路径（复用 `resolveDropSlot`） | WS-14 | f7498c7, dd742f8 |
| FIX-1 | 服务端 ESM 入口:按方法 lodash import 加 `.js` 扩展名 | — | f94c01c |
| FIX-2 | 可出牌高亮:含 joker 的牌组颜色锚到非 joker 牌 | — | 562358d |

## 4. 终审/自验发现（均已修复）

- **FIX-1 · 生产启动崩溃（自验抓到,类型回归）:** S3-U3 拆包把 lodash 改成按方法导入（如 `import invert from "lodash/invert"`,无扩展名）。
  Vite 能解析,但 Dockerfile 入口 `node src/server.js` 以原生 Node ESM 直接运行,无法解析无扩展名子路径,
  启动即 `ERR_MODULE_NOT_FOUND` 退出——与 Sprint 2 的 `dndUtil` 是**同一类问题**。`npm run build` 通过但服务器起不来,只有跑「启动服务器」这一步才暴露。
  **修复 f94c01c:** 给全部 14 处 lodash 子路径 import 加 `.js`。复验:`node src/server.js` → `App serving`,`/games -> ["RummyCube"]`;build 仍通过;jest 全绿。
- **FIX-2 · 可出牌高亮少算（终审抓到,Medium,仅高亮）:** `freezeSeqJokers` 只改 joker 的「值」不改「色」,冻结后 `isJoker()` 为假,
  于是棋盘上 joker 的黑/红编码色被当成真实牌色。任何含 joker 且颜色不同的牌组,run 会被整组丢弃、set 会错误地把 joker 的编码色算作「已存在」,
  导致「{n} 可出」计数和高亮**偏少**（蓝/橙 run/set 含 joker 是常见情况）。**不影响**计分/服务端状态（`moves.js` 只读 `getTileValue`,joker 计分与 retrieveJoker 正确）。
  **修复 562358d:** 由冻结后的值区分 run/set,`runColor`/`presentColors` 一律锚到非 joker 牌;补 3 个 TDD 用例（棋盘 joker 的 run/set/满 4 张三种）。228→231。

## 5. 关键不变量（经终审跨分支核实）

- **服务器权威/反作弊不退化:** 新增的 `_setConnection` 只写「已认证调用方自己的座位」（座位由 socket sync 参数服务端解析,绝不信任客户端）;
  `retrieveJoker` 受 `currentPlayer` 守卫且非破坏性（先改后 `isBoardValid`,失败返回 `INVALID_MOVE`,草稿丢弃）;Sprint 1 的 `forceEndTurn` 到点守卫原样保留。
- **组件组合正确:** `connTransport` 复用同一个 `MATCH-<id>` pubSub 频道,故 `_setConnection` 的广播仍经过 `playerView`（对手手牌仍隐藏）;
  `G.connected/disconnectTurns/forfeited` 经 FlatFile 持久化;`onTurnBegin`/`_setConnection` 对 WS-12 之前的旧对局有兜底默认值。
- **GC 安全:** `listMatches` 的 `updatedBefore` 过滤 `metadata.updatedAt`,而每步 move 都会 bump 它 → 活跃对局不会被清（IDLE_TTL 6h）;`data/` 已 git-ignore。
- **拆包无副作用:** 产出独立 GameOverModal/ComboOverlay/fx/vendor 分块;`dynamic-import-cjs` babel 插件仅 `env.test` 生效（不进生产）;confetti 仍受 `reduced()` 门控。
- 应用内文案英文;juice 受 `prefers-reduced-motion` + mute 门控。

## 6. 测试与验证（owner 可复现）

- `npx jest` → **50 套件 / 231 用例**全绿（新增:flatfile-persistence、joker-scoring/retrieve、bundle-split、conn-transport/disconnect、reconnect-cue、playable-tiles/marker、tap-to-place 等）。
- `npm run build` 成功;入口 chunk 573→**206 kB**（< 350 kB 预算）;产物无 `console.log`。
- 服务端入口实测可启动并带 FlatFile:`PORT=… FLATFILE_DIR=… node src/server.js` → `App serving`,`/games -> ["RummyCube"]`。
- 持久化本地实测:建一局 + `/api/stats` 后停服再起服,对局与统计仍在。
- 断线本地实测:2-socket 冒烟,断开一方后 `G.connected` 翻转、宽限/弃权按预期推进。

## 7. 遗留事项（post-merge backlog,终审判定不阻断）

- **需真实部署才能完整验证:** Quadlet 卷挂载 + 重启后跨进程重连、以及经 Cloudflare 的线上 WSS 断线。
  注意:服务重启后,持久化的 `G.connected` 对「新进程里从未连过的座位」会停留在 stale-`true`,直到其重连才纠正（新进程不会为不存在的 socket 触发 disconnect）——v1 可接受,部署后值得复查。
- **owner 调参（常量已隔离 + 有测试覆盖）:** `GRACE_MS`/`N_FORFEIT_TURNS`、`JOKER_RETRIEVE_TILES_NEEDED`（2 偏严,经典规则是 1）、`comboLabel` 阈值/权重。
- **小项:** `PlayerAvatar` 仍用 metadata 的 `isConnected`,可切到权威 `G.connected`（cosmetic）;forfeit = 跳过座位（v1,仍参与轮转,靠对手强制推进,已验证无双重弃权/双重结算）;
  `retrieveJoker` 尚未接 UI（休眠的服务端 move,有单测）且不可 Undo;tap-to-place 键盘路径顺延;`connTransport` 依赖两处框架内部实现（已记录,0.50.x 升级需复查）。

## 8. 下一步

- 合并:rebase/fast-forward 到 `main`（线性）。
- **强烈建议合并后重新部署:** 线上仍跑 Sprint 1 之前的旧镜像;一次部署即可上线 Sprint 1+2+3 的全部改进
  （含 §4 两个生产相关修复 + 持久化 + 断线处理）。部署命令:`podman build -t shunlyu-rummycube:latest ~/work/rummycube && systemctl --user restart shunlyu-rummycube.service`。
- 注意:FlatFile 需把对局目录挂成持久卷,否则容器重建即丢历史对局。
