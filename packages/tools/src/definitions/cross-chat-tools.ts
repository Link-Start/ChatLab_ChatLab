import type {
  AIEntityRef,
  CrossChatEvidencePayload,
  CrossChatMessageSource,
  CrossChatSearchScope,
} from '@openchatlab/shared-types'
import type { CrossChatToolExecutionContext, JsonSchema, ToolDefinition, ToolResult } from '../types'
import { parseExtendedTimeParams } from '../utils/time-params'
import { timeParamProperties } from '../utils/schemas'

const scopeItems = {
  type: 'object',
  properties: {
    sessionId: { type: 'string', description: 'Stable session ID returned by resolve_chat_entities' },
    memberIds: { type: 'array', items: { type: 'number' }, description: 'Local member IDs for this session' },
    label: { type: 'string', description: 'Human-readable scope label' },
  },
  required: ['sessionId'],
}

const resolveSchema: JsonSchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      description: 'Structured contact/session refs copied from <chatlab_entity_refs> in the user message or history',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['contact', 'session'] },
          contactKey: { type: 'string' },
          sessionId: { type: 'string' },
          displayName: { type: 'string' },
          sessionType: { type: 'string', enum: ['private', 'group'] },
        },
        required: ['type', 'displayName'],
      },
    },
  },
  required: ['entities'],
}

const searchSchema: JsonSchema = {
  type: 'object',
  properties: {
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exact substring keywords; at least one is required',
    },
    scopes: {
      type: 'array',
      description: 'Resolved session/member scopes. Omit only when the user clearly requested global discovery.',
      items: scopeItems,
    },
    match_mode: { type: 'string', enum: ['any', 'all'], description: 'Whether any or all keywords must match' },
    sort: { type: 'string', enum: ['asc', 'desc'], description: 'Timestamp order; defaults to newest first' },
    max_sessions: { type: 'number', description: 'Maximum sessions to scan' },
    max_evidence: { type: 'number', description: 'Maximum evidence messages returned' },
    max_wall_time_ms: { type: 'number', description: 'Maximum wall time for this scan' },
    ...timeParamProperties,
  },
  required: ['keywords'],
}

const contextSchema: JsonSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', description: 'Source session ID from cross-chat search evidence' },
    message_id: { type: 'number', description: 'Message ID inside that source session' },
    context_size: { type: 'number', description: 'Messages before and after the source message; defaults to 10' },
  },
  required: ['session_id', 'message_id'],
}

const overviewSchema: JsonSchema = {
  type: 'object',
  properties: {
    scopes: {
      type: 'array',
      description: 'Resolved session/member scopes to summarize separately',
      items: scopeItems,
    },
    max_sessions: { type: 'number', description: 'Maximum sessions to analyze' },
    max_wall_time_ms: { type: 'number', description: 'Maximum wall time for this analysis' },
  },
  required: ['scopes'],
}

function resolveHandler(params: Record<string, unknown>, context: CrossChatToolExecutionContext): ToolResult {
  const refs = parseEntityRefs(params.entities)
  const resolution = context.analysisService.resolveEntities(refs)
  return { content: JSON.stringify(resolution), data: resolution }
}

