/**
 * Platform-agnostic assistant manager.
 * Abstracts file system operations and builtin resource loading
 * via dependency injection.
 */

import { parseAssistantFile, serializeAssistant } from './assistant-parser'
import type { AssistantConfig, AssistantSummary } from './types'

// ==================== Result types ====================

export interface AssistantInitResult {
  total: number
  generalCreated: boolean
}

export interface AssistantSaveResult {
  success: boolean
  error?: string
}

export interface BuiltinAssistantInfo {
  id: string
  name: string
  systemPrompt: string
  applicableChatTypes?: ('group' | 'private')[]
  supportedLocales?: string[]
  imported: boolean
}

// ==================== Dependency abstraction ====================

export interface AssistantManagerFs {
  ensureDir(dir: string): void
  listFiles(dir: string, ext: string): string[]
  readFile(filePath: string): string
  writeFile(filePath: string, content: string): void
  deleteFile(filePath: string): void
  fileExists(filePath: string): boolean
  joinPath(...parts: string[]): string
}

export interface AssistantManagerDeps {
  fs: AssistantManagerFs
  assistantsDir: string
  builtinRawConfigs?: Array<{ id: string; content: string }>
  generalIds?: string[]
  generateId?: () => string
  logger?: {
    info: (category: string, message: string, data?: unknown) => void
    warn: (category: string, message: string, data?: unknown) => void
    error: (category: string, message: string, data?: unknown) => void
  }
}

// ==================== Manager ====================

function toSummary(config: AssistantConfig): AssistantSummary {
  return {
    id: config.id,
    name: config.name,
    systemPrompt: config.systemPrompt,
    presetQuestions: config.presetQuestions,
    builtinId: config.builtinId,
    applicableChatTypes: config.applicableChatTypes,
    supportedLocales: config.supportedLocales,
  }
}

export class AssistantManager {
  private deps: AssistantManagerDeps
  private generalIds: string[]
  private builtinCache = new Map<string, AssistantConfig>()
  private cache = new Map<string, AssistantConfig>()
  private initialized = false

  constructor(deps: AssistantManagerDeps) {
    this.deps = deps
    this.generalIds = deps.generalIds || ['general_cn', 'general_en', 'general_ja']
    this.initBuiltinCache()
  }

  private initBuiltinCache(): void {
    if (!this.deps.builtinRawConfigs) return
    for (const { id, content } of this.deps.builtinRawConfigs) {
      const config = parseAssistantFile(content, `${id}.md`)
      if (config) this.builtinCache.set(config.id, config)
    }
  }

  private getBuiltinConfig(id: string): AssistantConfig | undefined {
    return this.builtinCache.get(id)
  }

  private ensureInitialized(): void {
    if (!this.initialized) this.init()
  }

  // ==================== Init ====================

  init(): AssistantInitResult {
    const { fs, assistantsDir } = this.deps
    fs.ensureDir(assistantsDir)

    const generalCreated = this.ensureGeneralAssistants()
    this.loadAll()

    this.initialized = true
    this.deps.logger?.info('AssistantManager', 'Initialized', {
      total: this.cache.size,
      generalCreated,
    })

    return { total: this.cache.size, generalCreated }
  }

  private ensureGeneralAssistants(): boolean {
    const { fs, assistantsDir } = this.deps
    let anyCreated = false
    for (const id of this.generalIds) {
      const config = this.getBuiltinConfig(id)
      if (!config) continue

      const filePath = fs.joinPath(assistantsDir, `${id}.md`)
      if (fs.fileExists(filePath)) continue

      fs.writeFile(filePath, serializeAssistant({ ...config, builtinId: config.id }))
      anyCreated = true
    }
    return anyCreated
  }

  private loadAll(): void {
    const { fs, assistantsDir } = this.deps
    this.cache.clear()

    const files = fs.listFiles(assistantsDir, '.md')
    for (const file of files) {
      try {
        const filePath = fs.joinPath(assistantsDir, file)
        const content = fs.readFile(filePath)
        const config = parseAssistantFile(content, filePath)
        if (config) {
          this.cache.set(config.id, config)
        } else {
          this.deps.logger?.warn('AssistantManager', `Failed to parse: ${file}`)
        }
      } catch (error) {
        this.deps.logger?.warn('AssistantManager', `Failed to load: ${file}`, { error: String(error) })
      }
    }
  }

  // ==================== Query ====================

