# RummyCube · Review 5 · 游戏设计独立评审（Game Design 视角）

**日期:** 2026-06-26 · **作者:** Game Designer（独立复审）
**范围:** 核心循环是否好玩、solo 死路、game-over 闭环、留存钩子、AI/补位、节奏与计时手感、超越单张 coach 卡的引导、观战/重连。**只分析，不改代码。**
**方法:** 通读 `Game.js` / `moves.js` / `util.js`（计分与胜负）/ `waitingRoom.js` / `lobbyClient.js` / `CreateGame.jsx` / `GameOverModal.jsx` / `ServerStats.jsx` / `planning.js`，对照三张实时截图。
**红线:** 应用内文案英文；服务器权威与 Rummikub 规则不动；不重复已上线项（combo、hints、joker 取回、insert/push、undo/redo、超时 toast、聊天等）。

---

## 0. TL;DR — 最高价值机会只有一个

**这是一个"只能多人、且当前在线 0 人"的产品 —— 一个没有朋友同时在线的访客，进来后无事可做：solo 是对着空气打、没有 AI、没有公开对局、没有单人谜题。** 截图里 `0 games / 0 rooms / 0 players` 不是冷启动噱头，而是这个游戏对单个访客的真实状态。**单一最高价值动作 = 引入一个 AI 对手（bot）**：它一箭四雕 —— 让 solo 变成真正的对局、补满空座、当练习陪练、缓冲冷启动。bot 是 L 工程量，所以用一个 **每日/练习谜题（seeded deal，单人、可分享）** 作为"今天就能玩到"的快速补位。两者之后才是身份/留存与 game-over 闭环。

**值得肯定（简述）:** 规则内核扎实（首牌 ≥30、joker 取回、insert/push、断线宽限+forfeit 都已正确实现）；game-over 已有撒花 + Play Again + 计分列表；提交非法是无副作用 no-op，手感干净。骨架够好，**缺的是"一个人也有得玩"和"玩完有理由再来"。**

排序：**A 组（人口/单人死路，最高）→ B 组（身份与终局闭环）→ C 组（手感与引导缺口）。**

---

## A 组 · 让"一个人/凑不齐人"也能玩（最高价值）

### A1. 加一个 AI 对手（bot）—— Impact High × Effort L（可分阶段）
**现状:** 全代码无 bot/AI/CPU（已 grep 确认）。`Game.js` `minPlayers:1`，"0 · solo test" 创建的是 1 人局；`countPoints` 在无对手时 `winnerPoints=0`，所以 solo 即使"清空手牌赢了"，弹窗也是 **Total Points: 0** 的空胜利。`waitingRoom.isWaitingForPlayers` 要求**每个座位都坐满真人**棋盘才可交互——4 人房凑不齐 4 个真人就永远开不了局。
**为什么重要:** 这是整个产品最大的漏斗泄漏点。单人没对手 = solo 是死路；多人必须集齐真人 = 任何缺一人的局直接卡死。一个 bot 同时解决：solo 练习、空座补位、新手陪练、在线 0 人时的冷启动。`planning.js` 的 `playableTiles` 已经具备"牌能不能接某组"的判定砖块——但那只是高亮 helper，bot 需要的是**会摆牌的 meld-planner**（找 run/set、满足首牌 ≥30、必要时重排桌面）。
**建议（分阶段，每阶段独立可上线）:**
- **P0 "Easy bot"（贪心）:** 复用 `playableTiles` 思路：每回合枚举手牌能延长/补全的合法落子，能放就放、首牌未达 30 就抽牌。不做桌面重排。足以让 solo / 补位"有人陪打"。
- **P1 "Normal":** 加首牌组合搜索（凑 ≥30）+ 简单桌面操纵（拆 run 借牌）。
- **P2 "Hard":** 接近最优的 tile-rearrangement 求解。
- 在 CreateGame 增加 "Add bot" 选项 / "Solo vs CPU" 模式；房间等待界面允许"用 bot 填满空座并开局"。bot 走与真人相同的 server-authoritative move 通道（防作弊红线不破）。

