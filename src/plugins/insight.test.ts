import assert from 'node:assert/strict'
import test from 'node:test'
import { annualSummaryBuiltin } from './builtin/annual-summary'
import { getLegacyInsightPages, listInsightShellPages } from './insight-catalog'
import { createInsightPluginRuntime, type InsightPlugin } from './insight'
import { InsightScopeController } from './insight-scope'
import { UiServiceRegistry, type UiHostContext } from './ui-host'

const services = new UiServiceRegistry()
const annualSummaryPlugin = annualSummaryBuiltin.plugin
const uiHost: UiHostContext = {
  theme: {
    getSnapshot: () => 'light',
    subscribe: () => () => {},
  },
  locale: {
    getSnapshot: () => 'en-US',
    subscribe: () => () => {},
    translate: (key) => key,
    formatDate: (value) => String(value),
    formatNumber: (value) => String(value),
  },
  overlay: {
    getRoot: () => null,
  },
  insightScope: new InsightScopeController(),
  services,
}

test('registers annual summary as a removable Desktop and CLI Web contribution', () => {
  const runtime = createInsightPluginRuntime('cli-web', uiHost, [annualSummaryPlugin])

  assert.equal(runtime.isActive(annualSummaryPlugin.id), true)
  assert.equal(runtime.getDefaultPage()?.id, 'annual-summary')
  assert.deepEqual(runtime.getPage('annual-summary')?.filters?.time, {
    allowedModes: ['recent', 'year'],
    allowedRecentDays: [365],
    defaultMode: 'year',
  })
  assert.deepEqual(
    runtime.listNavigation().map(({ page }) => page.id),
    ['annual-summary']
  )

  runtime.dispose(annualSummaryPlugin.id)
  assert.equal(runtime.getPage('annual-summary'), undefined)
  assert.deepEqual(runtime.listNavigation(), [])
})

test('keeps the annual summary plugin out of Web WASM', () => {
  const runtime = createInsightPluginRuntime('web-wasm', uiHost, [annualSummaryPlugin])

  assert.equal(runtime.isActive(annualSummaryPlugin.id), false)
  assert.deepEqual(runtime.listPages(), [])
  assert.deepEqual(
    listInsightShellPages(runtime).map((page) => page.id),
    ['time-investment']
  )
})

test('combines plugin and legacy Insight pages by navigation order', () => {
  const runtime = createInsightPluginRuntime('electron', uiHost, [annualSummaryPlugin])

  assert.deepEqual(
    listInsightShellPages(runtime).map((page) => page.id),
    ['annual-summary', 'time-investment', 'relationship-changes']
  )
})

test('rolls back a plugin whose navigation targets an unknown page', () => {
  const brokenPlugin: InsightPlugin = {
    id: 'broken-insight',
    platforms: ['cli-web'],
    activate(context) {
      assert.equal(context.ui, uiHost)
      context.navigation.register({ id: 'broken-entry', pageId: 'missing-page', order: 1 })
    },
  }
  const runtime = createInsightPluginRuntime('cli-web', uiHost)

  assert.throws(() => runtime.activate(brokenPlugin), /targets unknown page "missing-page"/)
  assert.equal(runtime.isActive(brokenPlugin.id), false)
  assert.deepEqual(runtime.listNavigation(), [])
})

test('normalizes time filter declarations and rejects invalid defaults', () => {
  const runtime = createInsightPluginRuntime('cli-web', uiHost)
  runtime.activate({
    id: 'normalized-filter',
    platforms: ['cli-web'],
    activate(context) {
      context.pages.register({
        id: 'normalized',
        path: 'normalized',
        routeName: 'insight-normalized',
        titleKey: 'normalized.title',
        icon: 'normalized-icon',
        filters: {
          time: {
            allowedModes: ['year', 'year', 'recent'],
            allowedRecentDays: [365, 365],
            defaultMode: 'year',
          },
        },
        view: { load: async () => ({}) },
      })
    },
  })
  assert.deepEqual(runtime.getPage('normalized')?.filters?.time, {
    allowedModes: ['year', 'recent'],
    allowedRecentDays: [365],
    defaultMode: 'year',
  })

  assert.throws(
    () =>
      runtime.activate({
        id: 'invalid-filter',
        platforms: ['cli-web'],
        activate(context) {
          context.pages.register({
            id: 'invalid',
            path: 'invalid',
            routeName: 'insight-invalid',
            titleKey: 'invalid.title',
            icon: 'invalid-icon',
            filters: { time: { allowedModes: ['recent'], defaultMode: 'year' } },
            view: { load: async () => ({}) },
          })
        },
      }),
    /default time mode that is not allowed/
  )
  assert.equal(runtime.isActive('invalid-filter'), false)
})

test('rejects plugin pages that conflict with host-owned legacy pages', () => {
  const runtime = createInsightPluginRuntime('cli-web', uiHost, [], getLegacyInsightPages('cli-web'))

  assert.throws(
    () =>
      runtime.activate({
        id: 'conflicting-page',
        platforms: ['cli-web'],
        activate(context) {
          context.pages.register({
            id: 'time-investment',
            path: 'another-path',
            routeName: 'another-route',
            titleKey: 'another.title',
            icon: 'another-icon',
            view: { load: async () => ({}) },
          })
        },
      }),
    /conflicts with a host page/
  )
  assert.equal(runtime.isActive('conflicting-page'), false)
})
