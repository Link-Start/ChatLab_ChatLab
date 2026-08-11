import type { LocaleType } from '@/i18n'
import type { Disposer } from './core'
import type { InsightScope } from './insight-scope'

declare const uiServiceType: unique symbol

export interface UiServiceKey<T> {
  id: string
  readonly [uiServiceType]?: T
}

export function createUiServiceKey<T>(id: string): UiServiceKey<T> {
  return { id }
}

export interface UiServiceProvider {
  get<T>(key: UiServiceKey<T>): T
}

export class UiServiceRegistry implements UiServiceProvider {
  private readonly services = new Map<string, unknown>()

  register<T>(key: UiServiceKey<T>, service: T): Disposer {
    if (this.services.has(key.id)) throw new Error(`UI host service "${key.id}" is already registered`)
    this.services.set(key.id, service)
    return () => {
      if (this.services.get(key.id) === service) this.services.delete(key.id)
    }
  }

  get<T>(key: UiServiceKey<T>): T {
    if (!this.services.has(key.id)) throw new Error(`UI host service "${key.id}" is unavailable`)
    return this.services.get(key.id) as T
  }
}

export type ThemeMode = 'light' | 'dark'

export interface ThemeService {
  getSnapshot(): ThemeMode
  subscribe(listener: () => void): Disposer
}

export interface LocaleService {
  getSnapshot(): LocaleType
  subscribe(listener: () => void): Disposer
  translate(key: string, params?: Record<string, unknown>): string
  formatDate(value: Date | number): string
  formatNumber(value: number): string
}

export interface OverlayService {
  getRoot(): HTMLElement | null
}

export interface UiHostContext {
  theme: ThemeService
  locale: LocaleService
  overlay: OverlayService
  insightScope: InsightScope
  services: UiServiceProvider
}
