import fs from 'node:fs'
import path from 'node:path'
import { appLogger } from '../../logging/app-logger'

const CONTACT_OVERRIDES_FILE_NAME = 'contact-overrides.json'
const CONTACT_OVERRIDES_TMP_PREFIX = 'contact-overrides.tmp-'
const CONTACT_OVERRIDES_VERSION = 1

export interface ManualFriendOverride {
  key: string
  createdAt: number
  updatedAt: number
}

export interface ContactOverridesFile {
  version: 1
  manualFriends: Record<string, ManualFriendOverride>
}

export interface ContactOverrideMutationResult {
  success: boolean
}

export function createEmptyContactOverridesFile(): ContactOverridesFile {
  return {
    version: CONTACT_OVERRIDES_VERSION,
    manualFriends: {},
  }
}

export function getContactOverridesPath(snapshotDir: string): string {
  return path.join(snapshotDir, CONTACT_OVERRIDES_FILE_NAME)
}

export function readContactOverrides(snapshotDir: string): ContactOverridesFile {
  const filePath = getContactOverridesPath(snapshotDir)
  if (!fs.existsSync(filePath)) return createEmptyContactOverridesFile()

  try {
    return normalizeContactOverrides(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
  } catch (error) {
    appLogger.warn('contacts', 'contact overrides file is unreadable', error)
    return createEmptyContactOverridesFile()
  }
}

export function writeContactOverrides(snapshotDir: string, overrides: ContactOverridesFile): void {
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true })
  const tmpPath = path.join(snapshotDir, `${CONTACT_OVERRIDES_TMP_PREFIX}${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmpPath, JSON.stringify(normalizeContactOverrides(overrides), null, 2), 'utf-8')
  fs.renameSync(tmpPath, getContactOverridesPath(snapshotDir))
}

function normalizeContactOverrides(value: unknown): ContactOverridesFile {
  const input = isRecord(value) ? value : {}
  const manualFriendsInput = isRecord(input.manualFriends) ? input.manualFriends : {}
  const manualFriends: Record<string, ManualFriendOverride> = {}

  for (const [key, entry] of Object.entries(manualFriendsInput)) {
    if (!key || !isRecord(entry)) continue
    const createdAt = Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now()
    const updatedAt = Number.isFinite(entry.updatedAt) ? Number(entry.updatedAt) : createdAt
    manualFriends[key] = { key, createdAt, updatedAt }
  }

  return {
    version: CONTACT_OVERRIDES_VERSION,
    manualFriends,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
