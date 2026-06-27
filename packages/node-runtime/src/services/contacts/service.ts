import path from 'node:path'
import type { PathProvider } from '@openchatlab/core'
import type {
  ContactItem,
  ContactListItem,
  ContactPool,
  ContactDetailResponse,
  ContactsCacheState,
  ContactsResponse,
  ContactsTaskState,
  ContactsTimeRangePreset,
} from '@openchatlab/shared-types'
import type { RuntimeIdentity } from '../../data-dir-compat'
import { appLogger } from '../../logging/app-logger'
import type { SessionRuntimeAdapter } from '../adapters'
import {
  CONTACTS_ALGORITHM_VERSION,
  createEmptyContactsDiagnostics,
  type ContactsComputeProgress,
  type ContactsSnapshot,
} from './compute'
import { buildContactsSignature } from './signature'
import { cleanupContactsSnapshotTempFiles, readContactsSnapshot, writeContactsSnapshot } from './snapshot'
import { normalizeContactsTimeRangePreset, resolveContactsTimeRange } from './time-range'
import { createContactsWorkerRunner } from './worker-runner'

const CONTACTS_SNAPSHOT_DIR_NAME = 'contacts'
const DEFAULT_CONTACTS_PAGE_SIZE = 100
const MAX_CONTACTS_PAGE_SIZE = 200

export interface ContactsServiceOptions {
  forceRecompute?: boolean
  acceptStale?: boolean
  timeRangePreset?: ContactsTimeRangePreset
  pool?: ContactPool
  page?: number
  pageSize?: number
  query?: string
}

export interface ContactsRunnerOptions {
  signature: string
  timeRangePreset: ContactsTimeRangePreset
  onProgress: (progress: ContactsComputeProgress) => void
  signal: AbortSignal
}

export type ContactsComputeRunner = (options: ContactsRunnerOptions) => Promise<ContactsSnapshot>

export interface ContactsServiceDeps {
  adapter: SessionRuntimeAdapter
  systemDir?: string
  pathProvider?: PathProvider
  runtimeIdentity?: RuntimeIdentity
  nativeBinding?: string
  workerEntryUrl?: string | URL
  runner?: ContactsComputeRunner
  now?: () => number
}

export interface ContactsService {
  getContacts(options?: ContactsServiceOptions): ContactsResponse
  getContactsPage(options?: ContactsServiceOptions): ContactsResponse
  getContactDetail(key: string, options?: ContactsServiceOptions): ContactDetailResponse
  startRecompute(options?: ContactsServiceOptions): ContactsResponse
  invalidateContactsCache(): void
  close(): Promise<void>
  replaceSnapshotForTests?(snapshot: ContactsSnapshot): void
}

interface InFlightTask {
  id: string
  signature: string
  promise: Promise<ContactsSnapshot>
  abortController: AbortController
}

export function createContactsService(deps: ContactsServiceDeps): ContactsService {
  return new DefaultContactsService(deps)
}

class DefaultContactsService implements ContactsService {
  private readonly snapshots = new Map<ContactsTimeRangePreset, ContactsSnapshot | null>()
  private inFlight: InFlightTask | null = null
  private task: ContactsTaskState = createIdleTaskState()
  private readonly snapshotDir: string
  private readonly runner: ContactsComputeRunner

  constructor(private readonly deps: ContactsServiceDeps) {
    this.snapshotDir = resolveContactsSnapshotDir(deps)
    cleanupContactsSnapshotTempFiles(this.snapshotDir)
    this.runner =
      deps.runner ??
      createContactsWorkerRunner({
        pathProvider: requirePathProvider(deps),
        runtimeIdentity: deps.runtimeIdentity,
        nativeBinding: deps.nativeBinding,
        workerEntryUrl: deps.workerEntryUrl,
      })
  }

  getContacts(options: ContactsServiceOptions = {}): ContactsResponse {
    return this.getContactsPage(options)
  }

  getContactsPage(options: ContactsServiceOptions = {}): ContactsResponse {
    const timeRangePreset = normalizeContactsTimeRangePreset(options.timeRangePreset)
    const signature = buildContactsSignature(this.deps.adapter, timeRangePreset)
    const cacheStatus = this.getCacheStatus(signature, timeRangePreset)
    if (this.shouldStartTaskFromRead(options, cacheStatus)) this.ensureTaskStarted(signature, timeRangePreset)
    return this.toResponse(signature, { ...options, timeRangePreset })
  }

