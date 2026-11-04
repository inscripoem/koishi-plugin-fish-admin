import { Context, Session } from 'koishi'
import { Config } from './config'
import { Fish, FishGroup, FishGroupPolicy, FishViolation } from './model'

export async function ensurePolicy(
  ctx: Context,
  groupId: string,
  platform: string,
  config: Config,
  actorId = '',
): Promise<FishGroupPolicy> {
  const [existing] = await ctx.database.get('fish_group_policy', { groupId })
  if (existing) {
    if (existing.mode !== 'dry-run') {
      await ctx.database.set('fish_group_policy', { groupId }, {
        mode: 'dry-run',
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      return { ...existing, mode: 'dry-run' }
    }
    return existing
  }

  const row: FishGroupPolicy = {
    groupId,
    platform,
    enabled: true,
    // v0.1.0 preview: only observation is implemented.
    mode: 'dry-run',
    fishAllowed: true,
    banAtEvents: config.groupRedLine.banAtEvents,
    eventTotal: 0,
    adminChannel: '',
    updatedAt: new Date(),
    updatedBy: actorId,
  }

  try {
    await ctx.database.create('fish_group_policy', row)
  } catch {
    // concurrent creation; re-read below
  }

  const [created] = await ctx.database.get('fish_group_policy', { groupId })
  return created
}

export async function writeAudit(
  ctx: Context,
  groupId: string,
  actorId: string,
  action: string,
  target: string,
  detail: object = {},
) {
  await ctx.database.create('fish_audit_log', {
    groupId,
    actorId,
    action,
    target,
    detail,
    createdAt: new Date(),
  })
}

export async function getFish(ctx: Context, platform: string, userId: string): Promise<Fish | undefined> {
  const [fish] = await ctx.database.get('fish', { platform, userId })
  return fish
}

export async function getMemberInfo(session: Session, groupId: string, userId: string) {
  try {
    const member = await (session.bot as any).getGuildMember(groupId, userId)
    const name = member?.user?.name || member?.nick || userId
    const nick = member?.nick || name
    return { name, nick }
  } catch {
    return { name: userId, nick: userId }
  }
}

export async function getRelation(ctx: Context, fishId: number, groupId: string): Promise<FishGroup | undefined> {
  const [relation] = await ctx.database.get('fish_group', { fishId, groupId })
  return relation
}

export async function registerFish(
  ctx: Context,
  session: Session,
  groupId: string,
  platform: string,
  userId: string,
  fishName: string,
  nick: string,
  ownerUserId: string,
  ownerName: string,
) {
  // Throws if the user is not in the target group.
  await (session.bot as any).getGuildMember(groupId, userId)

  let fish = await getFish(ctx, platform, userId)
  if (!fish) {
    fish = await ctx.database.create('fish', {
      platform,
      userId,
      name: fishName,
      ownerUserId,
      ownerName,
      createdBy: session.userId ?? '',
      createdAt: new Date(),
    })
  } else {
    await ctx.database.set('fish', { id: fish.id }, { name: fishName, ownerUserId, ownerName })
    fish = { ...fish, name: fishName, ownerUserId, ownerName }
  }

  let relation = await getRelation(ctx, fish.id, groupId)
  let created = false

  if (!relation) {
    relation = await ctx.database.create('fish_group', {
      fishId: fish.id,
      groupId,
      platform,
      status: 'active',
      nick,
      mutedUntil: null,
      invitedBy: session.userId ?? '',
      joinedAt: new Date(),
      firstSeenAt: null,
      bannedAt: null,
      banReason: '',
    })
    created = true
  } else {
    if (relation.status === 'banned') {
      throw new Error('该 QQ 在本群已被永久禁入，先执行 fish.unban。')
    }
    await ctx.database.set('fish_group', { id: relation.id }, {
      status: 'active',
      nick,
      mutedUntil: null,
      bannedAt: null,
      banReason: '',
    })
    relation = { ...relation, status: 'active', nick, mutedUntil: null, bannedAt: null, banReason: '' }
  }

  return { fish, relation, created }
}

export async function unregisterFish(ctx: Context, platform: string, groupId: string, qq: string) {
  const fish = await getFish(ctx, platform, qq)
  if (!fish) return null
  const relation = await getRelation(ctx, fish.id, groupId)
  if (!relation) return null

  await ctx.database.set('fish_group', { id: relation.id }, {
    status: 'removed',
    mutedUntil: null,
  })
  return { fish, relation: { ...relation, status: 'removed', mutedUntil: null } }
}

export function sumPoints(violations: FishViolation[], since: number) {
  return violations
    .filter((violation) => !violation.pardoned && new Date(violation.createdAt).getTime() >= since)
    .reduce((sum, violation) => sum + violation.points, 0)
}

export function getDayKey(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Number(`${values.year}${values.month}${values.day}`)
}
