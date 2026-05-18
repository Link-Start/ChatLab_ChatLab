/**
 * 服务端 Agent
 *
 * 使用 @openchatlab/node-runtime 的 runAgentCore 编排对话流程，
 * 通过 AgentEventHandler 输出与 Electron 端一致的流式事件。
 */

import {
  runAgentCore,
  completeSimple,
  checkAndCompress,
  buildSystemPrompt,
  createAiTranslate,
  AgentEventHandler,
  type AgentStreamChunk,
  type PiMessage,
  type SimpleHistoryMessage,
  type AIConversationManager,
  type CompressionConfig,
  type CompressionLlmAdapter,
  type PiTextContent,
  type AgentTool,
  type DataSnapshot,
  type OwnerInfo,
  type MentionedMember,
} from '@openchatlab/node-runtime'

import { getDefaultAssistantConfig, buildPiModel } from './llm-config'
import { getServerAiLogger } from './logger'

export type { AgentStreamChunk }

export interface RunAgentOptions {
  userMessage: string
  conversationId: string
  chatType?: 'group' | 'private'
  locale?: string
  assistantSystemPrompt?: string
  skillMenu?: string | null
  compressionConfig?: CompressionConfig
  tools?: AgentTool[]
  aiDataDir: string
  convManager: AIConversationManager
  onEvent: (event: AgentStreamChunk) => void
  abortSignal?: AbortSignal
  ownerInfo?: OwnerInfo
  mentionedMembers?: MentionedMember[]
  dataSnapshot?: DataSnapshot
}

/**
 * Format AI errors with user-friendly messages (mirrors Electron's formatAIError)
 */
function formatAIError(error: unknown): string {
  const candidates: unknown[] = []
  if (error) candidates.push(error)

  const errorObj = error as { lastError?: unknown; errors?: unknown[] }
  if (errorObj?.lastError) candidates.push(errorObj.lastError)
  if (Array.isArray(errorObj?.errors)) candidates.push(...errorObj.errors)

  let rawMessage = ''
  let statusCode: number | undefined
  let retrySeconds: number | undefined

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      if (!rawMessage && typeof candidate === 'string') rawMessage = candidate
      continue
    }

    const record = candidate as Record<string, unknown>
    if (typeof record.statusCode === 'number') statusCode = record.statusCode
    if (!rawMessage && typeof record.message === 'string') rawMessage = record.message

    if (!rawMessage && record.data && typeof record.data === 'object') {
      const data = record.data as { error?: { message?: string } }
      if (data.error?.message) rawMessage = data.error.message
    }

    if (record.responseBody && typeof record.responseBody === 'string') {
      try {
        const parsed = JSON.parse(record.responseBody) as { error?: { message?: string } }
        if (!rawMessage && parsed.error?.message) rawMessage = parsed.error.message
      } catch {
        if (!rawMessage) rawMessage = record.responseBody
      }
    }

    if (rawMessage) {
      const retryMatch = rawMessage.match(/retry in ([0-9.]+)s/i)
      if (retryMatch) retrySeconds = Math.ceil(Number(retryMatch[1]))
    }
  }

  const fallbackMessage = rawMessage || String(error)
  const lowerMessage = fallbackMessage.toLowerCase()

  if (statusCode === 429 || lowerMessage.includes('quota') || lowerMessage.includes('resource_exhausted')) {
    return retrySeconds
      ? `API quota exhausted, please retry after ${retrySeconds}s or upgrade your quota.`
      : `API quota exhausted, please retry later or upgrade your quota.`
  }

  if (
    statusCode === 403 &&
    (lowerMessage.includes('quota') || lowerMessage.includes('not enough') || lowerMessage.includes('insufficient'))
  ) {
    return `API rejected the request due to insufficient quota or balance.`
  }

  if (statusCode === 503 || lowerMessage.includes('overloaded') || lowerMessage.includes('unavailable')) {
    return `Model is overloaded, please retry later.`
  }

  if (fallbackMessage.length > 300) {
    return `${fallbackMessage.slice(0, 300)}...`
  }

  return fallbackMessage
}

