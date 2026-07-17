import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ChatType, type AnalysisSession } from '@/types/base'
import { createBrowserHomeController, type BrowserHomePorts } from './browser-home'

function createFile(name: string): File {
  const blob = new Blob(['{}'], { type: 'application/json' })
  return {
    name,
    size: blob.size,
    type: blob.type,
    text: () => blob.text(),
    arrayBuffer: () => blob.arrayBuffer(),
    slice: (start?: number, end?: number) => blob.slice(start, end),
  } as File
}

function createSession(id: string, name = id): AnalysisSession {
  return {
    id,
    name,
    platform: 'wechat',
    type: ChatType.GROUP,
    importedAt: 100,
    messageCount: 10,
    memberCount: 2,
    dbPath: `/chatlab-sessions/${id}.db`,
    groupId: null,
    groupAvatar: null,
    ownerId: null,
    ownerName: null,
    ownerStatus: 'missing',
    memberAvatar: null,
    lastMessageTs: 90,
    summaryCount: 0,
    aiConversationCount: 0,
  }
}

function createPorts(overrides: Partial<BrowserHomePorts> = {}): BrowserHomePorts {
  return {
    runtime: {
      checkCapabilities: async () => ({
        supported: true,
        missing: [],
        capabilities: {
          webAssembly: true,
          dedicatedWorker: true,
          opfs: true,
          storageEstimate: true,
          secureContext: true,
        },
      }),
    },
    data: {
      getSessions: async () => [createSession('session-one')],
      renameSession: async () => true,
      deleteSession: async () => true,
      getHourlyActivity: async () =>
        Array.from({ length: 24 }, (_, hour) => ({ hour, messageCount: hour === 8 ? 10 : 0 })),
    },
    importer: {
      detectFormat: async () => ({
        id: 'chatlab',
        name: 'ChatLab JSON',
        platform: 'unknown',
        extensions: ['.json'],
      }),
      importFile: async (_file, _options, onProgress) => {
        onProgress?.({ stage: 'saving', progress: 80, messagesProcessed: 8 })
        return { success: true, sessionId: 'session-two', messageCount: 8, memberCount: 2 }
      },
      scanMultiChatFile: async () => [],
      cancelActiveImport: () => undefined,
    },
    ...overrides,
  }
}

