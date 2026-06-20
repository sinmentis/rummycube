# RummyCube 优化 · 安全与反作弊审视(Security Architect)

> 范围:本轮优化(spec `docs/optimization/2026-06-20-rummycube-optimization-spec.md` 的 WS-1 / WS-11 / WS-12 / WS-13)是否引入新弱点或让「服务器权威 + 反作弊」核心卖点退化。
> 定位:防御性应用安全。产品非商业、无账号、无支付、仅 127.0.0.1 + Cloudflare Tunnel,**不过度设计**;但「服务器权威 + 反作弊 + 房间码私密」必须守住。
> 约束遵守:不改代码、不 commit。论断均带 `file:line`;无法确认者标「待核实」。

---

## 0. 结论速览(按严重度)

| # | 发现 | 严重度 | 类型 | 与本轮关系 |
|---|------|--------|------|-----------|
| F1 | 默认 lobby 路由 `GET /games/rummikub` 列出**全部活跃房间码 + 玩家名 + 座位占用** | 高 | 既有,WS-13 会放大 | 房间码私密性被彻底击穿 |
| F2 | 无 `playerView`,完整 `G`(含**所有玩家手牌** `tilePositions`)下发到每个客户端 | 高 | 既有,核心反作弊缺口 | 改造客户端/DevTools 即可看穿对手手牌 |
| F3 | WS-1 `submitMeld` / `forfeitTurn` 若漏 `playerID === ctx.currentPlayer` 门禁 | 高 | 本轮新增 | 越权代他人结束/弃权回合 |
| F4 | WS-12 连接状态若信任客户端上报 → 伪造对手「掉线」触发弃权 | 高 | 本轮新增 | spec 已警示,需实现层守住 |
| F5 | 聊天无服务端长度/频率限制,`sanitizeChatText` 仅客户端 | 中 | 既有 | 刷屏/超长消息 DoS;XSS 已被 React 转义挡住 |
| F6 | `/api/stats` 每请求 O(matches) 次 DB fetch,无限流/缓存 | 中 | 既有,WS-13 落盘后更重 | 放大型 DoS |
| F7 | WS-11 joker 取回 move 的所有权/合法性/时序校验 | 中 | 本轮新增 | 偷 joker / 棋盘 desync |
| F8 | WS-13 落盘文件含对局内容+昵称,权限/备份位置 | 低-中 | 本轮新增 | 信息留存 |
| F9 | `GET /games` 列出已注册游戏名;join/leave/rename/update 等默认写路由仅 CORS 保护 | 低 | 既有 | 次要信息泄露 / 元数据篡改面 |

**最重要的一句话:** `origins` / `apiOrigins`(`src/server.js:8-16`)只是 **CORS**,只约束浏览器;`curl` / 非浏览器客户端**完全绕过**。因此 F1/F9 的默认 lobby 路由在 Tunnel 后对任意攻击者开放。这是本轮「房间码私密 + /api/stats 不泄露 id/名」防线最大的实现级漏洞。

---

## 1. 威胁面清单 —— 逐个新增/改动 move

### 1.1 `submitMeld`(WS-1 新增,当前玩家 move)
spec:`docs/.../spec.md:44`、`:50`。无效时 **no-op 返回 INVALID_MOVE**,不结束回合、不抽牌、不回滚。

可能滥用与防护要求:

