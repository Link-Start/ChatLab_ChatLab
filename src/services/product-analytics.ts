import type { AnalyticsEventName } from '@openchatlab/shared-types'
import { usePlatformService } from './platform/service'

export function trackProductEvent(eventName: AnalyticsEventName, properties?: Record<string, unknown>): void {
  try {
    void usePlatformService()
      .trackAnalyticsEvent(eventName, properties)
      .catch(() => {})
  } catch {
    // Analytics is best-effort and may run before the platform adapter is registered in tests or early startup.
  }
}
