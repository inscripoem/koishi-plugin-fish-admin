# fish-admin 实施计划

> 最后更新：2026-11-01
> 当前阶段：v0.1.0 发布准备（预览，不在群内上线）
> 插件目录：`external/fish-admin`
> 隐私约定：计划、代码、测试数据不写真实群号/QQ；运行时日志对 ID 做掩码。

## 发布状态（v0.1.0 preview）

- 发布范围：GitHub 源码，预览版；不部署到群聊。
- 已实现：登记、自助登记 + 审批、观察器、只读报表、规则/模式/频道/状态命令。
- 未实现：策略引擎、执法、群级红线、日报/周报、策略测试。
- `fish.mode` 只接受 `dry-run`；`recall-only` / `enforce` 是 roadmap。
- 发布前只做构建、类型检查、文档和 package 元数据，不补执法功能。

## 进度总览

| 阶段 | 状态 | 说明 |
|---|---|---|
| 0 脚手架 | ✅ 完成 | `yarn setup fish-admin` 生成 `external/fish-admin` |
| 1 计划落盘 | ✅ 完成 | 本文件 |
| 2 Preflight | ✅ 完成 | 实机三项通过：收消息、撤回、禁言/解禁 |
| 3 数据模型 + 登记 | ✅ 完成 | 8 张表、登记/列表/状态/规则/频道命令；实机登记成功；自助登记代码完成 |
| 4 观察器 + 计数器 | ✅ 代码完成 | 消息入库、分钟/小时/日计数、只读报表已实现；决定不在群内上线，未做目标群观察 |
| 5 策略 + 单测 | ⬜ roadmap | 配额、鱼链、连发、事件 |
| 6 执法 + 处罚 | ⬜ roadmap | 撤回、禁言、踢出、手动执法 |
| 7 群级红线 | ⬜ roadmap | 15 次事件 → 全群停鱼 |
| 8 报表 + 命令补全 | 🟡 部分完成 | `fish.report` 已有；日报/周报、审计、violations 未做 |
| 9 dry-run + 验收 | ⬜ 未开始 | 不在群内上线，跳过 |
| 10 v0.1.0 发布 | 🟡 进行中 | GitHub 源码发布准备；README/CHANGELOG/LICENSE/package 元数据 |

状态标记：✅ 完成 / 🟡 进行中 / ⬜ 未开始 / ⚠️ 阻塞。

## 0. 定稿参数

| 项 | 值 |
|---|---|
| 目录 | `external/fish-admin` |
| 包名 | `koishi-plugin-fish-admin` |
| 插件名 | `fish-admin` |
| 命令前缀 | `fish` |
| 表前缀 | `fish_` |
| 平台 | QQ / OneBot v11 |
| 定位 | 群侧执法插件，不是出站闸门 |

核心机制：鱼级正常额度 + 少禁言；群级 15 次违规事件预算，用完全群停鱼。劝退来自群级红线，不来自把 RPM 压到鱼没法说话。

## 1. 目标与边界

**做**：

- 登记“鱼 QQ → 主人”，按群管理。
- 按统一配额观察、撤回、禁言、踢出、永久禁入。
- 记录原始发言与频次。
- 群级累计 15 次违规事件 → 全群停鱼。

**不做**：

- 不替别人的鱼装限流，不修改鱼的代码。
- 不自动处罚主人；主人只用于登记和审计。
- 不下载图片、不存人类消息原文。
- v1 不做自定义控制台页面。
- v1 只做 QQ/OneBot。

## 2. Preflight

目标：实测管理器能否收到鱼的群消息、能否撤回、能否禁言。

- [x] 实现 `fish.preflight` 命令
- [x] 实现 `fish.groups` 命令
- [x] 内存消息缓冲（按群 + QQ 保留最近一条）
- [x] 自检管理器角色、数据库、平台
- [x] `--test <qq>`：撤回最近一条消息、禁言 60 秒、自动解禁
- [x] `yarn build fish-admin` 构建通过
- [x] `yarn dev` 中 `fish-admin` 插件成功加载，控制台可访问
- [x] 实机验证：收到另一只大肥鱼的群消息
- [x] 实机验证：撤回成功
- [x] 实机验证：禁言 60 秒成功，自动解除成功
- [x] 结果写入 `docs/PREFLIGHT.md`（不记录真实 ID）

**通过标准**：