- **伪造 playerID / 非当前玩家调用** —— boardgame.io 会用握手凭证绑定 `playerID`,但 move 内部仍**必须**首行 `if (playerID !== ctx.currentPlayer) return INVALID_MOVE`(对齐 `endTurn` `moves.js:128`、`drawTile` `moves.js:29`)。**严重度:高**。
- **错误的 phase 暴露** —— `submitMeld` 只能注册在 `play` 阶段的 `moves`,**不得**进 `playersJoin.moves`(`Game.js:50-60`),否则可在发牌/加入阶段触发校验副作用。**中**。
- **用 no-op 反复试探合法性 / 拖时间** —— 这是 spec 刻意的设计(无效不惩罚)。**真实风险有限**:棋盘本就是公共信息(任何玩家都能看到台面),反复 `submitMeld` 不暴露任何新信息;拖时间也被 `forceEndTurn` 的服务器截止时间(`moves.js:142-150`)兜住——到点后**任何**对手都能强制结束并触发回滚+罚抽。**结论:保留 no-op 语义即可,无需额外限流**;但需在验收里明确「`submitMeld` 不写 `G.timerExpireAt`」。**低**。
- **no-op 必须真的零副作用** —— 不得 push `gameStateStack`、不得改 `tilePositions`、`tilesPool`、`firstMoveDone`、`lastPlay`、`currentPlayer`(spec `:50` 已列为 Jest 验收)。**中**。

验收/测试点:
- Jest:非当前玩家调用 `submitMeld` → `INVALID_MOVE` 且 `G` 不变。
- Jest(对齐 spec `:50`):无效棋盘 `submitMeld` 前后 `tilePositions` / 手牌数 / `tilesPool` / `currentPlayer` 全等;`G.timerExpireAt` 不变。
- Jest:有效棋盘 → freeze + `lastPlay` + `endTurn`。

### 1.2 `submitRejectReason(G, ctx)`(WS-1 新增,纯函数)
spec:`:43`。返回 `{code, score?, required?, group?}`。

- **信息泄露面** —— 返回值只描述**当前玩家自己台面**的校验结果(score/required/group 都来自公共棋盘),不涉及对手手牌,**安全**。要求:实现时**不得**顺手把 `G.tilesPool`、对手 `firstMoveDone`、对手手牌等读进返回结构。**低**。
- **纯函数无副作用** —— 不得写 `G`(它会被 `submitMeld` 与客户端预检共用)。**低**。

验收:Jest 对各 `code` 的构造棋盘断言;并断言调用前后 `G` 引用不被 mutate(可 `deepFreeze(G)` 后调用)。

### 1.3 `forfeitTurn`(WS-1 新增,当前玩家显式弃权)
spec:`:45`、`:51`。显式确认弃权 → 回滚 + 罚抽。

- **越权弃权(代他人弃权)** —— **必须** `if (playerID !== ctx.currentPlayer) return INVALID_MOVE`。否则玩家 B 可在玩家 A 回合调用 `forfeitTurn` 强制 A 弃权。**严重度:高**。
- **不得复用 `forceEndTurn`** —— spec `:45` 已明确:`forceEndTurn` 在截止前 `return INVALID_MOVE`(`moves.js:148`),而显式弃权应**随时**可由当前玩家自己触发,语义不同。实现独立 move,复用 `rollbackChanges` + `drawTile` 的「无效路径」。**中**。
- **不可绕过 `forceEndTurn` 反作弊** —— `forfeitTurn` 仅作用于**调用者自己**的当前回合,不读/不改 `timerExpireAt`,因此不会成为「跳过截止时间」的旁路。需在验收固化。**中**。

验收(对齐 spec `:51`):
- Jest:当前玩家 `forfeitTurn` → 回滚 + 罚抽 + 结束回合。
- Jest:**非**当前玩家 `forfeitTurn` → `INVALID_MOVE`,`G` 不变。

### 1.4 joker 取回(WS-11 新增,当前玩家 move)
spec:`:138-139`。用两张匹配的真实牌拖到台面 joker 上取回它,仅当棋盘保持有效。

- **当前玩家门禁** —— `if (playerID !== ctx.currentPlayer) return INVALID_MOVE`。**高**。
- **所有权校验** —— 用来交换的两张真实牌**必须当前在调用者手牌**(`tilePositions[t].gridId===HAND_GRID_ID && playerID===调用者`),严防用「读到的对手手牌 id」(见 F2)凭空构造交换。**高**。
- **匹配校验 + 棋盘有效性** —— 两张牌的 value+color 必须等于 joker 在序列中代表的值;取回后 `isBoardValid(G)`(`moveValidation.js:69`)必须为真,否则整体 `INVALID_MOVE`、不留半成品。**中**。
- **计分一致性** —— spec 要求 joker 以「代表值」计入 `lastPlay.points`;注意 `validatePlayerMove` 现用 `isJoker(p.id)?0:getTileValue(...)`(`moves.js:237`),WS-11 改动需保证不引入「joker 既算 0 又被取回重复计分」的逻辑漏洞(作弊刷分)。**中**。

