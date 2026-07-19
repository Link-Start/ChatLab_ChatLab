import type { BrowserCapabilityReport } from '@openchatlab/web-runtime'
import type { PlatformCapabilities } from '@/utils/platform-capabilities'

export class UnsupportedBrowserCapabilitiesError extends Error {
  constructor(readonly missing: string[]) {
    super(`Missing browser capabilities: ${missing.join(', ')}`)
    this.name = 'UnsupportedBrowserCapabilitiesError'
  }
}

export interface AppInitializationPorts {
  capabilities: PlatformCapabilities
  initializeServices(): Promise<void>
  checkBrowserCapabilities?: () => Promise<BrowserCapabilityReport>
  initializePreferences(): Promise<void>
  initializeLocale?: () => Promise<void>
  initializeLlm?: () => Promise<void>
  loadSessions(): Promise<void>
  listenForPullResults?: () => () => void
}

export interface AppInitializationResult {
  browserCapabilities: BrowserCapabilityReport | null
  stopListeningForPullResults: (() => void) | null
}

export async function initializeAppRuntime(ports: AppInitializationPorts): Promise<AppInitializationResult> {
  await ports.initializeServices()

  let browserCapabilities: BrowserCapabilityReport | null = null
  if (ports.capabilities.usesBrowserRuntime) {
    if (!ports.checkBrowserCapabilities) throw new Error('Browser capability checker is required')
    browserCapabilities = await ports.checkBrowserCapabilities()
    if (!browserCapabilities.supported) {
      throw new UnsupportedBrowserCapabilitiesError(browserCapabilities.missing)
    }
  }

  if (ports.capabilities.loadsPreferences) await ports.initializePreferences()
  if (ports.capabilities.initializesLlm) {
    if (!ports.initializeLocale || !ports.initializeLlm) throw new Error('LLM initialization ports are required')
    await ports.initializeLocale()
    await ports.initializeLlm()
  }

  await ports.loadSessions()

  let stopListeningForPullResults: (() => void) | null = null
  if (ports.capabilities.listensForPullResults) {
    if (!ports.listenForPullResults) throw new Error('Pull result listener is required')
    stopListeningForPullResults = ports.listenForPullResults()
  }

  return {
    browserCapabilities,
    stopListeningForPullResults,
  }
}
