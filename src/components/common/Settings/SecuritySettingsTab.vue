<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

type SecurityApi = Window['securityApi']
type LockConfig = Awaited<ReturnType<SecurityApi['getConfig']>>
type LockConfigUpdate = Parameters<SecurityApi['updateConfig']>[0]

const { t, locale } = useI18n()
const PIN_PATTERN = /^\d{4}$/
const DEFAULT_IDLE_TIMEOUT_MINUTES = 5
const IDLE_TIMEOUT_OPTIONS = [1, 3, 5, 10, 15, 30, 60]

const config = ref<LockConfig | null>(null)
const isLoading = ref(true)
const isSaving = ref(false)
const operationError = ref('')
const showPasswordModal = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const newPasswordConfirm = ref('')
const passwordError = ref('')
const isSubmitting = ref(false)

const isEnabled = computed(() => config.value?.enabled ?? false)
const canSubmitPassword = computed(() => {
  if (!PIN_PATTERN.test(newPassword.value) || newPassword.value !== newPasswordConfirm.value) return false
  return !isEnabled.value || PIN_PATTERN.test(oldPassword.value)
})
const timeoutOptions = computed(() => {
  const formatter = new Intl.NumberFormat(locale.value, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'short',
  })
  return IDLE_TIMEOUT_OPTIONS.map((value) => ({ value, label: formatter.format(value) }))
})

onMounted(async () => {
  await loadConfig()
  isLoading.value = false
})

async function loadConfig(): Promise<void> {
  try {
    config.value = await window.securityApi.getConfig()
  } catch {
    operationError.value = t('settings.security.password.errorFailed')
  }
}

async function applyConfig(updates: LockConfigUpdate): Promise<void> {
  isSaving.value = true
  operationError.value = ''
  try {
    const result = await window.securityApi.updateConfig(updates)
    if (result.success && result.config) config.value = result.config
    else operationError.value = t('settings.security.password.errorFailed')
  } catch {
    operationError.value = t('settings.security.password.errorFailed')
  } finally {
    isSaving.value = false
  }
}

function resetPasswordForm(): void {
  oldPassword.value = ''
  newPassword.value = ''
  newPasswordConfirm.value = ''
  passwordError.value = ''
}

function openPasswordModal(): void {
  resetPasswordForm()
  showPasswordModal.value = true
}

function closePasswordModal(): void {
  showPasswordModal.value = false
  resetPasswordForm()
}

function handlePasswordModalOpenChange(open: boolean): void {
  if (!open) closePasswordModal()
}

function normalizePinInput(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 4)
}

async function handleSetOrChangePassword(): Promise<void> {
  passwordError.value = ''
  if (!PIN_PATTERN.test(newPassword.value)) {
    passwordError.value = t('settings.security.password.errorInvalidPin')
    return
  }
  if (newPassword.value !== newPasswordConfirm.value) {
    passwordError.value = t('settings.security.password.errorMismatch')
    return
  }
  if (isEnabled.value && newPassword.value === oldPassword.value) {
    passwordError.value = t('settings.security.password.errorSameAsOld')
    return
  }

  isSubmitting.value = true
  try {
    const result = isEnabled.value
      ? await window.securityApi.changePassword(oldPassword.value, newPassword.value)
      : await window.securityApi.setPassword(newPassword.value)
    if (!result.success) {
      passwordError.value = t('settings.security.password.errorFailed')
      return
    }
    closePasswordModal()
    await loadConfig()
  } catch {
    passwordError.value = t('settings.security.password.errorFailed')
  } finally {
    isSubmitting.value = false
  }
}

async function handleDisableLock(): Promise<void> {
  if (!confirm(t('settings.security.lock.disableConfirm'))) return
  operationError.value = ''
  try {
    const result = await window.securityApi.resetPassword()
    if (result.success) await loadConfig()
    else operationError.value = t('settings.security.password.errorFailed')
  } catch {
    operationError.value = t('settings.security.password.errorFailed')
  }
}

async function handleManualLock(): Promise<void> {
  operationError.value = ''
  try {
    const result = await window.securityApi.lock()
    if (!result.success) operationError.value = t('settings.security.password.errorFailed')
  } catch {
    operationError.value = t('settings.security.password.errorFailed')
  }
}
</script>

