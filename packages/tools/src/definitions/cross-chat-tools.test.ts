import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  AIEntityRef,
  CrossChatContactLookupResult,
  CrossChatEntityResolution,
  CrossChatMessageContextResult,
  CrossChatOverviewResult,
  CrossChatSearchResult,
} from '@openchatlab/shared-types'
import { ChatType } from '@openchatlab/shared-types'
import { AGENT_TOOL_REGISTRY, CROSS_CHAT_AGENT_TOOL_REGISTRY, MCP_TOOL_REGISTRY } from '../registry'
import type { CrossChatAnalysisToolService, CrossChatToolExecutionContext } from '../types'

function createContext(overrides: Partial<CrossChatAnalysisToolService> = {}): CrossChatToolExecutionContext {
  const service: CrossChatAnalysisToolService = {
    lookupContact: (query: string): CrossChatContactLookupResult => ({
      query,
      status: 'not_found',
      cacheStatus: 'fresh',
      totalCandidates: 0,
      candidates: [],
    }),
    resolveEntities: (_refs: AIEntityRef[]): CrossChatEntityResolution => ({
      contacts: [],
      sessions: [],
      unresolved: [],
      coverage: {
        requestedEntities: 0,
        resolvedEntities: 0,
        candidateSessions: 0,
        resolvedSessions: 0,
        failedSessions: 0,
      },
    }),
    searchMessages: async (): Promise<CrossChatSearchResult> => ({
      messages: [
        {
          sessionId: 'session-a',
          sessionName: 'Session A',
          sessionType: ChatType.PRIVATE,
          platform: 'test',
          lastMessageTs: 10,
          messageId: 7,
          senderId: 2,
          senderName: 'Alice',
          senderPlatformId: 'alice',
          content: 'private raw content',
          timestamp: 10,
          messageType: 0,
        },
      ],
      totalMatches: 1,
      appliedFilters: {
        startTs: null,
        endTs: null,
        recentDays: null,
        sender: 'all',
      },
      coverage: {
        candidateSessions: 1,
        scannedSessions: 1,
        matchedSessions: 1,
        failedSessions: 0,
        truncated: false,
        truncatedReasons: [],
      },
    }),
    getMessageContext: (): CrossChatMessageContextResult => ({
      source: {
        sessionId: 'session-a',
        sessionName: 'Session A',
        sessionType: ChatType.PRIVATE,
        platform: 'test',
        lastMessageTs: 10,
      },
      messages: [],
    }),
    getOverview: async (): Promise<CrossChatOverviewResult> => ({
      items: [],
      coverage: {
        candidateSessions: 0,
        analyzedSessions: 0,
        failedSessions: 0,
        truncated: false,
        truncatedReasons: [],
      },
    }),
    ...overrides,
  }
  return {
    locale: 'zh-CN',
    analysisService: service,
    preprocessMessagesBySession: (_sessionId, messages) =>
      messages.map((message) => ({ ...message, senderName: 'U1', content: '[redacted]' })),
  }
}

