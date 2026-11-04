import { Schema } from 'koishi'

export type Mode = 'dry-run' | 'recall-only' | 'enforce'

export interface QuotaConfig {
  rpm: number
  interval: number
  hourly: number
  daily: number
  groupRpm: number
  groupHourly: number
  groupDaily: number
  nightMute: boolean
}

export interface RulesConfig {
  chainGuard: boolean
  sameFishStreak: {
    enabled: boolean
    limit: number
  }
  burstMuteThreshold: number
  eventWindowMinutes: number
}

export interface PenaltiesConfig {
  twelveHoursAt: number
  kickAt: number
  banAt: number
}

export interface GroupRedLineConfig {
  enabled: boolean
  banAtEvents: number
  autoBan: boolean
}

export interface NoticesConfig {
  groupEvents: string[]
  approvalDmFallback: boolean
}

export interface ReportsConfig {
  daily: boolean
  dailyTime: string
  weekly: boolean
  weeklyDay: number
  weeklyTime: string
}

export interface RetentionConfig {
  rawMessageDays: number
  textLimit: number
  aggregateDays: number
}

export interface Config {
  enabled: boolean
  mode: Mode
  timezone: string
  registration: 'admin' | 'member'
  adminUsers: string[]
  quota: QuotaConfig
  rules: RulesConfig
  penalties: PenaltiesConfig
  groupRedLine: GroupRedLineConfig
  notices: NoticesConfig
  reports: ReportsConfig
  retention: RetentionConfig
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true).description('启用插件'),
  mode: Schema.union([
    Schema.const('dry-run').description('只记录，不执法'),
    Schema.const('recall-only').description('保留字段；v0.1.0 预览版未实现'),
    Schema.const('enforce').description('保留字段；v0.1.0 预览版未实现'),
  ]).default('dry-run').description('v0.1.0 预览版只支持 dry-run；其他值保留给后续版本'),
  timezone: Schema.string().default('Asia/Shanghai').description('统计与时段使用的时区'),
  registration: Schema.union([
    Schema.const('admin').description('只允许群主/管理员直接登记'),
    Schema.const('member').description('普通成员可提交申请，需管理员审批'),
  ]).default('admin').description('登记权限'),
  adminUsers: Schema.array(Schema.string()).default([]).description('私聊/管理员频道里的超管 QQ'),
  quota: Schema.object({
    rpm: Schema.natural().default(2).description('每鱼每分钟条数'),
    interval: Schema.natural().default(30).description('每鱼两条消息之间的最小间隔（秒）'),
    hourly: Schema.natural().default(15).description('每鱼每小时条数'),
    daily: Schema.natural().default(60).description('每鱼每天条数'),
    groupRpm: Schema.natural().default(6).description('全群每分钟条数'),
    groupHourly: Schema.natural().default(40).description('全群每小时条数'),
    groupDaily: Schema.natural().default(150).description('全群每天条数'),
    nightMute: Schema.boolean().default(false).description('00:00–08:00 全群鱼静音'),
  }).description('配额'),
  rules: Schema.object({
    chainGuard: Schema.boolean().default(true).description('不同鱼不能直接接话（开关）'),
    sameFishStreak: Schema.object({
      enabled: Schema.boolean().default(false).description('启用同鱼连发限制；默认关闭，避免与 RPM 冲突'),
      limit: Schema.natural().default(2).description('同一只鱼最多连发条数'),
    }).description('同鱼连发'),
    burstMuteThreshold: Schema.natural().default(10).description('单事件内超限多少条立即 12h 禁言；0 = 关闭'),
    eventWindowMinutes: Schema.natural().default(10).description('违规事件窗口（分钟）'),
  }).description('行为规则'),
  penalties: Schema.object({
    twelveHoursAt: Schema.natural().default(3).description('24h 内第几次事件触发 12h 禁言'),
    kickAt: Schema.natural().default(6).description('30d 内累计几次事件踢出'),
    banAt: Schema.natural().default(12).description('30d 内累计几次事件永久禁入'),
  }).description('鱼级处罚'),
  groupRedLine: Schema.object({
    enabled: Schema.boolean().default(true).description('启用群级红线'),
    banAtEvents: Schema.natural().default(15).description('全群累计多少次违规事件后停鱼'),
    autoBan: Schema.boolean().default(true).description('达到红线后自动全群停鱼'),
  }).description('群级红线'),
  notices: Schema.object({
    groupEvents: Schema.array(Schema.string()).default(['kick', 'groupBan']).description('允许发到群里的执法公告类型'),
    approvalDmFallback: Schema.boolean().default(true).description('管理员频道不可用时，私聊 adminUsers 发送审批申请'),
  }).description('公告'),
  reports: Schema.object({
    daily: Schema.boolean().default(true).description('每天发送日报'),
    dailyTime: Schema.string().default('09:00').description('日报时间 HH:mm'),
    weekly: Schema.boolean().default(true).description('每周发送周报'),
    weeklyDay: Schema.natural().min(1).max(7).default(1).description('周报星期几（1=周一）'),
    weeklyTime: Schema.string().default('09:00').description('周报时间 HH:mm'),
  }).description('报表'),
  retention: Schema.object({
    rawMessageDays: Schema.natural().default(0).description('原始消息保留天数；0 = 永久'),
    textLimit: Schema.natural().default(4096).description('单条消息文本截断字节数'),
    aggregateDays: Schema.natural().default(0).description('聚合数据保留天数；0 = 永久'),
  }).description('数据保留'),
})
