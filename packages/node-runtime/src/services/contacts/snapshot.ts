import fs from 'node:fs'
import path from 'node:path'
import type { ContactsTimeRangePreset } from '@openchatlab/shared-types'
import { appLogger } from '../../logging/app-logger'
import type { ContactsSnapshot } from './compute'
import { normalizeContactsTimeRangePreset } from './time-range'

const CONTACTS_SNAPSHOT_TMP_PREFIX = 'contacts-snapshot.tmp-'

export interface ReadContactsSnapshotOptions {
  now?: () => number
}

export function getContactsSnapshotPath(snapshotDir: string, timeRangePreset?: ContactsTimeRangePreset): string {
  const preset = normalizeContactsTimeRangePreset(timeRangePreset)
  return path.join(snapshotDir, `contacts-snapshot-${preset}.json`)
}

export function readContactsSnapshot(
  snapshotDir: string,
  timeRangePreset?: ContactsTimeRangePreset,
  options: ReadContactsSnapshotOptions = {}
): ContactsSnapshot | null {
  const snapshotPath = getContactsSnapshotPath(snapshotDir, timeRangePreset)
  if (!fs.existsSync(snapshotPath)) return null

  try {
    return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as ContactsSnapshot
  } catch (error) {
    const ts = options.now?.() ?? Date.now()
    const backupPath = path.join(snapshotDir, `contacts-snapshot.corrupt-${ts}.json`)
    try {
      fs.renameSync(snapshotPath, backupPath)
    } catch (renameError) {
      appLogger.warn('contacts', 'failed to backup corrupt contacts snapshot', renameError)
    }
    appLogger.warn('contacts', 'contacts snapshot is corrupt', error)
    return null
  }
}

export function writeContactsSnapshot(snapshotDir: string, snapshot: ContactsSnapshot): void {
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true })
  const tmpPath = path.join(snapshotDir, `${CONTACTS_SNAPSHOT_TMP_PREFIX}${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8')
  fs.renameSync(tmpPath, getContactsSnapshotPath(snapshotDir, snapshot.timeRange.preset))
}

export function cleanupContactsSnapshotTempFiles(snapshotDir: string): void {
  if (!fs.existsSync(snapshotDir)) return
  for (const name of fs.readdirSync(snapshotDir)) {
    if (!name.startsWith(CONTACTS_SNAPSHOT_TMP_PREFIX)) continue
    try {
      fs.rmSync(path.join(snapshotDir, name), { force: true })
    } catch (error) {
      appLogger.warn('contacts', 'failed to remove contacts snapshot temp file', error)
    }
  }
}