async function searchHandler(
  params: Record<string, unknown>,
  context: CrossChatToolExecutionContext
): Promise<ToolResult> {
  const timeFilter = parseExtendedTimeParams(params)
  const keywords = parseStringArray(params.keywords)
  const result = await context.analysisService.searchMessages(
    {
      keywords,
      scopes: params.scopes === undefined ? undefined : parseScopes(params.scopes),
      startTs: timeFilter?.startTs,
      endTs: timeFilter?.endTs,
      matchMode: params.match_mode === 'all' ? 'all' : 'any',
      sort: params.sort === 'asc' ? 'asc' : 'desc',
      maxSessions: parseOptionalNumber(params.max_sessions),
      maxEvidence: parseOptionalNumber(params.max_evidence),
      maxWallTimeMs: parseOptionalNumber(params.max_wall_time_ms),
    },
    {
      signal: context.abortSignal,
      onProgress: (progress) =>
        context.reportProgress?.({
          phase: 'searching',
          current: progress.processedSessions,
          total: progress.totalSessions,
        }),
    }
  )
  const safeMessages = await preprocessBySession(context, result.messages)
  const limited = limitMessagesToBudget(safeMessages, context.maxToolResultTokens)
  const coverage = {
    ...result.coverage,
    truncated: result.coverage.truncated || limited.truncated,
    truncatedReasons: limited.truncated
      ? [...new Set([...result.coverage.truncatedReasons, 'evidence_budget' as const])]
      : result.coverage.truncatedReasons,
  }
  const evidence: CrossChatEvidencePayload = {
    version: 1,
    query: keywords.join(' '),
    sources: limited.messages.map(toEvidenceSource),
    coverage,
  }
  const data = {
    totalMatches: result.totalMatches,
    returned: limited.messages.length,
    coverage,
    messages: limited.messages.map(toModelMessage),
    crossChatEvidence: evidence,
  }
  return { content: JSON.stringify(data), data }
}

async function contextHandler(
  params: Record<string, unknown>,
  context: CrossChatToolExecutionContext
): Promise<ToolResult> {
  const sessionId = requireString(params.session_id, 'session_id')
  const messageId = requireNumber(params.message_id, 'message_id')
  const contextSize = parseOptionalNumber(params.context_size)
  const result = context.analysisService.getMessageContext({ sessionId, messageId, contextSize })
  const safeMessages = await preprocessBySession(context, result.messages)
  const limited = limitMessagesToBudget(safeMessages, context.maxToolResultTokens)
  const data = {
    source: result.source,
    returned: limited.messages.length,
    truncated: limited.truncated,
    messages: limited.messages.map(toModelMessage),
  }
  return { content: JSON.stringify(data), data }
}

async function overviewHandler(
  params: Record<string, unknown>,
  context: CrossChatToolExecutionContext
): Promise<ToolResult> {
  const result = await context.analysisService.getOverview(
    {
      scopes: parseScopes(params.scopes),
      maxSessions: parseOptionalNumber(params.max_sessions),
      maxWallTimeMs: parseOptionalNumber(params.max_wall_time_ms),
    },
    {
      signal: context.abortSignal,
      onProgress: (progress) =>
        context.reportProgress?.({
          phase: 'analyzing',
          current: progress.processedSessions,
          total: progress.totalSessions,
        }),
    }
  )
  const data = {
    items: result.items.map(({ memberNames: _memberNames, ...item }) => item),
    coverage: result.coverage,
  }
  return { content: JSON.stringify(data), data }
}

export const resolveChatEntitiesTool: ToolDefinition<CrossChatToolExecutionContext> = {
  name: 'resolve_chat_entities',
  description:
    "Resolve structured contact/session references into exact source sessions and each database's local member IDs. Call this before scoped cross-chat search or overview. Never resolve people by display-name matching.",
  inputSchema: resolveSchema,
  handler: resolveHandler,
  category: 'core',
}

export const searchMessagesGloballyTool: ToolDefinition<CrossChatToolExecutionContext> = {
  name: 'search_messages_globally',
  description:
    'Search exact keywords across resolved contacts or sessions. Omit scopes only for an explicit global discovery request. Results include source session identity, coverage, and truncation status.',
  inputSchema: searchSchema,
  handler: searchHandler,
  category: 'core',
  truncationStrategy: 'keep_first',
}

export const getCrossChatMessageContextTool: ToolDefinition<CrossChatToolExecutionContext> = {
  name: 'get_cross_chat_message_context',
  description:
    'Load surrounding messages for one cross-chat evidence item. Both session_id and message_id are required because message IDs are only unique inside a session.',
  inputSchema: contextSchema,
  handler: contextHandler,
  category: 'core',
  truncationStrategy: 'keep_last',
}

