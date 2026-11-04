import { Context, Session } from 'koishi'
import { Config } from './config'

export function isGroupAdmin(session: Session) {
  const roles = session.author?.roles?.map((role) => role.id) ?? []
  return roles.includes('owner') || roles.includes('admin')
}

export function isSuperAdmin(session: Session, config: Config) {
  if (session.userId && config.adminUsers.includes(session.userId)) return true
  return session.author?.roles?.some((role) => role.id === 'owner') ?? false
}

export function isAdmin(session: Session, config: Config) {
  if (isGroupAdmin(session) || isSuperAdmin(session, config)) return true
  const authority = (session.user as { authority?: number } | undefined)?.authority ?? 0
  return authority >= 3
}

export function resolveGroupId(session: Session, options?: { group?: string }) {
  if (options?.group) return String(options.group)
  return session.guildId ?? null
}

export function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function maskId(id?: string | null) {
  if (!id) return ''
  return id.length <= 4 ? '***' : `***${id.slice(-4)}`
}

export interface ResolvedTarget {
  platform: string
  userId: string
}

export function getAtTargets(session: Session): ResolvedTarget[] {
  return (session.elements ?? [])
    .filter((element) => element.type === 'at' && element.attrs?.id)
    .map((element) => String(element.attrs.id))
    .filter((id) => id !== 'all' && id !== session.selfId)
    .map((userId) => ({ platform: session.platform, userId }))
}

export function resolveTarget(session: Session, target?: string): ResolvedTarget | null {
  const raw = target?.trim()

  if (raw) {
    const atMatch = raw.match(/^<at\s+[^>]*id="([^"]+)"/)
    if (atMatch) {
      return atMatch[1] === 'all' ? null : { platform: session.platform, userId: atMatch[1] }
    }

    if (raw.startsWith('@')) {
      const value = raw.slice(1)
      if (value.includes(':')) {
        const [platform, userId] = value.split(':', 2)
        return userId ? { platform, userId } : null
      }
      return value === 'all' ? null : { platform: session.platform, userId: value }
    }

    if (raw.includes(':')) {
      const [platform, userId] = raw.split(':', 2)
      return userId ? { platform, userId } : null
    }

    if (/^\d{5,12}$/.test(raw)) {
      return { platform: session.platform, userId: raw }
    }

    return null
  }

  return getAtTargets(session)[0] ?? null
}

export function getBot(ctx: Context, platform?: string) {
  return ctx.bots.find((bot) => !platform || bot.platform === platform) ?? ctx.bots[0]
}