验收(对齐 spec `:139`):取回成功/失败的 Jest;并补一条:**用非自己手牌的两张牌**取回 → `INVALID_MOVE` 且 `G` 不变。

### 1.5 WS-12 连接状态写入(新增,服务端权威)
spec:`:143-145`、`:168`、`:194`(「Never trust a client-supplied connection flag」)。

- **绝不信任客户端上报** —— 连接状态**必须**来自服务端 socket 事件(boardgame.io `onConnectionChange` / 中间件 / 插件),写入 `G.connected[seat]`。若做成一个可被客户端调用的 move,玩家 B 即可把自己/对手标为「掉线」以**缩短对手 grace、强制其弃权**——直接摧毁反作弊。**严重度:高**。
- **vote-to-skip / forfeit 阈值** —— 「跨 N 个掉线回合后转分」必须由服务端依据**权威**连接状态计数,单个玩家不能单方面把对手判负;阈值与计数都在服务端。**高**。
- **grace 截止不得给客户端可写入口** —— 折叠 `timerExpireAt` 的逻辑必须与 `onTurnBegin`/`onPlayPhaseBegin` 同源(`moves.js:255`、`:261`),客户端不可写。**高**。

验收:spike 文档说明「连接状态如何进入权威 `G`」;Jest/smoke:掉线活跃座位在 grace 窗口内自动推进,而非完整 `timePerTurn`;并新增对抗用例:模拟客户端发送伪造连接 payload → 不影响 `G.connected`。

---

## 2.「服务器权威 + 反作弊」回归检查项

| 检查项 | 当前状态(file:line) | 本轮要求 |
|--------|----------------------|----------|
| 新 move 不绕过 `forceEndTurn` 截止时间 | `forceEndTurn` 仅在 `getSecTs() >= G.timerExpireAt` 后放行回滚+罚抽(`moves.js:142-150`) | `submitMeld`/`forfeitTurn`/joker 取回**都不读写 `timerExpireAt`**;`forfeitTurn` 只作用调用者当前回合 ✅ 设计可达,需 Jest 固化 |
| 合法性判定全在服务端 | `validatePlayerMove` / `isMoveValid` / `isFirstMoveValid` 均服务端执行(`moves.js:219`、`moveValidation.js`) | `submitRejectReason` 可在客户端**复用做预检 UX**,但服务端 `submitMeld` 必须**独立再校验**,不得以客户端结果为准 |
| 不在客户端泄露对手手牌 | **未通过** —— 无 `playerView`(`grep` 全仓零命中),完整 `tilePositions`(含所有手牌)下发(`Game.js` 无 `playerView`,`util.js:476` 证明手牌就在 `tilePositions`) | 见 **F2**,建议本轮一并修复 `playerView` |
| 越权门禁 | `endTurn`/`drawTile`/`undo`/`redo` 都有 `currentPlayer` 检查;但 `moveTiles` 的 `fromHandToHand` 分支**未校验被移动牌的归属**(`moves.js:99-100`,只校验落点 overlap 用调用者 `playerID`) | 新 move 一律首行门禁;并核实 `moveTiles` 是否允许非当前玩家重排自己手牌(预期允许),但**不应能移动他人手牌牌面**——**待核实** `fromHandToHand` 是否可作用于 `currPos.playerID !== playerID` 的牌 |

