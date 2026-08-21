import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

test('restores the requested or latest AI chat only when it belongs to the current session', async (t) => {
  const aiService = {
    getAIChat: async (id: string) =>
      id === 'chat-one' || id === 'chat-latest'
        ? {
            id,
            sessionId: id === 'chat-one' ? 'session-one' : 'session-three',
            kind: 'session' as const,
            title: 'Saved chat',
            assistantId: 'assistant-one',
            createdAt: 1,
            updatedAt: 1,
          }
        : null,
    getAIChats: async (sessionId: string) =>
      sessionId === 'session-three'
        ? [
            {
              id: 'chat-latest',
              sessionId,
              kind: 'session' as const,
              title: 'Latest chat',
              assistantId: 'assistant-one',
              createdAt: 2,
              updatedAt: 2,
            },
          ]
        : [],
    getMessages: async () => [
      {
        id: 'message-one',
        aiChatId: 'chat-one',
        role: 'assistant' as const,
        content: 'Saved answer',
        timestamp: 1,
      },
    ],
    getAIChatTokenUsage: async () => ({
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    }),
  }
  const assistantStore = {
    isLoaded: true,
    loadAssistants: async () => undefined,
    selectAssistant: () => undefined,
    clearSelection: () => undefined,
  }

  await Promise.all([
    t.mock.module('@/stores/session', {
      namedExports: { useSessionStore: () => ({ sessions: [] }) },
    }),
    t.mock.module('@/stores/settings', {
      namedExports: { useSettingsStore: () => ({ aiPreprocessConfig: {} }) },
    }),
    t.mock.module('@/stores/assistant', {
      namedExports: { useAssistantStore: () => assistantStore },
    }),
    t.mock.module('@/stores/skill', {
      namedExports: { useSkillStore: () => ({ activeSkill: ref(null) }) },
    }),
    t.mock.module('@/stores/llm', {
      namedExports: { useLLMStore: () => ({}) },
    }),
    t.mock.module('@/services', {
      namedExports: {
        useAIService: () => aiService,
        useDataService: () => ({}),
        useLLMService: () => ({}),
      },
    }),
    t.mock.module('@/services/ai-stream/service', {
      namedExports: { useAgentStreamService: () => ({}) },
    }),
  ])

  setActivePinia(createPinia())
  const { useAIChatStore } = await import('./aiChat')
  const store = useAIChatStore()

  const first = store.ensureSessionState({
    sessionId: 'session-one',
    sessionName: 'First session',
    chatType: 'private',
    locale: 'zh-CN',
  })
  await store.resetToSelectorOnEnter(first.chatKey, 'chat-one')

  assert.equal(first.state.currentAIChatId, 'chat-one')
  assert.equal(first.state.messages[0]?.content, 'Saved answer')

  const second = store.ensureSessionState({
    sessionId: 'session-two',
    sessionName: 'Second session',
    chatType: 'private',
    locale: 'zh-CN',
  })
  await store.resetToSelectorOnEnter(second.chatKey, 'chat-one')

  assert.equal(second.state.currentAIChatId, null)
  assert.equal(second.state.messages.length, 0)

  const third = store.ensureSessionState({
    sessionId: 'session-three',
    sessionName: 'Third session',
    chatType: 'private',
    locale: 'zh-CN',
  })
  await store.resetToSelectorOnEnter(third.chatKey)

  assert.equal(third.state.currentAIChatId, 'chat-latest')
  assert.equal(third.state.messages[0]?.content, 'Saved answer')
})
