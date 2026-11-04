# koishi-plugin-fish-admin

大肥鱼群聊管理插件（v0.1.0 预览版）。

仓库：<https://github.com/inscripoem/koishi-plugin-fish-admin>

> **预览版说明**：v0.1.0 只包含登记、审批、观察和统计。它**不会自动撤回、禁言或踢人**，`fish.mode` 也只接受 `dry-run`。不要直接部署到生产群。

## 已实现

- 登记“鱼 QQ → 主人”，支持 QQ、`@用户`、`platform:id`。
- 自助登记：普通成员在目标群提交申请，管理员审批后生效。
- 审批通知：管理员频道优先；可配置私聊 `adminUsers` fallback。
- 观察器：记录已登记鱼的原始消息、分钟/小时/日计数、人类消息日聚合。
- 只读统计：`fish.report` 查看鱼/人比例、全群峰值、每鱼峰值。
- 列表、状态、审批申请统一显示 `昵称 (QQ)`，优先群名片，其次 QQ 昵称。
- 行为规则开关：`chainGuard` 默认开；`sameFishStreak` 默认关，避免与 RPM 冲突。

## 未实现（roadmap）

- 策略引擎：配额判定、10 分钟事件窗口、处罚阶梯。
- 执法：撤回、禁言、踢出、永久禁入、手动执法。
- 群级红线：15 次事件停鱼、入群拦截、`fish.enable` / `fish.disable` / `fish.threshold`。
- 日报/周报定时器、`fish.violations`、`fish.audit`、`fish.purge`。
- 策略单测与 mock 集成测试。

## 安装

从 GitHub 克隆到 Koishi 工作区：

```bash
cd <koishi-workspace>
yarn clone inscripoem/koishi-plugin-fish-admin fish-admin
yarn build fish-admin
```

也可以手动放到 `external/fish-admin`，然后在 `koishi.yml` 中加入：

```yaml
plugins:
  fish-admin:
```

启动开发模式：

```bash
yarn dev
```

## 配置

```yaml
fish-admin:
  enabled: true
  mode: dry-run                  # v0.1.0 只支持 dry-run
  timezone: Asia/Shanghai
  registration: admin            # admin | member
  adminUsers: []                 # 私聊管理命令/审批 fallback 的超管 QQ

  quota:
    rpm: 2
    interval: 30
    hourly: 15
    daily: 60
    groupRpm: 6
    groupHourly: 40
    groupDaily: 150
    nightMute: false

  rules:
    chainGuard: true
    sameFishStreak:
      enabled: false
      limit: 2
    burstMuteThreshold: 10
    eventWindowMinutes: 10

  notices:
    groupEvents: [kick, groupBan]
    approvalDmFallback: true

  retention:
    rawMessageDays: 0
    textLimit: 4096
    aggregateDays: 0
```

- `registration: admin`：只有群主/管理员可以直接登记。
- `registration: member`：普通成员可在目标群提交申请，管理员审批后登记。
- `adminUsers`：私聊执行管理命令、私聊审批 fallback 需要的 QQ 列表。
- `approvalDmFallback`：管理员频道不可用时，是否私聊 `adminUsers` 发送审批申请。
- `mode`：预览版只支持 `dry-run`；`recall-only` / `enforce` 保留给后续版本。

`penalties`、`groupRedLine`、`reports` 字段保留给 roadmap；v0.1.0 不会执行这些处罚或定时报表。

## 命令

### 已实现

| 命令 | 说明 |
|---|---|
| `fish.preflight [--test <qq>] [--group <id>]` | 自检权限、消息接收、撤回、禁言 |
| `fish.groups` | 列出管理器所在群 |
| `fish.register [target] [owner] [--owner <qq>] [--group <id>]` | 登记；target/owner 支持 QQ、`@用户`、`platform:id` |
| `fish.unregister [target] [--group <id>]` | 取消登记 |
| `fish.owner [target] [owner] [--group <id>]` | 修改主人 |
| `fish.pending [--group <id>]` | 查看待审批申请 |
| `fish.approve <id> [--group <id>]` | 通过申请；私聊可省略 `--group` |
| `fish.reject <id> [--group <id>]` | 拒绝申请 |
| `fish.my [--group <id>]` | 查看自己登记的鱼和申请状态 |
| `fish.list [--group <id>]` | 列出本群登记 |
| `fish.status [target] [--group <id>]` | 单鱼状态 |
| `fish.rules [--group <id>]` | 查看规则与事件说明 |
| `fish.mode [mode] [--group <id>]` | 预览版只接受 `dry-run` |
| `fish.channel [--group <id>]` | 设置管理员频道 |
| `fish.report [days] [--group <id>]` | 只读统计 |

### Roadmap

`fish.threshold`、`fish.enable`、`fish.disable`、`fish.pardon`、`fish.violations`、`fish.audit`、`fish.mute`、`fish.kick`、`fish.ban`、`fish.unban`、`fish.purge`。

## 管理员频道

私聊管理器：

```text
fish.groups
fish.channel --group <目标群ID>
```

把当前私聊设为该群的管理员频道。私聊执行需要 `adminUsers` 包含你的 QQ。目标群本身不能作为管理员频道。

## 数据与隐私

- 只保存已登记鱼的原始消息；人类消息只保存日聚合数量，不保存内容。
- 图片只计数，不下载、不保存 URL。
- 运行日志对群号/QQ 做掩码。
- 运行数据库会保存登记所需的平台用户 ID 和群 ID。

## 开发

```bash
yarn build fish-admin
./node_modules/.bin/tsc -p external/fish-admin/tsconfig.json --noEmit --composite false --incremental false
```

设计与进度见 [docs/PLAN.md](docs/PLAN.md)，实机验证记录见 [docs/PREFLIGHT.md](docs/PREFLIGHT.md)。

## License

MIT
