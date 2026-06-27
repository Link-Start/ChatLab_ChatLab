/**
 * Contract tests for shared contacts routes.
 *
 * Run: pnpm test -- packages/http-routes/src/routes/web/contacts.test.ts
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import Fastify from 'fastify'
import type { PathProvider } from '@openchatlab/core'
import type { ContactsResponse } from '@openchatlab/shared-types'
import type { ContactsService, DatabaseManager, SessionRuntimeAdapter } from '@openchatlab/node-runtime'
import type { HttpRouteContext } from '../../context'
import { registerContactsRoutes } from './contacts'

function emptyContactsResponse(status: ContactsResponse['cache']['status'] = 'missing'): ContactsResponse {
  return {
    contacts: [],
    diagnostics: {
      privateSessionCount: 0,
      activePrivateSessionCount: 0,
      contactsEnabled: false,
      skippedMissingOwnerSessions: 0,
      skippedUnresolvedOwnerSessions: 0,
      skippedAmbiguousPrivateSessions: 0,
      skippedInvalidPlatformIdMembers: 0,
      skippedFailedSessions: 0,
      hiddenLowSignalNonFriends: 0,
      warnings: [],
    },
    cache: {
      status,
      computedAt: null,
    },
    timeRange: {
      preset: '1y',
      anchorTs: null,
      startTs: null,
    },
    algorithmVersion: 'contacts-v1',
    task: {
      id: 'task-1',
      status: 'running',
      startedAt: 1000,
      finishedAt: null,
      processedSessions: 0,
      totalSessions: 1,
      timeRangePreset: '1y',
    },
  }
}

class FakeContactsService implements ContactsService {
  getCalls: Array<{ acceptStale?: boolean; timeRangePreset?: string }> = []
  recomputeCalls: Array<{ timeRangePreset?: string }> = []
  closeCalls = 0

  getContacts(options?: { acceptStale?: boolean; timeRangePreset?: string }): ContactsResponse {
    this.getCalls.push({ acceptStale: options?.acceptStale, timeRangePreset: options?.timeRangePreset })
    return emptyContactsResponse('missing')
  }

  startRecompute(options?: { timeRangePreset?: string }): ContactsResponse {
    this.recomputeCalls.push({ timeRangePreset: options?.timeRangePreset })
    return emptyContactsResponse('stale')
  }

  invalidateContactsCache(): void {
    throw new Error('not used in route contract tests')
  }

  async close(): Promise<void> {
    this.closeCalls++
  }
}

function createMockContext(contactsService: ContactsService): HttpRouteContext {
  const pathProvider: PathProvider = {
    getSystemDir: () => path.join('/tmp', 'chatlab-contacts-route-test'),
    getUserDataDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'data'),
    getDatabaseDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'data', 'databases'),
    getVectorDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'vector'),
    getAiDataDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'ai'),
    getSettingsDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'settings'),
    getCacheDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'cache'),
    getTempDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'temp'),
    getLogsDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'logs'),
    getDownloadsDir: () => path.join('/tmp', 'chatlab-contacts-route-test', 'downloads'),
  }
  const sessionAdapter = {
    listSessionIds: () => [],
  } as unknown as SessionRuntimeAdapter

  return {
    sessionAdapter,
    pathProvider,
    contactsService,
    dbManager: {} as DatabaseManager,
    getVersion: () => 'test',
  } as HttpRouteContext
}

test('GET /_web/contacts returns contacts response with task state', async (t) => {
  const service = new FakeContactsService()
  const app = Fastify()
  t.after(async () => app.close())
  registerContactsRoutes(app, createMockContext(service))
  await app.ready()

  const response = await app.inject({ method: 'GET', url: '/_web/contacts?acceptStale=1' })

  assert.equal(response.statusCode, 200)
  const body = response.json<ContactsResponse>()
  assert.equal(body.cache.status, 'missing')
  assert.equal(body.task?.status, 'running')
  assert.deepEqual(service.getCalls, [{ acceptStale: true, timeRangePreset: '1y' }])
})

test('GET /_web/contacts forwards explicit time range preset', async (t) => {
  const service = new FakeContactsService()
  const app = Fastify()
  t.after(async () => app.close())
  registerContactsRoutes(app, createMockContext(service))
  await app.ready()

  const response = await app.inject({ method: 'GET', url: '/_web/contacts?acceptStale=1&timeRange=2y' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(service.getCalls, [{ acceptStale: true, timeRangePreset: '2y' }])
})

test('POST /_web/contacts/recompute starts or reuses background recompute without waiting for completion', async (t) => {
  const service = new FakeContactsService()
  const app = Fastify()
  t.after(async () => app.close())
  registerContactsRoutes(app, createMockContext(service))
  await app.ready()

  const response = await app.inject({ method: 'POST', url: '/_web/contacts/recompute' })

  assert.equal(response.statusCode, 200)
  const body = response.json<ContactsResponse>()
  assert.equal(body.cache.status, 'stale')
  assert.equal(body.task?.status, 'running')
  assert.deepEqual(service.recomputeCalls, [{ timeRangePreset: '1y' }])
})

test('override routes are not registered', async (t) => {
  const app = Fastify()
  t.after(async () => app.close())
  registerContactsRoutes(app, createMockContext(new FakeContactsService()))
  await app.ready()

  const patched = await app.inject({
    method: 'PATCH',
    url: '/_web/contacts/weixin:alice/override',
    payload: { isPinned: true },
  })
  assert.equal(patched.statusCode, 404)

  const deleted = await app.inject({
    method: 'DELETE',
    url: '/_web/contacts/weixin:alice/override',
  })
  assert.equal(deleted.statusCode, 404)
})

test('closes contacts service when Fastify app closes', async () => {
  const service = new FakeContactsService()
  const app = Fastify()
  registerContactsRoutes(app, createMockContext(service))
  await app.ready()

  await app.close()

  assert.equal(service.closeCalls, 1)
})
