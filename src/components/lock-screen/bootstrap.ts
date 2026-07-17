import { computed, ref } from 'vue'

export function useLockScreenBootstrap(isElectron: boolean) {
  const isLockScreenReady = ref(!isElectron)
  const isBootstrapMaskVisible = computed(() => isElectron && !isLockScreenReady.value)

  function markLockScreenReady(): void {
    isLockScreenReady.value = true
  }

  return {
    isBootstrapMaskVisible,
    markLockScreenReady,
  }
}