export async function runServerAgent(options: RunAgentOptions): Promise<void> {
  const {
    userMessage,
    conversationId,
    chatType = 'group',
    locale = 'zh-CN',
    assistantSystemPrompt,
    skillMenu,
    compressionConfig,
    tools = [],
    aiDataDir,
    convManager,
    onEvent,
    abortSignal,
    ownerInfo,
    mentionedMembers,
    dataSnapshot,
  } = options

  const aiLogger = getServerAiLogger()

  const llmConfig = getDefaultAssistantConfig(aiDataDir)
  if (!llmConfig) {
    onEvent({ type: 'error', error: { name: 'ConfigError', message: 'LLM service not configured' } })
    onEvent({ type: 'done', isFinished: true })
    return
  }

  const piModel = buildPiModel(llmConfig)
  const t = createAiTranslate(locale)

  let skillCtx: { skillDef?: { name: string; prompt: string }; skillMenu?: string } | undefined
  if (skillMenu) {
    skillCtx = { skillMenu }
  }

  const systemPrompt = buildSystemPrompt({
    t,
    chatType,
    assistantSystemPrompt,
    ownerInfo,
    locale,
    skillCtx,
    mentionedMembers,
    dataSnapshot,
  })

  const handler = new AgentEventHandler({
    onChunk: onEvent,
    context: {},
    systemPrompt,
  })

  if (compressionConfig?.enabled) {
    const llmAdapter: CompressionLlmAdapter = {
      contextWindow: piModel.contextWindow ?? 128000,
      compress: async (prompt: string, maxTokens: number) => {
        handler.emitStatus('compressing', [])
        try {
          const result = await completeSimple(
            piModel,
            {
              systemPrompt: undefined,
              messages: [{ role: 'user', content: [{ type: 'text', text: prompt }], timestamp: Date.now() }] as any,
            },
            { apiKey: llmConfig.apiKey, maxTokens }
          )
          const text = result.content
            .filter((item): item is PiTextContent => item.type === 'text')
            .map((item) => item.text)
            .join('')
          return text || null
        } catch {
          return null
        }
      },
    }
    const compressionResult = await checkAndCompress(
      conversationId,
      compressionConfig,
      systemPrompt,
      llmAdapter,
      convManager,
      aiLogger ?? undefined
    )
    if (compressionResult.compressed) {
      onEvent({
        type: 'compression_done',
        compressionResult: {
          summaryContent: compressionResult.summaryContent ?? '',
          tokensBefore: compressionResult.tokensBefore ?? 0,
          tokensAfter: compressionResult.tokensAfter ?? 0,
          timestamp: Date.now(),
        },
      })
    }
  }

  if (abortSignal?.aborted) {
    handler.emitStatus('aborted', [], { force: true })
    onEvent({ type: 'done', isFinished: true, usage: handler.cloneUsage() })
    return
  }

  let history: SimpleHistoryMessage[] = []
  try {
    history = convManager.getHistoryForAgent(conversationId)
  } catch {
    // empty history on failure
  }

  handler.emitStatus('preparing', [], { pendingUserMessage: userMessage, force: true })

  const steerMessage = t('ai.agent.answerWithoutTools')
  let cachedMessages: PiMessage[] = []

  try {
    const result = await runAgentCore({
      piModel,
      apiKey: llmConfig.apiKey,
      systemPrompt,
      tools,
      history,
      userMessage,
      maxToolRounds: 5,
      abortSignal,
      steerMessage,
      onConvertToLlm: (filteredMessages) => {
        cachedMessages = filteredMessages as PiMessage[]
      },
      onEvent: (coreEvent) => handler.handleCoreEvent(coreEvent, cachedMessages),
      onDebugContext: (messages) => {
        try {
          convManager.setPendingDebugContext(conversationId, JSON.stringify(messages, null, 2))
        } catch {
          // silent
        }
      },
    })

    if (result.error) {
      const friendlyMessage = formatAIError(result.error)
      onEvent({ type: 'error', error: { name: 'AgentError', message: friendlyMessage } })
    }

    handler.emitStatus('completed', cachedMessages, { force: true })
    onEvent({ type: 'done', isFinished: true, usage: result.usage })
  } catch (error) {
    const friendlyMessage = formatAIError(error)
    aiLogger?.error('ServerAgent', 'Agent execution error', { error: String(error) })
    handler.emitStatus('error', cachedMessages, { force: true })
    onEvent({ type: 'error', error: { name: 'AgentError', message: friendlyMessage } })
    onEvent({ type: 'done', isFinished: true, usage: handler.cloneUsage() })
  }
}
