import { reactive } from 'vue'
import type { BrowserCapabilityReport } from '@openchatlab/web-runtime'
import type { AnalysisSession, ImportProgress } from '@/types/base'
import type { HourlyActivity } from '@/types/analysis'
import type { BrowserRuntimeServiceAdapter } from '@/services/browser-runtime/types'
import type { DataAdapter } from '@/services/data/types'
import type { FormatInfo, ImportAdapter, ImportResult, MultiChatEntry } from '@/services/import/types'

export type BrowserHomePhase = 'initializing' | 'ready' | 'unsupported' | 'failed'
export type BrowserImportStatus = 'idle' | 'detecting' | 'ready' | 'importing' | 'success' | 'cancelled' | 'failed'

export interface BrowserImportSummary {
  messageCount: number
  memberCount: number
  sessionCount?: number
  totalCount?: number
  failedCount?: number
}

export interface BrowserBatchFailure {
  index: number
  name: string
  error: string
}

export interface BrowserHomeState {
  phase: BrowserHomePhase
  capabilities: BrowserCapabilityReport | null
  sessions: AnalysisSession[]
  refreshingSessions: boolean
  selectedFile: File | null
  detectedFormat: FormatInfo | null
  multiChatEntries: MultiChatEntry[]
  selectedChatIndexes: number[]
  importStatus: BrowserImportStatus
  importProgress: ImportProgress | null
  importSummary: BrowserImportSummary | null
  batchFailures: BrowserBatchFailure[]
  batchCurrentPosition: number
  batchTotal: number
  currentChatName: string | null
  error: string | null
  busySessionId: string | null
  selectedSessionId: string | null
  analysisStatus: 'idle' | 'loading' | 'ready' | 'failed'
  hourlyActivity: HourlyActivity[]
  analysisError: string | null
}

export interface BrowserHomeLogEvent {
  level: 'info' | 'error'
  message: string
  data?: Record<string, unknown>
}

export interface BrowserHomePorts {
  runtime: Pick<BrowserRuntimeServiceAdapter, 'checkCapabilities'>
  data: Pick<DataAdapter, 'getSessions' | 'renameSession' | 'deleteSession' | 'getHourlyActivity'>
  importer: Pick<ImportAdapter, 'detectFormat' | 'scanMultiChatFile' | 'importFile' | 'cancelActiveImport'>
  onLog?: (event: BrowserHomeLogEvent) => void
}

export interface BrowserHomeController {
  state: BrowserHomeState
  initialize(): Promise<void>
  refreshSessions(): Promise<void>
  selectFile(file: File | null): Promise<void>
  importSelectedFile(): Promise<void>
  cancelImport(): void
  toggleChatSelection(chatIndex: number): void
  toggleAllChats(): void
  renameSession(sessionId: string, name: string): Promise<boolean>
  deleteSession(sessionId: string): Promise<boolean>
  openSessionAnalysis(sessionId: string): Promise<void>
  closeSessionAnalysis(): void
  clearImportState(): void
}

