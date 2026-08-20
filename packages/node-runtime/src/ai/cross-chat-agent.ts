import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Api as PiApi, Message as PiMessage, Model as PiModel } from '@earendil-works/pi-ai'
import type { AIEntityRef } from '@openchatlab/shared-types'
import type { ThinkingLevel } from '@openchatlab/core'
import { DEFAULT_CONTEXT_COMPRESSION_CONFIG, checkAndCompress, createCompressionLlmAdapter } from './compression'
import { createAiTranslate } from './i18n'
import { initTokenizer } from './tokenizer'
import type { AIChatManager } from './chats'
import { AgentEventHandler, type AgentStreamChunk } from './agent/event-handler'
import { appendEntityRefsForModel } from './agent/history'
import { DEFAULT_MAX_TOOL_ROUNDS } from './agent/constants'
import { runAgentCore } from './agent/core'
import { buildPlanGuidance, createAnalysisPlanner, createPlanContentBlock } from './agent/planner'
import { createLlmRouteDecider, decideRequestRoute } from './agent/router'
import { formatAIError } from './error-formatter'

export interface CrossChatAgentLogger {
  info(category: string, message: string, data?: unknown): void
  warn(category: string, message: string, data?: unknown): void
  error(category: string, message: string, data?: unknown): void
}

export interface RunCrossChatAgentOptions {
  userMessage: string
  entityRefs?: AIEntityRef[]
  aiChatId: string
  historyLeafMessageId?: string | null
  locale?: string
  piModel: PiModel<PiApi>
  apiKey: string
  tools: AgentTool[]
  aiChatManager: AIChatManager
  onEvent: (event: AgentStreamChunk) => void
  abortSignal?: AbortSignal
  thinkingLevel?: ThinkingLevel
  logger?: CrossChatAgentLogger
}