### F2 详述(高):无 `playerView`
- 证据:`grep -rn playerView src/` 零命中;`Game.js` 未配置 `playerView`;`G.tilePositions` 同时持有所有玩家手牌(`Game.js:16-32` 发牌写入,`util.js:476-492` 按 `playerID` 还原各家手牌)。
- 影响:boardgame.io 默认把完整 `G` 同步给每个连接的客户端。改造客户端 / 浏览器 DevTools 即可读出**全部对手手牌**——对一个把「服务器权威 + 反作弊」当卖点的产品,这是核心缺口。
- 防护要求:为 `Rummikub` 增加 `playerView`,对每个 `playerID` 过滤掉 `gridId===HAND_GRID_ID && playerID!==viewer` 的牌(保留台面、池计数、`lastPlay` 等)。注意所有依赖完整 `tilePositions` 的服务端逻辑都在 move 内(服务端拿到的是完整 `G`,不受 `playerView` 影响),仅同步层裁剪。
- 工作量:**M**(需仔细确认客户端渲染只用自己手牌 + 台面;`recentlyDrawnTiles` 只对本人保留)。
- 验收:Jest 对 `playerView(G, ctx, '0')` 断言不含座位 1/2/3 的 hand 牌;Playwright/手动:以玩家 1 身份连接,WS 帧 / `window` 状态中不含对手具体牌 id。
- 备注:这是**既有**问题,严格说不属「本轮新增退化」,但 WS-11 joker 取回会**新增**一个依赖「手牌所有权」的 move(F7),在手牌已泄露的前提下其所有权校验尤为关键——故强烈建议同轮修复。

---

## 3. 聊天安全(ChatPanel / quickChat)

证据:
- 渲染:消息文本经 React JSX `{m.payload.text}` 输出(`ChatPanel.jsx:126`),玩家名 `nameFor` 经 `{...}` 输出(`ChatPanel.jsx:125`、`:63-64`)。**React 默认转义**,故存储型/反射型 **XSS 不成立**(这是当前最大的安全亮点)。
- 头像:`url(${catAvatarUrl(matchID, m.sender)})` 内联 style(`ChatPanel.jsx:122`),`catAvatarUrl` 由 `matchID+sender` 确定性生成,非用户文本,**无 CSS 注入**。**低**。

问题:
- **F5 净化只在客户端** —— `sanitizeChatText`(`quickChat.js:23-26`)仅 `trim` + `slice(0,200)`,且只在客户端 `send()`(`ChatPanel.jsx:66-71`)调用。boardgame.io 的 chat 经 socket `chat` 事件直送,**服务端不做长度/内容校验**。改造客户端可发送任意长 / 任意结构 `payload`。
  - 风险点:① **超长消息 / 刷屏 DoS**(无频率限制);② `payload` 可含非 `{text}` 字段,虽渲染层用 `typeof p.text==='string'` 过滤(`ChatPanel.jsx:33`、`:54`),但**存储仍无界增长**(尤其 WS-13 落盘后,见 F8)。
  - **XSS 仍不成立**(React 转义),故严重度为**中**,定位为「刷屏/资源滥用」而非「注入」。
- 防护要求:
  1. **服务端**对 chat 强制长度上限(与 `MAX_CHAT_LEN=200` 对齐)与**每玩家频率限制**(建议 `[PLACEHOLDER: 1 条 / 1.5s,突发 5]`)。boardgame.io 无内建 chat 限流,需在 socket 层 / 自定义中间件实现,或在落盘前丢弃超限消息。**待核实** boardgame.io 0.50 是否暴露可拦截 chat 的 hook;若无,则在 `transport` 层包装。
  2. 即使 React 转义,仍建议服务端把 chat `text` 视为不可信:落盘/日志前 `String(text).slice(0,200)`,拒绝非字符串 `text`。
  3. 保留客户端 `MAX_CHAT_LEN` 仅作 UX,**不作为安全边界**。
- 验收:
  - Jest/集成:构造一条 5KB 文本的 chat payload → 服务端截断/拒绝;非字符串 `text` → 丢弃。
  - 手动:快速连发 20 条 → 服务端按频率限制丢弃多余条。

---

## 4. 无账号房间的滥用面