1. 管理器能收到另一只大肥鱼的群消息，`userId`、`messageId`、`elements` 齐全。
2. 管理器能在 2 分钟窗口内撤回那条消息。
3. 管理器能禁言那只鱼 60 秒，并解除。

任何一项不通过，降级为 `dry-run` 或只做统计；不要把未验证的执法直接开进群。

## 3. 架构与文件

```
external/fish-admin/
  src/
    index.ts          # 入口、元属性、生命周期
    config.ts         # Schema
    model.ts          # ctx.model.extend + 类型扩展
    registry.ts       # 鱼/群登记
    observer.ts       # 消息观察、计数器、人类消息聚合
    policy.ts         # 纯函数：配额、鱼链、连发、事件
    enforcement.ts    # 撤回/禁言/踢出、处罚阶梯
    redline.ts        # 群级 15 次事件预算
    reporter.ts       # 日报/周报/报表
    commands.ts       # 命令
    utils/time.ts
    utils/message.ts
  tests/
    policy.spec.ts
  docs/
    PLAN.md
    PREFLIGHT.md
  package.json
  README.md
```

Koishi 接入约定：

- `export const name = 'fish-admin'`，`inject = ['database']`，`Config: Schema<Config>`，`usage`。
- `ctx.model.extend` 在 `apply` 同步阶段调用，先于任何数据库操作；用 `declare module 'koishi' { interface Tables { ... } }` 扩展类型。
- `ctx.on('ready')`：重建计数器、检查管理员权限、注册报表定时器。
- `ctx.on('dispose')`：只清内存和定时器；数据每条立即落库。
- 定时器用 `ctx.setInterval`；公告用 `ctx.throttle`；多条公告用 `session.sendQueued`。
- 配置页由 `Schema` 自动生成；v1 不写自定义控制台页面。

## 4. 数据模型（8 张表）

- [x] `fish`：全局鱼身份（含 QQ 昵称）
- [x] `fish_group`：鱼 × 群成员关系（含群昵称）
- [x] `fish_request`：自助登记申请
- [x] `fish_message`：原始发言、频次、审计
- [x] `fish_violation`：事件流水、鱼级积分
- [x] `fish_group_policy`：每群策略、群级预算
- [x] `fish_group_daily`：人类/鱼消息日聚合
- [x] `fish_audit_log`：管理操作审计

| 表 | 关键字段 | 约束/索引 | 用途 |
|---|---|---|---|
| `fish` | `id`, `platform`, `userId`, `name`, `ownerUserId`, `ownerName`, `createdBy`, `createdAt` | unique `(platform, userId)` | 全局鱼身份与 QQ 昵称 |
| `fish_group` | `id`, `fishId`, `groupId`, `platform`, `status`, `nick`, `mutedUntil`, `invitedBy`, `joinedAt`, `firstSeenAt`, `bannedAt`, `banReason` | unique `(fishId, groupId)`; index `(groupId, status)` | 鱼在某群的成员关系与群昵称 |
| `fish_request` | `id`, `groupId`, `platform`, `fishUserId`, `fishName`, `ownerUserId`, `ownerName`, `requestedBy`, `status`, `createdAt`, `reviewedBy`, `reviewedAt`, `note` | index `(groupId, status)`, `(requestedBy)` | 自助登记申请 |
| `fish_message` | `id`, `fishId`, `groupId`, `platform`, `messageId`, `createdAt`, `text`, `imageCount`, `hasQuote`, `quoteUserId`, `recalled`, `violationId`, `minuteKey`, `hourKey`, `dayKey` | unique `(platform, messageId)`; index `(groupId, createdAt)`, `(fishId, createdAt)`, `(dayKey)` | 原始发言、频次、审计 |
| `fish_violation` | `id`, `fishId`, `groupId`, `episodeId`, `createdAt`, `rule`, `overLimitCount`, `firstMessageId`, `action`, `actionResult`, `points`, `isEpisodeStart`, `pardoned` | index `(groupId, createdAt)`, `(fishId, createdAt)`, `(episodeId)` | 事件流水、鱼级积分 |
| `fish_group_policy` | `groupId` PK, `platform`, `enabled`, `mode`, `fishAllowed`, `banAtEvents`, `eventTotal`, `adminChannel`, `updatedAt`, `updatedBy` | PK `groupId` | 每群策略与群级预算 |
| `fish_group_daily` | `id`, `groupId`, `date`, `humanTotal`, `fishTotal`, `overLimit`, `eventCount` | unique `(groupId, date)` | 鱼/人比例、日报/周报 |
| `fish_audit_log` | `id`, `groupId`, `actorId`, `action`, `target`, `detail`, `createdAt` | index `(groupId, createdAt)` | 阈值/模式变更、赦免、手动执法 |

