# RummyCube · Review 5 · 综合建议（按 owner 边界收敛 · v2）

> **日期:** 2026-06-26 · **方法:** 4 位专家（Game Design / UX / UI / Architecture）独立对线上产品 fresh review，去重 + 交叉印证。本文是**唯一权威建议稿**（原始分报告已并入此处、不再单独保留）；条目后的 `GD/UX/UI/Arch` 标签仅表来源视角。
> **红线:** 服务器权威 + Rummikub 规则不动；应用内文案英文；不重复已上线项。

## 0. Owner 边界（据此删除了哪些观点）

owner 明确了产品定位，以下整类建议**已删除（不再出现在本文）**，因为前提不成立：

- **单人模式 = 开发者测试用，不是产品** → 删除一切关于 solo 作为正式玩法、冷启动 / 「孤独访客无事可玩」、把 solo 升为一等入口的观点。
- **friend-only，不做匹配** → 删除 AI bot、每日 / 练习谜题、Quick Play 公开速配、观战 / 陌生人补位。
- **现有教程已足够** → 删除「首回合核心动作没教 / 交互式 tutorial / 手势教学」等加教学的观点。
- **不考虑无障碍** → 删除色盲第二通道等观点。
- 连带删除：落地页「一排 0 = 负向社会证明」「加游戏预览以转化陌生访客」等以陌生人转化为前提的项。

**保留的，是对一个 friend-only 多人游戏真正有效的东西**：修真 bug、把「邀请→一起玩→再来一局」这条好友闭环做顺、打磨真实对局画面、让计时更清晰、还代码健康债。

**值得肯定:** 规则内核扎实（首牌 ≥30 / joker 取回 / insert-push / 断线宽限 全部正确）；`dndUtil`/`insertPush`/`moveValidation` 是干净的「纯函数 + 客户端·服务端共享内核」范本；442 测试是重构安全网。

---

## 1. 路线图（影响 × 成本）

### P0 · 修 bug + 健康债（S，纯前端/低风险）
| # | 项 | 来源 | 影响 | 成本 |
|---|---|---|---|---|
| P0-1 | **修 GameOverModal 排名 bug** — `GameOverModal.jsx:75` `sort((a,b)=>b[0]-a[0])` 比的是**座位 ID 字符串**不是分数，赢家可能排在最后；改 `b[1]-a[1]` 按分数降序 + 🥇🥈🥉（已核实） | GD B5 | High | S |
| P0-2 | **服务端日志收敛** — `src/server.js` 是 raw Node 直跑，`moves.js` 22 处 `console.*` 全在生产；`drawTile` 每次摸牌 `console.log` **整副剩余牌序**（`moves.js:47–48`），每回合 `new Date()` 刷屏。引入带 level 的 logger 或服务端 console 过滤，热路径降级为默认关 | Arch#8 | Med | S |
| P0-3 | **env 数值校验 + 删死代码** — `constants.js:6–7` `TILES_TO_DRAW`/`FIRST_MOVE_SCORE_LIMIT` 从 env `parseInt`，缺失即静默 `NaN` 烤进规则；加 `Number.isFinite` 断言（错配置→构建/启动失败），顺手删 `HAND_ROWS = IS_DEV?2:2` 死三元 | Arch#9 | Low-Med | S |
| P0-4 | **引入 ESLint + `react-hooks/exhaustive-deps`** — 当前**零静态检查**；它机械命中 Board 里靠 `gRef.current` 绕过的依赖陷阱，是后续拆分的护栏。`String()`×24 / `Number()`×20 的 stringly-typed 强转也是它的活 | Arch#2 | High | S |
| P0-5 | **落地页 Create 别默认灰禁用** — 用户名为空时 Create 呈灰棕禁用态（`lobby.css:169`），首屏主按钮看着「坏了」；改为保留绿色 active 皮肤、空名时就地提示 / 自动聚焦输入框 | UI#3 | Med | S |