### A2. 每日谜题 / 练习模式（seeded deal）—— Impact High × Effort M
**现状:** 没有任何单人可玩内容；solo 是无目标沙盒。
**为什么重要:** bot 是 L 工程，但"让孤独访客今天就有得玩"不能等。一副**确定性发牌（按日期 seed）**的单人谜题，是 Wordle 式的低成本留存+病毒钩子，且**完全不依赖在线人口**——这正是当前最稀缺的东西。
**建议:** 用 `random` 的 seed = 当日日期生成同一副牌，目标如"最少回合清空手牌"或"限时内清空"。结算给一个可复制的成绩串（🟩🟩⬜ 风格 + 回合数/剩余牌），本地 `localStorage` 存最佳。把现有"0 · solo test"重命名为 **"Practice / Daily"**，并在结算用真实指标（剩余牌点数、最长 run、桌面操纵次数）替代当前的 0 分空胜利。

### A3. 公开速配 / Quick Play —— Impact High × Effort M
**现状:** `lobbyClient.createGame` 一律 `unlisted:true`，只能凭 code 加入；首页 `ServerStats` 明明拿到了 `waiting`（等待中房间数），**却没有任何"加入一个等待中的房间"按钮**——有数据、无动作。`App.jsx` 路由只有 `/match`、`/join-match`、`/`，无任何撮合入口。
**为什么重要:** 一个想玩的陌生访客无路可走，只能"创建房间→把链接发给本来就没在线的朋友"。这是把所有需求强行漏斗到"线下约人"。哪怕只在两个真访客之间撮合，也比现在的"零撮合"强。
**建议:** 加一个 **"Quick Play"** 按钮：有公开 waiting 房就塞进去，没有就建一个 2 人公开房等人（配合 A1 的 bot：等待超 N 秒自动用 bot 开局，永不卡死）。同时把 `ServerStats` 的 `rooms waiting` 数字变成可点的"加入"入口。需要在 `createMatch` 上区分 listed/unlisted（朋友私局仍 unlisted）。

---

## B 组 · 身份、终局闭环与"再来一局"

### B4. 没有持久身份与战绩 —— Impact High × Effort M
**现状:** 用户名每次现敲（`CreateGame` 里 dev 预填 'test'），无账号、无 profile、无胜场/连胜/历史。游戏结束→回首页→一切归零。
**为什么重要:** 没有任何"积累感"，玩家没有回来的理由。这是留存的根基缺口，且不需要后端账号系统——`localStorage` 足以撑起轻量身份。
**建议:** 用已存在的 `localStorage`（重连用的同一处）记住昵称 + 轻量战绩（games / wins / 最佳 combo / 最快清空 / 当前连胜），首页直接展示"Welcome back {name} — 12 wins · 3-streak"。这是低风险、纯前端、立刻见效的留存钩子。**连胜（streak）是这里性价比最高的承诺装置。**

### B5. Game-over 是一次性的，且排名有 bug —— Impact Med × Effort S（修排序）/ M（高光+分享）
**现状（已核实 bug）:** `GameOverModal.jsx:74-76` 的计分列表 `Object.entries(gameover.points).sort((a,b)=>b[0]-a[0])` —— `a[0]/b[0]` 是**座位 ID 字符串**，所以列表按座位号倒序排，**根本没按分数排名**。赢家可能排在最后。所谓"standings"并不是 standings。此外终局只有总分，没有任何这一局的高光，也没有分享。
**为什么重要:** 这是全局最常被截图/分享的一屏，却在"排名"这件最基本的事上出错，并且浪费了天然的炫耀/病毒时刻。
**建议:**
- **快速修:** 改成 `.sort((a,b)=>b[1]-a[1])` 按分数降序，给前排加 🥇🥈🥉。
- **增值:** 结算展示本局高光（最长 run、最高 combo、桌面操纵次数、清空用时）——这些数据 `lastPlay`/combo 管线已经在算。加一个"Share result"复制成绩串。
- **赛制:** 支持 best-of-3 的多局累计赛，给"再来一局"一个比单局更强的理由。

### B6. "Play Again" 太脆、没有共享 ready 房 —— Impact Med × Effort M
**现状:** `onPlayAgain` 每个玩家各自调 `playAgain` 拿到 `nextMatchID`、复制链接、随机塞进一个空座、立即 `navigate` 到新局。没有"谁要重赛"的可见状态、没有 ready-check、没有把原班人马自动归位。4 人局要 4 个人都各自点一次再在等待室重新集齐才能开。
**为什么重要:** 重赛是留存的黄金 30 秒，现在却比开局还麻烦——很多人就在这一步流失了。
**建议:** 把"Play again?"做成**局级 ready 房**：原房间内显示"3/4 ready to rematch"，原座位保留，全员 ready（或配合 A1 用 bot 补缺）即开。复用现有等待室 UI 即可，不必每人手动重走 create/join。

