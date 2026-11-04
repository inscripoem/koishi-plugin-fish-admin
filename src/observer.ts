import { Context, $ } from 'koishi'
import { Config } from './config'
import { getDayKey, getFish, getRelation } from './registry'

interface FishCounter {
  minuteKey: number
  minuteCount: number
  hourKey: number
  hourCount: number
  dayKey: number
  dayCount: number
  lastMessageAt: number
}

interface GroupCounter {
  minuteKey: number
  minuteCount: number
  hourKey: number
  hourCount: number
  dayKey: number
  dayCount: number
  lastHumanAt: number
  lastFishId: number | null
  fishStreak: number
}

interface ObserverState {
  fishCounters: Map<string, FishCounter>
  groupCounters: Map<string, GroupCounter>
  seen: Set<string>
}

function minuteKeyOf(timestamp: number) {
  return Math.floor(timestamp / 60_000)
}

function hourKeyOf(timestamp: number) {
  return Math.floor(timestamp / 3_600_000)
}

function ensureFishCounter(state: ObserverState, key: string, now: number, dayKey: number) {
  const minuteKey = minuteKeyOf(now)
  const hourKey = hourKeyOf(now)
  let counter = state.fishCounters.get(key)
  if (!counter) {
    counter = {
      minuteKey,
      minuteCount: 0,
      hourKey,
      hourCount: 0,
      dayKey,
      dayCount: 0,
      lastMessageAt: 0,
    }
    state.fishCounters.set(key, counter)
  }
  if (counter.minuteKey !== minuteKey) {
    counter.minuteKey = minuteKey
    counter.minuteCount = 0
  }
  if (counter.hourKey !== hourKey) {
    counter.hourKey = hourKey
    counter.hourCount = 0
  }
  if (counter.dayKey !== dayKey) {
    counter.dayKey = dayKey
    counter.dayCount = 0
  }
  return counter
}

function ensureGroupCounter(state: ObserverState, groupId: string, now: number, dayKey: number) {
  const minuteKey = minuteKeyOf(now)
  const hourKey = hourKeyOf(now)
  let counter = state.groupCounters.get(groupId)
  if (!counter) {
    counter = {
      minuteKey,
      minuteCount: 0,
      hourKey,
      hourCount: 0,
      dayKey,
      dayCount: 0,
      lastHumanAt: 0,
      lastFishId: null,
      fishStreak: 0,
    }
    state.groupCounters.set(groupId, counter)
  }
  if (counter.minuteKey !== minuteKey) {
    counter.minuteKey = minuteKey
    counter.minuteCount = 0
  }
  if (counter.hourKey !== hourKey) {
    counter.hourKey = hourKey
    counter.hourCount = 0
  }
  if (counter.dayKey !== dayKey) {
    counter.dayKey = dayKey
    counter.dayCount = 0
  }
  return counter
}

async function ensureDaily(ctx: Context, groupId: string, date: number) {
  const [row] = await ctx.database.get('fish_group_daily', { groupId, date })
  if (row) return
  try {
    await ctx.database.create('fish_group_daily', {
      groupId,
      date,
      humanTotal: 0,
      fishTotal: 0,
      overLimit: 0,
      eventCount: 0,
    })
  } catch {
    // concurrent creation; the following set still works
  }
}

async function incrementDaily(ctx: Context, groupId: string, date: number, field: 'humanTotal' | 'fishTotal') {
  await ensureDaily(ctx, groupId, date)
  try {
    await ctx.database.set('fish_group_daily', { groupId, date }, (row) => ({
      [field]: $.add(row[field], 1),
    }))
  } catch (error) {
    ctx.logger('fish-admin').warn(
      'daily increment failed: %s',
      error instanceof Error ? error.message : String(error),
    )
  }
}