约定：

- `fish_violation.points` 只在新事件第一条记 1，后续同事件记 0。
- `eventTotal` 是群级预算计数器，每个新事件 +1；只在 `enforce` 模式增长；`fish.enable` 清零；`fish.pardon` 不减。
- `overLimitCount` 每条超限消息累加，只用于 burst 止损和统计，不参与群级红线。
- `pardoned=true` 的违规不计入鱼级 24h/30d，不删除原始记录。
- 文本截断 4 KB；图片只计数，不存 URL/文件。
- 人类消息只进 `fish_group_daily.humanTotal`，不存原文。
- 同一 QQ 重新登记复用原 `fish_group` 行，鱼级 30d 积分继续累计，12 次永久禁入才可达。

## 5. 配置（Schema 自动生成配置页）

- [x] 配置 schema（v1 全量字段）
- [ ] 配置页描述与分组校验

```yaml
enabled: true
mode: dry-run                  # dry-run | recall-only | enforce
timezone: Asia/Shanghai
registration: admin            # admin = 仅管理员直接登记；member = 普通成员申请 + 审批
adminUsers: []                 # 私聊管理命令的超管 QQ

quota:
  rpm: 2
  interval: 30                 # 秒
  hourly: 15
  daily: 60
  groupRpm: 6
  groupHourly: 40
  groupDaily: 150
  nightMute: false             # 可选，默认关

rules:
  chainGuard: true             # 鱼不接鱼（开关）
  sameFishStreak:
    enabled: false             # 默认关闭，避免与 RPM 冲突
    limit: 2
  burstMuteThreshold: 10       # 单事件超限 10 条 → 12h 禁言；0 = 关闭
  eventWindowMinutes: 10

penalties:
  twelveHoursAt: 3             # 24h 内第 3 次
  kickAt: 6                    # 30d 内累计
  banAt: 12                    # 30d 内累计

groupRedLine:
  enabled: true
  banAtEvents: 15              # 群级累计违规事件
  autoBan: true                # 达到后自动全群停鱼

notices:
  groupEvents: [kick, groupBan]   # 群里只发这两种；12h 禁言发管理员频道
  approvalDmFallback: true        # 管理员频道不可用时私聊 adminUsers

reports:
  daily: true
  dailyTime: "09:00"
  weekly: true
  weeklyDay: 1
  weeklyTime: "09:00"

retention:
  rawMessageDays: 0            # 0 = 永久
  textLimit: 4096
  aggregateDays: 0
```

- `adminChannel` 不在 Schema 里，用 `fish.channel --group <id>` 在私聊里把当前私聊设为该群的管理员频道。
- 配置页用 `Schema.intersect` 分组，`Schema.union` 选模式，`.description()` 写中文说明。
- `mode` 是默认值；`fish.mode` 按群覆盖。

## 6. 规则

### 6.1 配额（全时段统一）

| 项 | 值 |
|---|---|
| 每鱼 RPM | 2 条/分钟 |
| 最小间隔 | 30 秒 |
| 每鱼每小时 | 15 条 |
| 每鱼每天 | 60 条 |
| 全群 RPM（3 鱼） | 6 条/分钟 |
| 全群每小时 | 40 条 |
| 全群每天 | 150 条 |

- 判定用最小间隔；报表显示 RPM。
- 监控端不加随机抖动，只给 1–2 秒时钟容差。
- 不设新鱼档位；进群即同一档位。
- `nightMute` 默认关；开启后 00–08 任何鱼消息都撤回。

- [ ] 实现统一配额判定
- [ ] 实现全群总闸
- [ ] 实现可选夜间静音

### 6.2 行为规则（独立于 RPM）

按顺序判定，命中即撤回：

1. **鱼不接鱼**（开关 `chainGuard`，默认开）：上一条是另一只鱼，中间没有人类消息 → 撤回当前这条。
2. **同鱼连发**（开关 `sameFishStreak.enabled`，默认关）：同一只鱼连续第 N 条 → 撤回。**默认关闭**，因为 30 秒间隔已经限制了频率；开启后会在第 3 条即使没超 RPM 也撤回，和 RPM 语义冲突。
3. **间隔/小时/日/全群上限**：超了 → 撤回。

