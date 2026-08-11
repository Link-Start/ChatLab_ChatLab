import type { InsightPlugin } from '../../insight'
import type { StaticInsightPluginDescriptor } from '../../static-insight'

export const annualSummaryPlugin: InsightPlugin = {
  id: 'chatlab.insight.annual-summary',
  platforms: ['electron', 'cli-web'],
  activate(context) {
    context.pages.register({
      id: 'annual-summary',
      path: 'annual-summary',
      routeName: 'insight-annual-summary',
      titleKey: 'insight.tabs.annualSummary',
      icon: 'i-lucide-calendar-range',
      default: true,
      filters: {
        time: {
          allowedModes: ['recent', 'year'],
          allowedRecentDays: [365],
          defaultMode: 'year',
        },
      },
      view: {
        load: () => import('./ui/index.vue'),
      },
    })
    context.navigation.register({
      id: 'insight.annual-summary',
      pageId: 'annual-summary',
      order: 10,
    })
  },
}

export const annualSummaryBuiltin: StaticInsightPluginDescriptor = {
  plugin: annualSummaryPlugin,
  installUiServices: async (services) => {
    const { registerAnnualSummaryUiService } = await import('./host')
    return registerAnnualSummaryUiService(services)
  },
}
