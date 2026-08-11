import { inject, type App, type Component, type InjectionKey } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import type { InsightPluginRuntime } from './insight'
import type { UiHostContext } from './ui-host'

const INSIGHT_PLUGIN_RUNTIME_KEY: InjectionKey<InsightPluginRuntime> = Symbol('InsightPluginRuntime')
const UI_HOST_CONTEXT_KEY: InjectionKey<UiHostContext> = Symbol('UiHostContext')

export function installInsightPluginRuntime(app: App, runtime: InsightPluginRuntime): void {
  app.provide(INSIGHT_PLUGIN_RUNTIME_KEY, runtime)
  app.provide(UI_HOST_CONTEXT_KEY, runtime.ui)
}

export function useInsightPluginRuntime(): InsightPluginRuntime {
  const runtime = inject(INSIGHT_PLUGIN_RUNTIME_KEY)
  if (!runtime) throw new Error('Insight plugin runtime is unavailable')
  return runtime
}

export function useUiHostContext(): UiHostContext {
  const context = inject(UI_HOST_CONTEXT_KEY)
  if (!context) throw new Error('UI host context is unavailable')
  return context
}

export function createVueInsightRouteRecords(runtime: InsightPluginRuntime): RouteRecordRaw[] {
  return runtime.listPages().map((page) => ({
    path: page.path,
    name: page.routeName,
    component: async (): Promise<Component> => {
      const loaded = await page.view.load()
      if (typeof loaded === 'object' && loaded !== null && 'default' in loaded) {
        return loaded.default as Component
      }
      return loaded as Component
    },
    meta: { insightPageId: page.id },
  }))
}