export const getCrossChatOverviewTool: ToolDefinition<CrossChatToolExecutionContext> = {
  name: 'get_cross_chat_overview',
  description:
    'Get separate message-count and time-range overviews for resolved contact/session scopes. This is a basic comparison tool, not arbitrary SQL or single-chat deep analytics.',
  inputSchema: overviewSchema,
  handler: overviewHandler,
  category: 'core',
}

function parseEntityRefs(value: unknown): AIEntityRef[] {
  if (!Array.isArray(value)) throw new Error('entities must be an array')
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('each entity must be an object')
    const type = requireString(item.type, 'entity.type')
    const displayName = requireString(item.displayName, 'entity.displayName')
    if (type === 'contact') {
      return { type, contactKey: requireString(item.contactKey, 'entity.contactKey'), displayName }
    }
    if (type === 'session') {
      const sessionType = item.sessionType === 'private' ? 'private' : item.sessionType === 'group' ? 'group' : null
      if (!sessionType) throw new Error('entity.sessionType must be private or group')
      return { type, sessionId: requireString(item.sessionId, 'entity.sessionId'), displayName, sessionType }
    }
    throw new Error('entity.type must be contact or session')
  })
}

function parseScopes(value: unknown): CrossChatSearchScope[] {
  if (!Array.isArray(value)) throw new Error('scopes must be an array')
  return value.map((item) => {
    if (!isRecord(item)) throw new Error('each scope must be an object')
    return {
      sessionId: requireString(item.sessionId, 'scope.sessionId'),
      memberIds: item.memberIds === undefined ? undefined : parseNumberArray(item.memberIds),
      label: typeof item.label === 'string' ? item.label : undefined,
    }
  })
}

async function preprocessBySession(
  context: CrossChatToolExecutionContext,
  messages: CrossChatMessageSource[]
): Promise<CrossChatMessageSource[]> {
  const bySession = new Map<string, CrossChatMessageSource[]>()
  for (const message of messages) {
    const group = bySession.get(message.sessionId) ?? []
    group.push({ ...message })
    bySession.set(message.sessionId, group)
  }
  const safe: CrossChatMessageSource[] = []
  for (const [sessionId, group] of bySession) {
    const processed = await context.preprocessMessagesBySession(sessionId, group)
    safe.push(...processed.filter((message) => message.sessionId === sessionId))
  }
  return safe.sort((left, right) => right.timestamp - left.timestamp || right.messageId - left.messageId)
}

function limitMessagesToBudget(
  messages: CrossChatMessageSource[],
  maxToolResultTokens?: number
): { messages: CrossChatMessageSource[]; truncated: boolean } {
  const maxChars = maxToolResultTokens && maxToolResultTokens > 0 ? maxToolResultTokens * 4 : Number.POSITIVE_INFINITY
  let usedChars = 0
  const limited: CrossChatMessageSource[] = []
  for (const message of messages) {
    const content = message.content.length > 500 ? `${message.content.slice(0, 500)}…` : message.content
    const next = { ...message, content }
    const estimatedChars = JSON.stringify(toModelMessage(next)).length
    if (usedChars + estimatedChars > maxChars) break
    limited.push(next)
    usedChars += estimatedChars
  }
  return { messages: limited, truncated: limited.length < messages.length }
}

function toModelMessage(message: CrossChatMessageSource): Record<string, unknown> {
  return {
    sessionId: message.sessionId,
    sessionName: message.sessionName,
    sessionType: message.sessionType,
    messageId: message.messageId,
    senderId: message.senderId,
    senderName: message.senderName,
    timestamp: message.timestamp,
    content: message.content,
  }
}

function toEvidenceSource(message: CrossChatMessageSource): CrossChatEvidencePayload['sources'][number] {
  return {
    sessionId: message.sessionId,
    sessionName: message.sessionName,
    sessionType: message.sessionType,
    platform: message.platform,
    messageId: message.messageId,
    senderName: message.senderName,
    timestamp: message.timestamp,
    snippet: message.content,
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('keywords must be an array')
  return value.map((item) => requireString(item, 'keyword')).filter(Boolean)
}

function parseNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('memberIds must be an array')
  return value.map((item) => requireNumber(item, 'memberId'))
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a number`)
  return value
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
