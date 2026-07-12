import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { appLogger } from '../logging/app-logger'

export const IMPORT_LOCK_FILENAME = '.chatlab-import.lock'
export const IMPORT_IN_PROGRESS_ERROR_KEY = 'error.import_in_progress'

interface ImportLockOwner {
  pid: number
  token: string
  startedAt: number
}

export class ImportInProgressError extends Error {
  readonly code = 'IMPORT_IN_PROGRESS'
  readonly errorKey = IMPORT_IN_PROGRESS_ERROR_KEY

  constructor() {
    super('Another import is already in progress')
    this.name = 'ImportInProgressError'
  }
}

function parseOwner(lockPath: string): ImportLockOwner | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as Partial<ImportLockOwner>
    if (
      typeof parsed.pid !== 'number' ||
      !Number.isInteger(parsed.pid) ||
      parsed.pid <= 0 ||
      typeof parsed.token !== 'string' ||
      parsed.token.length === 0 ||
      typeof parsed.startedAt !== 'number'
    ) {
      return null
    }
    return parsed as ImportLockOwner
  } catch {
    return null
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function removeStaleLock(lockPath: string): boolean {
  const owner = parseOwner(lockPath)
  if (owner) {
    if (isProcessRunning(owner.pid)) return false
  } else {
    try {
      // A competing process may have created the file but not written its owner yet.
      // Only treat malformed lock files as stale after that short creation window.
      if (Date.now() - fs.statSync(lockPath).mtimeMs < 5_000) return false
    } catch {
      return true
    }
  }

  try {
    fs.unlinkSync(lockPath)
    appLogger.warn('import-lock', 'Removed stale import lock', { ownerPid: owner?.pid })
    return true
  } catch {
    return false
  }
}

function releaseLock(lockPath: string, fd: number, owner: ImportLockOwner): void {
  try {
    fs.closeSync(fd)
  } catch (error) {
    appLogger.error('import-lock', 'Failed to close import lock', error)
  }

  try {
    if (parseOwner(lockPath)?.token !== owner.token) {
      appLogger.warn('import-lock', 'Import lock ownership changed before release')
      return
    }
    fs.unlinkSync(lockPath)
    appLogger.info('import-lock', 'Import lock released')
  } catch (error) {
    appLogger.error('import-lock', 'Failed to release import lock', error)
  }
}

export async function withDataDirImportLock<T>(userDataDir: string, task: () => Promise<T>): Promise<T> {
  fs.mkdirSync(userDataDir, { recursive: true })
  const lockPath = path.join(userDataDir, IMPORT_LOCK_FILENAME)

  let fd: number | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fd = fs.openSync(lockPath, 'wx')
      break
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST' && attempt === 0 && removeStaleLock(lockPath)) continue
      if (code === 'EEXIST') {
        appLogger.warn('import-lock', 'Rejected concurrent import')
        throw new ImportInProgressError()
      }
      throw error
    }
  }

  if (fd === null) throw new ImportInProgressError()

  const owner: ImportLockOwner = {
    pid: process.pid,
    token: randomUUID(),
    startedAt: Date.now(),
  }

  try {
    fs.writeFileSync(fd, JSON.stringify(owner), 'utf-8')
    fs.fsyncSync(fd)
    appLogger.info('import-lock', 'Import lock acquired')
    return await task()
  } finally {
    releaseLock(lockPath, fd, owner)
  }
}