行为规则和 RPM 是两层：RPM 管总量，鱼链和连发管对话形状。两个行为规则都有独立开关。

| 规则 | 配置 | 默认 |
|---|---|---|
| 鱼不接鱼 | `rules.chainGuard` | `true` |
| 同鱼连发 | `rules.sameFishStreak.enabled` | `false` |
| 防洪禁言 | `rules.burstMuteThreshold` | `10`（`0` = 关闭） |

- [ ] 实现鱼链状态（受 `chainGuard` 控制）
- [ ] 实现同鱼连发（受 `sameFishStreak.enabled` 控制，默认关）
- [ ] 实现判定顺序与规则记录

### 6.3 鱼级处罚（方案 A）

- 一次“事件”从第一条超限消息开始，持续 10 分钟；同事件内继续超限只撤回、不重复计分。
- 10 分钟无超限后再次超限，才算下一次事件。
- 同一事件只执行一次处罚动作。
- 单事件超限 ≥10 条：立即 12 小时禁言止损，不再等第 3 次事件。

| 滚动窗口 | 事件数 | 动作 |
|---|---|---|
| 24h | 1 | 撤回，静默 |
| 24h | 2 | 撤回，静默 |
| 24h | 3 | 禁言 12 小时 + 管理员频道通知 |
| 30d | 6 | 踢出 + 群内一条 |
| 30d | 12 | 本群永久禁入 |

- 没有 1 小时禁言，没有 7 天 24 小时禁言，没有冻结。
- 禁言只作用在违规的那个群。
- 已在禁言期不重复禁言；如果鱼还能发消息（禁言失败），继续逐条撤回并记 `mute_failed`。
- 禁言失败（对方是群主/管理员）：撤回 + 通知管理员频道，不自动踢。
- 撤回失败记 `recall_failed`，仍然记事件；禁言是主处罚。
- 12 次永久禁入复用原 `fish_group` 行，换号重进需管理员审批。

- [ ] 实现 10 分钟事件窗口
- [ ] 实现 24h/30d 计数
- [ ] 实现方案 A 阶梯
- [ ] 实现 burst 止损
- [ ] 实现禁言/踢出失败降级

### 6.4 群级红线（真正的劝退）

- 全群累计 **15 次违规事件**，无窗口，从 `fish.enable` 起算。
- 一次 10 分钟违规窗口 = 1 次事件；一次爆发只算 1 次。
- 达到 15：`fishAllowed=false`，踢出所有鱼，拒绝新登记，入群即踢。
- 群里发一条事实公告；明细发管理员频道。
- 只有 `fish.enable` 清零并恢复。
- 鱼级处罚照常跑；群级红线是额外的全群终局。
- 3 只鱼各 5 次 = 15，通常在每条鱼被踢之前触发；一只鱼单独很难凑到 15，因为 3 次事件就会 12 小时禁言，6 次就踢出。

**它不保证一定触发**：鱼变乖、一直不到 15 次，群就继续有鱼。这是“不提倡但没禁”的正常结果。要保证有结果，得加 30 天复核或直接禁。

- [ ] 实现 `eventTotal`
- [ ] 实现 15 次停鱼
- [ ] 实现入群拦截
- [ ] 实现 `fish.enable` 清零

### 6.5 模式

| 模式 | 撤回 | 鱼级处罚 | 群级预算 | 群公告 |
|---|---|---|---|---|
| `dry-run` | 否 | 否 | 否 | 否 |
| `recall-only` | 是 | 否 | 否 | 否 |
| `enforce` | 是 | 是 | 是 | 仅踢出/全群停鱼 |

`eventTotal` 只在 `enforce` 增长；切换模式不清零；只有 `fish.enable` 清零。

- [ ] 实现三模式切换
- [ ] 实现模式持久化与审计

### 6.6 `fish.rules` 输出

`fish.rules` 会明确写出：

- 每鱼/全群配额；
- 当前**已开启**的行为规则（未开启的规则不显示）；
- 事件定义：从第一条超限消息开始，10 分钟内继续超限只撤回、不重复计分；10 分钟无超限后，下一次才算新事件；
- 处罚按**事件**计数，不按消息条数；
- 单事件超限 10 条 → 立即 12 小时禁言（阈值 0 时不显示）；
- 群级红线按事件累计，不按消息条数。

## 7. 命令

权限：`群管` = 群主/管理员或 Koishi authority ≥ 3；`超管` = 群主或 `adminUsers`。

