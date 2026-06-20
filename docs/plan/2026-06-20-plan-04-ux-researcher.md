# RummyCube 优化 · 用户流程与文案(UX Researcher)

**日期:** 2026-06-20 · **作者:** UX Researcher agent · **状态:** 实现级规格草案(供前端/后端/UI 协作)
**权威来源:** `docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-1/2/5/6/14)、`review-2-ux`、`review-5-persona`
**约束声明:** 本文不改代码、不 commit。所有行为论断尽量给 `file:line`;无法在代码中确认的设计建议标「待核实」。文案为中文,代码标识符保持英文。

---

## 0. 范围与读者

本报告把 WS-1(无效提交文案)、WS-2(onboarding + coach card)、WS-5(回合/计时 microcopy)、WS-6(等候室)、WS-14(tap-to-place 兜底放置)的**用户流程与文案**转化为可实现的规格:关键旅程、状态机、每状态中文文案、成功指标与 Playwright 断言点。

读者:实现 WS-1/2/5/6/14 的前端工程师、写 `submitMeld`/`submitRejectReason` 的后端工程师、定 UI 视觉的 UI Designer。

**已核实的代码现状(作为设计基线):**
- 无效提交的破坏发生在**服务端**:客户端 `endTurn()` 总是调用 `moves.endTurn()`(`Board.jsx:154-175`),服务端 `endTurn → validatePlayerMove` 在脏且无效时走 `drawTile()` + `rollbackChanges()`(spec WS-1 引 `moves.js:120-173`),回滚已摆放的牌 + 罚抽一张 + 结束回合,无原因。
- Draw 按钮一旦摆牌就被 End 替换(`Board.jsx:309-314`),`drawOrEnd` 二选一,Draw 消失。
- End 按钮已有 live 颜色提示:`end-valid`/`end-invalid`(`Board.jsx:190-197`),但只有颜色、无文字、无原因。
- 计时仅靠头像环 `useTurnTimer`(`Board.jsx:264-269`),无数字秒数、无「轮到你」文字、无到零后果说明。
- 等候室 = 完整可拖拽棋盘;`playersJoin` 阶段全员加入后才 `events.endPhase()`(`Board.jsx:30-35`);Draw 在 `playersJoin` 阶段被禁用(`Board.jsx:200`),但棋盘手牌仍可拖动。
- Join 表单字段标签为「Room code」但 placeholder 仍是「Enter match ID」(`JoinGame.jsx:65,74`);「Match not found」仅在输入完整码后出现(`JoinGame.jsx:87`)。
- 当前唯一交互方式是 @dnd-kit 指针拖拽(`Board.jsx:316` `DndContext`),无 tap-to-place、无键盘路径。
- 规则数值:joker 计 30 分(`util.js:319,341`);首墙阈值 `FIRST_MOVE_SCORE_LIMIT` 由 env 控制、默认 30(`constants.js:7`、`moveValidation.js:140`);有效 run/set 最少 3 张(标准 Rummikub 规则,`isSequenceValid → countSeqScore > 0`,`util.js:304-307`)。

**贯穿原则(承接 spec「Guiding principles」):**
1. 先修好新手的第一回合,再加功能。
2. 绝不无解释地惩罚;预防优于破坏性纠正。
3. 在情境中教学,而非靠没人读的弹窗。
4. 文案口语、第二人称「你」、低焦虑、给出**下一步动作**而非仅报错。

---

## 1. 关键用户旅程(逐步:看到 / 想什么 / 感受 / 系统反馈)

> 旅程对应 Persona「Mei」(32,会玩简单卡牌 app,从没玩过 Rummikub,被朋友发了房间链接,困惑 >3 秒即烦躁)。每一步标注 **当前痛点**(来自 review)与 **改造后体验**。

### 旅程 A — 新手首回合(从进房到完成第一墙)

| 步 | 用户看到 | 用户想 | 感受 | 系统反馈(改造后) |
|---|---|---|---|---|
| A1 落入对局,开局 | 棋盘从禁用态点亮,头像环开始走,出现「● 轮到你了」横幅 + 一次性 coach card | 「轮到我了,但要干嘛?」 | 由焦虑→被引导 | **WS-5** 横幅 + **WS-2** coach card 同时出现;coach card 一句话点明目标与首墙 ≥30 规则 |
| A2 读 coach card | 卡片:目标 + 「你的第一手必须凑够 30 分(顺子或同数字组)」+「不想出牌?点 Draw 摸一张跳过」+「joker 是百搭」 | 「哦,30 分,顺子/同色组,看懂了」 | 安心 | 「知道了」按钮关闭并写 localStorage,后续回合不再弹 |
| A3 选牌、摆牌 | 拖拽(或 **WS-14** 点牌→点格)把手牌放到棋盘;空格有微弱网格/落点高亮(WS-3) | 「放这里」 | 顺畅(WS-3 后不再无故弹回) | 牌停留在格;End 按钮 live 变色提示当前是否会被接受(`Board.jsx:190-191` 已有) |
| A4 凑不够 30,点「提交牌组」 | 按钮红色,旁边内联文案「第一手需要 ≥30 分 — 你现在 18 分」;牌**留在原地** | 「差一点,我再加牌」 | 「原来如此」而非「被惩罚」 | **WS-1** `submitMeld` 在无效时 no-op,牌不回滚、不罚抽、不结束回合;返回 `{code:'BELOW_30', score:18, required:30}` |
| A5 补牌到 30+,再次提交 | 按钮转绿;点击后 COMBO/庆祝动画 + 回合结束 | 「成了!」 | 成就感(spec 最强 hook,Persona Step 9) | 有效路径:freeze + `lastPlay` + `events.endTurn()`(spec WS-1) |
| A6(替代)不想出牌 | Draw 按钮始终可见;摆了牌时禁用,tooltip「先清空已摆的牌才能改为摸牌」 | 「我先摸一张观望」 | 有掌控感 | **WS-1/review-2-#5**:Draw 持久显示而非消失;摸牌跳过回合 |

**成功信号:** 新手在**无人协助**下完成第一墙(A1→A5),且**未触发**任何破坏性回滚/罚抽。

### 旅程 B — 等候室(创建 → 等人 → 开局)

| 步 | 用户看到 | 用户想 | 感受 | 系统反馈(改造后) |
|---|---|---|---|---|
| B1 创建房间 | Create 表单提交后显示「房间已创建 — 房间码 XXXX」+ 大号「复制邀请链接」 | 「把链接发给朋友」 | 顺利 | `CreateGame.jsx:108-117` 已有 room-share,WS-6 放大 Copy 按钮 |
| B2 进入等候室 | **遮罩**覆盖棋盘:「等待玩家加入 — 已加入 1/2」+ 旋转指示;棋盘变暗、不可交互;房间码 + 复制链接居中 | 「在等人,我没做错」 | 安心(Persona Step 3 的 #1 bounce 被消除) | **WS-6**:`playersJoin` 阶段渲染遮罩 + 禁用棋盘;邀请面板改写为「还差人?分享这个房间」 |
| B3 第二人加入 | 「已加入 2/2」短暂显示后遮罩淡出,棋盘点亮 | 「开始了」 | 期待 | `_.every(matchData, name)` → `events.endPhase()`(`Board.jsx:30-35`,已有);遮罩随阶段切换消失 |
| B4 开局 | 进入旅程 A | — | — | — |

**当前痛点(review-2-#4 / Persona-#3):** 等候室看起来就是可玩对局;无「Waiting 1/2」;唯一 CTA 是「邀请玩家」让被邀请者去再邀请别人;Draw/Undo 灰着但手牌可拖。

### 旅程 C — 无效提交 → 看懂原因 → 修正

状态机见 §2。逐步:

| 步 | 用户看到 | 用户想 | 感受 | 系统反馈 |
|---|---|---|---|---|
| C1 摆牌中 | End/提交按钮 live 变色(绿=会被接受 / 红=会被拒) | 「按钮变红了」 | 留意 | `endStateClass`(`Board.jsx:190-191`) |
| C2 点「提交牌组」(无效) | 按钮旁内联红字原因(§3 文案表);牌**不动** | 「我知道哪里错了」 | 可控 | `submitMeld` 返回 `INVALID_MOVE` + reason code;客户端渲染文案;无回滚/罚抽/结束 |
| C3 按文案修正 | 加牌 / 拆组 / 换成自己的新牌 | 「按提示改」 | 主动 | 每次摆放后按钮颜色与(可选)原因实时刷新 |
| C4 修正后提交(有效) | 转绿 → 庆祝 → 回合结束 | 「过了」 | 成就 | 有效路径 |

**关键差异(对比当前破坏式):** Persona Step 7「牌飞回去、14→13→15、回合结束、无原因」是最伤的 bounce;改造后该破坏只保留在**超时**(`forceEndTurn`)与**显式认输**(`forfeitTurn`)路径(spec WS-1)。

### 旅程 D — 掉线 → 看到标记 → 重连 / 弃权

> 注:WS-12/WS-13 为后续 sprint,且 WS-12 需先做架构 spike(连接状态如何进入权威 game state,spec WS-12)。本旅程的**文案与流程**先行设计,实现时机由那两个 WS 决定。**实现细节标「待核实」。**

| 步 | 用户看到 | 用户想 | 感受 | 系统反馈(目标态) |
|---|---|---|---|---|
| D1 某玩家掉线 | 该座位头像出现「连接中断」标记 + 灰化(非仅颜色,带图标) | 「他掉了?会卡住吗?」 | 担忧 | 头像 `isConnected`(`PlayerAvatar` 已消费 boardgame.io metadata)+ 文字标签;**待核实** 是否驱动权威态 |
| D2 轮到掉线者 | 横幅「等待 {name} 重连…(剩余 {n} 秒)」;其回合在缩短的宽限期内自动推进 | 「不会一直卡」 | 安心 | **WS-12**:掉线座位 grace deadline 折叠(spike 后)— **待核实** |
| D3 本人掉线后重连 | 「正在重新连接…」横幅;恢复后「已重新连接」 | 「回来了」 | 恢复掌控 | **WS-13**:surface boardgame.io 连接态 banner |
| D4 多回合不归 → 投票跳过/认输 | 提示「{name} 已离开 N 回合,其余玩家可跳过其回合」 | — | — | **WS-12**:vote-to-skip / forfeit,剩余牌折算最终分 — **待核实** |

---

## 2. WS-1 无效提交状态机

提交按钮(「提交牌组」)在本人回合的状态:

```
            ┌─────────────────────────────────────────────────────────┐
            │                     NEUTRAL(中性)                       │
            │  条件: 本人回合 && 未摆任何新牌 (isBoardHasNewTiles=false) │
            │  外观: 灰/常态按钮; 显示的是 Draw(因 drawOrEnd 二选一)    │
            └───────────────┬─────────────────────────────────────────┘
                            │ 摆下第一张新牌
                            ▼
            ┌─────────────────────────────────────────────────────────┐
            │              STAGED-VALID(已摆-会被接受)                 │
            │  条件: isSubmitAccepted(G,ctx)=true                      │
            │  外观: 绿色 + ✓ 字形(WS-8 非颜色第二通道); 文案「提交牌组」 │
            └───────┬───────────────────────────────────┬─────────────┘
          点击提交  │                                     │ 撤回到无效(Undo/再摆)
                    ▼                                     ▼
            ┌──────────────┐               ┌─────────────────────────────────────┐
            │  SUBMITTED    │               │     STAGED-INVALID(已摆-会被拒)      │
            │ freeze+lastPlay│               │  条件: isSubmitAccepted=false        │
            │ +endTurn 庆祝 │               │  外观: 红色 + ✕ 字形; 文案「提交牌组」 │
            └──────────────┘               │  (可选)旁边预演原因(见下「预演」)    │
                                           └───────┬─────────────────────────────┘
                                          点击提交 │ submitMeld → INVALID_MOVE
                                                   ▼
                                ┌──────────────────────────────────────────────┐
                                │   REJECTED-EXPLAINED(已拒-已解释)            │
                                │  牌不动; 内联红字 = reasonMap[code](+score)   │
                                │  无回滚 / 无罚抽 / 无结束回合                  │
                                │  fx: 轻 buzz + bad flash(已有 Board.jsx:165-167)│
                                │  停留, 用户按文案修正 → 回到 STAGED-*          │
                                └──────────────────────────────────────────────┘
