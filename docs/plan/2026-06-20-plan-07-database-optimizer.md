# RummyCube 优化 · 持久化选型与接入(Database Optimizer)

> 权威来源:`docs/optimization/2026-06-20-rummycube-optimization-spec.md`(WS-12、WS-13、「Cross-cutting / Persistence」、Open question #5)。
> 现状已核实:`src/server.js:13-17` 调 `Server({games, apiOrigins, origins})` 未传 `db`;boardgame.io 在 `db === undefined` 时走 `DBFromEnv()`(`node_modules/boardgame.io/dist/cjs/server.js:3994-3999`),无 `FLATFILE_DIR` 环境变量 → 退化为 `new InMemory()`(`server.js:2866-2871`)。因此每次重启/重新部署清空进行中对局与 `/api/stats` 计数,重启期间重连失败。

---

## 0. 关键源码事实(全部已核实,带 file:line)

1. **`db` 注入点**:`Server({…, db, …})`,`db===undefined` → `DBFromEnv()`(`boardgame.io/dist/cjs/server.js:3994-3999`)。`DBFromEnv()` 逻辑:`process.env.FLATFILE_DIR ? new FlatFile({dir}) : new InMemory()`(`server.js:2866-2871`)。
2. **内置 FlatFile 实现**:`class FlatFile extends Async`(`server.js:2722-2851`)。构造签名 `{dir, logging, ttl}`(`server.js:2723`)。
3. **⚠️ FlatFile 依赖 `node-persist`,且在构造函数里惰性 `require('node-persist')`**(`server.js:2725`)。但 `node-persist` 在 boardgame.io 的 **devDependencies**(`node_modules/boardgame.io/package.json:121`,与 `jest-transform-svelte`、`lint-staged` 同段),**不是**运行时依赖 → 当前 `node_modules` 内 `node-persist` 缺失,`require.resolve('node-persist')` 抛 `MODULE_NOT_FOUND`(已实测)。**结论:用 FlatFile 必须把 `node-persist` 加进本项目自己的 `dependencies`**,否则容器启动时一旦 `FLATFILE_DIR` 生效就崩。
4. **node-persist 存储格式**:每个 key 一个文件,落在 `dir/` 下。每个 match 产生 4 个 key:`matchID`(state)、`matchID:initial`、`matchID:metadata`、`matchID:log`(`server.js:2761-2766, 2825-2828, 2812-2890` 区间的 `InitialStateKey/MetadataKey/LogKey`)。
5. **`listMatches(opts)` 的代价**:带 `opts`(如 `/api/stats` 传的 `{gameName}`)时,会对**每个** match 调 `fetch(matchID, {state:true, metadata:true})` 全量读盘后再过滤(`server.js:2814-2850`)。不带 `opts` 只返回 ID 列表。
6. **`/api/stats` 当前实现**:`db.listMatches({gameName})` → 逐个 `db.fetch(id, {metadata:true})` → `computeServerStats(metas)`(`src/server.js:30-36`)。即 O(n) 次读 + listMatches 内部又各读一次 state+metadata。
7. **GC 钩子可用**:`listMatches` 支持 `where:{isGameover, updatedBefore, updatedAfter}`(`server.js:2828-2845`),`wipe(id)` 删除一个 match 的 4 个 key(`server.js:2802-2810`)。
8. **自写适配器的契约**:继承 `Async`(异步)或 `Sync`(同步)基类,需实现 `connect/createMatch/setState/setMetadata/fetch/wipe/listMatches`(基类在 `server.js:~2531`/`~2576`,未实现会 `console.error`)。

---

## 1. 后端选型对比

| 维度 | 内置 **FlatFile**(node-persist) | **SQLite**(社区 `bgio-sqlite` 或自写 `StorageAPI` 子类) |
|---|---|---|
| 实现成本 | **低**:加 1 个依赖 `node-persist` + 设 `FLATFILE_DIR` 或显式 `new FlatFile({dir})`。零自写代码。 | **中-高**:社区适配器成熟度待核实(见开放问题);自写需实现 7 个方法 + 建表 + 序列化 state/metadata/log。 |
| 查询能力(`/api/stats`) | 弱:`listMatches(opts)` 全表逐文件读盘(事实 5/6);计数仍是 O(n) 全扫。 | **强**:可建 `SELECT count(*) … WHERE gameover IS NULL GROUP BY …`,把 `/api/stats` 降到一条索引查询;可对 `gameName/updatedAt/isGameover` 建索引。 |
| 并发/锁 | 单进程内用 per-key 串行队列 `chainRequest`(`server.js:2731-2736`)避免同 match 竞态;**单容器单进程**够用。跨进程无锁(本项目单实例,不涉及)。 | SQLite 单写者 + WAL 模式可并发读;同样单进程足够。 |
| 容器落盘 / 卷 | 一个目录,N×4 个小 JSON 文件 → 适合挂目录卷。小文件多,但量级小。 | 单个 `.db` 文件 → 卷挂载更干净,备份就是拷一个文件。 |
| 备份 | `cp -r` 整个 dir(需停写或接受弱一致);文件多。 | `sqlite3 .backup` 或 `VACUUM INTO`,**原子、单文件**,更友好。 |
| 与 512M 内存上限 | ⚠️ **风险点**:node-persist 默认 `init()` 会把已存条目载入内存缓存(具体策略**待核实**,见开放问题)。对局对象含完整 `G`(牌面+历史 log),长期累积可能吃内存 → 必须配 GC。 | **更省**:state 留在磁盘,按需查询;内存只持游标/结果。对 512M 上限更安全。 |
| 扩展友好度(spectator/stats/WS-16 留存) | 弱:任何聚合都要全扫。 | **强**:未来 spectator 列表、历史战绩(WS-16)、按昵称统计都能用 SQL 直接做。 |
| 运维 | 无新二进制;纯 JS。 | 需 `better-sqlite3`(原生编译,alpine 需 build-base/python)或 `node:sqlite`(Node 22 内置,实验性,**待核实**适配器可用性)。 |

### 推荐

**第一步用内置 FlatFile 上线持久化(S 工作量),以最快路径满足 WS-13 的「重启不丢局」与 `/api/stats` 不归零;同时把 GC 一起做掉以守住 512M。**

理由:
- 本项目是**单容器单进程、低并发**的小游戏,FlatFile 的并发/查询短板基本不触发;`/api/stats` 的 O(n) 全扫在对局数为两位数时完全可接受(且可加 5–10s 内存缓存,见 §3)。
- 实现面只动 `package.json` + `server.js` 几行 + Quadlet 一行卷,风险最小、可秒回滚。
- **SQLite 留作演进路径**:当 `/api/stats` 扫描变慢、或开始做 WS-16 留存/历史战绩/spectator 时,再切到 SQLite 适配器(届时统计走单条 SQL)。两步走避免一次性引入原生编译依赖与自写存储层的成本。

> 反对「一步到位上 SQLite」的依据:当前没有任何已安装的 SQLite 适配器(`node_modules` 内无 `*sqlite*`/`bgio*`,已实测),社区适配器与 boardgame.io 0.50 的兼容性**待核实**;在 alpine 上引入 `better-sqlite3` 还要补原生编译链,违背「最小改动先恢复持久化」的目标。

---

## 2. `src/server.js` 接入点(精确改法,伪代码)

### 2.1 方案 A(推荐):显式构造 FlatFile,落盘路径自管

```js
// src/server.js 顶部新增
import {Server, Origins, FlatFile} from 'boardgame.io/dist/cjs/server.js';

// FLATFILE_DIR 由 Quadlet 注入;本地开发缺省到 ./data
const DB_DIR = process.env.FLATFILE_DIR || path.resolve(import.meta.dirname, '../data');

const server = Server({
    games: [Rummikub],
    apiOrigins: allowedOrigins,
    origins: allowedOrigins,
    db: new FlatFile({ dir: DB_DIR, logging: false /*, ttl: false */ }),
});
```

> 方案 B(更省一行代码):不改 `server.js`,仅在 Quadlet 注入 `Environment=FLATFILE_DIR=/app/data`,靠 `DBFromEnv()` 自动选 FlatFile(事实 1)。**但**仍**必须**先把 `node-persist` 加进 `dependencies`(事实 3),否则启动即崩。推荐方案 A,因为路径与依赖在代码里显式可见、本地 `npm test`/dev 也能跑。

### 2.2 必须的依赖改动(否则启动崩溃)

`package.json` `dependencies` 增加(版本对齐 boardgame.io devDep):

```jsonc
"dependencies": {
  // …
  "node-persist": "^3.1.0"
}
```

> Dockerfile 第 14 行 `npm ci --omit=dev --omit=optional` 会装 `dependencies` → 加在 `dependencies`(不是 dev/optional)才会进运行时镜像。无需改 Dockerfile。

### 2.3 落盘路径与 Quadlet 卷

- 容器内路径建议:`/app/data`(WORKDIR 为 `/app`,见 Dockerfile:11)。
- 用**命名卷**(rootless podman 下避免宿主目录 UID 映射/权限坑):

`deploy/shunlyu-rummycube.container` 在 `[Container]` 段新增:

```ini
[Container]
Image=localhost/shunlyu-rummycube:latest
ContainerName=shunlyu-rummycube
PublishPort=127.0.0.1:8093:9119
Environment=PORT=9119
Environment=FLATFILE_DIR=/app/data        # 新增:持久化目录
# … 其余 Environment 原样 …
Volume=rummycube-data.volume:/app/data    # 新增:命名卷挂载到落盘目录
```

并新增一个 Quadlet 卷单元 `deploy/rummycube-data.volume`:

```ini
[Volume]
# 由 Quadlet 自动创建命名卷 systemd-rummycube-data(rootless 用户卷)
```

> 卷单元 `rummycube-data.volume` 在 `Volume=` 里以 `rummycube-data.volume` 引用(Quadlet 约定)。**待核实**:本机 Quadlet 版本对 `.volume` 单元的支持;若版本较旧,可退化为 `Volume=rummycube-data:/app/data`(`podman volume create rummycube-data` 预先建好)。部署 README 需补这一步。
> 容器以何 UID 运行:Dockerfile 未设 `USER`,默认 root(rootless podman 下映射到调用用户)。命名卷由 podman 初始化属主,`/app/data` 可写,无需额外 chown。**待核实**:首次启动卷为空时 node-persist `init()` 自建目录的权限。

---

## 3. 持久化后对 `/api/stats` 的影响

- 行为**不变**:`src/server.js:30-36` 的 `listMatches({gameName})` + 逐个 `fetch` 在 FlatFile 下仍有效;但每次请求要读盘 N×(state+metadata)(事实 5)。`Cache-Control: no-store`(`server.js:40`)意味着边缘不缓存,Cloudflare 后每个首页访问都打全扫。
- **建议**:
  1. **服务端内存缓存**:对 `computeServerStats` 结果加 `[PLACEHOLDER: 5–10s]` TTL 缓存(进程内变量),把高频首页轮询从「N 次读盘」降为「每窗口一次」。这是性价比最高的一招,且与 FlatFile 完全兼容。
  2. **降低单次读盘量**:`computeServerStats` 只用 metadata(`serverStats.js`),但 `listMatches({gameName})` 内部仍会 `fetch state:true`(事实 5,无法绕过)→ 若 state 体积大(完整牌局+log),全扫成本主要来自此。缓存可掩盖之。
  3. **演进到 SQLite 时**:`/api/stats` 改为单条聚合 SQL(`WHERE gameName=? AND gameover IS NULL`),无需缓存,顺带支持 spectator/历史。
- **不建议**现在为 FlatFile 自建索引文件(等于自写半个 DB,不如直接上 SQLite)。

---

## 4. 重连(WS-13)与重启后恢复

- **机理**:boardgame.io 的 master 在 socket `sync`/`update` 时从 `app.context.db` 读取 match state/metadata(`server.js:3901-3924` 的 `new Master(game, app.context.db, …)`)。InMemory 下重启即丢 → 客户端重连时服务端查无此 match,`sync` 失败。**换成 FlatFile 后,state/metadata/log 落盘存活于容器重启**,重连时 master 能重新 `sync` 出权威 `G`,客户端恢复牌局。
- **「重启期间重连」**:重启窗口内 socket 断开期间客户端会进入 WS-13 的「reconnecting…」横幅;容器起来后,只要凭据(playerID + credentials)仍在客户端(localStorage)且 match 在卷里 → 自动重连成功。这正是 spec 把持久化与 WS-13 绑定排期的原因(spec「Cross-cutting / Persistence」)。
- **与 WS-12 的关系**:WS-12 要把「连接状态」写入**权威 game state**(`G.connected[seat]`,spec WS-12 + 依赖注 line 180/193)。一旦连接状态进入 `G`,它会随 state 一起被 FlatFile 持久化 → 重启后断线判定/宽限计时的依据不丢失。**顺序依赖**:WS-12 的 spike(连接状态如何进入 `G`)应先于把它当作可持久化字段来设计;但**持久化本身不阻塞 WS-12**,二者可并行,持久化先落地反而给 WS-12 提供「重启后状态可恢复」的地基。

---

## 5. 数据生命周期 / GC

FlatFile 不会自动清理已结束或陈旧对局 → 文件与(node-persist)内存缓存无限增长,威胁 512M 上限。策略:

1. **结束即可回收**:对局 `gameover` 后保留 `[PLACEHOLDER: 24h]` 供复盘/重连尾声,然后 `wipe`。
2. **陈旧空房**:`updatedAt` 早于 `[PLACEHOLDER: 2h]` 且无人连接(`computeServerStats` 口径里 `joined===0` 的房)直接 `wipe`。
3. **实现方式(二选一)**:
   - **应用层定时 GC**(推荐,与 FlatFile 契合):服务端 `setInterval([PLACEHOLDER: 15min])` 调
     ```js
     const stale = await db.listMatches({
       gameName: GAME_NAME,
       where: { isGameover: true, updatedBefore: Date.now() - GAMEOVER_TTL_MS }
     });                                    // server.js:2828-2845 支持该 where
     for (const id of stale) await db.wipe(id);  // server.js:2802-2810
     // 另一轮:updatedBefore 清理超时未结束的死局
     ```
   - **node-persist TTL**:`new FlatFile({dir, ttl: …})` 透传给 node-persist 的过期机制(`server.js:2727`)。**待核实**:0.50 透传的 `ttl` 是否按 match key 生效、过期粒度;且 TTL 对「仍在进行的对局」会误删 → **不推荐**用 TTL 管理活跃对局,GC 用应用层定时更可控。
4. **总量护栏**:设 `[PLACEHOLDER: maxMatches]` 上限,超过时按 `updatedAt` 最旧优先回收(防滥用建房刷爆磁盘/内存)。

> 数值 `[PLACEHOLDER]` 待产品/运维确认;建议初值:gameover 保留 1h、死局 2h、GC 间隔 15min。

---

## 6. 迁移与回滚

- **无数据迁移**:当前 InMemory 重启即清空,所以从 InMemory→FlatFile **没有历史数据需要搬**。切换是「下次重启起开始持久化」,对存量零影响。
- **上线步骤**:
  1. `package.json` 加 `node-persist`(§2.2)。
  2. `server.js` 显式 `db: new FlatFile({dir})`(§2.1)。
  3. Quadlet 加 `Environment=FLATFILE_DIR=/app/data` + 卷(§2.3)。
  4. 重建镜像 + `systemctl --user restart`(README §4)。
- **切换窗口**:因为**重启本来就会清空进行中对局**,部署时机仍选**低峰**(凌晨)以最小化「正打到一半被踢」的玩家;但持久化上线后,这是**最后一次**重启清局——之后重启不再丢。
- **回滚**:去掉 `db:`(或移除 `FLATFILE_DIR`)即退回 InMemory;`node-persist` 依赖留着无副作用。卷可保留(下次再开启时数据还在)或 `podman volume rm rummycube-data` 清掉。回滚同样只在重启窗口生效。

---

## 7. 验收

**可观测信号**
- 重启后对局仍在:进行中对局发起者重连后能恢复牌面(非「房间不存在」)。
- `/api/stats` 不归零:`restart` 前后 `inProgress/waiting/players` 计数连续(在房玩家未掉线时不跳回 0)。
- 卷有数据:`podman volume inspect rummycube-data` 后目录内出现 `*:metadata`、`*:initial`、`*:log` 文件。

**最小冒烟(沿用 README 的 curl)**
```bash
# 1) 基线
curl -s http://127.0.0.1:8093/games            # -> ["RummyCube"]
# 2) 创建+加入一局(造出一个 match)
./scripts/smoke-rest.sh https://game.shunlyu.com
curl -s http://127.0.0.1:8093/api/stats        # waiting/inProgress > 0
# 3) 重启容器
systemctl --user restart shunlyu-rummycube.service
sleep 3
# 4) 关键断言:重启后计数不归零、match 仍可被列出
curl -s http://127.0.0.1:8093/api/stats        # 仍 > 0(持久化生效)
curl -s "http://127.0.0.1:8093/games/RummyCube" # 该 match 仍存在(若用 lobby 列表 API,待核实路径)
```
> 进一步用 `scripts/smoke-multiplayer.mjs`(README §Smoke)在重启前后各连一次,验证重连拿到 state。

---

## 8. 工作量 / 依赖 / 开放问题

**工作量**
- FlatFile 接入(§2):**S**(依赖 1 行 + server.js 数行 + Quadlet 1–2 行)。
- `/api/stats` 内存缓存(§3.1):**S**。
- 定时 GC(§5):**S–M**。
- (可选,未来)SQLite 适配器 + `/api/stats` 改 SQL:**M–L**。

**依赖 / 跨专业**
- **DevOps(Quadlet/部署)**:加 `Volume=`、`FLATFILE_DIR` env、卷创建步骤入 `deploy/README.md`;确认本机 Quadlet 对 `.volume` 单元支持(否则用预建命名卷)。
- **WS-12(连接状态)**:其 spike 决定 `G.connected` 形态;持久化天然带走它,二者并行但 WS-12 设计需知晓「连接状态会被持久化」。
- **WS-13(前端韧性)**:reconnecting/syncing 横幅依赖服务端重连成功,持久化是其后端前提。
- **WS-9**:操纵分须在 `validatePlayerMove`(冻结前)写入 `G`(spec 依赖注 line 179),才能随 state 持久化、被复盘读取。

**开放问题 / 待核实**
1. **node-persist 内存缓存策略**:v3 `init()` 是否把全部条目载入内存常驻?这直接关系 512M 与 GC 激进度。**待核实**(读 node-persist 文档/源码)。
2. **`FlatFile` 的 `ttl` 透传语义**(`server.js:2727`):粒度与对活跃对局的影响 → 决定能否用 TTL 替代应用层 GC(倾向否)。**待核实**。
3. **Quadlet `.volume` 单元支持**:本机 podman/Quadlet 版本;不支持则预建命名卷。**待核实**。
4. **SQLite 社区适配器**(`bgio-sqlite` 等)与 boardgame.io 0.50 的兼容性、维护状态;或评估 Node 22 内置 `node:sqlite`(实验)自写 `Async` 子类。**待核实**(选 SQLite 路径时)。
5. **lobby/match 列表 API 路径**(用于冒烟「重启后 match 仍存在」的精确 curl):0.50 的 `/games/:name` 列表端点形态。**待核实**。
6. GC 各 `[PLACEHOLDER]` 数值需产品/运维定稿。
