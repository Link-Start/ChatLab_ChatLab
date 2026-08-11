import type { RuntimePlatform } from '@/utils/platform-capabilities'
import { DisposableStore, type Disposer } from './core'
import {
  createInsightPluginRuntime,
  type InsightPageDefinition,
  type InsightPlugin,
  type InsightPluginRuntime,
} from './insight'
import type { UiHostContext, UiServiceRegistry } from './ui-host'

export interface StaticInsightPluginDescriptor {
  plugin: InsightPlugin
  installUiServices?: (services: UiServiceRegistry) => Promise<void | Disposer>
}

export function createStaticInsightPluginRuntime(
  platform: RuntimePlatform,
  ui: UiHostContext,
  descriptors: readonly StaticInsightPluginDescriptor[],
  reservedPages: readonly InsightPageDefinition[] = []
): InsightPluginRuntime {
  return createInsightPluginRuntime(
    platform,
    ui,
    descriptors.map(({ plugin }) => plugin),
    reservedPages
  )
}

export async function installStaticInsightPluginUiServices(
  descriptors: readonly StaticInsightPluginDescriptor[],
  runtime: InsightPluginRuntime,
  services: UiServiceRegistry
): Promise<Disposer> {
  const disposables = new DisposableStore()
  try {
    for (const descriptor of descriptors) {
      if (!runtime.isActive(descriptor.plugin.id) || !descriptor.installUiServices) continue
      const disposer = await descriptor.installUiServices(services)
      if (disposer) disposables.add(disposer)
    }
  } catch (error) {
    try {
      disposables.dispose()
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Static Insight UI service installation and rollback failed')
    }
    throw error
  }
  return () => disposables.dispose()
}