### F1 详述(高):房间码可枚举 + 玩家名泄露
- 证据:boardgame.io 默认注册 `GET /games/:name`(`node_modules/boardgame.io/dist/cjs/server.js:2180-2227`)→ 遍历 `db.listMatches` 返回**所有未 `unlisted` 的 match**(matchID + `createClientMatchData` 含玩家名/座位)。另有 `GET /games/:name/:id`(`:2235-2245`)按 id 返回元数据,`GET /games`(`:2128`)列出游戏名。
- `createMatch`(`lobbyClient.js:10-14`)**未设 `unlisted: true`**,故每个房间都进公开列表。
- `origins`/`apiOrigins`(`server.js:8-16`)是 **CORS**,不拦截 `curl`/非浏览器。Cloudflare Tunnel 转发全部路径,故外部攻击者可 `curl https://<tunnel>/games/rummikub` **拉取全部活跃房间码 + 玩家名 + 空座**,再 join 任意空座或纯旁观读取 `G`(叠加 F2 → 看穿手牌)。
- **这直接抵消了 `/api/stats` 的脱敏努力**(`server.js:23-45` 刻意只给聚合数,但默认 lobby 路由把 id/名全暴露了)。
- 防护要求(按优先级):
  1. **`createMatch` 加 `unlisted: true`**(`lobbyClient.js:10`)→ match 不进 `GET /games/:name` 列表(`server.js:2221` 的 `!metadata.unlisted` 守卫),房间码恢复「只有持码者可达」。这是最小改动、最高收益。
  2. 评估**屏蔽 / 收敛默认 lobby 路由**:在 `server.js` 的中间件里对 `GET /games`、`GET /games/:name` 返回 404/空(应用 join 流程只需 `GET /games/:name/:id`(`JoinGame.jsx:15`)与 create/join/playAgain,不需要 list)。**待核实** playAgain / `GameOverModal.jsx:30` 是否依赖 list。
  3. 房间码本身:boardgame.io 默认 matchID 为随机 UUID(非顺序),即使无 list 也不可猜——**待核实**生成器(应在 server 的 `uuid` 实现),建议确认非短/顺序 id。
- 限流建议(`[PLACEHOLDER]`,按非商业小流量取保守值):
  - `POST /games/:name/create`:`[PLACEHOLDER: 5 个 / IP / 10 min]`(防刷房耗尽内存/磁盘)。
  - `POST /games/:name/:id/join`:`[PLACEHOLDER: 10 次 / IP / min]`(防座位爆破/骚扰)。
  - chat:见 §3。
  - 由于仅 127.0.0.1 + Tunnel,建议在 **Cloudflare 侧**(Rate Limiting Rules / WAF)做 IP 限流,应用侧只做兜底,避免重造轮子。
- 验收:
  - 手动:`curl <tunnel>/games/rummikub` 在加 `unlisted` 后返回空 `matches`。
  - Jest:`computeServerStats` 与 lobby 行为下,新建 match 不出现在 list。

### 旁观 / 未授权加入
- 现状:join 只需 matchID + 空座(`JoinGame.jsx:23-43`),无密码——**这是无账号产品的预期**,可接受。真正的风险是 F1 让「持码」这一弱凭证形同虚设。修了 F1,房间码即恢复为唯一准入凭证。**中**(随 F1 一并降级为可接受)。

---

## 5. 持久化(WS-13 / 平台)安全

spec:`:147-150`、`:167`(切 FlatFile/SQLite 让 reconnect + stats 持久)。

- **落盘数据敏感度** —— 无 PII(无账号、无邮箱/支付);但含**对局内容**:玩家**自填昵称**、**聊天记录**、完整牌局 `G`。昵称+聊天可能被用户填入任意文本(含其自愿透露的个人信息)。定级:**低-中**。
- **F8 防护要求**:
  1. **文件权限**:DB 文件(FlatFile 目录 / SQLite 文件)`0600`(属主可读写),目录 `0700`;rootless Podman 下确保挂载卷不被宿主其他用户/容器读取。
  2. **位置**:落在容器内**专用卷**,**不要**放进会被打进镜像 / 推到 registry 的构建上下文;`.dockerignore` / `.gitignore` 排除,严防 DB 误入 git 或镜像层。
  3. **保留期**:已结束对局(`gameover` 非空)应有清理策略(cron / 启动时 GC),避免聊天/昵称无限留存;与 chat 截断(§3)叠加防止单 match 文件膨胀。
  4. **备份**:若做备份,落同一受限卷,**不外发第三方**;无需加密(无 PII),但备份文件权限同 `0600`。