---

## C 组 · 手感与引导的真实缺口

### C7. 计时是"思考型游戏"的坏压力，且藏了一条 draw-2 暗规则 —— Impact Med × Effort M
**现状:** 每回合固定 10–60s（默认 30）。Rummikub 的桌面重排经常 30s 做不完，而超时 = `forceEndTurn` → **掉这一回合 + 罚抽**。更关键的暗规则：`drawTile` 在 `firstMoveDone` 后**一次抽 2 张**（`moves.js:38-39`，首牌后于 `:302` 置真）——即首牌之后无论主动抽还是超时，**手牌一次涨 2**。玩家界面从未告知这条，超时一次直接倒退 ~2 张进度。
**为什么重要:** 对一个慢思考的拼图游戏，"固定倒计时 + 双重惩罚 + 隐藏的 draw-2"制造的是焦虑而非张力；新手尤其会在毫不知情下越打牌越多、越陷越深。
**建议:**
- 让计时更像"思考钟"：可选 **time bank / 增量加时**（如基础 25s + 每局少量储备），或低代价的"+15s 一次性救急"。
- **把 draw-2 规则显性化**（抽牌按钮标注"Draw ×2"或 tooltip 说明），并复核它是有意变体还是应回归标准的抽 1；至少在超时路径上别叠满双倍惩罚。
- 计时归零前给一个温和的视觉降速提示（非"警报红"），与已上线的 board-only 提示去噪方向一致。

### C8. 引导深度止步于一张 coach 卡 —— Impact Med × Effort M–L
**现状:** 只有静态 `HowToPlay` 文案 + 一次性 coach 卡 + 选开的 hints。一个没玩过 Rummikub 的人，仍要靠试错才知道"拖牌→上桌→submit"，更不懂"首牌必须用自己手牌凑 ≥30"。
**为什么重要:** 目标用户是零门槛访客，而最常拒绝新手的规则（首牌 ≥30）现在只能在被拒后才学到。文字读不进去，手得动一次。
**建议:** 做一个 90 秒**交互式 tutorial**（强烈复用 A1 bot / A2 seeded deal）："把这 3 张拖上桌凑出你的第一组 ≥30" → 引导一次成功的 submit → 引导一次 draw → 一次 joker。让首胜发生在安全沙盒里。这是把 bot/谜题投资再利用的最高杠杆点。

### C9. 座位会"死掉"——无观战、无补位、无中途加入 —— Impact Med × Effort M
**现状:** 重连有（`localStorage` 的 `rummycube:match:*`），但断线达 `N_FORFEIT_TURNS` 后座位 forfeit；没有观战、没有把等待中的人/ bot 顶替进来的机制；`unlisted` + 必须空座有名才可 join，使中途没法补人。
**为什么重要:** 真人局一旦有人掉线/离开，体验就崩——剩下的人陪着一个空座打完。Spectate 还能让"等位的朋友"先看着，降低流失。
**建议:** ① **Spectator 模式**：凭链接只读观战，座位空出时一键"坐下接管"。② **Backfill**：forfeit 的座位允许等待玩家或 bot（A1）顶替继续。③ 观战 + 补位天然配合 A3 的速配。

---

## 落地顺序建议（价值/依赖排序）

1. **B5 修排序**（S，立刻做，止血）→ 同屏顺手加高光+share。
2. **A2 每日/练习谜题**（M，不依赖人口，最快让单人有得玩）。
3. **A1 Easy bot P0**（复用 `playableTiles`）→ 解锁 solo-vs-CPU / 空座补位，并成为 C8 tutorial、C9 backfill、A3 兜底的公共基建。
4. **B4 持久身份+连胜**（M，纯前端留存根基）。
5. **A3 Quick Play / B6 ready 重赛 / C7 计时经济 / C9 观战补位 / C8 交互教程**（依次，多数依赖 1–4 的基建）。

> 一句话：**先让"一个人也玩得下去"（A2+A1），再让"玩完想再来"（B4+B5+B6），手感与引导缺口（C 组）随基建顺势补齐。**
