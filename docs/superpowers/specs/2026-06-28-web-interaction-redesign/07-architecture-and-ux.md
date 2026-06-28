# 混乱 DLC — 架构 / 可行性 + 子项目拆分 + UX 界面清单(桥梁文档)

> **作用**:把已封板的规则 spec(`06-chaos-dlc.md`)接到实现之间的桥。**仍是 spec 层**(设计/交互),不是 plan;每个子项目之后各自走 writing-plans。
> **核对过的真实接缝**(`src/rummikub/Game.js` / `moves.js` / `playerView.js` / `turn.js`):boardgame.io `phases:{playersJoin,play}`;`moves:{drawTile,moveTiles,insertTilesWithPush,submitMeld,retrieveJoker,undo,redo,...}`;`turn:{onBegin:onTurnBegin,onEnd:onTurnEnd,activePlayers:{all:Stage.NULL}}`;`playerView` 已按玩家裁剪手牌;`moves.js` 已算 `s.manipulation`(连击分)、`G.gameStateStack` 做撤销快照、`forfeitSeat` 服务器侧结算掉线者。

---

## 1. 架构 / 可行性

### 1.1 模式开关(经典零回归)
- 开房时一个选项 `chaos:true` → setup 写入 `G.mode`。**几乎所有混乱逻辑都 gate 在 `G.mode==='chaos'`**;经典模式走原路径,**字节级不变**。

### 1.2 能力卡 = 服务器状态(隐藏 + 隐藏张数)
- `G.abilityDeck`(28 张抽堆,服务器私有)、`G.abilityHands[pid]`(各自的卡)、`G.abilityDiscard`(用完进、不洗回)。
- **扩 `playerView`**:剥掉对手的 `abilityHands` 内容**以及张数**(owner 要"不知道别人有几张")。
- **发卡**:`onTurnBegin`(chaos)里用**服务器随机**掷 30% → 发 1 张;setup 发 2 张。
- **出卡**:新 move `playAbilityCard({cardId, declaredType, target, faceDown})`。绝大多数效果是"你自己回合即时生效"= 普通 move(便宜)。

### 1.3 三个"打断"节拍(全靠 boardgame.io stage + 软时钟,不做秒级窗口)
回合制框架没有服务器时钟调度,所以这三处都用 **`activePlayers`/Stage 把行动权临时交给某人 + 复用现有回合软时钟,超时执行默认**:
- **诈唬质疑**:盖牌出 + 报名时,move 不立即结算,写 `G.pendingBluff`,把质疑权交给"目标(指定卡)/全场(非指定卡)";他们出 `challengeBluff()`/`passBluff()`,或超时**默认放过**。
- **砸牌 UNO 转移**:被砸时进 `G.pendingJunk`,目标可出自己的砸牌转走(叠加),或接收;超时默认全吃。
- (护盾是被动:结算那刻服务器自动判,无需交互。)
> 这两处(质疑、转移)是**唯二离开"纯你自己回合"模型**的地方,**实现风险最高**,建议先做一个最小 spike 验证 stage+超时默认这套手感。

### 1.4 转盘 = 服务器纯函数
- `spinWheel(G, random)` 用 boardgame.io 的 `random`(**服务器确定性 RNG,绝不用 Math.random**,保证权威+可重放)。
- 触发:move 结算后,若"本回合贡献>7"或打了「转盘卡」→ 调用。效果都在三态间搬牌(摸/手→库/库→桌/桌→库)。

### 1.5 小丑炸弹
- `G.jokerHeat[jokerTileId]`(该 joker 组被改动次数)。move 改动了含 joker 的组 → `onTurnEnd` 结算用服务器随机掷 `20%+15%*heat`(封顶80%);中了 → 该组散回牌库 + **当前玩家摸 3(普通牌)**。
- `【待定】` "改动 joker 组"的精确判定 + **排除自动整理引擎的位移**(只算玩家主动增删/拆/取回)。

### 1.6 砸牌 +N
- move 效果:强制目标**从牌库摸 N(普通牌)**,在 turn-commit 应用。转移见 1.3。

