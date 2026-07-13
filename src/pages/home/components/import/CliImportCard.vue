<script setup lang="ts">
import { computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const skillInstallCommand = 'npx skills add ChatLab/ChatLab --skill chatlab-import -g'
const cliImportCommand = 'chatlab import ~/Downloads/chat-export.json'
const { copy: copySkillCommand, copied: skillCommandCopied } = useClipboard({ copiedDuring: 2000 })
const { copy: copyCliCommand, copied: cliCommandCopied } = useClipboard({ copiedDuring: 2000 })

const importGuideUrl = computed(() => {
  const prefix = locale.value === 'zh-CN' ? '/cn' : locale.value === 'zh-TW' ? '/tw' : ''
  return `https://docs.chatlab.fun${prefix}/usage/how-to-import`
})
</script>

<template>
  <div class="flex w-full flex-col items-center space-y-6">
    <div class="grid w-full max-w-2xl gap-3 sm:h-[220px] sm:grid-cols-2">
      <section
        class="relative flex min-h-[210px] flex-col overflow-hidden rounded-3xl bg-primary-50/70 p-5 shadow-elevated ring-1 ring-primary-500/10 dark:bg-primary-950/20 dark:ring-primary-400/10"
      >
        <div class="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-primary-400/10 blur-2xl" />
        <div class="relative flex items-start justify-between gap-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500 text-white shadow-sm shadow-primary-500/20"
          >
            <UIcon name="i-heroicons-sparkles" class="h-5 w-5" />
          </div>
          <span class="rounded-full bg-primary-500 px-2.5 py-1 text-[10px] font-bold text-white">
            {{ t('home.tabs.recommended') }}
          </span>
        </div>
        <div class="relative mt-3">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ t('home.tabs.agentImportTitle') }}</h2>
          <p class="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {{ t('home.tabs.agentImportDescription') }}
          </p>
        </div>
        <div class="relative mt-auto flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 text-gray-100">
          <code class="min-w-0 flex-1 truncate text-[10px] sm:text-[11px]">{{ skillInstallCommand }}</code>
          <UButton
            :icon="skillCommandCopied ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
            :color="skillCommandCopied ? 'success' : 'neutral'"
            variant="ghost"
            size="xs"
            :aria-label="t('home.tabs.copyCommand')"
            @click="copySkillCommand(skillInstallCommand)"
          />
        </div>
      </section>

      <section
        class="flex min-h-[210px] flex-col rounded-3xl bg-white/80 p-5 shadow-elevated ring-1 ring-gray-900/[0.04] backdrop-blur-md dark:bg-card-dark dark:ring-white/[0.06]"
      >
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-gray-100 dark:bg-white/10">
          <UIcon name="i-heroicons-command-line" class="h-5 w-5" />
        </div>
        <div class="mt-3">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">{{ t('home.tabs.manualCliTitle') }}</h2>
          <p class="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {{ t('home.tabs.manualCliDescription') }}
          </p>
        </div>
        <div class="mt-auto flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 text-gray-100">
          <code class="min-w-0 flex-1 truncate text-[10px] sm:text-[11px]">{{ cliImportCommand }}</code>
          <UButton
            :icon="cliCommandCopied ? 'i-heroicons-check' : 'i-heroicons-clipboard'"
            :color="cliCommandCopied ? 'success' : 'neutral'"
            variant="ghost"
            size="xs"
            :aria-label="t('home.tabs.copyCommand')"
            @click="copyCliCommand(cliImportCommand)"
          />
        </div>
        <UButton
          :href="importGuideUrl"
          target="_blank"
          color="neutral"
          variant="link"
          size="xs"
          trailing-icon="i-heroicons-arrow-up-right"
          class="mt-1 self-start px-0"
        >
          {{ t('home.tabs.viewImportGuide') }}
        </UButton>
      </section>
    </div>
    <div class="h-6 w-full opacity-0 pointer-events-none" />
  </div>
</template>