export async function runCrossChatAgent(options: RunCrossChatAgentOptions): Promise<void> {
  const {
    userMessage,
    entityRefs,
    aiChatId,
    historyLeafMessageId,
    locale = 'zh-CN',
    piModel,
    apiKey,
    tools,
    aiChatManager,
    onEvent,
    abortSignal,
    thinkingLevel,
    logger,
  } = options
  await initTokenizer()
  logger?.info('CrossChatAgent', 'Cross-chat agent execution started', {
    aiChatId,
    entityRefCount: entityRefs?.length ?? 0,
    toolCount: tools.length,
  })
  const systemPrompt = buildCrossChatSystemPrompt(locale)
  const handler = new AgentEventHandler({ onChunk: onEvent, context: {}, systemPrompt })

  if (historyLeafMessageId === undefined) {
    const compressionResult = await checkAndCompress(
      aiChatId,
      DEFAULT_CONTEXT_COMPRESSION_CONFIG,
      systemPrompt,
      createCompressionLlmAdapter({
        piModel,
        apiKey,
        onCompressing: () => handler.emitStatus('compressing', []),
      }),
      aiChatManager,
      logger
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

  const history = aiChatManager.getHistoryForAgent(aiChatId, undefined, historyLeafMessageId)
  const modelUserMessage = appendEntityRefsForModel(userMessage, entityRefs)
  handler.emitStatus('preparing', [], { pendingUserMessage: modelUserMessage, force: true })

  let cachedMessages: PiMessage[] = []
  try {
    const routeInput = {
      userMessage: modelUserMessage,
      chatType: 'group' as const,
      locale,
      availableTools: tools.map((tool) => tool.name),
      availableCapabilities: [],
    }
    const routeDecision = await decideRequestRoute(routeInput, {
      llmRouter: createLlmRouteDecider({ piModel, apiKey, abortSignal }),
    })
    onEvent({ type: 'route', routeDecision })

    let effectiveSystemPrompt = systemPrompt
    if (routeDecision.route === 'planned_execution') {
      const planner = createAnalysisPlanner({
        piModel,
        apiKey,
        onPlanDelta: (delta) => onEvent({ type: 'plan_delta', planDelta: delta }),
        onThinkingDelta: (delta) => onEvent({ type: 'think', content: delta, thinkTag: 'thinking' }),
        onThinkingEnd: (durationMs) =>
          onEvent({ type: 'think', content: '', thinkTag: 'thinking', thinkDurationMs: durationMs }),
        onValidationDelta: (delta) => onEvent({ type: 'think', content: delta, thinkTag: 'plan_validation' }),
        onValidationEnd: (durationMs) =>
          onEvent({ type: 'think', content: '', thinkTag: 'plan_validation', thinkDurationMs: durationMs }),
      })
      const plan = await planner(routeInput, abortSignal)
      if (plan) {
        onEvent({ type: 'plan', plan: createPlanContentBlock(plan) })
        effectiveSystemPrompt = `${systemPrompt}\n\n${buildPlanGuidance(plan)}`
      } else {
        onEvent({ type: 'plan_skipped' })
      }
    }

    const result = await runAgentCore({
      piModel,
      apiKey,
      systemPrompt: effectiveSystemPrompt,
      tools,
      history,
      userMessage: modelUserMessage,
      maxToolRounds: DEFAULT_MAX_TOOL_ROUNDS,
      abortSignal,
      providerSessionId: aiChatId,
      steerMessage: createAiTranslate(locale)('ai.agent.answerWithoutTools'),
      thinkingLevel,
      onConvertToLlm: (messages) => {
        cachedMessages = messages as PiMessage[]
      },
      onEvent: (event) => handler.handleCoreEvent(event, cachedMessages),
      onDebugContext: (messages) => {
        try {
          aiChatManager.setPendingDebugContext(aiChatId, JSON.stringify(messages, null, 2))
        } catch {
          // Debug context is best-effort.
        }
      },
    })
    if (result.error) {
      onEvent({ type: 'error', error: { name: 'AgentError', message: formatAIError(result.error) } })
    }
    handler.emitStatus('completed', cachedMessages, { force: true })
    logger?.info('CrossChatAgent', 'Cross-chat agent execution completed', {
      aiChatId,
      toolRounds: result.toolRounds,
      toolsUsed: result.toolsUsed.length,
    })
    onEvent({ type: 'done', isFinished: true, usage: result.usage })
  } catch (error) {
    logger?.error('CrossChatAgent', 'Cross-chat agent execution failed', error)
    handler.emitStatus('error', cachedMessages, { force: true })
    onEvent({ type: 'error', error: { name: 'AgentError', message: formatAIError(error) } })
    onEvent({ type: 'done', isFinished: true, usage: handler.cloneUsage() })
  }
}

export function buildCrossChatSystemPrompt(locale = 'zh-CN'): string {
  if (locale.startsWith('zh')) {
    return `你是 ChatLab 的跨对话分析助手。你可以按用户当前问题，在其本地聊天数据库中按需检索多个联系人和群聊。

数据与范围规则：
- 用户已授权你查询全部本地聊天数据，但只能为回答当前问题按需调用工具，禁止无目的遍历。
- <chatlab_entity_refs> 是界面选择器写入的稳定实体引用。涉及这些实体时，先调用 resolve_chat_entities；禁止按显示名猜测联系人身份。
- 对话历史中的实体引用只帮助理解上下文，不构成永久锁定范围。每一轮根据用户语义决定继续原对象、切换对象或执行全局发现。
- 联系人默认覆盖其实际参与的私聊和群聊。多个对象既可能是交集、并集，也可能需要分别检索比较；以用户语义为准，不要机械套用一种集合规则。
- 只有用户明确表达“忘了和谁聊过”“在所有聊天里找”等全局发现意图时，才允许不带 scopes 调用 search_messages_globally。全局发现必须提供至少一个关键词。

工具与结论规则：
- 你只有 resolve_chat_entities、search_messages_globally、get_cross_chat_message_context、get_cross_chat_overview 四个工具。不要声称可以使用单会话 SQL、语义索引、技能、图表或热力图。
- search_messages_globally 是字面关键词 LIKE 检索，不是语义搜索。未知关键词时，先从用户问题提取少量高价值词；不要无限穷举。
- 比较联系人或群聊时，优先分别给出概览并检索有来源的证据。需要理解命中消息时，用 session_id + message_id 获取上下文。
- 工具返回 coverage 和 truncated。覆盖不完整或被截断时必须明确说明抽样范围，禁止把样本表述成全量结论。
- 引用证据时说明来源会话；不要泄露工具未返回的信息，也不要编造联系人、群聊或消息。
- 如果问题不需要聊天数据，直接回答；如果现有四个工具不足，坦诚说明第一版能力边界。

你可以使用工具。如果需要你没有的信息，请调用提供的函数。`
  }

  return `You are ChatLab's cross-chat analysis assistant. You may query multiple contacts and group chats from the user's local chat databases as needed for the current question.

Data and scope rules:
- The user authorizes access to all local chat data, but you must query only what is needed for the current question and never crawl without purpose.
- <chatlab_entity_refs> contains stable references selected in the UI. Resolve them with resolve_chat_entities before use; never identify a person by display-name matching.
- Entity references in history provide conversational context, not a permanently locked scope. Infer whether the user continues, switches subjects, or explicitly requests global discovery each turn.
- A contact normally covers the private and group sessions they actually participate in. Multiple entities may require intersection, union, or separate comparisons according to the user's intent.
- Call search_messages_globally without scopes only for explicit global discovery such as "I forgot who I discussed this with". Global discovery always requires at least one keyword.

Tool and conclusion rules:
- You only have resolve_chat_entities, search_messages_globally, get_cross_chat_message_context, and get_cross_chat_overview. Do not claim access to session SQL, semantic search, skills, charts, or heatmaps.
- Global search is literal LIKE keyword search, not semantic retrieval. Use a small set of high-value terms and do not brute-force unlimited guesses.
- For comparisons, prefer separate overviews and source-backed evidence. Expand a hit with session_id plus message_id when context is needed.
- Respect coverage and truncated fields. State incomplete coverage or sampling explicitly and never present a sample as exhaustive.
- Name the source session when citing evidence. Never invent people, sessions, or messages.
- Answer directly when no chat data is needed. If the four tools are insufficient, explain the first-version limitation honestly.

You have access to tools. If you need information you don't have, use the provided functions.`
}
