import { generateMessageKey, getSessionMeta, type DatabaseAdapter } from '@openchatlab/core'
import { streamParseFile, type ParsedMeta } from '@openchatlab/parser'
import { MessageType } from '@openchatlab/shared-types'
import { normalizeImportTimestamp } from './incremental-importer'
import type { ImportProgressCallback } from './streaming-importer'

const MATCH_WINDOW_SIZE = 5

export type AutoImportMatchMethod = 'source-session-id' | 'stable-id' | 'trailing-messages'

export type AutoImportDecision =
  | { action: 'incremental'; sessionId: string; matchedBy: AutoImportMatchMethod }
  | { action: 'create'; reason: 'no-match' | 'ambiguous' }

export interface AutoImportMatcherDeps {
  listSessionIds(): string[]
  openReadonly(sessionId: string): DatabaseAdapter
  onProgress?: ImportProgressCallback
}

function buildPrivateIdentity(ownerId: string | null | undefined, memberIds: Iterable<string>): string | null {
  if (!ownerId) return null
  const ids = [...new Set(memberIds)].filter((id) => id && id.toLowerCase() !== 'system').sort()
  return ids.length > 0 ? `${ownerId}\0${ids.join('\0')}` : null
}

function isBusinessMessage(type: number, content: string | null): boolean {
  return type !== MessageType.SYSTEM && type !== MessageType.RECALL && Boolean(content?.trim())
}

function addMessageWindow(
  recentKeys: string[],
  windows: Set<string>,
  message: { timestamp: unknown; senderPlatformId: string; type: number; content: string | null }
): void {
  if (!message.senderPlatformId || !isBusinessMessage(message.type, message.content)) return
  const timestamp = normalizeImportTimestamp(message.timestamp)
  if (timestamp === null) return

  recentKeys.push(generateMessageKey(timestamp, message.senderPlatformId, message.content))
  if (recentKeys.length > MATCH_WINDOW_SIZE) recentKeys.shift()
  if (recentKeys.length === MATCH_WINDOW_SIZE) windows.add(recentKeys.join(''))
}

export async function resolveAutoImportTarget(
  filePath: string,
  deps: AutoImportMatcherDeps,
  formatOptions?: Record<string, unknown>
): Promise<AutoImportDecision> {
  let sourceMeta: ParsedMeta | null = null
  const sourceMemberIds = new Set<string>()
  const sourceWindows = new Set<string>()
  const recentSourceKeys: string[] = []
  const { formatId, ...parserOptions } = formatOptions ?? {}

  await streamParseFile(
    filePath,
    {
      formatOptions: parserOptions,
      onProgress: deps.onProgress ?? (() => {}),
      onMeta: (meta) => {
        sourceMeta = meta
      },
      onMembers: (members) => {
        for (const member of members) sourceMemberIds.add(member.platformId)
      },
      onMessageBatch: (messages) => {
        for (const message of messages) {
          sourceMemberIds.add(message.senderPlatformId)
          addMessageWindow(recentSourceKeys, sourceWindows, message)
        }
      },
    },
    typeof formatId === 'string' ? formatId : undefined
  )

  if (!sourceMeta) throw new Error('Import source did not provide metadata')

  const meta = sourceMeta as ParsedMeta
  const privateIdentity = meta.type === 'private' ? buildPrivateIdentity(meta.ownerId, sourceMemberIds) : null
  const hasStableIdentity = Boolean(meta.groupId || privateIdentity)

  const stableMatches: string[] = []
  const trailingMatches: string[] = []
  for (const sessionId of deps.listSessionIds()) {
    const db = deps.openReadonly(sessionId)
    try {
      const candidate = getSessionMeta(db)
      if (candidate?.platform !== meta.platform || candidate.type !== meta.type) continue

      const groupMatches = Boolean(meta.groupId && candidate.groupId === meta.groupId)
      const memberRows = privateIdentity
        ? (db.prepare("SELECT platform_id FROM member WHERE LOWER(platform_id) != 'system'").all() as Array<{
            platform_id: string
          }>)
        : []
      const candidatePrivateIdentity = privateIdentity
        ? buildPrivateIdentity(
            candidate.ownerId,
            memberRows.map((row) => row.platform_id)
          )
        : null

      if (groupMatches || (privateIdentity && candidatePrivateIdentity === privateIdentity)) {
        stableMatches.push(sessionId)
      }

      if (!hasStableIdentity && sourceWindows.size > 0) {
        const rows = db
          .prepare(
            `SELECT msg.ts, member.platform_id, msg.type, msg.content
             FROM message msg
             JOIN member ON member.id = msg.sender_id
             WHERE msg.type NOT IN (?, ?)
               AND NULLIF(TRIM(msg.content), '') IS NOT NULL
             ORDER BY msg.ts DESC, msg.id DESC
             LIMIT ?`
          )
          .all(MessageType.SYSTEM, MessageType.RECALL, MATCH_WINDOW_SIZE) as Array<{
          ts: number
          platform_id: string
          type: number
          content: string
        }>

        if (rows.length === MATCH_WINDOW_SIZE) {
          const signature = rows
            .reverse()
            .map((row) => generateMessageKey(row.ts, row.platform_id, row.content))
            .join('')
          if (sourceWindows.has(signature)) trailingMatches.push(sessionId)
        }
      }
    } finally {
      db.close()
    }
  }

  if (hasStableIdentity) {
    if (meta.sourceSessionId && stableMatches.includes(meta.sourceSessionId)) {
      return { action: 'incremental', sessionId: meta.sourceSessionId, matchedBy: 'source-session-id' }
    }
    if (stableMatches.length === 1) {
      return { action: 'incremental', sessionId: stableMatches[0], matchedBy: 'stable-id' }
    }
    return { action: 'create', reason: stableMatches.length > 1 ? 'ambiguous' : 'no-match' }
  }
  if (meta.sourceSessionId && trailingMatches.includes(meta.sourceSessionId)) {
    return { action: 'incremental', sessionId: meta.sourceSessionId, matchedBy: 'source-session-id' }
  }
  if (trailingMatches.length === 1) {
    return { action: 'incremental', sessionId: trailingMatches[0], matchedBy: 'trailing-messages' }
  }
  return { action: 'create', reason: trailingMatches.length > 1 ? 'ambiguous' : 'no-match' }
}
