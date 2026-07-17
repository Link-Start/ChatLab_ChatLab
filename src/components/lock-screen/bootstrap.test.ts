import assert from 'node:assert/strict'
import test from 'node:test'
import { useLockScreenBootstrap } from './bootstrap'

test('desktop content stays masked until the lock screen finishes its initial state check', () => {
  const { isBootstrapMaskVisible, markLockScreenReady } = useLockScreenBootstrap(true)

  assert.equal(isBootstrapMaskVisible.value, true)
  markLockScreenReady()
  assert.equal(isBootstrapMaskVisible.value, false)
})

test('web content never enables the desktop lock bootstrap mask', () => {
  const { isBootstrapMaskVisible } = useLockScreenBootstrap(false)

  assert.equal(isBootstrapMaskVisible.value, false)
})
