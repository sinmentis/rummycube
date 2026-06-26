# RummyCube · Review 5 · 综合建议报告（专家团队 fresh review）

> **日期:** 2026-06-26 · **方法:** 4 位专家（Game Designer / UX Researcher / UI Designer / Software Architect）独立对**线上产品**做 fresh review（实时走查 + 3 张截图 + 通读源码），各出一份报告;本文是去重 + 交叉印证后的统一优先级路线图。
> **分报告:** `2026-06-26-review5-game-design.md`、`-ux.md`、`-ui.md`、`-architecture.md`。
> **红线:** 服务器权威 + Rummikub 规则不动;应用内文案英文;不重复已上线项(combo、hints、joker 取回、insert/push、undo/redo、长按取牌、超时 toast、聊天、断线徽标等)。

---

## 0. 元结论 — 四份独立报告收敛到两件事

把四个视角叠在一起,**互不通气的专家指向了同一处**:

1. **「孤独访客无事可玩」(冷启动 / 单人死路)** — 产品**只能多人、且实时在线 0 人**。solo 是对着空气打(赢了也 `Total Points: 0`)、没有 AI、没有公开对局、没有单人内容;4 人房凑不齐真人**永远开不了局**。落地页三个醒目的 `0 / 0 / 0` 在喊「没人玩」。→ Game Design(A1/A2/A3)、UX(#2/#6)、UI(#4)同时命中。
2. **「第一回合不教核心动作」(首턴悬崖)** — 新手面对一片空毡 + 已在倒数的计时,而「**把牌从木架拖上桌、凑一组 ≥30 分**」这个核心动词,coach 卡、How-to-play、空棋盘**三处都没教**。→ UX(#1/#4/#5)、Game Design(C7/C8)、UI(#5)同时命中。

外加两条放大器:**对局画面布局浪费**(空毡 + 右侧 316px 死栏 + 底部拥挤,UI#1/#2 + UX#3),和**终局留存闭环破且有 bug**(GameOverModal 按座位号而非分数排名,GD B5)。

> 一句话路线:**先让「一个人也玩得下去」,再让「玩完想再来」,同时清掉一批 S 成本的止血项与健康债。AI bot 是终极解但工程大(L),用每日谜题做最快补位。**

**值得肯定(不是客套):** 规则内核扎实(首牌 ≥30、joker 取回、insert/push、断线宽限+forfeit 全部正确);`dndUtil`/`insertPush`/`moveValidation` 是教科书级的「纯函数 + 客户端/服务端共享内核」;442 测试是所有重构的安全网;视觉主题(绿毡 + 黄铜 + 象牙)有底子。**骨架很好,缺的是「单人可玩」「玩完想再来」「第一眼会玩」。**

---

## 1. 优先级路线图（影响 × 成本)

### P0 · 止血 + 快速高回报（基本纯前端,S 为主)
| # | 项 | 来源 | 影响 | 成本 |
|---|---|---|---|---|
| P0-1 | **修 GameOverModal 排名 bug**:`sort((a,b)=>b[0]-a[0])` 按座位号 ID 排,改 `b[1]-a[1]` 按分数降序 + 🥇🥈🥉 | GD B5 | High | S(真 bug) |
| P0-2 | 落地页:Create 别默认灰禁用(保留绿色 active + 空名就地提示/聚焦输入框);统计为 0 时整块隐藏或换「Be the first 🎴」 | UI#3,#4 · UX#9 | High | S |
| P0-3 | 把 `0 · solo test` 升级为一等「**Play solo / Practice**」(首页与 Create/Join 平级的按钮 + 下拉改名「1 · just me」) | UX#2 · GD A2 | High | S |
| P0-4 | 无对手时**隐藏聊天 + 撤掉 316px gutter**(`board.css:33`);复用已有 `.chat-fab` | UX#6 · UI#1 | High | S |
| P0-5 | coach 卡 / How-to-play 打开时**暂停计时**,首回合放宽(solo 默认不计时或 60–90s) | UX#4 · GD C7 | High | S |
| P0-6 | **教核心动作**:coach 卡加一行 imperative「Drag tiles from your rack onto the table to make a run/set (≥30 to start)」+ 空盘居中 ghost 目标「Drop here →」 | UX#1 · UI#5 | High | S–M |
| P0-7 | Join 术语统一为「room code」+ 接受粘贴**整条邀请链接**(取尾 id);等待卡内加 **Share/Copy link** 按钮 + toast | UX#7,#8 | Med | S |
| P0-8 | **健康债(零后悔):** 引入 ESLint + `react-hooks/exhaustive-deps`(当前**零静态检查**) | Arch#2 | High | S |
| P0-9 | **健康债:** 服务端 `moves.js` 日志分级(停止每次摸牌打印整副牌序,22 处 `console.*` 跑在生产)+ env 数值校验(`NaN` 不再静默烤进规则)+ 删 `HAND_ROWS` 死三元 | Arch#8,#9 | Med | S |

### P1 · 高价值中等（M)
| # | 项 | 来源 | 影响 | 成本 |
|---|---|---|---|---|
| P1-1 | **对局画面配平**:空盘**纵向收敛**(开局 ~46vh,落子增长)+ 木架上移 + 居中空状态引导 + 聊天折叠为 FAB | UI#1,#2,#5 · UX#3 | High | M |
| P1-2 | **每日 / 练习谜题**(按日期 seed 的确定性发牌,单人可玩、Wordle 式可分享成绩串)— **冷启动最快解,不依赖在线人口** | GD A2 | High | M |
| P1-3 | **持久身份 + 连胜/战绩**(localStorage:昵称 + games/wins/最佳 combo/最快清空/streak,首页「Welcome back」)— 留存根基,纯前端 | GD B4 | High | M |
| P1-4 | Game-over 增值:本局**高光**(最长 run / 最高 combo / 操纵次数 / 清空用时,数据 `lastPlay`+combo 管线已在算)+ **Share result** + best-of-N 多局赛 | GD B5 | Med | M |
| P1-5 | **ready-room 重赛**:原房间内「3/4 ready to rematch」,原座位保留,全 ready 即开(复用等待室 UI) | GD B6 | Med | M |
| P1-6 | **手势可发现性**:How-to-play 加「Controls/Tips」段(拖放 / 长按抓整组 / 拖到 joker 取回 / 点牌再点桌 / Sort / Undo)+ 1–2 个 JIT 提示 | UX#5 | Med-High | M |
| P1-7 | **色盲第二通道**:牌面加冗余花色符号/角标(可选高对比开关)— 影响**核心玩法理解**,非装饰 | UX#11 | Med | M |
| P1-8 | 移动端:tap-to-place 落到**可见区/最近 meld**而非全局首个空格;chat FAB 让出拇指区 | UX#10 | Med | M |
| P1-9 | 计时改「**思考钟**」(time bank / 一次性 +15s)+ **显性化 draw-2 暗规则**(首牌后摸牌一次涨 2,界面从不告知) | GD C7 | Med | M |
| P1-10 | **UI 打磨包**:计时环改品牌色坡道(去纯蓝→红)、统一 Poppins(去 Segoe UI)、wordmark 统一 + 英雄标题对比 ≥3:1、木架内牌组居中、avatar 木质名牌底座、radius/elevation token 化 | UI#6–12 | Med | S–M |

### P2 · 大投入 / 战略（L)
| # | 项 | 来源 | 影响 | 成本 |
|---|---|---|---|---|
| P2-1 | **AI bot**(分阶段 P0 贪心复用 `playableTiles` → P1 首牌搜索+简单操纵 → P2 近最优)— 一箭四雕:solo 对战 / 空座补位 / 新手陪练 / 冷启动兜底;走相同 server-authoritative move 通道 | GD A1 | High | L |
| P2-2 | **交互式 90s tutorial**(强复用 bot/谜题:引导一次成功 submit + draw + joker,让首胜发生在沙盒) | GD C8 | Med | M–L |
| P2-3 | **Quick Play 公开速配 + 观战/补位**(有公开 waiting 房就塞进去,否则建 2 人公开房;ServerStats 的 waiting 数变可点入口;座位空出可观战「坐下接管」) | GD A3 · C9 | High | M–L |

### 架构 / 健康度 track（并行,使能未来每一轮 UX)
| # | 项 | 来源 | 影响 | 成本 | 风险 |
|---|---|---|---|---|---|
| ARCH-1 | 拆 `Board.jsx`(755 行 god component)→ 聚焦 hooks(`usePersistentFlag`/`useComboCelebration`/`useGiveUpConfirm`/`useDropDispatch`/`useSyncingCue`),Board 退化为布局壳。**在 P0-8 的 exhaustive-deps 护栏下分批做** | Arch#1 | High | M(分批) | Med |
| ARCH-2 | 拆 `moves.js`(turn/掉线裁决 → `turn.js`;计分 `applyValidMove` → 与 `util` 计分同层),拆 `util.js` 5 领域 + 驱逐 DOM 代码 + **单独命名 `playerView.js` 隐私缝** | Arch#3,#4 | High/Med-High | M | Med/Low |
| ARCH-3 | 写 `docs/ARCHITECTURE.md`:G 字段表 + 不变量、**move 原子性契约(INVALID_MOVE = 整体 abort)**、模块地图(谁纯/谁能被 server import/隐私边界)、客户端·服务端共享内核清单 | Arch#7 | Med | S–M | Low |
| ARCH-4 | 测试加 `makeMatch()` 工厂(消 14 份手搓 G + 反向删生产里的向后兼容 shim);状态约定成文(G 唯一权威 / `gRef` 何时用 / drawn 高亮去掉回写 move) | Arch#5,#6 | Med | M | Low/Med |
| ARCH-5 | **观察项**(暂不动):`connTransport.js` 深耦合 boardgame.io 私有内部 → 精确锁版 + 加一个断线集成测试;计分路径无共享模块,做 P2-1/ARCH-2 时顺手做成**可被客户端 import 的纯模块**,堵住「落子即时预览得分」时客户端重实现的发散 | Arch#10,#11 | Med | — | — |

---

## 2. 三个被坐实的 bug / 卫生问题(建议立即处理)
1. **GameOverModal 排名错**(`GameOverModal.jsx:74–76`):`sort((a,b)=>b[0]-a[0])` 比的是**座位 ID 字符串**,赢家可能排最后。最常被截图分享的一屏却在「排名」上出错。→ P0-1。
2. **服务端热路径日志外溢**(`moves.js:47–48` 等):每次 `drawTile` 把**整副剩余牌的顺序**打到 stdout,每回合 `new Date()` 刷屏;前端 bundle 已被 `dropConsolePlugin` 清掉,但 `src/server.js` 是 raw Node 直跑,22 处 `console.*` 全在生产。→ P0-9。
3. **运行时配置无校验**(`constants.js:6–7`):`TILES_TO_DRAW`/`FIRST_MOVE_SCORE_LIMIT` 从 env `parseInt`,缺失即静默 `NaN` 并被烤进 bundle,直接污染发牌/首出门槛规则,无早失败。→ P0-9。

---

## 3. 建议的下一步(一个可批准的「Round 5」打包)

四份报告价值很满,但不必一次吃完。最高性价比的起手式 = **一轮纯前端、低风险、当天可见的 P0 包**,把「止血 + 第一眼会玩 + 单人有入口」一次性补齐:

> **Round-5 建议范围 = P0-1…P0-9**(全部 S/前端为主),外加先行的 **ARCH-1 的 `usePersistentFlag` 抽取**作为后续拆分的楔子。
>
> 产出:修掉排名 bug、落地页不再「看着坏掉」、solo 成为一等入口且不再被聊天/计时干扰、第一回合教会拖牌上桌、并清掉静态检查/日志/env 三笔健康债。**一轮就能把「孤独访客 + 首턴悬崖」这两个元问题各砍掉一大半。**

之后按需推进 P1(配平 + 谜题 + 身份/留存)与 P2(bot 战略基建)。架构 track 与之并行,且 **P0-8(ESLint)应在 ARCH-1 拆分之前先落**,作为护栏。

> 要的话我可以把上面任一档(建议先 Round-5 = P0 包)走老流程:spec → 评审 → plan → 实现 → 部署。