所有群级命令都接受 `--group <id>`：在群里省略时用当前群，在私聊里省略则报错并提示 `fish.groups`。

| 命令 | 权限 | 状态 |
|---|---|---|
| `fish.register [target] [owner] [--owner <qq>] [--group <id>]` | 群管 | 🟡 已实现（QQ/@/platform:id），待实机 |
| `fish.unregister [target] [--group <id>]` | 群管 | 🟡 已实现 |
| `fish.owner [target] [owner] [--owner <qq>] [--group <id>]` | 群管 | 🟡 已实现 |
| `fish.pending [--group <id>]` | 群管 | 🟡 已实现 |
| `fish.approve <id> [--group <id>]` | 群管 | 🟡 已实现 |
| `fish.reject <id> [--group <id>]` | 群管 | 🟡 已实现 |
| `fish.my [--group <id>]` | 所有人 | 🟡 已实现 |
| `fish.list [--group <id>]` | 群管 | 🟡 已实现 |
| `fish.status [target] [--group <id>]` | 群管 | 🟡 已实现（计数待阶段 4） |
| `fish.groups` | 超管 | ✅ 已实现 |
| `fish.rules [--group <id>]` | 所有人 | ✅ 已实现 |
| `fish.channel --group <id>` | 超管 | ✅ 已实现（私聊/管理员群） |
| `fish.channel --clear --group <id>` | 超管 | ✅ 已实现（私聊/管理员群） |
| `fish.mode [dry-run\|recall-only\|enforce] --group <id>` | 超管 | ✅ 已实现 |
| `fish.threshold [n] --group <id>` | 超管 | ⬜ |
| `fish.enable --group <id>` | 超管 | ⬜ |
| `fish.disable --confirm --group <id>` | 超管 | ⬜ |
| `fish.pardon <qq> --group <id>` | 超管 | ⬜ |
| `fish.report [days] --group <id>` | 群管 | ✅ 已实现（只读统计） |
| `fish.violations [qq] [days] --group <id>` | 群管 | ⬜ |
| `fish.audit [--limit] --group <id>` | 超管 | ⬜ |
| `fish.preflight [--test <qq>] --group <id>` | 群管 | ✅ 已实现，实机通过 |
| `fish.mute <qq> <duration> [--reason] --group <id>` | 群管 | ⬜ |
| `fish.kick <qq> --confirm [--reason] --group <id>` | 群管 | ⬜ |
| `fish.ban <qq> --confirm [--reason] --group <id>` | 超管 | ⬜ |
| `fish.unban <qq> --group <id>` | 超管 | ⬜ |
| `fish.purge <qq> --before <date> --group <id>` | 超管 | ⬜ 可选 |

不单独做 `fish.help`，用 Koishi 自带 `help fish`。

## 8. 主动发言策略

| 场景 | 发哪里 | 默认 |
|---|---|---|
| 第 1 次撤回 | 不发 | 静默 |
| 第 2 次撤回 | 不发 | 静默 |
| 12 小时禁言 | 管理员频道 | 群里静默 |
| 踢出 | 群内一条 | 一行事实 |
| 全群停鱼（15 次红线） | 群内一条 | 一行事实 |
| 手动 `fish.disable` | 群内一条 | 一行事实 |
| 日报 | 管理员频道 | 每天 09:00 |
| 周报 | 管理员频道 | 每周一 09:00 |
| 命令回复 | 当前会话 | 仅调用时 |

- 群内只发踢出、全群停鱼、手动全群停鱼；12 小时禁言只发管理员频道。
- 同一群 10 分钟最多一条执法公告；多条合并；一行写完。
- 没有管理员频道就只记日志，不 fallback 到目标群。
- 管理员频道可以用私聊或管理员群，用 `fish.channel` 设置；你个人用私聊即可。
- 机器人不回复普通聊天、不打招呼、不提醒、不评论撤回。
- `fish.rules` 是公开命令；管理员可以把它置顶。群里不自动播报预算进度。

- [ ] 实现管理员频道
- [ ] 实现公告节流/合并
- [ ] 实现日报/周报

## 9. 登记流程

v1 允许在私聊、管理员群或目标群登记。在目标群执行时省略 `--group`，默认用当前群。