describe('cross-chat agent registry', () => {
  it('contains only the four dedicated tools and is isolated from session and MCP registries', () => {
    const names = CROSS_CHAT_AGENT_TOOL_REGISTRY.map((tool) => tool.name)
    assert.deepEqual(names, [
      'resolve_chat_entities',
      'search_messages_globally',
      'get_cross_chat_message_context',
      'get_cross_chat_overview',
    ])
    for (const name of names) {
      assert.equal(
        AGENT_TOOL_REGISTRY.some((tool) => tool.name === name),
        false
      )
      assert.equal(
        MCP_TOOL_REGISTRY.some((tool) => tool.name === name),
        false
      )
    }
  })

  it('resolves a unique contact name before continuing with stable scopes', async () => {
    let resolvedRefs: AIEntityRef[] = []
    const context = createContext({
      lookupContact: () => ({
        query: '小红',
        status: 'resolved',
        cacheStatus: 'fresh',
        totalCandidates: 1,
        candidates: [
          {
            contactKey: 'test:xiaohong',
            displayName: '小红',
            platform: 'test',
            aliases: [],
            sourceSessions: [{ id: 'private-xiaohong', name: '小红', type: ChatType.PRIVATE }],
          },
        ],
      }),
      resolveEntities: (refs) => {
        resolvedRefs = refs
        return {
          contacts: [],
          sessions: [],
          unresolved: [],
          coverage: {
            requestedEntities: refs.length,
            resolvedEntities: refs.length,
            candidateSessions: 1,
            resolvedSessions: 1,
            failedSessions: 0,
          },
        }
      },
    } as Partial<CrossChatAnalysisToolService>)
    const tool = CROSS_CHAT_AGENT_TOOL_REGISTRY.find((item) => item.name === 'resolve_chat_entities')
    assert.ok(tool)

    const result = await tool.handler({ entities: [{ type: 'contact', displayName: '小红' }] }, context)
    assert.deepEqual(resolvedRefs, [{ type: 'contact', contactKey: 'test:xiaohong', displayName: '小红' }])
    assert.equal((result.data as { contactLookups: Array<{ status: string }> }).contactLookups[0]?.status, 'resolved')
  })

  it('returns ambiguous contact candidates without choosing one', async () => {
    let resolvedRefs: AIEntityRef[] = []
    const context = createContext({
      lookupContact: () => ({
        query: '小红',
        status: 'ambiguous',
        cacheStatus: 'fresh',
        totalCandidates: 2,
        candidates: [
          {
            contactKey: 'test:xiaohong-1',
            displayName: '小红',
            platform: 'test',
            aliases: ['小红 A'],
            sourceSessions: [{ id: 'private-1', name: '小红 A', type: ChatType.PRIVATE }],
          },
          {
            contactKey: 'test:xiaohong-2',
            displayName: '小红',
            platform: 'test',
            aliases: ['小红 B'],
            sourceSessions: [{ id: 'private-2', name: '小红 B', type: ChatType.PRIVATE }],
          },
        ],
      }),
      resolveEntities: (refs) => {
        resolvedRefs = refs
        return {
          contacts: [],
          sessions: [],
          unresolved: [],
          coverage: {
            requestedEntities: refs.length,
            resolvedEntities: 0,
            candidateSessions: 0,
            resolvedSessions: 0,
            failedSessions: 0,
          },
        }
      },
    } as Partial<CrossChatAnalysisToolService>)
    const tool = CROSS_CHAT_AGENT_TOOL_REGISTRY.find((item) => item.name === 'resolve_chat_entities')
    assert.ok(tool)

    const result = await tool.handler({ entities: [{ type: 'contact', displayName: '小红' }] }, context)
    assert.deepEqual(resolvedRefs, [])
    assert.equal((result.data as { contactLookups: Array<{ status: string }> }).contactLookups[0]?.status, 'ambiguous')
  })

  it('sanitizes each session before returning global search evidence', async () => {
    const tool = CROSS_CHAT_AGENT_TOOL_REGISTRY.find((item) => item.name === 'search_messages_globally')
    assert.ok(tool)
    const result = await tool.handler({ keywords: ['private'] }, createContext())
    const data = result.data as {
      crossChatEvidence: { sources: Array<{ sessionId: string; messageId: number; snippet: string }> }
    }

    assert.equal(result.content.includes('private raw content'), false)
    assert.equal(result.content.includes('[redacted]'), true)
    assert.deepEqual(data.crossChatEvidence.sources, [
      {
        sessionId: 'session-a',
        sessionName: 'Session A',
        sessionType: 'private',
        platform: 'test',
        messageId: 7,
        senderName: 'U1',
        timestamp: 10,
        snippet: '[redacted]',
      },
    ])
  })

  it('allows recent-message sampling only when explicit scopes are present', async () => {
    let captured: unknown
    const context = createContext({
      searchMessages: async (request) => {
        captured = request
        return {
          messages: [],
          totalMatches: 0,
          appliedFilters: {
            startTs: null,
            endTs: null,
            recentDays: null,
            sender: 'all',
          },
          coverage: {
            candidateSessions: 1,
            scannedSessions: 1,
            matchedSessions: 0,
            failedSessions: 0,
            truncated: false,
            truncatedReasons: [],
          },
        }
      },
    })
    const tool = CROSS_CHAT_AGENT_TOOL_REGISTRY.find((item) => item.name === 'search_messages_globally')
    assert.ok(tool)
    await tool.handler({ scopes: [{ sessionId: 'session-a', memberIds: [2] }] }, context)
    assert.deepEqual(captured, {
      keywords: [],
      scopes: [{ sessionId: 'session-a', memberIds: [2], label: undefined }],
      startTs: undefined,
      endTs: undefined,
      recentDays: undefined,
      sender: 'all',
      matchMode: 'any',
      sort: 'desc',
      maxSessions: undefined,
      maxEvidence: undefined,
      maxWallTimeMs: undefined,
    })
  })

  it('forwards relative time and owner-only filters for global discovery', async () => {
    let captured: unknown
    const context = createContext({
      searchMessages: async (request) => {
        captured = request
        return {
          messages: [],
          totalMatches: 0,
          appliedFilters: {
            startTs: 100,
            endTs: null,
            recentDays: 90,
            sender: 'owner',
          },
          coverage: {
            candidateSessions: 1,
            scannedSessions: 1,
            matchedSessions: 0,
            failedSessions: 0,
            ownerResolution: {
              resolvedSessions: 1,
              missingOwnerSessions: 0,
              unresolvedOwnerSessions: 0,
            },
            truncated: false,
            truncatedReasons: [],
          },
        }
      },
    })
    const tool = CROSS_CHAT_AGENT_TOOL_REGISTRY.find((item) => item.name === 'search_messages_globally')
    assert.ok(tool)
    await tool.handler({ keywords: ['买房'], recent_days: 90, sender: 'owner' }, context)

    assert.deepEqual(captured, {
      keywords: ['买房'],
      scopes: undefined,
      startTs: undefined,
      endTs: undefined,
      recentDays: 90,
      sender: 'owner',
      matchMode: 'any',
      sort: 'desc',
      maxSessions: undefined,
      maxEvidence: undefined,
      maxWallTimeMs: undefined,
    })
  })

  it('requires compound source identity for cross-chat context lookup', async () => {
    let captured: unknown
    const context = createContext({
      getMessageContext: (request) => {
        captured = request
        return {
          source: {
            sessionId: request.sessionId,
            sessionName: 'Session A',
            sessionType: ChatType.PRIVATE,
            platform: 'test',
            lastMessageTs: null,
          },
          messages: [],
        }
      },
    })
    const tool = CROSS_CHAT_AGENT_TOOL_REGISTRY.find((item) => item.name === 'get_cross_chat_message_context')
    assert.ok(tool)
    await tool.handler({ session_id: 'session-a', message_id: 7, context_size: 3 }, context)
    assert.deepEqual(captured, { sessionId: 'session-a', messageId: 7, contextSize: 3 })
  })
})
