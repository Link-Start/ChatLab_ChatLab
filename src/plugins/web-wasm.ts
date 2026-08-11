import { createInsightPluginRuntime } from './insight'
import { getLegacyInsightPages } from './insight-catalog'
import { createVueUiHostContext } from './vue-ui-host'

export const webWasmInsightRuntime = createInsightPluginRuntime(
  'web-wasm',
  createVueUiHostContext(),
  [],
  getLegacyInsightPages('web-wasm')
)