export function createBrowserHomeController(ports: BrowserHomePorts): BrowserHomeController {
  const state = reactive<BrowserHomeState>({
    phase: 'initializing',
    capabilities: null,
    sessions: [],
    refreshingSessions: false,
    selectedFile: null,
    detectedFormat: null,
    multiChatEntries: [],
    selectedChatIndexes: [],
    importStatus: 'idle',
    importProgress: null,
    importSummary: null,
    batchFailures: [],
    batchCurrentPosition: 0,
    batchTotal: 0,
    currentChatName: null,
    error: null,
    busySessionId: null,
    selectedSessionId: null,
    analysisStatus: 'idle',
    hourlyActivity: [],
    analysisError: null,
  })
  let detectionSequence = 0
  let analysisSequence = 0
  let cancelRequested = false

  async function initialize(): Promise<void> {
    state.phase = 'initializing'
    state.error = null
    try {
      const capabilities = await ports.runtime.checkCapabilities()
      state.capabilities = capabilities
      if (!capabilities.supported) {
        state.phase = 'unsupported'
        ports.onLog?.({
          level: 'error',
          message: 'Standalone browser capabilities are unavailable',
          data: { missing: capabilities.missing },
        })
        return
      }
      await loadSessions()
      state.phase = 'ready'
      ports.onLog?.({ level: 'info', message: 'Standalone browser workspace is ready' })
    } catch (error) {
      state.phase = 'failed'
      state.error = toErrorMessage(error)
      ports.onLog?.({ level: 'error', message: 'Standalone browser workspace initialization failed' })
    }
  }

  async function loadSessions(): Promise<void> {
    state.sessions = await ports.data.getSessions()
    if (state.selectedSessionId && !state.sessions.some((session) => session.id === state.selectedSessionId)) {
      closeSessionAnalysis()
    }
  }

  async function refreshSessions(): Promise<void> {
    if (state.phase !== 'ready') return
    state.refreshingSessions = true
    try {
      await loadSessions()
    } catch (error) {
      state.error = toErrorMessage(error)
      ports.onLog?.({ level: 'error', message: 'Standalone browser session refresh failed' })
    } finally {
      state.refreshingSessions = false
    }
  }

  async function selectFile(file: File | null): Promise<void> {
    const sequence = ++detectionSequence
    state.selectedFile = file
    state.detectedFormat = null
    state.multiChatEntries = []
    state.selectedChatIndexes = []
    state.importProgress = null
    state.importSummary = null
    state.batchFailures = []
    state.batchCurrentPosition = 0
    state.batchTotal = 0
    state.currentChatName = null
    state.error = null
    state.importStatus = file ? 'detecting' : 'idle'
    if (!file) return

    try {
      const format = await ports.importer.detectFormat(file)
      if (sequence !== detectionSequence) return
      state.detectedFormat = format
      if (!format) {
        state.importStatus = 'failed'
        state.error = 'Unsupported file format'
        return
      }
      if (format.multiChat) {
        const chats = await ports.importer.scanMultiChatFile(file)
        if (sequence !== detectionSequence) return
        state.multiChatEntries = chats
        state.selectedChatIndexes = chats.filter((chat) => chat.messageCount > 0).map((chat) => chat.index)
        if (chats.length === 0) {
          state.importStatus = 'failed'
          state.error = 'The multi-chat export does not contain any chats'
          return
        }
      }
      state.importStatus = 'ready'
    } catch (error) {
      if (sequence !== detectionSequence) return
      state.importStatus = 'failed'
      state.error = toErrorMessage(error)
      ports.onLog?.({ level: 'error', message: 'Standalone browser file detection failed' })
    }
  }

  async function importSelectedFile(): Promise<void> {
    const file = state.selectedFile
    const format = state.detectedFormat
    if (!file || !format || state.importStatus === 'importing') return

    cancelRequested = false
    state.importStatus = 'importing'
    state.importProgress = { stage: 'detecting', progress: 0 }
    state.importSummary = null
    state.batchFailures = []
    state.batchCurrentPosition = 0
    state.batchTotal = 0
    state.currentChatName = null
    state.error = null
    const selectedChats = format.multiChat
      ? state.multiChatEntries.filter((chat) => state.selectedChatIndexes.includes(chat.index))
      : []
    if (format.multiChat && selectedChats.length === 0) {
      state.importStatus = 'ready'
      state.importProgress = null
      return
    }
    state.batchTotal = selectedChats.length
    ports.onLog?.({
      level: 'info',
      message: 'Standalone browser import started',
      data: { formatId: format.id, chatCount: format.multiChat ? selectedChats.length : 1 },
    })

    if (format.multiChat) {
      await importSelectedChats(file, format, selectedChats)
      return
    }

    let result: ImportResult
    try {
      result = await ports.importer.importFile(file, { formatId: format.id }, (progress) => {
        state.importProgress = progress
      })
    } catch (error) {
      if (cancelRequested) {
        state.importStatus = 'cancelled'
        state.error = null
        ports.onLog?.({ level: 'info', message: 'Standalone browser import cancelled' })
        return
      }
      state.importStatus = 'failed'
      state.error = toErrorMessage(error)
      ports.onLog?.({ level: 'error', message: 'Standalone browser import failed' })
      return
    }
    if (cancelRequested) {
      state.importStatus = 'cancelled'
      state.error = null
      ports.onLog?.({ level: 'info', message: 'Standalone browser import cancelled' })
      return
    }
    if (!result.success) {
      state.importStatus = 'failed'
      state.error = result.error ?? 'Import failed'
      ports.onLog?.({ level: 'error', message: 'Standalone browser import failed' })
      return
    }

    state.importStatus = 'success'
    state.importSummary = {
      messageCount: result.messageCount ?? result.newMessageCount ?? 0,
      memberCount: result.memberCount ?? 0,
    }
    state.selectedFile = null
    state.detectedFormat = null
    await refreshSessions()
    ports.onLog?.({
      level: 'info',
      message: 'Standalone browser import completed',
      data: { messageCount: state.importSummary.messageCount, memberCount: state.importSummary.memberCount },
    })
  }

  async function importSelectedChats(file: File, format: FormatInfo, chats: MultiChatEntry[]): Promise<void> {
    let messageCount = 0
    let memberCount = 0
    let sessionCount = 0

    for (let position = 0; position < chats.length; position += 1) {
      if (cancelRequested) break
      const chat = chats[position]
      state.batchCurrentPosition = position + 1
      state.currentChatName = chat.name
      state.importProgress = { stage: 'detecting', progress: 0 }

      let result: ImportResult
      try {
        result = await ports.importer.importFile(file, { formatId: format.id, chatIndex: chat.index }, (progress) => {
          state.importProgress = progress
        })
      } catch (error) {
        if (cancelRequested) break
        result = { success: false, error: toErrorMessage(error) }
      }

      if (cancelRequested) break
      if (result.success) {
        sessionCount += 1
        messageCount += result.messageCount ?? result.newMessageCount ?? 0
        memberCount += result.memberCount ?? 0
      } else {
        state.batchFailures.push({
          index: chat.index,
          name: chat.name,
          error: result.error ?? 'Import failed',
        })
        ports.onLog?.({
          level: 'error',
          message: 'Standalone browser chat import failed',
          data: { chatIndex: chat.index },
        })
      }
    }

    state.importSummary = {
      messageCount,
      memberCount,
      sessionCount,
      totalCount: chats.length,
      failedCount: state.batchFailures.length,
    }
    state.currentChatName = null
    if (sessionCount > 0) await refreshSessions()

    if (cancelRequested) {
      state.importStatus = 'cancelled'
      state.error = null
      ports.onLog?.({
        level: 'info',
        message: 'Standalone browser import cancelled',
        data: { completedCount: sessionCount, totalCount: chats.length },
      })
      return
    }
    if (sessionCount === 0) {
      state.importStatus = 'failed'
      state.error = state.batchFailures[0]?.error ?? 'Import failed'
      ports.onLog?.({
        level: 'error',
        message: 'Standalone browser multi-chat import failed',
        data: { failedCount: state.batchFailures.length },
      })
      return
    }

    state.importStatus = 'success'
    state.selectedFile = null
    state.detectedFormat = null
    state.multiChatEntries = []
    state.selectedChatIndexes = []
    ports.onLog?.({
      level: 'info',
      message: 'Standalone browser multi-chat import completed',
      data: {
        sessionCount,
        failedCount: state.batchFailures.length,
        messageCount,
        memberCount,
      },
    })
  }

  function cancelImport(): void {
    if (state.importStatus !== 'importing') return
    cancelRequested = true
    ports.importer.cancelActiveImport?.()
  }

  function toggleChatSelection(chatIndex: number): void {
    if (state.importStatus !== 'ready' || !state.multiChatEntries.some((chat) => chat.index === chatIndex)) return
    state.selectedChatIndexes = state.selectedChatIndexes.includes(chatIndex)
      ? state.selectedChatIndexes.filter((index) => index !== chatIndex)
      : [...state.selectedChatIndexes, chatIndex].sort((left, right) => left - right)
  }

  function toggleAllChats(): void {
    if (state.importStatus !== 'ready' || state.multiChatEntries.length === 0) return
    const allSelected = state.multiChatEntries.every((chat) => state.selectedChatIndexes.includes(chat.index))
    state.selectedChatIndexes = allSelected ? [] : state.multiChatEntries.map((chat) => chat.index)
  }

  async function renameSession(sessionId: string, name: string): Promise<boolean> {
    const normalizedName = name.trim()
    if (!normalizedName || state.busySessionId) return false
    state.busySessionId = sessionId
    state.error = null
    try {
      const renamed = await ports.data.renameSession(sessionId, normalizedName)
      if (renamed) await loadSessions()
      return renamed
    } catch (error) {
      state.error = toErrorMessage(error)
      ports.onLog?.({ level: 'error', message: 'Standalone browser session rename failed' })
      return false
    } finally {
      state.busySessionId = null
    }
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    if (state.busySessionId) return false
    state.busySessionId = sessionId
    state.error = null
    try {
      const deleted = await ports.data.deleteSession(sessionId)
      if (deleted) {
        if (state.selectedSessionId === sessionId) closeSessionAnalysis()
        await loadSessions()
      }
      return deleted
    } catch (error) {
      state.error = toErrorMessage(error)
      ports.onLog?.({ level: 'error', message: 'Standalone browser session deletion failed' })
      return false
    } finally {
      state.busySessionId = null
    }
  }

  async function openSessionAnalysis(sessionId: string): Promise<void> {
    const sequence = ++analysisSequence
    state.selectedSessionId = sessionId
    state.analysisStatus = 'loading'
    state.hourlyActivity = []
    state.analysisError = null
    try {
      const hourly = await ports.data.getHourlyActivity(sessionId)
      if (sequence !== analysisSequence) return
      state.hourlyActivity = hourly
      state.analysisStatus = 'ready'
    } catch (error) {
      if (sequence !== analysisSequence) return
      state.analysisStatus = 'failed'
      state.analysisError = toErrorMessage(error)
      ports.onLog?.({
        level: 'error',
        message: 'Standalone browser hourly activity query failed',
        data: { sessionId },
      })
    }
  }

  function closeSessionAnalysis(): void {
    analysisSequence += 1
    state.selectedSessionId = null
    state.analysisStatus = 'idle'
    state.hourlyActivity = []
    state.analysisError = null
  }

  function clearImportState(): void {
    if (state.importStatus === 'importing') return
    state.selectedFile = null
    state.detectedFormat = null
    state.multiChatEntries = []
    state.selectedChatIndexes = []
    state.importStatus = 'idle'
    state.importProgress = null
    state.importSummary = null
    state.batchFailures = []
    state.batchCurrentPosition = 0
    state.batchTotal = 0
    state.currentChatName = null
    state.error = null
    detectionSequence += 1
  }

  return {
    state,
    initialize,
    refreshSessions,
    selectFile,
    importSelectedFile,
    cancelImport,
    toggleChatSelection,
    toggleAllChats,
    renameSession,
    deleteSession,
    openSessionAnalysis,
    closeSessionAnalysis,
    clearImportState,
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
