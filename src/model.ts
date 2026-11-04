import { Context } from 'koishi'

export interface Fish {
  id: number
  platform: string
  userId: string
  name: string
  ownerUserId: string
  ownerName: string
  createdBy: string
  createdAt: Date
}

export interface FishGroup {
  id: number
  fishId: number
  groupId: string
  platform: string
  status: 'active' | 'removed' | 'banned'
  nick: string
  mutedUntil: Date | null
  invitedBy: string
  joinedAt: Date
  firstSeenAt: Date | null
  bannedAt: Date | null
  banReason: string
}

export interface FishRequest {
  id: number
  groupId: string
  platform: string
  fishUserId: string
  fishName: string
  ownerUserId: string
  ownerName: string
  requestedBy: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  reviewedBy: string
  reviewedAt: Date | null
  note: string
}

export interface FishMessage {
  id: number
  fishId: number
  groupId: string
  platform: string
  messageId: string
  createdAt: Date
  text: string
  imageCount: number
  hasQuote: boolean
  quoteUserId: string
  recalled: boolean
  violationId: number
  minuteKey: number
  hourKey: number
  dayKey: number
}

export interface FishViolation {
  id: number
  fishId: number
  groupId: string
  episodeId: string
  createdAt: Date
  rule: string
  overLimitCount: number
  firstMessageId: string
  action: string
  actionResult: string
  points: number
  isEpisodeStart: boolean
  pardoned: boolean
}

export interface FishGroupPolicy {
  groupId: string
  platform: string
  enabled: boolean
  mode: 'dry-run' | 'recall-only' | 'enforce'
  fishAllowed: boolean
  banAtEvents: number
  eventTotal: number
  adminChannel: string
  updatedAt: Date
  updatedBy: string
}

export interface FishGroupDaily {
  id: number
  groupId: string
  date: number
  humanTotal: number
  fishTotal: number
  overLimit: number
  eventCount: number
}

export interface FishAuditLog {
  id: number
  groupId: string
  actorId: string
  action: string
  target: string
  detail: object
  createdAt: Date
}

declare module 'koishi' {
  interface Tables {
    fish: Fish
    fish_group: FishGroup
    fish_request: FishRequest
    fish_message: FishMessage
    fish_violation: FishViolation
    fish_group_policy: FishGroupPolicy
    fish_group_daily: FishGroupDaily
    fish_audit_log: FishAuditLog
  }
}

export function applyModel(ctx: Context) {
  ctx.model.extend('fish', {
    id: 'unsigned',
    platform: 'string(63)',
    userId: 'string(63)',
    name: 'string(63)',
    ownerUserId: 'string(63)',
    ownerName: 'string(63)',
    createdBy: 'string(63)',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    unique: [['platform', 'userId']],
  })

  ctx.model.extend('fish_group', {
    id: 'unsigned',
    fishId: 'unsigned',
    groupId: 'string(63)',
    platform: 'string(63)',
    status: 'string(15)',
    nick: 'string(63)',
    mutedUntil: 'timestamp',
    invitedBy: 'string(63)',
    joinedAt: 'timestamp',
    firstSeenAt: 'timestamp',
    bannedAt: 'timestamp',
    banReason: 'string(255)',
  }, {
    autoInc: true,
    unique: [['fishId', 'groupId']],
    indexes: [['groupId', 'status']],
  })

  ctx.model.extend('fish_request', {
    id: 'unsigned',
    groupId: 'string(63)',
    platform: 'string(63)',
    fishUserId: 'string(63)',
    fishName: 'string(63)',
    ownerUserId: 'string(63)',
    ownerName: 'string(63)',
    requestedBy: 'string(63)',
    status: 'string(15)',
    createdAt: 'timestamp',
    reviewedBy: 'string(63)',
    reviewedAt: 'timestamp',
    note: 'string(255)',
  }, {
    autoInc: true,
    indexes: [['groupId', 'status'], ['requestedBy']],
  })

  ctx.model.extend('fish_message', {
    id: 'unsigned',
    fishId: 'unsigned',
    groupId: 'string(63)',
    platform: 'string(63)',
    messageId: 'string(127)',
    createdAt: 'timestamp',
    text: 'text',
    imageCount: 'unsigned',
    hasQuote: 'boolean',
    quoteUserId: 'string(63)',
    recalled: 'boolean',
    violationId: 'unsigned',
    minuteKey: 'unsigned',
    hourKey: 'unsigned',
    dayKey: 'unsigned',
  }, {
    autoInc: true,
    unique: [['platform', 'messageId']],
    indexes: [['groupId', 'createdAt'], ['fishId', 'createdAt'], ['dayKey']],
  })

  ctx.model.extend('fish_violation', {
    id: 'unsigned',
    fishId: 'unsigned',
    groupId: 'string(63)',
    episodeId: 'string(127)',
    createdAt: 'timestamp',
    rule: 'string(31)',
    overLimitCount: 'unsigned',
    firstMessageId: 'string(127)',
    action: 'string(15)',
    actionResult: 'string(15)',
    points: 'unsigned',
    isEpisodeStart: 'boolean',
    pardoned: 'boolean',
  }, {
    autoInc: true,
    indexes: [['groupId', 'createdAt'], ['fishId', 'createdAt'], ['episodeId']],
  })

  ctx.model.extend('fish_group_policy', {
    groupId: 'string(63)',
    platform: 'string(63)',
    enabled: 'boolean',
    mode: 'string(15)',
    fishAllowed: 'boolean',
    banAtEvents: 'unsigned',
    eventTotal: 'unsigned',
    adminChannel: 'string(127)',
    updatedAt: 'timestamp',
    updatedBy: 'string(63)',
  }, {
    primary: 'groupId',
  })

  ctx.model.extend('fish_group_daily', {
    id: 'unsigned',
    groupId: 'string(63)',
    date: 'unsigned',
    humanTotal: 'unsigned',
    fishTotal: 'unsigned',
    overLimit: 'unsigned',
    eventCount: 'unsigned',
  }, {
    autoInc: true,
    unique: [['groupId', 'date']],
  })

  ctx.model.extend('fish_audit_log', {
    id: 'unsigned',
    groupId: 'string(63)',
    actorId: 'string(63)',
    action: 'string(31)',
    target: 'string(127)',
    detail: 'json',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    indexes: [['groupId', 'createdAt']],
  })
}
