import { Context } from 'koishi'
import { Config } from './config'
import { formatError, isAdmin, maskId } from './utils'

interface LastMessage {
  messageId: string
  channelId: string
  groupId: string
  userId: string
  timestamp: number
}

export function applyPreflight(ctx: Context, config: Config) {
  const logger = ctx.logger('fish-admin')
  const lastMessages = new Map<string, LastMessage>()

  ctx.on('message', (session) => {
    if (!session.guildId || !session.userId || !session.messageId || !session.channelId) return
    const key = `${session.guildId}:${session.userId}`
    lastMessages.set(key, {
      messageId: session.messageId,
      channelId: session.channelId,
      groupId: session.guildId,
      userId: session.userId,
      timestamp: Date.now(),
    })
    if (lastMessages.size > 1000) {
      const oldest = lastMessages.keys().next().value
      if (oldest) lastMessages.delete(oldest)
    }
  })

  ctx
    .command('fish.preflight', '大肥鱼插件自检')
    .userFields(['authority'])
    .option('test', '-t <qq>')
    .option('group', '-g <id>')
    .action(async ({ session, options }) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
      }

      const groupId = options.group ? String(options.group) : session.guildId
      if (!groupId) return '请在目标群里执行，或用 --group <id> 指定目标群。'

      const bot = session.bot
      const lines: string[] = [
        `目标群：${groupId}`,
        `平台：${session.platform}`,
        `管理器：${bot.selfId}`,
        `数据库：${ctx.database ? '可用' : '不可用'}`,
      ]

      try {
        const member = await (bot as any).getGuildMember(groupId, bot.selfId)
        const roles: string[] = member?.roles?.map((role: { id: string }) => role.id) ?? []
        lines.push(`管理器角色：${roles.length ? roles.join(', ') : '未知'}`)
        if (!roles.includes('admin') && !roles.includes('owner')) {
          lines.push('⚠️ 管理器不是群管理员，撤回/禁言可能失败。')
        }
      } catch (error) {
        lines.push(`管理器角色：读取失败（${formatError(error)}）`)
      }

      if (!options.test) {
        lines.push('')
        lines.push('下一步：让测试鱼在目标群发一条消息，然后执行：')
        lines.push(`fish.preflight --test <测试鱼QQ> --group ${groupId}`)
        return lines.join('\n')
      }

      const qq = String(options.test)
      const last = lastMessages.get(`${groupId}:${qq}`)
      if (!last) {
        return [...lines, '', `❌ 还没看到 QQ ${qq} 在群 ${groupId} 的消息；先让它发一条。`].join('\n')
      }

      lines.push('')
      lines.push(`测试鱼：${qq}`)
      lines.push(`最近消息：${last.messageId}（${new Date(last.timestamp).toLocaleTimeString()}）`)

      try {
        await bot.deleteMessage(last.channelId, last.messageId)
        lines.push('✅ 撤回：成功')
      } catch (error) {
        lines.push(`❌ 撤回：失败（${formatError(error)}）`)
      }

      try {
        await (bot as any).muteGuildMember(groupId, qq, 60_000)
        lines.push('✅ 禁言 60 秒：成功')
        await (bot as any).muteGuildMember(groupId, qq, 0)
        lines.push('✅ 解除禁言：成功')
      } catch (error) {
        lines.push(`❌ 禁言：失败（${formatError(error)}）`)
      }

      logger.info('preflight: group=%s bot=%s test=%s', maskId(groupId), maskId(bot.selfId), maskId(qq))
      return lines.join('\n')
    })

  ctx.command('fish.groups', '列出管理器所在群').userFields(['authority']).action(async ({ session }) => {
    if (!session) return '无法获取会话。'
    if (!isAdmin(session, config)) {
      return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
    }

    const lines: string[] = []
    for (const bot of ctx.bots) {
      try {
        const result = await (bot as any).getGuildList?.()
        const guilds = result?.data ?? []
        for (const guild of guilds) {
          lines.push(`${guild.id}\t${guild.name ?? ''}\t${bot.platform}:${bot.selfId}`)
        }
      } catch (error) {
        lines.push(`[${bot.platform}:${bot.selfId}] 读取失败：${formatError(error)}`)
      }
    }
    return lines.length ? lines.join('\n') : '没有读到任何群。'
  })
}
