/**
 * Import performance logger.
 *
 * Extracted from electron/main/worker/core/perfLogger.ts.
 * Records real-time performance metrics during import operations.
 *
 * Caller provides the log directory; this module has no path assumptions.
 */

import * as fs from 'fs'
import * as path from 'path'

export enum LogLevel {
  ERROR = 'ERROR',
  INFO = 'INFO',
}

let lastLogTime = Date.now()
let lastMessageCount = 0
let currentLogFile: string | null = null
let errorCount = 0

export function initPerfLog(sessionId: string, logDir: string): void {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    currentLogFile = path.join(logDir, `import_${sessionId}_${Date.now()}.log`)
    fs.writeFileSync(currentLogFile, `=== Import Log ===\nStart time: ${new Date().toISOString()}\n\n`, 'utf-8')
  } catch {
    // Ignore initialization failure
  }
}

export function logPerf(event: string, messagesProcessed: number, batchSize?: number): void {
  const now = Date.now()
  const duration = now - lastLogTime
  const messagesDelta = messagesProcessed - lastMessageCount
  const speed = duration > 0 ? Math.round((messagesDelta / duration) * 1000) : 0

  let memory = 0
  try {
    const used = process.memoryUsage()
    memory = Math.round(used.heapUsed / 1024 / 1024)
  } catch {
    // Ignore
  }

  const logLine =
    `[${new Date().toISOString()}] ${event} | ` +
    `messages: ${messagesProcessed.toLocaleString()} | ` +
    `elapsed: ${duration}ms | ` +
    `speed: ${speed.toLocaleString()}/s | ` +
    `memory: ${memory}MB` +
    (batchSize ? ` | batch: ${batchSize}` : '') +
    '\n'

  if (currentLogFile) {
    try {
      fs.appendFileSync(currentLogFile, logLine, 'utf-8')
    } catch {
      // Ignore write failure
    }
  }

  lastLogTime = now
  lastMessageCount = messagesProcessed
}

export function logPerfDetail(detail: string): void {
  if (currentLogFile) {
    try {
      fs.appendFileSync(currentLogFile, `  ${detail}\n`, 'utf-8')
    } catch {
      // Ignore
    }
  }
}

export function resetPerfLog(): void {
  lastLogTime = Date.now()
  lastMessageCount = 0
  currentLogFile = null
  errorCount = 0
}

export function getCurrentLogFile(): string | null {
  return currentLogFile
}

function writeLogLine(level: LogLevel, message: string): void {
  if (!currentLogFile) return

  const logLine = `[${new Date().toISOString()}] [${level}] ${message}\n`
  try {
    fs.appendFileSync(currentLogFile, logLine, 'utf-8')
  } catch {
    // Ignore write failure
  }
}

export function logError(message: string, error?: Error): void {
  errorCount++
  const errorDetail = error ? `: ${error.message}` : ''
  writeLogLine(LogLevel.ERROR, `${message}${errorDetail}`)
}

export function logInfo(message: string): void {
  writeLogLine(LogLevel.INFO, message)
}

export function getErrorCount(): number {
  return errorCount
}

export function logSummary(totalMessages: number, totalMembers: number): void {
  if (!currentLogFile) return

  const summary = `
=== Import Summary ===
End time: ${new Date().toISOString()}
Total messages: ${totalMessages.toLocaleString()}
Total members: ${totalMembers.toLocaleString()}
Errors: ${errorCount}
`
  try {
    fs.appendFileSync(currentLogFile, summary, 'utf-8')
  } catch {
    // Ignore
  }
}