1. 管理员在私聊、管理员群或目标群执行 `fish.register [target] [owner] [--group <id>]`。
2. `target` 和 `owner` 都支持 QQ 号、`@用户`、`platform:id`；群内可以直接 @。
3. 在私聊/管理员群执行时目标群看不到；在目标群执行时按当前群处理。
4. 插件用 `bot.getGuildMember` 检查目标用户是否在目标群；不在则拒绝。
5. 写入 `fish` + `fish_group`，状态 `active`；`invitedBy` 记调用者。
6. `owner` 省略时默认调用者；也可以 `fish.register @鱼 @主人` 或 `fish.register @鱼 --owner <QQ>`；登记后可用 `fish.owner @鱼 @主人` 修改。
7. 同一用户在同一群重复登记时复用原行，鱼级 30d 积分继续累计。
8. 一个鱼可以在多个群，各群独立计数、处罚、群级预算。
9. 主人目前是**全局映射**（`fish.ownerUserId`）；每个群的邀请人另存 `fish_group.invitedBy`。如果以后要按群不同主人，再把 owner 移到 `fish_group`。

`fish.channel` 仍不能在目标群执行，避免把日报发到目标群；它可以在私聊或管理员群执行。

- [x] 实现登记/取消
- [x] 实现主人映射
- [x] 实现登记位置与 `--group` 默认
- [x] 实现 QQ / @ / platform:id 解析
- [x] 实现目标用户在群校验
- [x] 实现重复登记复用
- [x] 实机登记测试（私聊/群内 + QQ/@）

### 9.1 自助登记

- 配置 `registration: member` 后，普通群成员可以在目标群执行 `fish.register @鱼`。
- 自助登记只能登记自己：`target` 是鱼，主人自动是调用者；不允许 `--owner` 或第二个主人参数。
- 提交后不直接登记，而是写入 `fish_request`，状态 `pending`。
- 管理员频道收到申请：#编号、群名、鱼昵称 (QQ)、申请人昵称 (QQ)、`fish.approve <id>` / `fish.reject <id>`。
- 管理员在目标群或私聊执行 `fish.approve <id>` / `fish.reject <id>`；私聊不需要 `--group`，会按申请记录找到群。
- 没有管理员频道或发送失败时，尝试私聊 `adminUsers` 里的每个 QQ；全部失败才只保存，管理员用 `fish.pending` 查看。
- 申请人用 `fish.my` 查看自己的鱼和待审批申请。
- 所有列表、状态、报表统一显示 `昵称 (QQ)`，昵称优先群名片，其次 QQ 昵称。

- [x] `fish_request` 入库
- [x] 管理员频道申请通知
- [x] `fish.pending` / `fish.approve` / `fish.reject`
- [x] `fish.my` 查看自己的鱼与申请状态
- [x] 列表/状态/报表显示 `昵称 (QQ)`
- [ ] 实机自助登记测试（普通成员 + 审批）

### 9.2 管理员频道

- 私聊执行 `fish.groups` 获取目标群 ID。
- 私聊执行 `fish.channel --group <目标群ID>`，把当前私聊设为该群的管理员频道。
- 私聊执行 `fish.channel` 需要 `adminUsers` 里包含你的 QQ。
- 目标群不能作为管理员频道（命令会拒绝），避免日报和审批发到目标群。
- 清除：`fish.channel --clear --group <目标群ID>`。
- 没设置管理员频道时，审批申请会尝试私聊 `adminUsers`；私聊也失败则只保存，用 `fish.pending` 查看。

## 10. 统计与数据

- 鱼的原始消息永久保留；文本截断 4 KB；图片只计数量。
- 人类消息只存日聚合，不存原文。
- 日报：各鱼条数、超限、撤回、禁言、当前积分；群级鱼/人比、群级预算 `X/15`。
- 周报：本周超限、群级事件数、Top 3 话痨、规则命中分布。
- `fish.report`、`fish.violations`、`fish.audit` 随时查。
- `fish.status` 显示 `24h: 2 / 30d: 7 / 群级: 9/15`。
- 每月低峰期 `VACUUM` 一次；数据量超过 1–2 GB 时把 `fish_message` 拆独立 SQLite。
- `fish.purge` 只删原始消息，不删违规/审计流水。

- [x] 实现 `fish_message` 入库
- [x] 实现日聚合（人类/鱼消息）
- [x] 实现只读报表 `fish.report`
- [x] 实现启动重建当前窗口
- [ ] 实机计数验证（今晚）
- [ ] 实现 `fish.purge`
- [ ] 实现月度 VACUUM 方案

## 11. 权限与安全