- **与 F6 关联**:落盘后 `/api/stats` 的 O(matches) 全表 fetch(见下)成本更高,需配合缓存。
- 验收:
  - 手动:部署后 `stat` DB 文件确认 `0600`;`git status` / 镜像 `history` 不含 DB。
  - 启动 GC:构造一个 `gameover` match,确认 N 天后被清理(N=`[PLACEHOLDER: 7d]`)。

---

## 6. `/api/stats` 信息泄露复核

- 证据:路由 `server.js:25-45` 仅返回 `computeServerStats(metas)`;`computeServerStats`(`serverStats.js:4-18`)只产出 `{inProgress, waiting, players}` 三个**聚合计数**,**不含** matchID、玩家名(`joined`/`connected` 只做计数,不外泄 name)。✅ **确认不泄露 id/名**。`Cache-Control: no-store`(`server.js:40`)合理。
- **但 F6(中)**:该路由对**每次请求**执行 `listMatches` + 对每个 match `db.fetch`(`server.js:30-35`),复杂度 O(活跃 match 数)且**无限流、无结果缓存**(`no-store` 反而阻止下游缓存)。未认证攻击者可高频拉取放大服务端负载(InMemory 尚可,WS-13 落盘后每请求 N 次磁盘读更重)。
  - 防护要求:服务端**短 TTL 内存缓存**(如 `[PLACEHOLDER: 5s]`)聚合结果,叠加 Cloudflare 侧 IP 限流。把 `Cache-Control: no-store` 改为 `max-age=5`(数据是聚合计数,短缓存无隐私风险且能挡放大)。
  - 验收:Jest/基准:连续 100 次 `/api/stats` 在 TTL 内只触发一次 `listMatches`。
- **注意 F1 与本节的割裂**:`/api/stats` 脱敏做得很到位,但同进程的默认 lobby 路由(F1)把 id/名全暴露——脱敏只在一个门口生效,旁门大开。**修 F1 才能让本节的努力真正有意义。**

---

## 7. 严重度 × 防护 × 验收 汇总表

| # | 严重度 | 防护要求(摘要) | 验收/测试点 | 工作量 |
|---|--------|------------------|-------------|--------|
| F1 房间码枚举 | 高 | `createMatch` 加 `unlisted:true`;收敛 `GET /games`、`GET /games/:name`;Cloudflare 限流 | 手动 `curl /games/rummikub` 空;Jest list 不含新房 | S |
| F2 手牌泄露 | 高 | 增 `playerView` 裁剪他人 hand 牌 | Jest `playerView` 不含对手牌;WS 帧无对手 id | M |
| F3 新 move 越权 | 高 | `submitMeld`/`forfeitTurn`/joker 首行 `playerID===ctx.currentPlayer` | Jest 非当前玩家调用→`INVALID_MOVE` 且 `G` 不变 | S |
| F4 连接状态信任 | 高 | 连接态仅服务端 socket 事件写入;vote-skip 阈值服务端;不给客户端写入口 | spike 文档 + 伪造 payload 不改 `G.connected` | M-L |
| F5 聊天无服务端限流 | 中 | 服务端长度上限 + 频率限制;text 视为不可信 | Jest 超长截断/丢弃;连发限流 | S-M |
| F6 stats 放大 DoS | 中 | 短 TTL 缓存聚合结果 + Cloudflare 限流 | 100 次请求只 1 次 `listMatches` | S |
| F7 joker 取回校验 | 中 | 当前玩家 + 两牌属己手牌 + 棋盘有效 + 计分不重复 | Jest 非己牌取回→`INVALID_MOVE` | S(并入 WS-11) |
| F8 落盘权限/留存 | 低-中 | DB `0600`、专用卷、排除 git/镜像、结束对局 GC | `stat` 权限;GC 生效 | S |
| F9 默认路由暴露面 | 低 | 屏蔽不需要的 list/写路由;确认 update/rename 不被滥用 | 路由清单审计 | S |

