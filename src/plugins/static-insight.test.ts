import assert from 'node:assert/strict'
import test from 'node:test'
import { InsightScopeController } from './insight-scope'
import {
  createStaticInsightPluginRuntime,
  installStaticInsightPluginUiServices,
  type StaticInsightPluginDescriptor,
} from './static-insight'
import { createUiServiceKey, UiServiceRegistry, type UiHostContext } from './ui-host'

const TEST_SERVICE = createUiServiceKey<{ value: string }>('test.static-insight-service')

function createHost(services: UiServiceRegistry): UiHostContext {
  return {
    theme: { getSnapshot: () => 'light', subscribe: () => () => {} },
    locale: {
      getSnapshot: () => 'en-US',
      subscribe: () => () => {},
      translate: (key) => key,
      formatDate: (value) => String(value),
      formatNumber: (value) => String(value),
    },
    overlay: { getRoot: () => null },
    insightScope: new InsightScopeController(),
    services,
  }
}

const descriptor: StaticInsightPluginDescriptor = {
  plugin: {
    id: 'test.static-insight',
    platforms: ['cli-web'],
    activate(context) {
      context.pages.register({
        id: 'test-page',
        path: 'test-page',
        routeName: 'insight-test-page',
        titleKey: 'test.page',
        icon: 'test-icon',
        view: { load: async () => ({}) },
      })
    },
  },
  installUiServices: async (services) => services.register(TEST_SERVICE, { value: 'installed' }),
}

test('uses one static descriptor for plugin contributions and UI services', async () => {
  const services = new UiServiceRegistry()
  const runtime = createStaticInsightPluginRuntime('cli-web', createHost(services), [descriptor])
  const disposeServices = await installStaticInsightPluginUiServices([descriptor], runtime, services)

  assert.equal(runtime.getPage('test-page')?.id, 'test-page')
  assert.equal(services.get(TEST_SERVICE).value, 'installed')

  disposeServices()
  assert.throws(() => services.get(TEST_SERVICE), /is unavailable/)
})

test('removing a static descriptor removes both contributions and its service installer', async () => {
  const services = new UiServiceRegistry()
  const runtime = createStaticInsightPluginRuntime('cli-web', createHost(services), [])
  const disposeServices = await installStaticInsightPluginUiServices([], runtime, services)

  assert.equal(runtime.getPage('test-page'), undefined)
  assert.throws(() => services.get(TEST_SERVICE), /is unavailable/)
  disposeServices()
})
