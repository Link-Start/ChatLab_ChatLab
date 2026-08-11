import { watch } from 'vue'
import { getLocale, i18n, type LocaleType } from '@/i18n'
import type { Disposer } from './core'
import { InsightScopeController } from './insight-scope'
import { UiServiceRegistry, type ThemeMode, type UiHostContext, type UiServiceProvider } from './ui-host'

export const PLUGIN_OVERLAY_ROOT_ID = 'chatlab-plugin-overlay-root'

function getThemeSnapshot(): ThemeMode {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribeToTheme(listener: () => void): Disposer {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}

  let previous = getThemeSnapshot()
  const observer = new MutationObserver(() => {
    const current = getThemeSnapshot()
    if (current === previous) return
    previous = current
    listener()
  })
  observer.observe(document.documentElement, { attributeFilter: ['class'], attributes: true })
  return () => observer.disconnect()
}

function subscribeToLocale(listener: () => void): Disposer {
  return watch(i18n.global.locale, listener)
}

function currentLocale(): LocaleType {
  return getLocale()
}

export interface CreateVueUiHostContextOptions {
  services?: UiServiceProvider
  insightScope?: InsightScopeController
}

export function createVueUiHostContext(options: CreateVueUiHostContextOptions = {}): UiHostContext {
  return {
    theme: {
      getSnapshot: getThemeSnapshot,
      subscribe: subscribeToTheme,
    },
    locale: {
      getSnapshot: currentLocale,
      subscribe: subscribeToLocale,
      translate: (key, params) => i18n.global.t(key, params ?? {}),
      formatDate: (value) => new Intl.DateTimeFormat(currentLocale()).format(value),
      formatNumber: (value) => new Intl.NumberFormat(currentLocale()).format(value),
    },
    overlay: {
      getRoot: () =>
        typeof document === 'undefined'
          ? null
          : ((document.getElementById(PLUGIN_OVERLAY_ROOT_ID) as HTMLElement | null) ?? document.body),
    },
    insightScope: options.insightScope ?? new InsightScopeController(),
    services: options.services ?? new UiServiceRegistry(),
  }
}