### P1 · 好友闭环（friend-only 的核心价值：邀请 → 一起玩 → 再来一局）
| # | 项 | 来源 | 影响 | 成本 |
|---|---|---|---|---|
| P1-1 | **邀请要顺手** — Create 后自动复制链接但立即跳转、用户没看到确认；等待中的中央卡只说「Waiting… 1 of 2」却**没有分享按钮**（真正的 code + copy 藏在左上角 `Sidebar`）。把 **Copy invite link**（含 code）放进等待卡内 + toast 确认 | UX#7 | Med | S |
| P1-2 | **加入别报错** — Join 字段叫「Room code」但 placeholder 写「Enter match ID」（两个名）；而朋友收到的是整条链接，粘进去 → `listSeats` 报「Match not found」。术语统一为 room code；**接受粘贴整条邀请链接**（取尾 id）；失败提示「粘 code 或完整链接」 | UX#8 | Med | S |
| P1-3 | **一键重赛（ready-room）** — 现在 Play Again 每人各自 `playAgain` 拿新 id、复制、随机塞空座、立即跳转，4 人要 4 个人各点一次再在等待室重新集齐。改成**局级 ready 房**：原房间显示「3/4 ready to rematch」、原座位保留、全 ready 即开（复用等待室 UI） | GD B6 | Med | M |
| P1-4 | **记住昵称（+ 可选轻量战绩）** — 用户名每次现敲、无积累。用已存在的 `localStorage`（重连同一处）记住昵称，首页「Welcome back {name}」；可选加 games/wins/最佳 combo/连胜。纯前端 | GD B4 | Med | S–M |

### P2 · 对局画面打磨（真实多人对局的体验）
| # | 项 | 来源 | 影响 | 成本 |
|---|---|---|---|---|
| P2-1 | **画面配平** — `.board-container` 在 ≥821px 无条件留 316px 右 gutter（`board.css:33`）而聊天面板只 300px 宽、约 60% 高度是死区；同时 9×32 空托盘 ≈63vh 开局全空、把 avatar/木架/控制行挤到底部。把聊天折叠为右下 FAB（复用 `.chat-fab`，有未读再气泡）或收窄 gutter 让棋盘吃满；空盘**纵向收敛**（~46vh 起、落子增长）+ 木架上移，让 board/rack/chat 三区配平 | UI#1,2 · UX#3 | High | M |
| P2-2 | **移动端** — board 在小屏是 ≥1536px 宽需**横向滚动**（`board.css:1069`）；tap-to-place 落「全局首个空格」无法瞄准；chat FAB 压拇指区。改：board 适配视口宽度免横滚；tap-to-place 落**可见区 / 最近 meld**；FAB 上移让出控制行 | UX#10,#3 | Med | M |
| P2-3 | **UI 打磨包** — 计时环纯蓝→红（`PlayerAvatar.jsx:15`）跳出 brass/绿 调性 → 改品牌色坡道（brass→琥珀→末段 5s 才告警红）；`.turn-banner`/`.timer-seconds`/`.rummikub-button` 仍 Segoe UI → 统一 Poppins；wordmark 导航 cream vs 落地 brass → 统一；木架内牌组居中（右侧大片空棕）；avatar/计时环/Your-turn 漂浮 → 做木质名牌底座坐进木架；Undo/Redo 幽灵按钮提可见；radius/elevation token 化 | UI#6–12 | Med | S–M |
| P2-4 | **（可选）game-over 本局高光** — 终局只有总分；加最长 run / 最高 combo / 清空用时（数据 `lastPlay`+combo 管线已在算），给好友局一点谈资。可叠 best-of-N 多局赛给「再来一局」更强理由 | GD B5 | Low-Med | M |

