import { getDbFileVersion } from '../../cache/analytics-cache'
import type { SessionRuntimeAdapter } from '../adapters'
import { CONTACTS_ALGORITHM_VERSION } from './compute'
import { normalizeContactsTimeRangePreset } from './time-range'
import type { ContactsTimeRangePreset } from '@openchatlab/shared-types'

export function buildContactsSignature(
  adapter: SessionRuntimeAdapter,
  timeRangePreset?: ContactsTimeRangePreset
): string {
  const parts = [
    `algorithm:${CONTACTS_ALGORITHM_VERSION}`,
    `range:${normalizeContactsTimeRangePreset(timeRangePreset)}`,
  ]
  for (const sessionId of [...adapter.listSessionIds()].sort()) {
    const dbPath = adapter.getDbPath(sessionId)
    parts.push(`${sessionId}:${getDbFileVersion(dbPath)}`)
  }
  return parts.join('|')
}
