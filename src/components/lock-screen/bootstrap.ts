import { computed, ref } from 'vue'

export function useLockScreenBootstrap(isElectron: boolean) {
  const isLockScreenReady = ref(!isElectron)
  const isLocked = ref(isElectron)
  const isBootstrapMaskVisible = computed(() => isElectron && !isLockScreenReady.value)
  // Electron 在锁屏状态确认前保持 fail-closed；Web 不启用应用锁门禁。
  const isApplicationContentVisible = computed(() => !isElectron || (isLockScreenReady.value && !isLocked.value))

  function markLockScreenReady(): void {
    isLockScreenReady.value = true
  }

  function updateLockState(locked: boolean): void {
    if (!isElectron) return
    isLocked.value = locked
  }

  return {
    isBootstrapMaskVisible,
    isApplicationContentVisible,
    markLockScreenReady,
    updateLockState,
  }
}