```

**两条破坏性出口(保持现状,不属于提交按钮):**
- `forceEndTurn`(超时):到 `G.timerExpireAt` 后回滚 + 罚抽(spec 保留,反作弊)。文案见 WS-5。
- `forfeitTurn`(显式认输,新 move):需二次确认弹窗,回滚 + 罚抽,带明确意图。

**设计决策 — 「预演原因」(STAGED-INVALID 是否提前显示文字):**
- **推荐 A(默认):** STAGED-INVALID 时只显示红色 + ✕,**不**自动展开文字;**点击提交后**(REJECTED-EXPLAINED)才显示原因文字。理由:减少摆牌过程中的噪音/抖动,符合 spec WS-1「on a `submitMeld` rejection … render the reason inline」(rejection 之后)。
- **可选 B:** 在 STAGED-INVALID 即预演原因(更强教学,但每次摆牌都刷新文字,易抖动)。→ **开放问题①**,交 UI/owner 决定。
- 无论 A/B,首回合的 BELOW_30 因教学价值高,建议**始终预演**当前分数(「你现在 {score} 分 / 还差 {required-score}」),因为它是新手最高频卡点(Persona Step 4/7)。

---

## 3. 原因码 → 中文文案 映射表(WS-1 核心交付)

后端 `submitRejectReason(G, ctx)` 返回 `{ code, score?, required?, group? }`,`code ∈ {BELOW_30, RUN_TOO_SHORT, INVALID_GROUP, MIXED_FIRST_MOVE, NO_NEW_TILE, OK}`(spec WS-1)。客户端映射:

| code | 触发场景(基于代码) | 内联主文案(红字) | 副提示 / 下一步 | 动态值 |
|---|---|---|---|---|
| `BELOW_30` | 首墙、所有组合法但新牌总分 < 阈值(`moveValidation.js:140`) | **「第一手需要 ≥{required} 分 — 你现在 {score} 分」** | 「再加 {required−score} 分的牌,或点 Draw 摸一张跳过」 | `score`, `required`(默认 30),差值前端算 |
| `RUN_TOO_SHORT` | 顺子不足 3 张 / 同数字组不足 3 张(`isSequenceValid` 失败因长度) | **「顺子或组合至少要 3 张牌」** | 「给这组再加一张,或把它拆回手牌」 | 可选 `group`(高亮哪组) |
| `INVALID_GROUP` | 有牌组非合法顺子/同数字组(颜色/数字不连续等,`countSeqScore=0`) | **「有一组不是有效的顺子或同数字组」** | 「顺子=同色连号;组=同数字不同色。红色高亮的就是问题组」 | 可选 `group` |
| `MIXED_FIRST_MOVE` | 首墙里某组同时含旧牌与本回合新牌(`moveValidation.js:109-125`) | **「第一手只能用你自己手里的新牌组成牌组」** | 「先别动桌上已有的牌,把那张旧牌移回去」 | 可选 `group` |
| `NO_NEW_TILE` | 未摆任何新牌就提交(`isBoardHasNewTiles=false`,`isSubmitAccepted` 早退,`moveValidation.js:150`) | **「你还没摆任何牌」** | 「从手牌拖一张到桌面,或点 Draw 摸一张」 | — |
| `OK` | 合法 | (不显示;走庆祝路径) | — | — |
| `INVALID_MOVE`(move 返回值) | `submitMeld` 在 reason≠OK 时 no-op 的返回(spec WS-1) | (用上面对应 code 的文案;此值是 move 层信号,非展示码) | — | — |

**文案写作规则:**
1. 永远第二人称「你」,不用「玩家」「用户」。
2. 主文案陈述事实,副提示给**可执行下一步**(降低 Persona「被惩罚」感)。
3. BELOW_30 必带动态分数 — 这是 Persona 两大 bounce(Step 4/7)的解药,spec 明确示例:「First meld must total ≥30 — you have {score}」。
4. 文案禁止出现「错误」「非法」「Error」「失败」等指责性词;用「需要…」「还差…」「不是…」中性表述。
5. 兜底:若收到未知 code,显示「这手暂时不能提交 — 调整一下牌组再试」(永不静默,永不破坏)。

**i18n 结构建议(实现给前端):**
```
reasonMap = {
  BELOW_30:         ({score, required}) => `第一手需要 ≥${required} 分 — 你现在 ${score} 分`,
  RUN_TOO_SHORT:    () => '顺子或组合至少要 3 张牌',
  INVALID_GROUP:    () => '有一组不是有效的顺子或同数字组',
  MIXED_FIRST_MOVE: () => '第一手只能用你自己手里的新牌组成牌组',
  NO_NEW_TILE:      () => '你还没摆任何牌',
}
```
（副提示同结构存 `reasonHintMap`，便于单测与后续翻译。）

---

## 4. WS-2 Onboarding 流程设计

三个组件:导航栏「如何游玩」modal + 一次性首回合 coach card + joker 标签。

### 4.1 导航栏「如何游玩」modal — 信息架构

入口:导航栏持久按钮「如何游玩」(或「? 玩法」)。静态内容,无后端。建议分 6 小节,可滚动,移动端全屏:

1. **目标** — 「最先把手里所有牌都打到桌上的人获胜。」
2. **每回合二选一** — 「① 打出/调整桌面牌组(顺子或组),然后点『提交牌组』;或 ② 点 Draw 摸一张牌、跳过本回合。」
3. **什么是顺子 / 组** —
   - 顺子:同颜色、数字连续,至少 3 张(例:红 4-5-6)。
   - 组(同数字):同数字、不同颜色,至少 3 张(例:红7 蓝7 黑7)。
   - (配小图示,UI Designer 负责)
4. **第一手的特殊规则** — 「你的**第一手**牌必须只用自己手里的牌、凑够 **≥30 分**。之后就能自由拼桌面的牌。」
5. **百搭(Joker)** — 「joker 可代替任意牌;计分时算 30 分。」
6. **回合计时** — 「每回合有限时,环走完会自动结束你的回合并替你摸一张牌,所以别拖太久。」

**关闭行为:** 关闭后不自动重弹;再次点导航栏可重开(纯静态,无 localStorage 依赖)。
**Playwright 断言(spec WS-2):** 点导航「如何游玩」打开的 modal 含字符串「30」与「顺子」/「组」;关闭后重进对局页不再自动弹 coach card。

### 4.2 一次性首回合 coach card

- **触发:** 本人**第一个**回合开始时(`ctx.currentPlayer === playerID` 且本人 `firstMoveDone` 为 false 且 localStorage 标志未置位)。
- **localStorage key 建议:** `rummycube.coachCardDismissed`(布尔)。**待核实** 是否要按 matchID 区分 — 建议**全局一次性**(同一浏览器只教一次),符合 spec「re-open of the match page doesn't auto-show the coach card again after dismissal」。
- **内容(精简,≤3 行 + 1 按钮):**
  - 标题:「轮到你了 — 先出第一手」
  - 正文:「把手里的牌拼成顺子或同数字组,第一手要凑够 **≥30 分**。不想出?点 Draw 摸一张跳过。」
  - 按钮:「知道了」→ 关闭 + 写 localStorage。
- **位置:** 锚定在提交/Draw 控制区附近(rack 上方),指向真正的动作区,而非屏幕中央盖住棋盘。
- **不打断:** 出现时不禁用棋盘;计时是否在 coach card 显示期间暂停 → **开放问题②**(建议:首回合首次显示时给计时一个宽限,或 coach card 显示期间不启动倒计时,避免「边读边被扣时间」的 Persona Step 8 焦虑)。

### 4.3 Joker 悬停 / 长按标签

- 现状:joker 渲染为无标签笑脸(Persona Step 4)。
- **改造:** 鼠标悬停 `title="百搭(Joker)"`;移动端长按弹同文字 tooltip;可访问性 `aria-label="百搭 Joker"`。
- spec 验收:joker tile 暴露可访问标签(accessible label)。
- 复用现有长按机制 `handleLongPressCb`(`Board.jsx:113-115`)承载移动端 tooltip — **待核实** 该回调当前只做选择,需新增 tooltip 分支或独立处理。

### 4.4 Lobby hero(顺带 WS-2 范围)

在 Create/Join tabs 上方加:
- Hero 一句:「和朋友在线玩 Rummikub — 用房间码或链接即可加入,无需注册。」
- 2–3 条 bullet:「① 创建房间,把链接发给朋友」「② 2–4 人一起玩,先清空手牌者赢」「③ 想先试试?用『0 · solo test』单人练手」。
- 把当前埋在「Number of players」下拉里的 `0 · solo test`(`CreateGame.jsx:75`)在 hero 区做一个显眼「试玩」入口(WS-17,顺带)。

---

## 5. WS-5 回合 / 计时 microcopy

### 5.1 回合横幅(rack 附近)

| 状态 | 文案 | 视觉(非仅颜色,WS-8) |
|---|---|---|
| 本人回合 | **「● 轮到你了」** | 实心圆点 + 绿/高亮;环内显示剩余**秒数**数字 |
| 他人回合 | **「轮到 {name} 了」** | 该玩家头像高亮;本人控制区禁用 |
| 等候中(playersJoin) | 见 WS-6 遮罩文案 | — |

### 5.2 倒计时 microcopy

- 环中央渲染**剩余秒数数字**(当前只有蓝→红弧,无数字,review-2-#3)。
- **首回合**一次性微文案(可并入 coach card 或紧邻环):**「环走完时,你的回合会自动结束。」**(spec WS-5;Persona Step 8 dread 的解药)
- **最后 N 秒警告**(建议 N=5):
  - 环脉冲(gated by `prefers-reduced-motion`,spec 原则)。
  - 文案(可选,出现在环旁):**「时间快到了 — 还剩 {n} 秒」**。
- **自动结束发生时**(`forceEndTurn` 触发):toast/内联提示 **「时间到 — 已替你结束回合并摸了一张牌」**。这把当前「无声回滚+罚抽」变成有解释的事件(对应 Persona Step 8)。
  - 注意:`forceEndTurn` 走的是破坏路径(回滚+罚抽,spec 保留)。文案要诚实说明摸了牌,但语气中性。

### 5.3 颜色无障碍

- 计时不能只靠蓝→红(色盲不可辨,review-2-#3)。加:数字秒数(主)+ 环长度(次)+ 最后阶段图标/脉冲。
- spec WS-5 验收:本人回合横幅读「轮到你了」,存在**递减的数字秒数**,且非纯颜色编码。

---

## 6. WS-6 等候室交互流程

### 6.1 流程与状态

```
创建房间(Create 提交)
   │  copyToClipboard 自动复制链接(CreateGame.jsx:28 已有)
   ▼