### P3 · 计时清晰（思考型游戏的手感）
| # | 项 | 来源 | 影响 | 成本 |
|---|---|---|---|---|
| P3-1 | **显性化 draw-2 暗规则** — `drawTile` 在首牌后**一次抽 2 张**（`moves.js:38–39`/`:302`），界面从不告知；超时一次直接倒退 ~2 张。抽牌按钮标注「Draw ×2」/ tooltip，并复核它是有意变体还是该回归抽 1（至少超时路径别叠满双倍罚） | GD C7 | Med | S–M |
| P3-2 | **计时像「思考钟」** — 固定 10–60s 对桌面重排常不够；可选 time bank / 增量加时 / 一次性「+15s」救急；归零前给温和视觉降速（非告警红），与已上线的去噪方向一致 | GD C7 | Med | M |

### 架构 / 健康 track（并行，product-agnostic，使能未来每一轮）
| # | 项 | 来源 | 影响 | 成本 | 风险 |
|---|---|---|---|---|---|
| ARCH-1 | 拆 `Board.jsx`（755 行 god component）→ 聚焦 hooks（`usePersistentFlag`/`useComboCelebration`/`useGiveUpConfirm`/`useDropDispatch`/`useSyncingCue`），Board 退化为布局壳。**在 P0-4 exhaustive-deps 护栏下分批做**，每批跑 442 测试 | Arch#1 | High | M(分批) | Med |
| ARCH-2 | 拆 `moves.js`（turn/掉线裁决 → `turn.js`；计分 `applyValidMove` 搬到与 `util` 计分同层）、拆 `util.js` 5 领域 + 驱逐 DOM 代码 + **单独命名 `playerView.js` 隐私缝** | Arch#3,#4 | High/Med-High | M | Med/Low |
| ARCH-3 | 写 `docs/ARCHITECTURE.md`：G 字段表 + 不变量、**move 原子契约（INVALID_MOVE = 整体 abort）**、模块地图（谁纯 / 谁能被 server import / 隐私边界）、客户端·服务端共享内核清单 | Arch#7 | Med | S–M | Low |
| ARCH-4 | 测试加 `makeMatch()` 工厂（消 14 份手搓 G + 反向删 `onTurnBegin` 里为旧夹具买单的兼容 shim）；状态约定成文（G 唯一权威 / `gRef` 何时用 / drawn 高亮去掉回写 move） | Arch#5,#6 | Med | M | Low/Med |
| ARCH-5 | **观察项（暂不动）:** `connTransport.js` 深耦合 boardgame.io 私有内部 → 精确锁版 + 加一个「断线翻 `G.connected[seat]`」集成测试；计分路径无共享模块，做 ARCH-2 时顺手做成**可被客户端 import 的纯模块**，堵住未来「落子即时预览得分」时客户端重实现的发散 | Arch#10,#11 | Med | — | — |

---

## 2. 坐实的 bug / 卫生问题（建议立即）
1. **GameOverModal 排名错**（`GameOverModal.jsx:75`）— 按座位 ID 而非分数排，赢家可能排最后。最常被截图的一屏却排错。→ P0-1。
2. **服务端热路径打印整副牌序**（`moves.js:47–48`）— 22 处 `console.*` 跑在生产，每次摸牌泄牌序到 stdout。→ P0-2。
3. **env 无校验**（`constants.js:6–7`）— 缺失即 `NaN` 静默烤进发牌/首牌规则，无早失败。→ P0-3。

---

## 3. 建议起手式（一个可批准的 Round-5）

> **Round-5 = P0 全包 + P1 好友闭环（P1-1…P1-4）。**
>
> P0 修掉真 bug + 清三笔健康债（含 ESLint 护栏）；P1 把 friend-only 唯一真正要紧的「邀请→加入→重赛」闭环做顺。**这是对一个 friend-only 游戏最直接的体验提升**，且全是 S–M、低风险。
>
> 之后 P2（对局画面打磨）按观感优先级推进，P3（计时）随手做，架构 track 与之并行——其中 **P0-4 的 ESLint 应在 ARCH-1 拆 Board 之前先落**。

> 要的话我把 Round-5（建议先 P0 + P1）走老流程：spec → 评审 → plan → 实现 → 部署。你拍范围。
