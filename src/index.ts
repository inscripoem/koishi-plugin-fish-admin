import { Context } from 'koishi'
import { Config } from './config'
import { applyCommands } from './commands'
import { applyModel } from './model'
import { applyObserver } from './observer'
import { applyPreflight } from './preflight'

export const name = 'fish-admin'
export const inject = ['database']
export const usage = `
大肥鱼群聊管理。

当前为 Preflight 阶段，可用命令：
- fish.preflight [--test <qq>] [--group <id>]：自检管理器权限、消息接收、撤回、禁言
- fish.groups：列出管理器所在群

完整计划见 docs/PLAN.md，实机验证步骤见 docs/PREFLIGHT.md。
`.trim()

export { Config }

export function apply(ctx: Context, config: Config) {
  if (!config.enabled) return
  if (config.mode !== 'dry-run') {
    ctx.logger('fish-admin').warn('v0.1.0 preview only supports dry-run; mode=%s is ignored', config.mode)
  }

  applyModel(ctx)

  ctx.plugin({
    name: 'fish-admin-commands',
    apply: (ctx) => applyCommands(ctx, config),
  })

  ctx.plugin({
    name: 'fish-admin-preflight',
    apply: (ctx) => applyPreflight(ctx, config),
  })

  ctx.plugin({
    name: 'fish-admin-observer',
    apply: (ctx) => applyObserver(ctx, config),
  })
}