等候室(ctx.phase === 'playersJoin')
   ├─ 遮罩: 「等待玩家加入 — 已加入 {joined}/{n}」 + 旋转指示
   ├─ 棋盘: 变暗 + 禁用(pointer-events:none / 不可拖)
   ├─ 房间码 + 大号「复制邀请链接」居中
   ├─ 邀请面板改写: 「还差人?把这个房间分享给朋友」
   └─ 座位: 已加入显示名字, 空位显示「等待中…」
   │  当 _.every(matchData, name) 为真 → events.endPhase()(Board.jsx:30-35 已有)
   ▼
开局(ctx.phase 切换, 遮罩淡出, 棋盘点亮)
```

### 6.2 文案表

| 元素 | 文案 |
|---|---|
| 遮罩主标题 | **「等待玩家加入」** |
| 进度 | **「已加入 {joined}/{n}」**(例「已加入 1/2」) |
| 副提示 | **「把下面的房间码或链接发给朋友,人齐了自动开始。」** |
| 房间码标签 | **「房间码」**(统一用词,见 §7) |
| 复制按钮(常态/已复制) | **「复制邀请链接」** / **「已复制!」**(复用 `CreateGame.jsx:113-115` copied 模式) |
| 邀请面板标题(改写) | **「还差人?分享这个房间」**(原「Invite a player」让被邀请者去再邀请,误导,review-2-#4) |
| 空座位 | **「等待中…」** |
| 棋盘禁用态提示(hover/首次) | **「人齐了就能开始 — 现在先等等」** |

### 6.3 与现状的差异 / 实现注意

- 当前 `playersJoin` 阶段棋盘**可拖手牌**(只有 Draw 按钮禁用,`Board.jsx:200`)。WS-6 要**整体禁用棋盘交互**(遮罩 + pointer-events),否则 Persona Step 3 的「为什么能动又不能玩」困惑仍在。
- 遮罩应盖在 `board-container` 之上,但**不**盖导航「如何游玩」(等候时正好可以读规则)。
- **Playwright 断言(spec WS-6):** 新建 2 人对局显示遮罩含「1/2」(或「已加入 1/2」);第二人加入前棋盘不可交互(尝试拖牌无效)。

---

## 7. WS-18 顺带:Join 文案统一(支撑 WS-6 一致性)

不属于本任务核心 WS,但直接影响 B/等候旅程的措辞一致性,列出供实现一并修:
- `JoinGame.jsx:74` placeholder「Enter match ID」→ 与字段标签统一为 **「输入房间码」**(标签 `JoinGame.jsx:65` 已是 Room code → 中文统一「房间码」)。
- 「Match not found」→ **「找不到这个房间 — 检查一下房间码」**;「No slots left」→ **「房间已满」**;「Enter a room code to see open seats」→ **「输入房间码查看空座位」**。
- 全产品统一术语:**「房间码」**(不混用 match ID / 房间号)。

---

## 8. WS-14 tap-to-place(非拖拽兜底)流程

### 8.1 交互流程

作为拖拽之外的**第二条放置路径**(并行存在,不替换拖拽,spec WS-14):

```
点牌(选中) ──► 牌进入 "已拾起" 态(高亮/微浮起) ──► 点目标空格 ──► 放置到该格
   │                                                  │
   │  再点同一张/点空白处 = 取消拾起                    │  目标被占/越界 = 轻提示, 保持拾起
   │  shift/ctrl 多选(复用 handleTileSelection)        │  多选时需连续空格(复用 WS-3 resolveDropSlot)
