import { appLogger } from '../logging/app-logger'
import {
  resolveAutoImportTarget,
  type AutoImportDecision,
  type AutoImportMatcherDeps,
  type AutoImportMatchMethod,
} from './auto-import-matcher'
import type { IncrementalImportResult } from './incremental-importer'
import type { ImportDiagnostics, StreamImportResult } from './streaming-importer'

export interface AutoImportOptions {
  explicitSessionId?: string
  formatOptions?: Record<string, unknown>
}

export interface AutoImportDeps extends AutoImportMatcherDeps {
  sessionExists(sessionId: string): boolean
  createSession(
    filePath: string,
    formatOptions?: Record<string, unknown>,
    sessionId?: string
  ): Promise<StreamImportResult>
  appendSession(
    sessionId: string,
    filePath: string,
    formatOptions?: Record<string, unknown>
  ): Promise<IncrementalImportResult>
  resolveTarget?: typeof resolveAutoImportTarget
}

export interface AutoImportResult {
  success: boolean
  sessionId?: string
  importMode?: 'created' | 'incremental'
  matchedBy?: AutoImportMatchMethod
  newMessageCount?: number
  duplicateCount?: number
  diagnostics?: ImportDiagnostics
  error?: string
}

function mapCreateResult(result: StreamImportResult): AutoImportResult {
  if (!result.success || !result.sessionId) {
    return { success: false, error: result.error, diagnostics: result.diagnostics }
  }
  return {
    success: true,
    sessionId: result.sessionId,
    importMode: 'created',
    newMessageCount: result.diagnostics?.messagesWritten ?? 0,
    duplicateCount: 0,
    diagnostics: result.diagnostics,
  }
}

function mapIncrementalResult(
  sessionId: string,
  result: IncrementalImportResult,
  matchedBy?: AutoImportMatchMethod
): AutoImportResult {
  if (!result.success) return { success: false, sessionId, error: result.error }
  return {
    success: true,
    sessionId,
    importMode: 'incremental',
    ...(matchedBy ? { matchedBy } : {}),
    newMessageCount: result.newMessageCount,
    duplicateCount: result.batch?.duplicateCount ?? 0,
  }
}

export async function autoImportFile(
  filePath: string,
  deps: AutoImportDeps,
  options: AutoImportOptions = {}
): Promise<AutoImportResult> {
  try {
    if (options.explicitSessionId) {
      if (deps.sessionExists(options.explicitSessionId)) {
        const result = mapIncrementalResult(
          options.explicitSessionId,
          await deps.appendSession(options.explicitSessionId, filePath, options.formatOptions)
        )
        appLogger.info('import', 'Explicit incremental import completed', {
          sessionId: options.explicitSessionId,
          success: result.success,
          newMessageCount: result.newMessageCount,
          duplicateCount: result.duplicateCount,
        })
        return result
      }

      const result = mapCreateResult(
        await deps.createSession(filePath, options.formatOptions, options.explicitSessionId)
      )
      appLogger.info('import', 'Explicit session import completed', {
        sessionId: result.sessionId,
        success: result.success,
        importMode: result.importMode,
      })
      return result
    }

    appLogger.info('import', 'Automatic session matching started', {
      candidateCount: deps.listSessionIds().length,
    })
    const decision: AutoImportDecision = await (deps.resolveTarget ?? resolveAutoImportTarget)(
      filePath,
      deps,
      options.formatOptions
    )

    if (decision.action === 'incremental') {
      const result = mapIncrementalResult(
        decision.sessionId,
        await deps.appendSession(decision.sessionId, filePath, options.formatOptions),
        decision.matchedBy
      )
      appLogger.info('import', 'Automatic incremental import completed', {
        sessionId: decision.sessionId,
        matchedBy: decision.matchedBy,
        success: result.success,
        newMessageCount: result.newMessageCount,
        duplicateCount: result.duplicateCount,
      })
      return result
    }

    const result = mapCreateResult(await deps.createSession(filePath, options.formatOptions))
    appLogger.info('import', 'Automatic import created a new session', {
      reason: decision.reason,
      sessionId: result.sessionId,
      success: result.success,
    })
    return result
  } catch (error) {
    appLogger.error('import', 'Automatic import failed', error)
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
