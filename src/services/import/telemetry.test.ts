import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { AnalyticsEventName } from '@openchatlab/shared-types'
import type { ImportAdapter, ImportResult } from './types'
import { TelemetryImportAdapter } from './telemetry'

function createDelegate(
  importResult: ImportResult = { success: true, sessionId: 'session-1', platform: 'weixin' }
): ImportAdapter {
  return {
    importFile: async () => importResult,
    detectFormat: async () => ({
      id: 'chatlab',
      name: 'ChatLab JSON',
      platform: 'qq',
      extensions: ['json'],
    }),
    scanMultiChatFile: async () => [],
    prepareImportSource: async () => ({ success: false }),
    importPreparedChat: async () => importResult,
    releaseImportSource: async () => {},
    getSupportedFormats: async () => [],
    importDemo: async () => ({ success: true }),
    analyzeIncrementalImport: async () => ({ newMessageCount: 0, duplicateCount: 0, totalInFile: 0, platform: 'qq' }),
    incrementalImport: async () => ({ success: true, newMessageCount: 0 }),
    importDirectory: async () => importResult,
  }
}

describe('TelemetryImportAdapter', () => {
  it('tracks the remembered format and the actual imported platform without file details', async () => {
    const events: Array<{ name: AnalyticsEventName; properties?: Record<string, unknown> }> = []
    const file = new File(['{}'], 'private-chat.json')
    const adapter = new TelemetryImportAdapter(createDelegate(), {
      trackAnalyticsEvent: async (name, properties) => {
        events.push({ name, properties })
      },
    })

    await adapter.detectFormat(file)
    await adapter.importFile(file)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(events.length, 2)
    assert.deepEqual(events[0], {
      name: 'chat_import_started',
      properties: { chat_platform: 'qq' },
    })
    assert.equal(events[1].name, 'chat_import_completed')
    assert.equal(events[1].properties?.chat_platform, 'weixin')
    assert.equal(typeof events[1].properties?.duration_ms, 'number')
    assert.equal(JSON.stringify(events).includes('private-chat.json'), false)
  })

  it('only sends a whitelisted failure category', async () => {
    const events: Array<{ name: AnalyticsEventName; properties?: Record<string, unknown> }> = []
    const adapter = new TelemetryImportAdapter(
      createDelegate({ success: false, error: 'Parser failed at /Users/alice/private.json' }),
      {
        trackAnalyticsEvent: async (name, properties) => {
          events.push({ name, properties })
        },
      }
    )

    await adapter.importFile(new File(['{}'], 'private.json'), { formatId: 'whatsapp-native-txt' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(events.at(-1), {
      name: 'chat_import_failed',
      properties: { chat_platform: 'whatsapp', failure_reason: 'parse' },
    })
    assert.equal(JSON.stringify(events).includes('/Users/alice'), false)
  })

  it('tracks incremental imports without exposing the session or file name', async () => {
    const events: Array<{ name: AnalyticsEventName; properties?: Record<string, unknown> }> = []
    const file = new File(['{}'], 'incremental-private.json')
    const adapter = new TelemetryImportAdapter(createDelegate(), {
      trackAnalyticsEvent: async (name, properties) => {
        events.push({ name, properties })
      },
    })

    await adapter.analyzeIncrementalImport('private-session-id', file)
    await adapter.incrementalImport('private-session-id', file)
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(events[0].name, 'chat_import_started')
    assert.equal(events[0].properties?.chat_platform, 'qq')
    assert.equal(events[1].name, 'chat_import_completed')
    assert.equal(JSON.stringify(events).includes('private-session-id'), false)
    assert.equal(JSON.stringify(events).includes('incremental-private.json'), false)
  })
})
