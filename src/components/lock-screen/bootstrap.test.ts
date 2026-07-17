import assert from 'node:assert/strict'
import test from 'node:test'
import { useLockScreenBootstrap } from './bootstrap'

test('desktop content stays unmounted until the lock screen is ready and unlocked', () => {
  const { isBootstrapMaskVisible, isApplicationContentVisible, markLockScreenReady, updateLockState } =
    useLockScreenBootstrap(true)

  assert.equal(isBootstrapMaskVisible.value, true)
  assert.equal(isApplicationContentVisible.value, false)

  updateLockState(false)
  assert.equal(isApplicationContentVisible.value, false)

  markLockScreenReady()
  assert.equal(isBootstrapMaskVisible.value, false)
  assert.equal(isApplicationContentVisible.value, true)

  updateLockState(true)
  assert.equal(isApplicationContentVisible.value, false)

  updateLockState(false)
  assert.equal(isApplicationContentVisible.value, true)
})

test('web content remains visible and never enables the desktop lock bootstrap mask', () => {
  const { isBootstrapMaskVisible, isApplicationContentVisible, updateLockState } = useLockScreenBootstrap(false)

  assert.equal(isBootstrapMaskVisible.value, false)
  assert.equal(isApplicationContentVisible.value, true)

  updateLockState(true)
  assert.equal(isApplicationContentVisible.value, true)
})