  getContactDetail(key: string, options: ContactsServiceOptions = {}): ContactDetailResponse {
    const timeRangePreset = normalizeContactsTimeRangePreset(options.timeRangePreset)
    const signature = buildContactsSignature(this.deps.adapter, timeRangePreset)
    const cacheStatus = this.getCacheStatus(signature, timeRangePreset)
    if (this.shouldStartTaskFromRead(options, cacheStatus)) this.ensureTaskStarted(signature, timeRangePreset)
    const snapshot = this.getSnapshot(timeRangePreset)
    const status = this.getCacheStatus(signature, timeRangePreset)
    const includeSnapshot = status === 'fresh' || (status === 'stale' && options.acceptStale === true)
    return {
      contact: includeSnapshot ? (snapshot?.contacts.find((contact) => contact.key === key) ?? null) : null,
      algorithmVersion: includeSnapshot
        ? (snapshot?.algorithmVersion ?? CONTACTS_ALGORITHM_VERSION)
        : CONTACTS_ALGORITHM_VERSION,
      timeRange: snapshot?.timeRange ?? resolveContactsTimeRange(timeRangePreset, null),
      cache: this.toCacheState(status, snapshot),
      task: this.task,
    }
  }

  startRecompute(options: ContactsServiceOptions = {}): ContactsResponse {
    const timeRangePreset = normalizeContactsTimeRangePreset(options.timeRangePreset)
    const signature = buildContactsSignature(this.deps.adapter, timeRangePreset)
    this.ensureTaskStarted(signature, timeRangePreset)
    return this.toResponse(signature, { ...options, acceptStale: true, timeRangePreset })
  }

  invalidateContactsCache(): void {
    this.snapshots.clear()
  }

  async close(): Promise<void> {
    const inFlight = this.inFlight
    if (!inFlight) return
    this.inFlight = null
    inFlight.abortController.abort()
    this.task = {
      ...this.task,
      status: 'failed',
      finishedAt: this.now(),
      lastError: 'contacts task aborted',
    }
  }

  replaceSnapshotForTests(snapshot: ContactsSnapshot): void {
    this.snapshots.set(snapshot.timeRange.preset, snapshot)
  }

  private shouldStartTaskFromRead(options: ContactsServiceOptions, cacheStatus: ContactsCacheState['status']): boolean {
    if (options.forceRecompute) return true
    if (cacheStatus === 'fresh') return false
    return this.task.status !== 'failed'
  }

  private ensureTaskStarted(signature: string, timeRangePreset: ContactsTimeRangePreset): void {
    if (this.inFlight) return

    const taskId = `contacts_${this.now()}_${Math.random().toString(36).slice(2)}`
    this.task = {
      id: taskId,
      status: 'running',
      startedAt: this.now(),
      finishedAt: null,
      processedSessions: 0,
      totalSessions: this.deps.adapter.listSessionIds().length,
      timeRangePreset,
    }

    const abortController = new AbortController()
    const promise = this.runner({
      signature,
      timeRangePreset,
      signal: abortController.signal,
      onProgress: (progress) => {
        if (this.task.id !== taskId || this.task.status !== 'running') return
        this.task = {
          ...this.task,
          processedSessions: progress.processedSessions,
          totalSessions: progress.totalSessions,
          currentSessionId: progress.currentSessionId,
        }
      },
    })
    this.inFlight = { id: taskId, signature, promise, abortController }

    promise
      .then((snapshot) => this.handleTaskSuccess(taskId, signature, snapshot))
      .catch((error) => this.handleTaskFailure(taskId, error))
  }

  private handleTaskSuccess(taskId: string, inputSignature: string, snapshot: ContactsSnapshot): void {
    if (this.inFlight?.id !== taskId) return
    this.inFlight = null
    const latestSignature = buildContactsSignature(this.deps.adapter, snapshot.timeRange.preset)
    const finishedAt = this.now()

    if (inputSignature !== latestSignature || snapshot.signature !== latestSignature) {
      this.task = {
        ...this.task,
        status: 'superseded',
        finishedAt,
      }
      appLogger.info('contacts', 'contacts worker result discarded because signature changed', {
        inputSignature,
        latestSignature,
      })
      return
    }

    try {
      writeContactsSnapshot(this.snapshotDir, snapshot)
      this.snapshots.set(snapshot.timeRange.preset, snapshot)
      this.task = {
        ...this.task,
        status: 'succeeded',
        finishedAt,
        processedSessions: snapshot.workerStats.processedSessions,
        totalSessions: snapshot.workerStats.totalSessions,
        currentSessionId: undefined,
      }
      appLogger.info('contacts', 'contacts worker snapshot persisted', {
        contactCount: snapshot.contacts.length,
        durationMs: snapshot.workerStats.durationMs,
      })
    } catch (error) {
      this.handleTaskFailure(taskId, error)
    }
  }