---

## 8. 工作量 / 依赖 / 开放问题

**工作量合计:** 高危四项中 F1/F3 为 **S**、F2/F4 为 **M~L**;其余 S~M。本轮新增 move 的门禁(F3)与 joker 校验(F7)应在各自 WS 实现内**顺手做掉**,几乎零额外成本。F1 是「一行 `unlisted:true` + 限流」的高性价比修复,**建议本轮必做**。

**跨专业依赖:**
- **WS-1 实现方(后端 / Game 逻辑)**:F3 门禁、`submitMeld` 零副作用、`forfeitTurn` 独立于 `forceEndTurn` —— 这些是反作弊回归的硬性验收,需在 Jest 里固化(对齐 spec `:50-51`)。
- **WS-11 实现方**:F7 的「两牌属己手牌」校验依赖正确读取手牌归属;若同期上 F2(`playerView`),注意服务端 move 仍拿完整 `G`,校验逻辑不受裁剪影响。
- **WS-12 spike 负责人**:F4 是该 spike 的安全验收前置——「连接状态如何进入权威 `G`」的结论必须排除任何客户端可写路径。spec `:144`、`:194` 已立此红线,需在 spike 文档显式回应「伪造连接 flag」对抗用例。
- **WS-13 / 平台(部署)**:F8(文件权限/卷/GC)与 F6(stats 缓存)落在持久化与 `deploy/` + Cloudflare 配置;F1/F5/F6 的限流建议放 Cloudflare 侧,需 DevOps 配合(应用侧仅兜底)。
- **前端(ChatPanel)**:F5 服务端限流落地后,客户端需优雅处理「消息被服务端丢弃」的反馈(不静默吞)。

**开放问题(需产品/平台拍板):**
1. **F1 路由收敛 vs. playAgain 依赖** —— 屏蔽 `GET /games/:name` 是否影响 `GameOverModal` 的 playAgain / 任何「再来一局」流程?**待核实** `playAgain`(`lobbyClient.js:39`)是否内部调用 list。若仅 `unlisted:true` 即足够(match 仍可按 id 访问),则首选最小改动。
2. **`moveTiles` 的 `fromHandToHand` 归属** —— **待核实**非当前玩家能否移动 `currPos.playerID !== 调用者` 的手牌(`moves.js:99-100` 未显式校验被移动牌归属)。预期只允许重排自己手牌;若可动他人手牌牌面,叠加 F2 会放大滥用面。建议补一条 Jest。
3. **限流数值** —— §4/§6 的 `[PLACEHOLDER]` 需结合实际玩家规模与 Cloudflare 套餐确定;非商业小流量下保守取值即可。
4. **chat 拦截 hook** —— **待核实** boardgame.io 0.50 是否提供可拦截/校验 chat 消息的服务端 hook;若无,F5 需在 transport / socket 层包装实现。
5. **matchID 生成器** —— **待核实**默认 matchID 是否为足够长的随机 UUID(非顺序/短码),作为 F1 的纵深防御。

---

## 9. 给实现的「不退化」红线清单(一句话版)

1. 每个新 move 首行 `if (playerID !== ctx.currentPlayer) return INVALID_MOVE`(`forceEndTurn` 因「任何人到点可结束」是**唯一**例外,且已被截止时间守住)。
2. `submitMeld` 无效路径**零副作用**,绝不触碰 `timerExpireAt`。
3. 合法性判定**只信服务端**;`submitRejectReason` 客户端预检仅作 UX。
4. 连接状态**只由服务端 socket 事件**写入 `G`,客户端无写入口。
5. `createMatch` 设 `unlisted:true`,房间码回归唯一准入凭证。
6. 上 `playerView` 裁剪对手手牌,让「服务器权威 + 反作弊」名副其实。
