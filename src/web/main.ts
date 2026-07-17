import { createApp } from 'vue'
import { useBrowserRuntimeService } from '@/services/browser-runtime/service'
import i18n from '@/i18n'
import { installGlobalErrorReporting, reportError, reportRuntimeLog } from '@/services/log-report'
import { initServices } from '@/services/registry'
import App from './App.vue'
import './styles.css'

installGlobalErrorReporting()

async function start(): Promise<void> {
  reportRuntimeLog({ level: 'info', scope: 'web-bootstrap', message: 'Initializing browser services' })
  await initServices()
  const runtime = useBrowserRuntimeService()
  window.addEventListener('pagehide', () => runtime.dispose(), { once: true })

  const app = createApp(App)
  app.config.errorHandler = (error, _instance, info) => {
    const normalized = error instanceof Error ? error : new Error(String(error))
    console.error(normalized, info)
    reportError(normalized.message, normalized.stack)
  }
  app.use(i18n)
  app.mount('#app')
}

start().catch((error) => {
  console.error('Web runtime startup failed', error)
  reportError(error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined)
  const root = document.querySelector<HTMLElement>('#app')
  if (root) root.textContent = String(i18n.global.t('common.initFailed'))
})