  private handleTaskFailure(taskId: string, error: unknown): void {
    if (this.inFlight?.id === taskId) this.inFlight = null
    const message = error instanceof Error ? error.message : String(error)
    this.task = {
      ...this.task,
      status: 'failed',
      finishedAt: this.now(),
      lastError: message,
    }
    appLogger.error('contacts', 'contacts worker failed', error)
  }

  private getCacheStatus(signature: string, timeRangePreset: ContactsTimeRangePreset): ContactsCacheState['status'] {
    const snapshot = this.getSnapshot(timeRangePreset)
    if (!snapshot) return 'missing'
    return snapshot.signature === signature ? 'fresh' : 'stale'
  }

  private toResponse(signature: string, options: ContactsServiceOptions = {}): ContactsResponse {
    const timeRangePreset = normalizeContactsTimeRangePreset(options.timeRangePreset)
    const snapshot = this.getSnapshot(timeRangePreset)
    const status = this.getCacheStatus(signature, timeRangePreset)
    const includeSnapshot = status === 'fresh' || (status === 'stale' && options.acceptStale === true)
    const allContacts = includeSnapshot ? (snapshot?.contacts ?? []) : []
    const stats = buildContactsStats(allContacts)
    const page = normalizePositiveInt(options.page, 1)
    const pageSize = normalizePageSize(options.pageSize)
    const query = options.query?.trim().toLowerCase() ?? ''
    const filteredContacts = allContacts.filter((contact) => {
      if (options.pool && contact.pool !== options.pool) return false
      if (query && !contact.searchText.includes(query)) return false
      return true
    })
    const offset = (page - 1) * pageSize
    const pageContacts = filteredContacts.slice(offset, offset + pageSize).map(toContactListItem)
    return {
      contacts: pageContacts,
      diagnostics: includeSnapshot
        ? (snapshot?.diagnostics ?? createEmptyContactsDiagnostics())
        : createEmptyContactsDiagnostics(),
      algorithmVersion: includeSnapshot
        ? (snapshot?.algorithmVersion ?? CONTACTS_ALGORITHM_VERSION)
        : CONTACTS_ALGORITHM_VERSION,
      timeRange: snapshot?.timeRange ?? resolveContactsTimeRange(timeRangePreset, null),
      cache: this.toCacheState(status, snapshot),
      pagination: {
        page,
        pageSize,
        total: filteredContacts.length,
        hasMore: offset + pageContacts.length < filteredContacts.length,
      },
      stats,
      task: this.task,
    }
  }

  private toCacheState(status: ContactsCacheState['status'], snapshot: ContactsSnapshot | null): ContactsCacheState {
    return {
      status,
      computedAt: snapshot?.computedAt ?? null,
      signature: snapshot?.signature,
      staleReason: status === 'stale' ? 'signature_changed' : undefined,
    }
  }

  private getSnapshot(timeRangePreset: ContactsTimeRangePreset): ContactsSnapshot | null {
    if (!this.snapshots.has(timeRangePreset)) {
      this.snapshots.set(
        timeRangePreset,
        readContactsSnapshot(this.snapshotDir, timeRangePreset, { now: this.deps.now })
      )
    }
    return this.snapshots.get(timeRangePreset) ?? null
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

function buildContactsStats(contacts: ContactItem[]): { friendsTotal: number; nonFriendsTotal: number } {
  let friendsTotal = 0
  let nonFriendsTotal = 0
  for (const contact of contacts) {
    if (contact.pool === 'friend') friendsTotal++
    else if (contact.pool === 'non_friend') nonFriendsTotal++
  }
  return { friendsTotal, nonFriendsTotal }
}

function toContactListItem(contact: ContactItem): ContactListItem {
  const { sourceSessions: _sourceSessions, searchText: _searchText, ...item } = contact
  return item
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.trunc(value!))
}

function normalizePageSize(value: number | undefined): number {
  return Math.min(MAX_CONTACTS_PAGE_SIZE, normalizePositiveInt(value, DEFAULT_CONTACTS_PAGE_SIZE))
}

function createIdleTaskState(): ContactsTaskState {
  return {
    id: null,
    status: 'idle',
    startedAt: null,
    finishedAt: null,
    processedSessions: 0,
    totalSessions: 0,
  }
}

function requirePathProvider(deps: ContactsServiceDeps): PathProvider {
  if (!deps.pathProvider) {
    throw new Error('contacts worker runner requires pathProvider')
  }
  return deps.pathProvider
}

function resolveContactsSnapshotDir(deps: ContactsServiceDeps): string {
  if (deps.pathProvider) return path.join(deps.pathProvider.getUserDataDir(), CONTACTS_SNAPSHOT_DIR_NAME)
  if (deps.systemDir) return deps.systemDir
  throw new Error('contacts service requires systemDir or pathProvider')
}