  getAllAssistants(): AssistantSummary[] {
    this.ensureInitialized()
    return Array.from(this.cache.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(toSummary)
  }

  getAssistantConfig(id: string): AssistantConfig | null {
    this.ensureInitialized()
    return this.cache.get(id) ?? null
  }

  hasAssistant(id: string): boolean {
    this.ensureInitialized()
    return this.cache.has(id)
  }

  getBuiltinCatalog(): BuiltinAssistantInfo[] {
    this.ensureInitialized()
    return []
  }

  isGeneralAssistant(id: string): boolean {
    return this.generalIds.includes(id)
  }

  // ==================== Import ====================

  importAssistant(builtinId: string): AssistantSaveResult {
    this.ensureInitialized()

    const builtinConfig = this.getBuiltinConfig(builtinId)
    if (!builtinConfig) return { success: false, error: `Builtin assistant not found: ${builtinId}` }

    const existing = this.findByBuiltinId(builtinId)
    if (existing) return { success: false, error: `Assistant already imported: ${builtinId}` }

    return this.saveToDisk({ ...builtinConfig, builtinId: builtinConfig.id })
  }

  reimportAssistant(id: string): AssistantSaveResult {
    this.ensureInitialized()

    const existing = this.cache.get(id)
    if (!existing) return { success: false, error: `Assistant not found: ${id}` }
    if (!existing.builtinId) return { success: false, error: 'Only imported builtin assistants can be reimported' }

    const builtinConfig = this.getBuiltinConfig(existing.builtinId)
    if (!builtinConfig) return { success: false, error: `Builtin template not found: ${existing.builtinId}` }

    return this.saveToDisk({ ...builtinConfig, id: existing.id, builtinId: existing.builtinId })
  }

  importAssistantFromMd(rawMd: string): AssistantSaveResult & { id?: string } {
    this.ensureInitialized()

    const config = parseAssistantFile(rawMd, 'cloud_import.md')
    if (!config) return { success: false, error: 'Failed to parse assistant markdown' }

    if (this.cache.has(config.id)) return { success: false, error: `Assistant already exists: ${config.id}` }

    const result = this.saveToDisk(config)
    return { ...result, id: result.success ? config.id : undefined }
  }

  // ==================== Mutate ====================

  updateAssistant(id: string, updates: Partial<AssistantConfig>): AssistantSaveResult {
    this.ensureInitialized()

    const existing = this.cache.get(id)
    if (!existing) return { success: false, error: `Assistant not found: ${id}` }

    return this.saveToDisk({ ...existing, ...updates, id })
  }

  createAssistant(config: Omit<AssistantConfig, 'id'>): AssistantSaveResult & { id?: string } {
    this.ensureInitialized()

    const id = this.deps.generateId?.() || `custom_${Date.now().toString(36)}`
    const newConfig: AssistantConfig = { ...config, id, builtinId: undefined }

    const result = this.saveToDisk(newConfig)
    return { ...result, id: result.success ? id : undefined }
  }

  deleteAssistant(id: string): AssistantSaveResult {
    this.ensureInitialized()

    if (this.generalIds.includes(id)) return { success: false, error: 'Cannot delete the default assistant (general)' }

    const existing = this.cache.get(id)
    if (!existing) return { success: false, error: `Assistant not found: ${id}` }

    try {
      const filePath = this.deps.fs.joinPath(this.deps.assistantsDir, `${id}.md`)
      if (this.deps.fs.fileExists(filePath)) this.deps.fs.deleteFile(filePath)
      this.cache.delete(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  resetAssistant(id: string): AssistantSaveResult {
    this.ensureInitialized()

    const existing = this.cache.get(id)
    if (!existing?.builtinId) return { success: false, error: 'Only builtin assistants can be reset' }

    const builtinConfig = this.getBuiltinConfig(existing.builtinId)
    if (!builtinConfig) return { success: false, error: `Builtin config not found: ${existing.builtinId}` }

    return this.saveToDisk({ ...builtinConfig, id: existing.id, builtinId: existing.builtinId })
  }

  // ==================== Internal ====================

  private findByBuiltinId(builtinId: string): AssistantConfig | undefined {
    return Array.from(this.cache.values()).find((c) => c.builtinId === builtinId)
  }

  private saveToDisk(config: AssistantConfig): AssistantSaveResult {
    try {
      const filePath = this.deps.fs.joinPath(this.deps.assistantsDir, `${config.id}.md`)
      this.deps.fs.writeFile(filePath, serializeAssistant(config))
      this.cache.set(config.id, config)
      return { success: true }
    } catch (error) {
      this.deps.logger?.error('AssistantManager', `Failed to save: ${config.id}`, { error: String(error) })
      return { success: false, error: String(error) }
    }
  }
}