- 群管 = 群主/管理员角色，或 Koishi authority ≥ 3。
- 超管 = 群主，或 `adminUsers` 里的 QQ。
- 管理器自身必须是群管理员；启动时自检，不是则强制 `dry-run` 并告警。
- 私聊执行管理命令需要 `adminUsers`；没填就拒绝。
- 管理员频道可以是私聊或管理员群；发送失败时只写日志，不发目标群。
- 原始消息只给管理员查；命令输出不包含人类消息内容。
- 所有阈值/模式变更、赦免、手动执法写审计。

- [x] 群管/超管判定（Preflight 版）
- [ ] 启动时管理员权限自检
- [ ] 审计日志
- [ ] 命令输出脱敏

## 12. 风险与降级

| 风险 | 处理 |
|---|---|
| OneBot 不上报其他 bot 消息 | preflight 实测；不通过则只做人工报表 |
| 撤回超时/无权限 | 立即处理 + 2 分钟窗口；失败记 `recall_failed`，禁言兜底 |
| 禁言失败（对方是群主/管理员） | 检查角色；降级为撤回 + 通知管理员频道 |
| 重复事件 | unique `(platform, messageId)` 去重 |
| 计数与 DB 不一致 | 启动时从 `fish_message`/`fish_violation` 重建当前窗口 |
| 多条鱼同时刷屏 | 每群一个动作队列，串行执行；先禁言止损，再补撤回 |
| 计数 bug 导致误禁 | 先 `dry-run`；`fish.pardon` 冲正；所有动作可审计 |
| 群级红线误触发 | 15 次事件是去重后的窗口，不是消息条数；`fish.enable` 可重置 |
| 多管理器实例重复处罚 | v1 约定每群一个管理器；v2 加租约 |
| 数据膨胀 | 文本截断、只存鱼消息、月度 VACUUM、可拆库 |

## 13. 实施顺序

1. [x] **Preflight spike**：`fish.preflight` 日志、撤回、禁言三件事实测（代码完成，待实机）。
2. [ ] 脚手架收尾；配置 + 数据模型 + 登记命令。
3. [x] 观察器 + 计数器 + `fish_message` + 启动重建（代码完成，等待今晚只读观察）。
4. [ ] 策略纯函数 + `node:test` 单测。
5. [ ] 执法：撤回/禁言/踢出 + 事件窗口 + 方案 A 阶梯 + 手动执法。
6. [ ] 群级红线：`eventTotal` + 15 次停鱼 + 入群拦截。
7. [ ] 报表 + 管理员频道 + 审计 + 命令补全。
8. [ ] `dry-run` 3–7 天 → `recall-only` 3 天 → `enforce`。

测试依赖：`@koishijs/plugin-mock` + `@koishijs/plugin-database-memory`，加到 devDependencies。

## 14. 验收

- [ ] Preflight 三项通过；撤回成功率 ≥95%，禁言可执行。
- [ ] 单测覆盖：30 秒间隔、15/60 上限、鱼链、连发、10 分钟事件去重、方案 A 阶梯、15 次群级红线。
- [ ] `dry-run` 三天，误报可人工解释；无重复计数。
- [ ] 实际执法：第 1/2 次撤回静默；第 3 次 12h 禁言；第 6 次踢出；第 12 次永久禁入。
- [ ] 群级红线：模拟 15 次事件 → 全群停鱼；`fish.enable` 清零并恢复。
- [ ] 报表数字与数据库查询一致；日报/周报只发管理员频道。
- [ ] 回滚：`fish.mode dry-run` 下一条消息即停止动作；`fish.pardon` 可解禁并冲正。

## 15. 回滚

- `fish.mode dry-run`：立即停止处罚，只记录。
- `fish.pardon <qq>`：冲正鱼级积分、解禁。
- `fish.enable` / `fish.disable`：恢复/停止全群鱼。
- 配置 `enabled: false` 或从 `koishi.yml` 移除插件：完全停用；数据表保留可审计。
- 迁移只增表/加字段，不删列；破坏性变更单独迁移脚本。

## 16. 上线与沟通

1. 先 `dry-run` 3–7 天，只记录、只撤回，校准计数。
2. 公告规则一次：`fish.rules` 输出置顶；写清楚 2/min、15/h、60/day、12h 禁言、30d 6 次踢出、群级 15 次停鱼。
3. 再跑 `recall-only` 3 天，确认群里没有误报。
4. 切 `enforce`。
5. 群级预算 `X/15` 只在管理员频道日报/周报里更新；管理员自己决定要不要在群里说。
6. 阈值变更写审计，并重新公告；不暗改。

