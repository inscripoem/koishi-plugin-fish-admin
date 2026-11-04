import { Context, Session } from 'koishi'
import { Config } from './config'
import { Fish, FishGroup } from './model'
import {
  ensurePolicy,
  getDayKey,
  getFish,
  getMemberInfo,
  getRelation,
  registerFish,
  sumPoints,
  unregisterFish,
  writeAudit,
} from './registry'
import { formatError, getAtTargets, isAdmin, isSuperAdmin, resolveGroupId, resolveTarget } from './utils'

function formatDate(value: Date | null | undefined, timeZone: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function resolvePair(
  session: Parameters<typeof resolveTarget>[0],
  target?: string,
  owner?: string,
  ownerOption?: string,
) {
  const ats = getAtTargets(session)
  const fish = resolveTarget(session, target) ?? ats[0] ?? null
  const ownerTarget = owner
    ? resolveTarget(session, owner)
    : ownerOption
      ? resolveTarget(session, String(ownerOption))
      : (target ? ats[0] : ats[1]) ?? null
  return { fish, owner: ownerTarget }
}

async function displayFish(session: Session, groupId: string, fish?: Fish, relation?: FishGroup) {
  if (fish) {
    const info = await getMemberInfo(session, groupId, fish.userId)
    const name = info.nick || info.name
    if (name && name !== fish.userId) return `${name} (${fish.userId})`
  }
  const name = relation?.nick || fish?.name
  return `${name || '?'} (${fish?.userId ?? '?'})`
}

async function displayOwner(session: Session, groupId: string, fish?: Fish) {
  if (fish?.ownerUserId) {
    const info = await getMemberInfo(session, groupId, fish.ownerUserId)
    const name = info.nick || info.name
    if (name && name !== fish.ownerUserId) return `${name} (${fish.ownerUserId})`
  }
  const name = fish?.ownerName
  return `${name || '?'} (${fish?.ownerUserId ?? '?'})`
}

export function applyCommands(ctx: Context, config: Config) {
  ctx
    .command('fish.register [target] [owner]', '登记大肥鱼')
    .userFields(['authority'])
    .option('owner', '-o <qq>')
    .option('group', '-g <id>')
    .action(async ({ session, options }, target, ownerArg) => {
      if (!session) return '无法获取会话。'
      const admin = isAdmin(session, config)

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const pair = resolvePair(session, target, ownerArg, options.owner)
      if (!pair.fish) return '请提供 QQ、@ 一只鱼，或 platform:id。'
      if (pair.fish.platform !== session.platform) return '目标用户不在当前平台。'

      if (!admin) {
        if (config.registration !== 'member') {
          return '权限不足：只有群主/管理员可以登记；自助登记未开启。'
        }
        if (session.guildId !== groupId) return '自助登记只能在目标群内进行。'
        if (ownerArg || options.owner) return '自助登记只能给自己登记，不能指定主人。'
        if (!session.userId) return '无法确定申请人。'

        const existingFish = await getFish(ctx, pair.fish.platform, pair.fish.userId)
        if (existingFish) {
          const relation = await getRelation(ctx, existingFish.id, groupId)
          if (relation?.status === 'active') return '这只鱼已经登记。'
          if (relation?.status === 'banned') return '这只鱼在本群已被永久禁入，请联系管理员。'
        }

        const [pending] = await ctx.database.get('fish_request', {
          groupId,
          fishUserId: pair.fish.userId,
          status: 'pending',
        })
        if (pending) return `这只鱼已有待审批申请（#${pending.id}）。`

        try {
          await (session.bot as any).getGuildMember(groupId, pair.fish.userId)
        } catch {
          return '这只鱼不在目标群。'
        }

        const info = await getMemberInfo(session, groupId, pair.fish.userId)
        const ownerName = session.author?.nick || session.author?.name || session.userId
        const request = await ctx.database.create('fish_request', {
          groupId,
          platform: pair.fish.platform,
          fishUserId: pair.fish.userId,
          fishName: info.nick || info.name || pair.fish.userId,
          ownerUserId: session.userId,
          ownerName,
          requestedBy: session.userId,
          status: 'pending',
          createdAt: new Date(),
          reviewedBy: '',
          reviewedAt: null,
          note: '',
        })

        const policy = await ensurePolicy(ctx, groupId, pair.fish.platform, config, session.userId)
        const text = [
          `登记申请 #${request.id}`,
          `群：${(session as any).guildName ?? groupId}`,
          `鱼：${request.fishName} (${request.fishUserId})`,
          `申请人：${request.ownerName} (${request.ownerUserId})`,
          `同意：fish.approve ${request.id}`,
          `拒绝：fish.reject ${request.id}`,
        ].join('\n')

        let delivered = false
        if (policy.adminChannel) {
          try {
            await session.bot.sendMessage(policy.adminChannel, text)
            delivered = true
          } catch (error) {
            ctx.logger('fish-admin').warn('send approval request failed: %s', formatError(error))
          }
        }

        if (!delivered && config.notices.approvalDmFallback && config.adminUsers.length) {
          for (const admin of config.adminUsers) {
            try {
              const channel = await (session.bot as any).createDirectChannel(admin)
              if (channel?.id) {
                await session.bot.sendMessage(channel.id, text)
                delivered = true
              }
            } catch (error) {
              ctx.logger('fish-admin').warn('send approval DM failed: %s', formatError(error))
            }
          }
        }

        return delivered
          ? `申请已提交（#${request.id}），已通知管理员审批。`
          : `申请已提交（#${request.id}）；暂时无法通知管理员，请提醒管理员用 fish.pending 查看。`
      }

      if (pair.owner && pair.owner.platform !== session.platform) return '主人不在当前平台。'
      const ownerTarget = pair.owner ?? (session.userId
        ? { platform: session.platform, userId: session.userId }
        : null)
      if (!ownerTarget) return '无法确定主人，请用 --owner <qq> 或 @主人。'

      const fishInfo = await getMemberInfo(session, groupId, pair.fish.userId)
      const ownerInfo = await getMemberInfo(session, groupId, ownerTarget.userId)

      try {
        const result = await registerFish(
          ctx,
          session,
          groupId,
          pair.fish.platform,
          pair.fish.userId,
          fishInfo.name,
          fishInfo.nick,
          ownerTarget.userId,
          ownerInfo.nick || ownerInfo.name,
        )
        await ensurePolicy(ctx, groupId, pair.fish.platform, config, session.userId ?? '')
        await writeAudit(
          ctx,
          groupId,
          session.userId ?? '',
          result.created ? 'fish.register' : 'fish.update',
          pair.fish.userId,
          { owner: ownerTarget.userId, platform: pair.fish.platform },
        )
        return [
          `${result.created ? '已登记' : '已更新'} ${fishInfo.nick || fishInfo.name} (${pair.fish.userId})`,
          `主人：${ownerInfo.nick || ownerInfo.name} (${ownerTarget.userId})`,
          `群：${groupId}`,
          `状态：${result.relation.status}`,
        ].join('\n')
      } catch (error) {
        return `登记失败：${formatError(error)}`
      }
    })

  ctx
    .command('fish.unregister [target]', '取消登记大肥鱼')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }, target) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
      }

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const resolved = resolveTarget(session, target)
      if (!resolved) return '请提供 QQ、@ 一只鱼，或 platform:id。'
      if (resolved.platform !== session.platform) return '目标用户不在当前平台。'

      const result = await unregisterFish(ctx, resolved.platform, groupId, resolved.userId)
      if (!result) return `用户 ${resolved.userId} 没有在这个群登记。`

      await writeAudit(ctx, groupId, session.userId ?? '', 'fish.unregister', resolved.userId)
      return `已取消登记 ${resolved.userId}；历史记录保留。`
    })

  ctx
    .command('fish.pending', '查看待审批登记')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
      }

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const requests = await ctx.database.get('fish_request', { groupId, status: 'pending' })
      if (!requests.length) return '没有待审批申请。'
      requests.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

      return [
        '待审批：',
        ...requests.map((request) => {
          return `#${request.id} 鱼：${request.fishName} (${request.fishUserId}) 申请人：${request.ownerName} (${request.ownerUserId})`
        }),
      ].join('\n')
    })

  ctx
    .command('fish.approve <id>', '通过登记申请')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }, id) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
      }

      const requestId = Number(id)
      if (!Number.isInteger(requestId)) return '申请编号不对。'

      const [request] = await ctx.database.get('fish_request', { id: requestId })
      if (!request || request.status !== 'pending') return '申请不存在或已处理。'

      const groupId = resolveGroupId(session, options) ?? request.groupId
      if (groupId !== request.groupId) return '这条申请不属于该群。'
      if (session.guildId && session.guildId !== request.groupId) return '这条申请不属于当前群。'

      try {
        const info = await getMemberInfo(session, groupId, request.fishUserId)
        await registerFish(
          ctx,
          session,
          groupId,
          request.platform,
          request.fishUserId,
          info.name,
          info.nick,
          request.ownerUserId,
          request.ownerName,
        )
      } catch (error) {
        return `通过失败：${formatError(error)}`
      }

      await ctx.database.set('fish_request', { id: requestId }, {
        status: 'approved',
        reviewedBy: session.userId ?? '',
        reviewedAt: new Date(),
      })
      await ensurePolicy(ctx, groupId, request.platform, config, session.userId ?? '')
      await writeAudit(ctx, groupId, session.userId ?? '', 'request.approve', String(requestId), {
        fish: request.fishUserId,
        owner: request.ownerUserId,
      })

      return `已通过申请 #${requestId}：${request.fishName} (${request.fishUserId})。`
    })

  ctx
    .command('fish.reject <id>', '拒绝登记申请')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }, id) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
      }

      const requestId = Number(id)
      if (!Number.isInteger(requestId)) return '申请编号不对。'

      const [request] = await ctx.database.get('fish_request', { id: requestId })
      if (!request || request.status !== 'pending') return '申请不存在或已处理。'

      const groupId = resolveGroupId(session, options) ?? request.groupId
      if (groupId !== request.groupId) return '这条申请不属于该群。'
      if (session.guildId && session.guildId !== request.groupId) return '这条申请不属于当前群。'

      await ctx.database.set('fish_request', { id: requestId }, {
        status: 'rejected',
        reviewedBy: session.userId ?? '',
        reviewedAt: new Date(),
      })
      await writeAudit(ctx, groupId, session.userId ?? '', 'request.reject', String(requestId), {
        fish: request.fishUserId,
        owner: request.ownerUserId,
      })

      return `已拒绝申请 #${requestId}：${request.fishName} (${request.fishUserId})。`
    })

  ctx
    .command('fish.my', '查看我登记的鱼')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }) => {
      if (!session) return '无法获取会话。'
      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'
      if (!session.userId) return '无法确定你的账号。'

      const fishes = await ctx.database.get('fish', {
        platform: session.platform,
        ownerUserId: session.userId,
      })
      const relations = fishes.length
        ? await ctx.database.get('fish_group', {
          groupId,
          fishId: { $in: fishes.map((fish) => fish.id) },
        })
        : []
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const pending = await ctx.database.get('fish_request', {
        groupId,
        ownerUserId: session.userId,
        status: 'pending',
      })
      const rejected = await ctx.database.get('fish_request', {
        groupId,
        ownerUserId: session.userId,
        status: 'rejected',
        createdAt: { $gte: since },
      })
      const requests = [...pending, ...rejected]

      const lines: string[] = []
      for (const relation of relations) {
        const fish = fishes.find((item) => item.id === relation.fishId)
        lines.push(`${await displayFish(session, groupId, fish, relation)}  ${relation.status}`)
      }
      for (const request of requests) {
        const state = request.status === 'pending' ? `待审批 #${request.id}` : `已拒绝 #${request.id}`
        lines.push(`${request.fishName} (${request.fishUserId})  ${state}`)
      }

      if (!lines.length) return '你还没有登记鱼。'
      return ['我的鱼：', ...lines].join('\n')
    })

  ctx
    .command('fish.owner [target] [owner]', '设置大肥鱼主人')
    .userFields(['authority'])
    .option('owner', '-o <qq>')
    .option('group', '-g <id>')
    .action(async ({ session, options }, target, ownerArg) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
      }

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const pair = resolvePair(session, target, ownerArg, options.owner)
      if (!pair.fish) return '请提供 QQ、@ 一只鱼，或 platform:id。'
      if (!pair.owner) return '请提供主人：@主人、QQ 或 platform:id。'
      if (pair.fish.platform !== session.platform || pair.owner.platform !== session.platform) {
        return '鱼和主人必须在当前平台。'
      }

      const fish = await getFish(ctx, pair.fish.platform, pair.fish.userId)
      if (!fish) return `用户 ${pair.fish.userId} 没有登记。`
      const relation = await getRelation(ctx, fish.id, groupId)
      if (!relation) return `用户 ${pair.fish.userId} 没有在这个群登记。`

      const fishInfo = await getMemberInfo(session, groupId, pair.fish.userId)
      const ownerInfo = await getMemberInfo(session, groupId, pair.owner.userId)
      await ctx.database.set('fish', { id: fish.id }, {
        ownerUserId: pair.owner.userId,
        ownerName: ownerInfo.nick || ownerInfo.name,
      })
      await writeAudit(ctx, groupId, session.userId ?? '', 'fish.owner', pair.fish.userId, {
        owner: pair.owner.userId,
      })

      return `已把 ${fishInfo.nick || fishInfo.name} (${pair.fish.userId}) 的主人设为 ${ownerInfo.nick || ownerInfo.name} (${pair.owner.userId})。`
    })

  ctx
    .command('fish.list', '列出本群登记的大肥鱼')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const relations = await ctx.database.get('fish_group', { groupId })
      if (!relations.length) return '本群还没有登记任何鱼。'

      const fishes = await ctx.database.get('fish', { id: { $in: relations.map((relation) => relation.fishId) } })
      const fishMap = new Map(fishes.map((fish) => [fish.id, fish]))
      const lines = ['鱼\t主人\t状态\t进群时间']
      for (const relation of relations) {
        const fish = fishMap.get(relation.fishId)
        const fishLabel = await displayFish(session, groupId, fish, relation)
        const ownerLabel = await displayOwner(session, groupId, fish)
        lines.push([
          fishLabel,
          ownerLabel,
          relation.status,
          formatDate(relation.joinedAt, config.timezone),
        ].join('\t'))
      }
      return lines.join('\n')
    })

  ctx
    .command('fish.status [target]', '查看单只大肥鱼状态')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }, target) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const resolved = resolveTarget(session, target)
      if (!resolved) return '请提供 QQ、@ 一只鱼，或 platform:id。'
      if (resolved.platform !== session.platform) return '目标用户不在当前平台。'

      const fish = await getFish(ctx, resolved.platform, resolved.userId)
      if (!fish) return `用户 ${resolved.userId} 没有登记。`

      const relation = await getRelation(ctx, fish.id, groupId)
      if (!relation) return `用户 ${resolved.userId} 没有在这个群登记。`

      const policy = await ensurePolicy(ctx, groupId, resolved.platform, config, session.userId ?? '')
      const violations = await ctx.database.get('fish_violation', {
        fishId: fish.id,
        groupId,
        pardoned: false,
      })
      const now = Date.now()
      const events24h = sumPoints(violations, now - 24 * 60 * 60 * 1000)
      const events30d = sumPoints(violations, now - 30 * 24 * 60 * 60 * 1000)
      const messages = await ctx.database.get('fish_message', {
        fishId: fish.id,
        groupId,
        dayKey: getDayKey(config.timezone),
      })
      const recent = [...violations]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)

      const fishLabel = await displayFish(session, groupId, fish, relation)
      const ownerLabel = await displayOwner(session, groupId, fish)
      const lines = [
        `鱼：${fishLabel}`,
        `主人：${ownerLabel}`,
        `状态：${relation.status}`,
        `进群：${formatDate(relation.joinedAt, config.timezone)}`,
        `今日消息：${messages.length}`,
        `24h 事件：${events24h}`,
        `30d 事件：${events30d}`,
        `群级预算：${policy.eventTotal}/${policy.banAtEvents}`,
      ]
      if (recent.length) {
        lines.push('最近违规：')
        for (const violation of recent) {
          lines.push(`  ${formatDate(violation.createdAt, config.timezone)} ${violation.rule} +${violation.points}`)
        }
      } else {
        lines.push('最近违规：无')
      }
      return lines.join('\n')
    })

  ctx
    .command('fish.rules', '查看大肥鱼规则')
    .option('group', '-g <id>')
    .action(async ({ session, options }) => {
      const quota = config.quota
      const rules = config.rules
      const behaviors: string[] = []
      if (rules.chainGuard) behaviors.push('不同鱼不能直接接话')
      if (rules.sameFishStreak.enabled) behaviors.push(`同一只鱼最多连发 ${rules.sameFishStreak.limit} 条`)

      const lines = [
        `每鱼：${quota.rpm} 条/分钟，间隔 ${quota.interval} 秒，${quota.hourly} 条/小时，${quota.daily} 条/天`,
        `全群：${quota.groupRpm} 条/分钟，${quota.groupHourly} 条/小时，${quota.groupDaily} 条/天`,
        `行为：${behaviors.length ? behaviors.join('；') : '无额外行为限制'}`,
        `事件：从第一条超限消息开始，${rules.eventWindowMinutes} 分钟内继续超限只撤回、不重复计分；${rules.eventWindowMinutes} 分钟无超限后，下一次才算新事件`,
        `处罚：24h 内第 ${config.penalties.twelveHoursAt} 次事件 12 小时禁言；30d 内第 ${config.penalties.kickAt} 次事件踢出、第 ${config.penalties.banAt} 次事件永久禁入`,
      ]
      if (rules.burstMuteThreshold > 0) {
        lines.push(`防洪：单个事件内超限 ${rules.burstMuteThreshold} 条 → 立即 12 小时禁言`)
      }
      lines.push(`群级红线：累计 ${config.groupRedLine.banAtEvents} 次事件 → 全群停鱼`)

      const groupId = session ? resolveGroupId(session, options) : options.group ? String(options.group) : null
      if (groupId) {
        const [policy] = await ctx.database.get('fish_group_policy', { groupId })
        if (policy) lines.push(`当前群级预算：${policy.eventTotal}/${policy.banAtEvents}`)
      }
      return lines.join('\n')
    })

  ctx
    .command('fish.mode [mode]', '查看/切换运行模式')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }, mode) => {
      if (!session) return '无法获取会话。'
      if (!isSuperAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主。'
      }

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const policy = await ensurePolicy(ctx, groupId, session.platform, config, session.userId ?? '')
      const value = mode ? String(mode) : ''
      if (!value) return `当前模式：${policy.mode}`

      if (value !== 'dry-run') {
        return 'v0.1.0 预览版只支持 dry-run；recall-only / enforce 在 roadmap。'
      }

      await ctx.database.set('fish_group_policy', { groupId }, {
        mode: 'dry-run',
        updatedAt: new Date(),
        updatedBy: session.userId ?? '',
      })
      await writeAudit(ctx, groupId, session.userId ?? '', 'mode.set', value)
      return `已切换为 ${value}。`
    })

  ctx
    .command('fish.report [days]', '查看群消息统计')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .action(async ({ session, options }, days) => {
      if (!session) return '无法获取会话。'
      if (!isAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主/管理员。'
      }

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'

      const span = Math.max(1, Math.min(30, Number(days) || 1))
      const since = new Date(Date.now() - span * 24 * 60 * 60 * 1000)
      const messages = await ctx.database.get('fish_message', {
        groupId,
        createdAt: { $gte: since },
      })
      const fishIds = [...new Set(messages.map((message) => message.fishId))]
      const fishes = fishIds.length
        ? await ctx.database.get('fish', { id: { $in: fishIds } })
        : []
      const fishMap = new Map(fishes.map((fish) => [fish.id, fish]))
      const relations = fishIds.length
        ? await ctx.database.get('fish_group', { groupId, fishId: { $in: fishIds } })
        : []
      const relationMap = new Map(relations.map((relation) => [relation.fishId, relation]))
      const daily = await ctx.database.get('fish_group_daily', {
        groupId,
        date: { $gte: getDayKey(config.timezone, since) },
      })
      const humanTotal = daily.reduce((sum, row) => sum + row.humanTotal, 0)
      const fishTotal = messages.length

      if (!fishTotal && !humanTotal) return `最近 ${span} 天没有记录。`

      const perFish = new Map<number, { count: number; minutes: Map<number, number>; hours: Map<number, number> }>()
      const groupMinutes = new Map<number, number>()
      const groupHours = new Map<number, number>()

      for (const message of messages) {
        const timestamp = new Date(message.createdAt).getTime()
        const minuteKey = Math.floor(timestamp / 60_000)
        const hourKey = Math.floor(timestamp / 3_600_000)
        groupMinutes.set(minuteKey, (groupMinutes.get(minuteKey) ?? 0) + 1)
        groupHours.set(hourKey, (groupHours.get(hourKey) ?? 0) + 1)

        let entry = perFish.get(message.fishId)
        if (!entry) {
          entry = { count: 0, minutes: new Map(), hours: new Map() }
          perFish.set(message.fishId, entry)
        }
        entry.count++
        entry.minutes.set(minuteKey, (entry.minutes.get(minuteKey) ?? 0) + 1)
        entry.hours.set(hourKey, (entry.hours.get(hourKey) ?? 0) + 1)
      }

      const max = (map: Map<number, number>) => Math.max(0, ...map.values())
      const top = [...perFish.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
      const ratio = humanTotal ? Math.round((fishTotal / humanTotal) * 100) : 0

      const lines = [
        `最近 ${span} 天：鱼消息 ${fishTotal}，人类消息 ${humanTotal}，鱼/人 ${ratio}%`,
        `全群峰值：${max(groupMinutes)} 条/分钟，${max(groupHours)} 条/小时`,
        '按鱼：',
      ]
      for (const [fishId, entry] of top) {
        const fish = fishMap.get(fishId)
        const relation = relationMap.get(fishId)
        const label = fish ? await displayFish(session, groupId, fish, relation) : `#${fishId}`
        lines.push(`  ${label}  ${entry.count} 条  峰值 ${max(entry.minutes)}/分钟，${max(entry.hours)}/小时`)
      }
      return lines.join('\n')
    })

  ctx
    .command('fish.channel', '设置本群管理员频道')
    .userFields(['authority'])
    .option('group', '-g <id>')
    .option('clear', '-c')
    .action(async ({ session, options }) => {
      if (!session) return '无法获取会话。'
      if (!isSuperAdmin(session, config)) {
        return '权限不足：私聊执行需要在插件配置 adminUsers 填你的 QQ；群内执行需要群主。'
      }

      const groupId = resolveGroupId(session, options)
      if (!groupId) return '请用 --group <id> 指定目标群。'
      if (session.guildId === groupId) {
        return '管理员频道不能是目标群；请用私聊或管理员群。'
      }

      await ensurePolicy(ctx, groupId, session.platform, config, session.userId ?? '')
      const channel = options.clear ? '' : session.channelId ?? ''
      if (!options.clear && !channel) return '无法获取当前频道。'

      await ctx.database.set('fish_group_policy', { groupId }, {
        adminChannel: channel,
        updatedAt: new Date(),
        updatedBy: session.userId ?? '',
      })
      await writeAudit(
        ctx,
        groupId,
        session.userId ?? '',
        options.clear ? 'channel.clear' : 'channel.set',
        channel,
      )

      return options.clear
        ? `已清除群 ${groupId} 的管理员频道。`
        : `已把当前会话设为群 ${groupId} 的管理员频道。`
    })
}