<template>
  <div class="space-y-6 pb-6">
    <div v-if="isLoading" class="flex items-center justify-center gap-2 py-10 text-xs text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-arrow-path" class="h-4 w-4 animate-spin text-primary-500" />
      {{ t('common.loading') }}
    </div>

    <template v-else-if="config">
      <section>
        <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <UIcon name="i-heroicons-shield-check" class="h-4 w-4 text-primary-500" />
          {{ t('settings.security.lock.title') }}
        </h3>
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <div class="min-w-0 flex-1 pr-4">
            <p class="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :class="isEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'"
              />
              {{ isEnabled ? t('settings.security.lock.statusOn') : t('settings.security.lock.statusOff') }}
            </p>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {{ t('settings.security.lock.desc') }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <template v-if="isEnabled">
              <UButton size="sm" variant="soft" icon="i-heroicons-key" @click="openPasswordModal">
                {{ t('settings.security.password.titleChange') }}
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                size="sm"
                icon="i-heroicons-lock-closed"
                @click="handleManualLock"
              >
                {{ t('settings.security.lock.manualLock') }}
              </UButton>
              <UButton color="error" variant="soft" size="sm" @click="handleDisableLock">
                {{ t('settings.security.lock.disableBtn') }}
              </UButton>
            </template>
            <UButton v-else size="sm" icon="i-heroicons-lock-open" @click="openPasswordModal">
              {{ t('settings.security.password.btnEnable') }}
            </UButton>
          </div>
        </div>
      </section>

      <section v-if="isEnabled">
        <h3 class="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <UIcon name="i-heroicons-clock" class="h-4 w-4 text-primary-500" />
          {{ t('settings.security.autoLock.title') }}
        </h3>
        <div class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
          <div class="flex items-center justify-between gap-4 p-4">
            <p class="min-w-0 flex-1 pr-4 text-sm font-medium text-gray-900 dark:text-white">
              {{ t('settings.security.autoLock.idleLabel') }}
            </p>
            <div class="flex shrink-0 items-center gap-2">
              <USelect
                v-if="config.idleTimeoutMinutes > 0"
                :model-value="config.idleTimeoutMinutes"
                :items="timeoutOptions"
                :ui="{ content: 'z-[200]' }"
                size="sm"
                class="w-28 shrink-0"
                :aria-label="t('settings.security.autoLock.idleLabel')"
                :disabled="isSaving"
                @update:model-value="applyConfig({ idleTimeoutMinutes: Number($event) })"
              />
              <USwitch
                :model-value="config.idleTimeoutMinutes > 0"
                :loading="isSaving"
                @update:model-value="applyConfig({ idleTimeoutMinutes: $event ? DEFAULT_IDLE_TIMEOUT_MINUTES : 0 })"
              />
            </div>
          </div>
          <div class="border-t border-gray-200 dark:border-gray-700" />
          <div class="flex items-center justify-between gap-4 p-4">
            <p class="min-w-0 flex-1 pr-4 text-sm font-medium text-gray-900 dark:text-white">
              {{ t('settings.security.autoLock.startupLabel') }}
            </p>
            <USwitch
              :model-value="config.lockOnStartup"
              :loading="isSaving"
              @update:model-value="applyConfig({ lockOnStartup: $event })"
            />
          </div>
        </div>
      </section>

      <UModal
        :open="showPasswordModal"
        :title="isEnabled ? t('settings.security.password.titleChange') : t('settings.security.password.titleSetup')"
        :dismissible="!isSubmitting"
        :close="{ disabled: isSubmitting }"
        :ui="{ content: 'z-[102] sm:max-w-md', overlay: 'z-[101]' }"
        @update:open="handlePasswordModalOpenChange"
      >
        <template #body>
          <div class="space-y-4">
            <div v-if="isEnabled">
              <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                {{ t('settings.security.password.labelOld') }}
              </label>
              <UInput
                :model-value="oldPassword"
                type="password"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="current-password"
                class="w-full"
                maxlength="4"
                @update:model-value="oldPassword = normalizePinInput($event)"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                {{ t('settings.security.password.labelNew') }}
              </label>
              <UInput
                :model-value="newPassword"
                type="password"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="new-password"
                class="w-full"
                maxlength="4"
                @update:model-value="newPassword = normalizePinInput($event)"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                {{ t('settings.security.password.labelConfirm') }}
              </label>
              <UInput
                :model-value="newPasswordConfirm"
                type="password"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="new-password"
                class="w-full"
                maxlength="4"
                @update:model-value="newPasswordConfirm = normalizePinInput($event)"
              />
            </div>
            <p v-if="passwordError" class="text-xs text-red-500">{{ passwordError }}</p>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="soft" size="sm" :disabled="isSubmitting" @click="closePasswordModal">
              {{ t('common.cancel') }}
            </UButton>
            <UButton
              size="sm"
              :loading="isSubmitting"
              :disabled="!canSubmitPassword"
              @click="handleSetOrChangePassword"
            >
              {{ isEnabled ? t('common.save') : t('settings.security.password.btnEnable') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <p v-if="operationError" class="text-xs text-red-500">{{ operationError }}</p>
    </template>
  </div>
</template>