## 17. 当前默认值（可改）

- 群级红线：15 次事件。
- 每鱼：2 条/分钟、30 秒、15 条/小时、60 条/天。
- 全群：6 条/分钟、40 条/小时、150 条/天。
- 鱼级：24h 第 3 次 12h 禁言；30d 第 6 次踢出、第 12 次永久禁入。
- 登记：只允许群管。
- 群公告：只发踢出和全群停鱼；12 小时禁言只发管理员频道。

## 16.1 只读观察（当前）

- 模式保持 `dry-run`：只记录、只计数，不撤回、不处罚。
- 目标群里**所有要观察的鱼都要先登记**；未登记的鱼会被当作人类消息，鱼/人比例会失真。
- 观察指标：鱼消息数、人类消息数、鱼/人比例、全群峰值（条/分钟、条/小时）、每鱼峰值。
- 今晚运行 `fish.report 1`（私聊加 `--group <目标群ID>`）查看；报告里的鱼 ID 是掩码。
- 观察结束后按实际峰值 review RPM，再决定是否调整 2/15/60 这组参数。

## 执行记录

| 日期 | 阶段 | 结果 |
|---|---|---|
| 2026-10-31 | 脚手架 | `yarn setup fish-admin -G` 生成 `external/fish-admin` |
| 2026-10-31 | 计划落盘 | 本文件 + `docs/PREFLIGHT.md` |
| 2026-10-31 | Preflight 代码 | `fish.preflight`、`fish.groups`、消息缓冲、角色/DB 自检已实现 |
| 2026-10-31 | 构建 | `yarn build fish-admin` 通过；`lib/index.js` 可导入，配置默认值正确 |
| 2026-10-31 | 加载 | `koishi.yml` 已添加 `fish-admin`；`yarn dev` 成功加载，控制台 5140 可访问 |
| 2026-10-31 | Preflight 实机 | 通过：收到鱼消息、撤回、禁言 60 秒、自动解禁；管理器角色 admin；ID 不记录 |
| 2026-10-31 | 日志脱敏 | 旧 preflight 日志中的群号/QQ 已替换为 `***`；后续日志只记录掩码 ID |
| 2026-10-31 | 阶段 3 代码 | 8 张表（含 `fish_request`）、`fish.register/unregister/list/status/rules/channel` 已实现 |
| 2026-10-31 | 阶段 3 构建 | `yarn build fish-admin` 通过，HMR 已重载插件 |
| 2026-10-31 | 登记位置 | `fish.register/unregister` 允许私聊、管理员群、目标群；群内省略 `--group` 用当前群；target 支持 QQ/@/platform:id。`fish.channel` 仍禁止目标群 |
| 2026-10-31 | 目标解析 | `resolveTarget` 支持裸 QQ、`@QQ`、`@platform:id`、`platform:id`、@ 元素；构建通过 |
| 2026-10-31 | 主人设置 | `fish.register @鱼 @主人` / `--owner` 已支持；新增 `fish.owner`；构建通过 |
| 2026-10-31 | 阶段 3 实机 | 登记成功；`fish.list` / `fish.status` 可用 |
| 2026-10-31 | 阶段 4 代码 | 观察器、`fish_message` 入库、分钟/小时/日计数、人类日聚合、启动重建 |
| 2026-10-31 | 阶段 4 报表 | 新增 `fish.mode`（dry-run/recall-only/enforce）与只读 `fish.report`；构建通过 |
| 2026-10-31 | 自助登记 | 新增 `fish_request`、`fish.pending/approve/reject/my`；`registration: member` 时普通成员可在目标群申请；显示改为 `昵称 (QQ)`；构建通过 |
| 2026-10-31 | 规则开关 | `chainGuard` 保留开关；`sameFishStreak` 改为 `{ enabled, limit }`，默认关闭；`fish.rules` 增加事件窗口解释；`registration` 描述改为已实现 |
| 2026-10-31 | 审批通知 | 无管理员频道时尝试私聊 `adminUsers`；私聊 `fish.approve/reject <id>` 不需要 `--group`；构建通过 |
| 2026-11-01 | v0.1.0 发布准备 | 范围定为 preview：只发布登记/审批/观察/报表；`mode` 限制为 dry-run；`approvalDmFallback` 开关；补 README/CHANGELOG/LICENSE/package 元数据 |
| 待补 | 只读观察 | 今晚保持 `dry-run`，用 `fish.report` 看目标群实际消息分布 |
