# Changelog

## 0.1.0 (2026-11-04)

v0.1.0 是预览版，只包含登记、审批、观察和统计，不包含执法。

### 已实现

- 鱼 QQ → 主人登记，支持 QQ、`@用户`、`platform:id`。
- 自助登记：普通成员在目标群提交申请，管理员用 `fish.pending` / `fish.approve` / `fish.reject` 审批。
- 审批通知：管理员频道优先；可配置私聊 `adminUsers` fallback。
- 观察器：记录已登记鱼的原始消息、分钟/小时/日计数、人类消息日聚合。
- 只读报表：`fish.report` 查看鱼/人比例、全群峰值、每鱼峰值。
- 命令：`fish.preflight`、`fish.groups`、`fish.register`、`fish.unregister`、`fish.owner`、`fish.my`、`fish.list`、`fish.status`、`fish.rules`、`fish.mode`、`fish.channel`。
- 显示格式统一为 `昵称 (QQ)`。
- 行为规则开关：`chainGuard` 默认开，`sameFishStreak` 默认关。

### 未实现（roadmap）

- 策略引擎：配额判定、事件窗口、处罚阶梯。
- 执法：撤回、禁言、踢出、永久禁入、手动执法。
- 群级红线：15 次事件停鱼、入群拦截、`fish.enable` / `fish.disable` / `fish.threshold`。
- 日报/周报定时器、`fish.violations`、`fish.audit`、`fish.purge`。
- 策略单测与 mock 集成测试。

### 说明

- v0.1.0 预览版只支持 `dry-run`，不会自动撤回、禁言或踢人。
- 不建议直接部署到生产群；请先阅读 README 的预览说明。