async function rebuild(ctx: Context, config: Config, state: ObserverState) {
  const now = Date.now()
  const dayKey = getDayKey(config.timezone)
  const rows = await ctx.database.get('fish_message', { dayKey })
  for (const row of rows) {
    const timestamp = new Date(row.createdAt).getTime()
    if (Number.isNaN(timestamp)) continue
    const fishCounter = ensureFishCounter(state, `${row.groupId}:${row.fishId}`, now, dayKey)
    const groupCounter = ensureGroupCounter(state, row.groupId, now, dayKey)
    if (timestamp >= now - 60_000) {
      fishCounter.minuteCount++
      groupCounter.minuteCount++
    }
    if (timestamp >= now - 3_600_000) {
      fishCounter.hourCount++
      groupCounter.hourCount++
    }
    fishCounter.dayCount++
    groupCounter.dayCount++
    fishCounter.lastMessageAt = Math.max(fishCounter.lastMessageAt, timestamp)
  }

  const recent = await ctx.database.get(
    'fish_message',
    { createdAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) } },
    ['platform', 'messageId'],
  )
  for (const row of recent) {
    state.seen.add(`${row.platform}:${row.messageId}`)
  }
}

export function applyObserver(ctx: Context, config: Config) {
  const logger = ctx.logger('fish-admin')
  const state: ObserverState = {
    fishCounters: new Map(),
    groupCounters: new Map(),
    seen: new Set(),
  }

  ctx.on('ready', async () => {
    try {
      await rebuild(ctx, config, state)
      logger.info('observer ready: %d fish counters, %d groups', state.fishCounters.size, state.groupCounters.size)
    } catch (error) {
      logger.warn('observer rebuild failed: %s', error instanceof Error ? error.message : String(error))
    }
  })

  ctx.on('message', async (session) => {
    if (!session.guildId || !session.userId) return
    if (session.userId === session.selfId) return

    const groupId = session.guildId
    const now = Date.now()
    const dayKey = getDayKey(config.timezone)
    const groupCounter = ensureGroupCounter(state, groupId, now, dayKey)

    const fish = await getFish(ctx, session.platform, session.userId)
    if (!fish) {
      groupCounter.lastHumanAt = now
      groupCounter.lastFishId = null
      groupCounter.fishStreak = 0
      await incrementDaily(ctx, groupId, dayKey, 'humanTotal')
      return
    }

    const relation = await getRelation(ctx, fish.id, groupId)
    if (!relation || relation.status !== 'active') return
    if (!session.messageId) {
      logger.debug('skip fish message without messageId: group=%s fish=%d', groupId, fish.id)
      return
    }

    const key = `${session.platform}:${session.messageId}`
    if (state.seen.has(key)) return
    state.seen.add(key)

    const timestamp = new Date(session.timestamp ?? now).getTime()
    const createdAt = Number.isNaN(timestamp) ? new Date(now) : new Date(timestamp)
    const text = (session.content ?? '').slice(0, config.retention.textLimit)
    const imageCount = (session.elements ?? []).filter((element) => {
      return element.type === 'img' || element.type === 'image'
    }).length
    const quote = session.quote as any

    try {
      await ctx.database.create('fish_message', {
        fishId: fish.id,
        groupId,
        platform: session.platform,
        messageId: session.messageId,
        createdAt,
        text,
        imageCount,
        hasQuote: !!session.quote,
        quoteUserId: quote?.userId ?? quote?.user?.id ?? '',
        recalled: false,
        violationId: 0,
        minuteKey: minuteKeyOf(createdAt.getTime()),
        hourKey: hourKeyOf(createdAt.getTime()),
        dayKey,
      })
    } catch (error) {
      logger.warn('store fish message failed: %s', error instanceof Error ? error.message : String(error))
      return
    }

    const fishCounter = ensureFishCounter(state, `${groupId}:${fish.id}`, now, dayKey)
    fishCounter.minuteCount++
    fishCounter.hourCount++
    fishCounter.dayCount++
    fishCounter.lastMessageAt = now

    groupCounter.minuteCount++
    groupCounter.hourCount++
    groupCounter.dayCount++
    if (groupCounter.lastFishId === fish.id) {
      groupCounter.fishStreak++
    } else {
      groupCounter.lastFishId = fish.id
      groupCounter.fishStreak = 1
    }

    await incrementDaily(ctx, groupId, dayKey, 'fishTotal')
  })

  ctx.on('dispose', () => {
    state.fishCounters.clear()
    state.groupCounters.clear()
    state.seen.clear()
  })
}