```

- **复用现有选择逻辑:** `handleTileSelectionCb`(`Board.jsx:109-112`)已处理 tile 选择 + shift/ctrl 多选。tap-to-place 在「已有选中 + 点击空格」时调用 `moves.moveTiles(col,row,gridId,...,selectedTiles)`(与拖拽落子同一 move,`Board.jsx:97`),保证后端契约不变。
- **多选放置:** 与 WS-3 一致 —— 需要 `selectionLength` 个**连续空格**,否则拒绝(轻提示「这里放不下 {n} 张,选更宽的空位」),不做部分放置。

### 8.2 状态机

```
IDLE ──点一张牌──► PICKED(selectedTiles 非空)
PICKED ──点空格(合法)──► moveTiles → IDLE(放置成功)
PICKED ──点已占格/越界──► PICKED(保持) + 轻提示
PICKED ──点该牌/点棋盘空白──► IDLE(取消, 复用 onBoardClick 清选 Board.jsx:128-140)
PICKED ──shift/ctrl 点另一张──► PICKED(加入多选)
```

### 8.3 可访问性 / 键盘路径(设想,spec WS-14「also enables a keyboard cursor + Enter path」)

- **键盘光标:** 在 rack/棋盘上用方向键移动一个「焦点格」高亮;**Enter/空格** = 拾起当前焦点牌 → 移动焦点到目标空格 → 再 **Enter** = 放置。**Esc** = 取消拾起。
- **可达性属性:** 每个 tile `role="button"` + `aria-label`(含牌面,如「红色 7」/「百搭 Joker」)+ `aria-pressed`(拾起态);每个空格 `role="gridcell"` + `aria-label`(列号),拾起态时可放置的格 `aria-dropeffect`/或动态提示「按 Enter 放到这里」。
- **焦点管理:** 放置后焦点回到 rack 下一张牌,便于连续操作。
- **与拖拽并存:** @dnd-kit 的 MouseSensor/TouchSensor 用 `activationConstraint:{distance:6}`(`Board.jsx:57-58`),小于 6px 的点击不会触发拖拽,天然给 tap-to-place 留出空间 —— **待核实** 单击是否会被 dnd-kit 吞掉,需实测点击与拖拽的事件分流。
- **触摸目标尺寸:** 配合 WS-8 把移动端 tile 命中区提到 ~44px,tap-to-place 才好用(review-2-#6)。

### 8.4 Playwright 断言(spec WS-14)

- 不发生 drag 的情况下,通过**两次 tap**(点牌 → 点空格)成功把一张牌放到棋盘;`G.tilePositions` 相应更新。
- 键盘路径:Tab 聚焦一张牌 → Enter 拾起 → 方向键到空格 → Enter 放置成功(若键盘路径在本 sprint 落地)。

---

## 9. 每条旅程的成功指标 / 验收

> 「可观测信号」= 可在 E2E/埋点中断言的客观事件,避免主观判断。

### 9.1 旅程 A(新手首回合)

| 指标 | 可观测信号 | Playwright 断言点 |
|---|---|---|
| 无协助完成首墙 | 从开局到首个 `OK` 提交之间,**0 次** `forceEndTurn`/`forfeitTurn`/破坏性回滚事件 | solo:摆 ≥30 合法牌 → 提交 → `G.firstMoveDone[0]` 变 true,无 pageerror |
| coach card 有效触达 | 首回合显示 coach card;含「30」 | 首回合 DOM 含 coach card 与字符串「30」「顺子」/「组」 |
| coach card 不重复 | localStorage 置位后重进不再弹 | 关闭 coach card → reload match → 无 coach card |
| 不被破坏 | 无效提交后 hand size / `tilePositions` / `tilesPool` / currentPlayer 均不变 | 摆 2 张(<30)→ 提交 → 上述四项快照不变(对齐 spec WS-1 jest) |

### 9.2 旅程 B/WS-6(等候室)

| 指标 | 信号 | 断言 |
|---|---|---|
| 等候态可辨 | 遮罩 + 进度文字存在 | 新建 2 人 → DOM 含「1/2」(或「已加入 1/2」)+ 遮罩 |
| 棋盘不可误操作 | playersJoin 阶段拖牌无效 | 第二人加入前尝试拖 tile,`tilePositions` 不变 |
| 开局切换 | 第二人加入后遮罩消失、棋盘可交互 | 第二 client join → 遮罩 DOM 移除 |

### 9.3 旅程 C / WS-1(无效提交)

| 指标 | 信号 | 断言 |
|---|---|---|
| 原因可见 | 拒绝后内联红字含对应文案 | solo 摆 2 张 → 提交 → 按钮红 + 文字含「30」(BELOW_30 含 `score`) |
| 非破坏 | 点拒绝按钮后棋盘不变 | 点击后 `tilePositions`/hand 不变;无 pageerror(spec WS-1 Playwright) |
| 每 code 文案正确 | reasonMap 覆盖全部 code | jest:`submitRejectReason` 各 code(+BELOW_30 的 score)→ 对应文案(对齐 spec WS-1 jest) |

### 9.4 旅程 D / WS-5(回合计时)+ 掉线

| 指标 | 信号 | 断言 |
|---|---|---|
| 回合归属清晰 | 本人回合横幅「轮到你了」 | 本人回合 DOM 含「轮到你了」;他人回合含「轮到 {name} 了」 |
| 数字秒数递减 | 环中存在递减数字 | 轮询两次,秒数数值下降(spec WS-5) |
| 到零有解释 | 超时后出现「已替你结束回合并摸了一张牌」 | 倒计时归零 → toast 文案存在 |
| 掉线可见 | 头像「连接中断」标记(非仅色) | **待核实**(WS-12/13 落地后) |

### 9.5 WS-14(tap-to-place)

见 §8.4。核心:两次 tap 放置成功、无 drag 事件;键盘 Enter 路径(若落地)。

---

## 10. 跨专业依赖

- **后端(`submitMeld`/`submitRejectReason`/`forfeitTurn`):** §3 文案表完全依赖后端返回的 `{code, score?, required?, group?}`。后端必须保证:(a) 无效时 no-op 不破坏;(b) `BELOW_30` 携带 `score` 与 `required`(不引用 `lastPlay`,spec WS-1 明确);(c) 新增 `forfeitTurn` 用于显式认输破坏路径。**WS-1 的 reason code 是 WS-5 内联诊断与 WS-8 教学提示的上游**(spec dependency note),必须先做。
- **UI Designer:** coach card/modal 的视觉与图示(顺子/组示意图)、按钮红绿的**非颜色第二通道**(✓/✕ 字形,WS-8)、等候遮罩与脉冲动画(需 gated by `prefers-reduced-motion`)。
- **WS-3(可读棋盘/落点):** tap-to-place 的多选放置依赖 WS-3 的 `resolveDropSlot` 连续空格规则;落点高亮同时服务拖拽与 tap。
- **WS-8(无障碍):** tap-to-place 的 44px 命中区、键盘 Undo/Redo、颜色对比;joker `aria-label`。
- **WS-12/13(掉线):** 旅程 D 的实现时机与可行性取决于「连接状态进入权威 game state」的 spike 结论(spec WS-12),文案先行、实现待核实。

## 11. 开放问题

1. **STAGED-INVALID 是否预演原因文字**(§2 决策 A vs B)?推荐 A(点击后才出文字),但 BELOW_30 始终预演分数。交 UI/owner。
2. **coach card 与计时的关系:** 首回合 coach card 显示期间是否暂停/宽限倒计时?建议宽限,避免「边读边扣时间」焦虑(Persona Step 8)。需 owner 确认是否动计时逻辑。
3. **coach card localStorage 粒度:** 全局一次性(推荐,符合 spec)vs 按 matchID?
4. **`forfeitTurn` 是否本期落地:** spec 开放问题①把它列为可选。若不落地,破坏路径仅剩 `forceEndTurn` 超时;§5.2 的「时间到」文案仍需要。
5. **tap-to-place 与 dnd-kit 的点击/拖拽事件分流**:6px activationConstraint 是否足以区分单击与拖拽,需实测(§8.3 待核实)。
6. **掉线标记是否驱动权威态**(旅程 D):取决于 WS-12 spike,文案已备,实现待核实。

---

## 附:文案速查(便于实现直接取用)

```
# 无效提交(WS-1)
BELOW_30         主: 第一手需要 ≥30 分 — 你现在 {score} 分    副: 再加 {required-score} 分,或点 Draw 摸一张跳过
RUN_TOO_SHORT    主: 顺子或组合至少要 3 张牌                  副: 给这组再加一张,或拆回手牌
INVALID_GROUP    主: 有一组不是有效的顺子或同数字组          副: 顺子=同色连号;组=同数字不同色
MIXED_FIRST_MOVE 主: 第一手只能用你自己手里的新牌组成牌组    副: 先别动桌上已有的牌
NO_NEW_TILE      主: 你还没摆任何牌                          副: 拖一张到桌面,或点 Draw
兜底             主: 这手暂时不能提交 — 调整一下牌组再试

# 计时(WS-5)
轮到你了 · 轮到 {name} 了
环走完时,你的回合会自动结束
时间快到了 — 还剩 {n} 秒
时间到 — 已替你结束回合并摸了一张牌

# 等候室(WS-6)
等待玩家加入 · 已加入 {joined}/{n}
把下面的房间码或链接发给朋友,人齐了自动开始
复制邀请链接 / 已复制!
还差人?分享这个房间
人齐了就能开始 — 现在先等等

# coach card(WS-2)
轮到你了 — 先出第一手
把手里的牌拼成顺子或同数字组,第一手要凑够 ≥30 分。不想出?点 Draw 摸一张跳过。
知道了

# joker(WS-2)
百搭(Joker)   /   aria-label: 百搭 Joker

# Draw 禁用 tooltip(WS-1)
先清空已摆的牌才能改为摸牌

# Join(WS-18)
房间码 / 输入房间码 / 找不到这个房间 — 检查一下房间码 / 房间已满
```