describe('createBrowserHomeController', () => {
  it('loads sessions only after the browser capability check succeeds', async () => {
    let sessionReads = 0
    const supported = createBrowserHomeController(
      createPorts({
        data: {
          getSessions: async () => {
            sessionReads += 1
            return [createSession('session-one')]
          },
          renameSession: async () => true,
          deleteSession: async () => true,
          getHourlyActivity: async () => [],
        },
      })
    )

    await supported.initialize()
    assert.equal(supported.state.phase, 'ready')
    assert.deepEqual(
      supported.state.sessions.map((session) => session.id),
      ['session-one']
    )
    assert.equal(sessionReads, 1)

    const unsupported = createBrowserHomeController(
      createPorts({
        runtime: {
          checkCapabilities: async () => ({
            supported: false,
            missing: ['opfs'],
            capabilities: {
              webAssembly: true,
              dedicatedWorker: true,
              opfs: false,
              storageEstimate: true,
              secureContext: true,
            },
          }),
        },
        data: {
          getSessions: async () => {
            sessionReads += 1
            return []
          },
          renameSession: async () => true,
          deleteSession: async () => true,
          getHourlyActivity: async () => [],
        },
      })
    )

    await unsupported.initialize()
    assert.equal(unsupported.state.phase, 'unsupported')
    assert.deepEqual(unsupported.state.capabilities?.missing, ['opfs'])
    assert.equal(sessionReads, 1)
  })

  it('keeps the latest file detection result when earlier detection resolves late', async () => {
    const pending = new Map<
      string,
      (value: Awaited<ReturnType<BrowserHomePorts['importer']['detectFormat']>>) => void
    >()
    const controller = createBrowserHomeController(
      createPorts({
        importer: {
          detectFormat: (file) =>
            new Promise((resolve) => {
              pending.set(typeof file === 'string' ? file : file.name, resolve)
            }),
          importFile: async () => ({ success: false }),
          scanMultiChatFile: async () => [],
        },
      })
    )
    const first = createFile('first.json')
    const second = createFile('second.jsonl')

    const firstDetection = controller.selectFile(first)
    const secondDetection = controller.selectFile(second)
    pending.get(second.name)?.({
      id: 'chatlab-jsonl',
      name: 'ChatLab JSONL',
      platform: 'unknown',
      extensions: ['.jsonl'],
    })
    await secondDetection
    pending.get(first.name)?.({
      id: 'chatlab',
      name: 'ChatLab JSON',
      platform: 'unknown',
      extensions: ['.json'],
    })
    await firstDetection

    assert.equal(controller.state.selectedFile?.name, second.name)
    assert.equal(controller.state.detectedFormat?.id, 'chatlab-jsonl')
  })

  it('reports import progress, refreshes sessions, supports cancellation, rename, and delete', async () => {
    let sessions = [createSession('session-one')]
    let cancelImport: (() => void) | undefined
    const controller = createBrowserHomeController(
      createPorts({
        data: {
          getSessions: async () => sessions,
          renameSession: async (id, name) => {
            sessions = sessions.map((session) => (session.id === id ? { ...session, name } : session))
            return true
          },
          deleteSession: async (id) => {
            sessions = sessions.filter((session) => session.id !== id)
            return true
          },
          getHourlyActivity: async () =>
            Array.from({ length: 24 }, (_, hour) => ({ hour, messageCount: hour === 8 ? 10 : 0 })),
        },
        importer: {
          detectFormat: async () => ({
            id: 'chatlab',
            name: 'ChatLab JSON',
            platform: 'unknown',
            extensions: ['.json'],
          }),
          importFile: async (_file, _options, onProgress) => {
            onProgress?.({ stage: 'saving', progress: 75, messagesProcessed: 75 })
            sessions = [createSession('session-two'), ...sessions]
            return { success: true, sessionId: 'session-two', messageCount: 100, memberCount: 3 }
          },
          scanMultiChatFile: async () => [],
          cancelActiveImport: () => cancelImport?.(),
        },
      })
    )
    await controller.initialize()
    await controller.selectFile(createFile('fixture.json'))
    await controller.importSelectedFile()

    assert.equal(controller.state.importStatus, 'success')
    assert.equal(controller.state.importProgress?.progress, 75)
    assert.deepEqual(controller.state.importSummary, { messageCount: 100, memberCount: 3 })
    assert.deepEqual(
      controller.state.sessions.map((session) => session.id),
      ['session-two', 'session-one']
    )

    assert.equal(await controller.renameSession('session-one', 'Renamed'), true)
    assert.equal(controller.state.sessions.find((session) => session.id === 'session-one')?.name, 'Renamed')
    assert.equal(await controller.deleteSession('session-one'), true)
    assert.deepEqual(
      controller.state.sessions.map((session) => session.id),
      ['session-two']
    )

    const cancelled = createBrowserHomeController(
      createPorts({
        importer: {
          detectFormat: async () => ({
            id: 'chatlab',
            name: 'ChatLab JSON',
            platform: 'unknown',
            extensions: ['.json'],
          }),
          importFile: () =>
            new Promise((resolve) => {
              cancelImport = () => resolve({ success: false, error: 'Import cancelled' })
            }),
          scanMultiChatFile: async () => [],
          cancelActiveImport: () => cancelImport?.(),
        },
      })
    )
    await cancelled.selectFile(createFile('cancel.json'))
    const importPromise = cancelled.importSelectedFile()
    cancelled.cancelImport()
    await importPromise

    assert.equal(cancelled.state.importStatus, 'cancelled')
    assert.equal(cancelled.state.error, null)
  })

  it('turns an unexpected import rejection into a visible failed state', async () => {
    const controller = createBrowserHomeController(
      createPorts({
        importer: {
          detectFormat: async () => ({
            id: 'chatlab',
            name: 'ChatLab JSON',
            platform: 'unknown',
            extensions: ['.json'],
          }),
          importFile: async () => {
            throw new Error('unexpected import failure')
          },
          scanMultiChatFile: async () => [],
        },
      })
    )

    await controller.selectFile(createFile('failure.json'))
    await controller.importSelectedFile()

    assert.equal(controller.state.importStatus, 'failed')
    assert.equal(controller.state.error, 'unexpected import failure')
  })

  it('loads and closes the selected session hourly analysis', async () => {
    const controller = createBrowserHomeController(createPorts())
    await controller.initialize()

    await controller.openSessionAnalysis('session-one')

    assert.equal(controller.state.selectedSessionId, 'session-one')
    assert.equal(controller.state.analysisStatus, 'ready')
    assert.equal(controller.state.hourlyActivity.length, 24)
    assert.equal(controller.state.hourlyActivity[8].messageCount, 10)

    controller.closeSessionAnalysis()
    assert.equal(controller.state.selectedSessionId, null)
    assert.equal(controller.state.analysisStatus, 'idle')
    assert.deepEqual(controller.state.hourlyActivity, [])
  })

  it('scans a multi-chat file, selects non-empty chats by default, and supports explicit selection', async () => {
    let scans = 0
    const controller = createBrowserHomeController(
      createPorts({
        importer: {
          detectFormat: async () => ({
            id: 'telegram-native',
            name: 'Telegram JSON',
            platform: 'telegram',
            extensions: ['.json'],
            multiChat: true,
          }),
          scanMultiChatFile: async () => {
            scans += 1
            return [
              { index: 0, name: 'Empty', type: 'personal_chat', id: 1, messageCount: 0 },
              { index: 1, name: 'Project Team', type: 'private_group', id: 2, messageCount: 5 },
            ]
          },
          importFile: async () => ({ success: false }),
        },
      })
    )

    await controller.selectFile(createFile('result.json'))

    assert.equal(scans, 1)
    assert.equal(controller.state.importStatus, 'ready')
    assert.deepEqual(
      controller.state.multiChatEntries.map((chat) => chat.name),
      ['Empty', 'Project Team']
    )
    assert.deepEqual(controller.state.selectedChatIndexes, [1])

    controller.toggleChatSelection(0)
    assert.deepEqual(controller.state.selectedChatIndexes, [0, 1])
    controller.toggleAllChats()
    assert.deepEqual(controller.state.selectedChatIndexes, [])
    controller.toggleAllChats()
    assert.deepEqual(controller.state.selectedChatIndexes, [0, 1])
  })

  it('imports selected chats sequentially, continues after one failure, and preserves completed sessions', async () => {
    const importCalls: number[] = []
    let sessions = [createSession('session-one')]
    const controller = createBrowserHomeController(
      createPorts({
        data: {
          getSessions: async () => sessions,
          renameSession: async () => true,
          deleteSession: async () => true,
          getHourlyActivity: async () => [],
        },
        importer: {
          detectFormat: async () => ({
            id: 'telegram-native',
            name: 'Telegram JSON',
            platform: 'telegram',
            extensions: ['.json'],
            multiChat: true,
          }),
          scanMultiChatFile: async () => [
            { index: 0, name: 'Alice', type: 'personal_chat', id: 1, messageCount: 2 },
            { index: 1, name: 'Broken', type: 'private_group', id: 2, messageCount: 3 },
            { index: 2, name: 'Project Team', type: 'private_group', id: 3, messageCount: 4 },
          ],
          importFile: async (_file, options, onProgress) => {
            const chatIndex = options?.chatIndex ?? -1
            importCalls.push(chatIndex)
            onProgress?.({ stage: 'parsing', progress: 50, messagesProcessed: chatIndex + 1 })
            if (chatIndex === 1) return { success: false, error: 'broken chat' }
            sessions = [createSession(`telegram-${chatIndex}`), ...sessions]
            return {
              success: true,
              sessionId: `telegram-${chatIndex}`,
              messageCount: chatIndex === 0 ? 2 : 4,
              memberCount: 1,
            }
          },
        },
      })
    )
    await controller.initialize()
    await controller.selectFile(createFile('result.json'))

    await controller.importSelectedFile()

    assert.deepEqual(importCalls, [0, 1, 2])
    assert.equal(controller.state.importStatus, 'success')
    assert.deepEqual(controller.state.importSummary, {
      messageCount: 6,
      memberCount: 2,
      sessionCount: 2,
      totalCount: 3,
      failedCount: 1,
    })
    assert.deepEqual(controller.state.batchFailures, [{ index: 1, name: 'Broken', error: 'broken chat' }])
    assert.deepEqual(
      controller.state.sessions.map((session) => session.id),
      ['telegram-2', 'telegram-0', 'session-one']
    )
  })

  it('stops a multi-chat batch after cancellation without removing an already completed session', async () => {
    let releaseSecond: ((result: { success: boolean; error?: string }) => void) | undefined
    let cancelImport: (() => void) | undefined
    const importCalls: number[] = []
    let sessions = [createSession('session-one')]
    const controller = createBrowserHomeController(
      createPorts({
        data: {
          getSessions: async () => sessions,
          renameSession: async () => true,
          deleteSession: async () => true,
          getHourlyActivity: async () => [],
        },
        importer: {
          detectFormat: async () => ({
            id: 'telegram-native',
            name: 'Telegram JSON',
            platform: 'telegram',
            extensions: ['.json'],
            multiChat: true,
          }),
          scanMultiChatFile: async () => [
            { index: 0, name: 'Alice', type: 'personal_chat', id: 1, messageCount: 1 },
            { index: 1, name: 'Bob', type: 'personal_chat', id: 2, messageCount: 1 },
            { index: 2, name: 'Carol', type: 'personal_chat', id: 3, messageCount: 1 },
          ],
          importFile: async (_file, options) => {
            const chatIndex = options?.chatIndex ?? -1
            importCalls.push(chatIndex)
            if (chatIndex === 0) {
              sessions = [createSession('telegram-0'), ...sessions]
              return { success: true, sessionId: 'telegram-0', messageCount: 1, memberCount: 1 }
            }
            return new Promise((resolve) => {
              releaseSecond = resolve
              cancelImport = () => resolve({ success: false, error: 'Import cancelled' })
            })
          },
          cancelActiveImport: () => cancelImport?.(),
        },
      })
    )
    await controller.initialize()
    await controller.selectFile(createFile('result.json'))

    const importing = controller.importSelectedFile()
    while (!releaseSecond) await new Promise<void>((resolve) => setImmediate(resolve))
    controller.cancelImport()
    releaseSecond?.({ success: false, error: 'Import cancelled' })
    await importing

    assert.deepEqual(importCalls, [0, 1])
    assert.equal(controller.state.importStatus, 'cancelled')
    assert.deepEqual(
      controller.state.sessions.map((session) => session.id),
      ['telegram-0', 'session-one']
    )
    assert.deepEqual(controller.state.importSummary, {
      messageCount: 1,
      memberCount: 1,
      sessionCount: 1,
      totalCount: 3,
      failedCount: 0,
    })
  })
})