### 1.7 完整性铁律(来自后端专家,必须遵守)
- **效果在 turn-commit 应用,绝不做成回合内可撤销的 move**(否则攻击者看到结果再 undo)。
- **`undo` 只还原你自己回合**,吃到的伤害无快照→撤不掉。
- **一切惩罚摸牌只摸普通牌、不摸能力卡**。
- **所有随机走服务器 `random`**(确定性、防作弊)。掉线逃伤无效(`forfeitSeat` 已服务器结算)。

### 1.8 流动性
- 沿用现有**邀请房**模型 + **solo/bot 测试模式**;混乱模式本质仍是**回合制**(无实时手速),**异步容忍度高**——推送效果等对手回来再落地。`【待定】` chaos vs bot 兜底,延后。

---

## 2. 子项目拆分 + 建议顺序
大 spec 拆成子项目,每个各自 **小 spec → plan → subagent 实现 → 部署**,全程**挂在 chaos 开关后、经典默认**,可增量上线。

| # | 子项目 | 内容 | 依赖 |
|---|---|---|---|
| **SP1** | **模式管线 + 能力卡骨架** | `G.mode` 开关;abilityDeck/Hands/Discard;playerView 隐藏(含张数);30% 发卡;`playAbilityCard`;先接两张最简单的"自己回合即时生效"卡(**窥探** + **护盾**) | — |
| **SP2** | **砸牌 +N + UNO 转移** | 砸牌效果 + `pendingJunk` 转移节拍 | SP1 |
| **SP3** | **公共转盘** | 触发(>7 / 转盘卡)+ `spinWheel` + 祸福/对象表 | SP1 |
| **SP4** | **小丑炸弹** | jokerHeat + 结算引信 + 散组/摸3 + 危险度显示 | — (可与 SP1 并行) |
| **SP5** | **诈唬 / 质疑** | `pendingBluff` + 质疑权 + 结算表 | SP1(+ 越多卡越值得测) |
| **SP6** | **剩余卡 + 打磨** | 跳过 / 封族 / 逼牌 / 大风吹;稀有度视觉;首测调参 | SP1–5 |

**顺序理由**:SP1 是骨架(转盘卡/诈唬/砸牌都挂它上)→ 先做;**诈唬(SP5)最难(打断节拍)**,等卡系统稳了再上;小丑(SP4)相对独立可早做。建议 **SP1 → SP4 → SP2 → SP3 → SP5 → SP6**。

---

## 3. UX / 界面清单 + 操作流(流程级,不抠像素)

### 新增界面
- **能力卡手区**:你自己的卡,**白/蓝/金**底色区分稀有度;**对手只显示"有牌"气场、不显示张数与内容**。
- **出卡操作流**:点卡 → (可选"盖着出"开关 + 报名选卡型) → 点目标(指定卡)→ 确认。
- **诈唬提示**:质疑者看到"X 声称打出【砸牌+4】砸老王 → [质疑] [放过]" + 软时钟倒计时(超时默认放过)。
- **转盘**:中央弹出转盘动画 → 结果 toast(对象 + 行动 + 祸/福)。
- **小丑危险度**:含 joker 的组上挂一个**危险度条/热度标**(20%→35%→…),让"敢不敢碰"可视。
- **砸牌来袭**:被砸/被转移时的提示 + **转移操作**(出自己砸牌甩给下家)。
- **模式入口**:开房选 经典 / 混乱;混乱模式首玩给 coach 卡 + 一句话规则。

### 复用现有
- 聊天气泡(做正向表情/吐槽)、打击感/动画层、coach 卡、回合软时钟、棋盘/手牌布局、自动整理。

### 待定 / 注意
- **移动端**:卡手区在小屏怎么放(抽屉?底部条?)。
- **无障碍**:转盘/爆炸特效尊重 reduce-motion。
- **保密**:严守"不显示对手能力卡张数"。
- **像素级视觉留到实现迭代**(repo 已有设计系统 + make-interfaces-feel-better 规范);想先看可让 UI Designer agent 出 mockup。

---

## 4. 下一步
1. (可选)UI Designer agent 出 SP1 的几张 mockup(卡手区 + 出卡流 + 小丑危险度)。
2. 对 **SP1(模式管线 + 能力卡骨架)** 走 writing-plans → subagent-driven 实现 → 部署。
3. 之后按建议顺序逐个子项目推进。
