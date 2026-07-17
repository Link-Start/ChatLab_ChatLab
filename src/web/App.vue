<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChatType, type AnalysisSession } from '@/types/base'
import { useBrowserRuntimeService } from '@/services/browser-runtime/service'
import { useDataService } from '@/services/data/service'
import { useImportService } from '@/services/import/service'
import { reportRuntimeLog } from '@/services/log-report'
import logoUrl from '@/assets/images/logo.svg'
import { createBrowserHomeController } from './browser-home'

const { t, locale } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
const editingSessionId = ref<string | null>(null)
const editedName = ref('')
const pendingDelete = ref<AnalysisSession | null>(null)
const deleteDialog = ref<HTMLElement | null>(null)
const analysisDialog = ref<HTMLElement | null>(null)

const controller = createBrowserHomeController({
  runtime: useBrowserRuntimeService(),
  data: useDataService(),
  importer: useImportService(),
  onLog: (event) =>
    reportRuntimeLog({
      level: event.level,
      scope: 'web-home',
      message: event.message,
      data: event.data,
    }),
})
const state = controller.state

const importPercent = computed(() => Math.max(0, Math.min(100, state.importProgress?.progress ?? 0)))
const selectedChatCount = computed(() => state.selectedChatIndexes.length)
const allChatsSelected = computed(
  () =>
    state.multiChatEntries.length > 0 &&
    state.multiChatEntries.every((chat) => state.selectedChatIndexes.includes(chat.index))
)
const visibleBatchFailures = computed(() => state.batchFailures.slice(0, 3))
const importStage = computed(() => {
  const stage = state.importProgress?.stage
  return stage ? t(`browser.import.stages.${stage}`) : t('browser.import.working')
})
const visibleError = computed(() => {
  if (state.batchFailures.length > 0) return null
  if (state.error === 'Unsupported file format') return t('browser.error.unsupportedFile')
  return state.error
})
const selectedSession = computed(() => state.sessions.find((session) => session.id === state.selectedSessionId) ?? null)
const hourlyTotal = computed(() => state.hourlyActivity.reduce((sum, item) => sum + item.messageCount, 0))
const activeHourCount = computed(() => state.hourlyActivity.filter((item) => item.messageCount > 0).length)
const peakHour = computed(() => {
  if (hourlyTotal.value === 0) return null
  return state.hourlyActivity.reduce((peak, item) => (item.messageCount > peak.messageCount ? item : peak))
})

watch(
  locale,
  (value) => {
    document.documentElement.lang = String(value)
  },
  { immediate: true }
)

watch(pendingDelete, async (session) => {
  if (!session) return
  await nextTick()
  deleteDialog.value?.focus()
})

watch(
  () => state.selectedSessionId,
  async (sessionId) => {
    if (!sessionId) return
    await nextTick()
    analysisDialog.value?.focus()
  }
)

onMounted(() => void controller.initialize())

function openFilePicker(): void {
  if (state.importStatus !== 'importing') fileInput.value?.click()
}

function handleFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  void controller.selectFile(input.files?.[0] ?? null)
  input.value = ''
}

function handleDrop(event: DragEvent): void {
  dragActive.value = false
  if (state.importStatus === 'importing') return
  void controller.selectFile(event.dataTransfer?.files[0] ?? null)
}

function beginRename(session: AnalysisSession): void {
  pendingDelete.value = null
  editingSessionId.value = session.id
  editedName.value = session.name
}

function openAnalysis(session: AnalysisSession): void {
  pendingDelete.value = null
  editingSessionId.value = null
  void controller.openSessionAnalysis(session.id)
}

async function saveRename(sessionId: string): Promise<void> {
  if (await controller.renameSession(sessionId, editedName.value)) {
    editingSessionId.value = null
    editedName.value = ''
  }
}

async function confirmDelete(): Promise<void> {
  const session = pendingDelete.value
  if (!session) return
  if (await controller.deleteSession(session.id)) pendingDelete.value = null
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(String(locale.value)).format(value)
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(String(locale.value), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp * 1000))
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function sessionInitial(session: AnalysisSession): string {
  return session.name.trim().charAt(0).toUpperCase() || '#'
}

function hourBarHeight(messageCount: number): number {
  const maximum = Math.max(...state.hourlyActivity.map((item) => item.messageCount), 1)
  return messageCount === 0 ? 0 : Math.max(4, (messageCount / maximum) * 100)
}
</script>

<template>
  <div class="web-app">
    <header class="topbar">
      <a class="brand" href="/" aria-label="ChatLab Web">
        <img :src="logoUrl" alt="" />
        <span>ChatLab</span>
      </a>
      <div class="local-chip">
        <span class="local-chip__dot" aria-hidden="true"></span>
        {{ t('browser.localOnly') }}
      </div>
    </header>

    <main class="page-shell">
      <section class="page-intro" aria-labelledby="page-title">
        <div>
          <p class="eyebrow">{{ t('browser.eyebrow') }}</p>
          <h1 id="page-title">{{ t('browser.title') }}</h1>
          <p class="page-intro__description">{{ t('browser.description') }}</p>
        </div>
        <aside class="privacy-note">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10m-10 0h11a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z"
            />
          </svg>
          <p>{{ t('browser.localOnlyDetail') }}</p>
        </aside>
      </section>

      <section v-if="state.phase === 'initializing'" class="state-card" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <h2>{{ t('browser.initializing') }}</h2>
          <p>{{ t('browser.initializingDetail') }}</p>
        </div>
      </section>

      <section v-else-if="state.phase === 'unsupported'" class="state-card state-card--warning" role="alert">
        <span class="state-card__mark" aria-hidden="true">!</span>
        <div>
          <h2>{{ t('browser.unsupported.title') }}</h2>
          <p>{{ t('browser.unsupported.description') }}</p>
          <code>{{ t('browser.unsupported.missing', { capabilities: state.capabilities?.missing.join(', ') }) }}</code>
        </div>
      </section>

      <section v-else-if="state.phase === 'failed'" class="state-card state-card--warning" role="alert">
        <span class="state-card__mark" aria-hidden="true">!</span>
        <div>
          <h2>{{ t('browser.error.title') }}</h2>
          <p>{{ state.error }}</p>
          <button class="button button--secondary" type="button" @click="controller.initialize">
            {{ t('common.retry') }}
          </button>
        </div>
      </section>

      <div v-else class="workspace-grid">
        <section class="panel import-panel" aria-labelledby="import-title">
          <div class="panel-heading">
            <p class="eyebrow">{{ t('browser.import.eyebrow') }}</p>
            <h2 id="import-title">{{ t('browser.import.title') }}</h2>
            <p>{{ t('browser.import.description') }}</p>
          </div>

          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept=".json,.jsonl,.txt,application/json,application/x-ndjson,text/plain"
            @change="handleFileInput"
          />

          <div
            class="drop-zone"
            :class="{ 'drop-zone--active': dragActive, 'drop-zone--selected': state.selectedFile }"
            :aria-disabled="state.importStatus === 'importing'"
            role="button"
            tabindex="0"
            @click="openFilePicker"
            @keydown.enter.prevent="openFilePicker"
            @keydown.space.prevent="openFilePicker"
            @dragenter.prevent="dragActive = true"
            @dragover.prevent="dragActive = true"
            @dragleave.prevent="dragActive = false"
            @drop.prevent="handleDrop"
          >
            <div class="drop-zone__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
              </svg>
            </div>
            <template v-if="state.selectedFile">
              <strong class="drop-zone__filename">{{ state.selectedFile.name }}</strong>
              <span>{{ formatFileSize(state.selectedFile.size) }}</span>
            </template>
            <template v-else>
              <strong>{{ dragActive ? t('browser.import.dropActive') : t('browser.import.drop') }}</strong>
              <span>{{ t('browser.import.formats') }}</span>
            </template>
          </div>

          <div v-if="state.importStatus === 'detecting'" class="format-line" aria-live="polite">
            <span class="spinner spinner--small" aria-hidden="true"></span>
            {{ t('browser.import.detecting') }}
          </div>
          <div v-else-if="state.detectedFormat" class="format-line format-line--ready">
            <span aria-hidden="true">✓</span>
            {{ t('browser.import.detected', { format: state.detectedFormat.name }) }}
          </div>

          <section
            v-if="state.importStatus === 'ready' && state.multiChatEntries.length > 0"
            class="chat-picker"
            :aria-label="t('browser.import.multiChat.title')"
          >
            <header class="chat-picker__header">
              <div>
                <strong>{{ t('browser.import.multiChat.title') }}</strong>
                <span>
                  {{
                    t('browser.import.multiChat.selected', {
                      selected: formatCount(selectedChatCount),
                      total: formatCount(state.multiChatEntries.length),
                    })
                  }}
                </span>
              </div>
              <button class="text-button text-button--accent" type="button" @click="controller.toggleAllChats">
                {{
                  allChatsSelected ? t('browser.import.multiChat.clearAll') : t('browser.import.multiChat.selectAll')
                }}
              </button>
            </header>
            <div class="chat-picker__list">
              <label v-for="chat in state.multiChatEntries" :key="chat.index" class="chat-picker__item">
                <input
                  type="checkbox"
                  :checked="state.selectedChatIndexes.includes(chat.index)"
                  @change="controller.toggleChatSelection(chat.index)"
                />
                <span class="chat-picker__copy">
                  <strong>{{ chat.name }}</strong>
                  <small>
                    {{ t('browser.import.multiChat.messages', { count: formatCount(chat.messageCount) }) }}
                    <template v-if="chat.messageCount === 0">· {{ t('browser.import.multiChat.empty') }}</template>
                  </small>
                </span>
              </label>
            </div>
          </section>

          <div v-if="state.importStatus === 'importing'" class="progress-card" aria-live="polite">
            <div class="progress-card__heading">
              <span>{{ importStage }}</span>
              <strong>{{ importPercent }}%</strong>
            </div>
            <div class="progress-track" aria-hidden="true">
              <span :style="{ width: `${importPercent}%` }"></span>
            </div>
            <p v-if="state.importProgress?.messagesProcessed !== undefined">
              {{ t('browser.import.processed', { count: formatCount(state.importProgress.messagesProcessed) }) }}
            </p>
            <p v-if="state.batchTotal > 0 && state.currentChatName">
              {{
                t('browser.import.multiChat.current', {
                  current: state.batchCurrentPosition,
                  total: state.batchTotal,
                  name: state.currentChatName,
                })
              }}
            </p>
          </div>

          <div v-if="state.importStatus === 'success' && state.importSummary" class="result-note result-note--success">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>{{ t('browser.import.successTitle') }}</strong>
              <p v-if="state.importSummary.totalCount !== undefined">
                {{
                  t('browser.import.multiChat.successDetail', {
                    sessions: formatCount(state.importSummary.sessionCount ?? 0),
                    total: formatCount(state.importSummary.totalCount),
                    messages: formatCount(state.importSummary.messageCount),
                  })
                }}
              </p>
              <p v-else>
                {{
                  t('browser.import.successDetail', {
                    messages: formatCount(state.importSummary.messageCount),
                    members: formatCount(state.importSummary.memberCount),
                  })
                }}
              </p>
            </div>
          </div>
          <div v-else-if="state.importStatus === 'cancelled'" class="result-note">
            <span aria-hidden="true">↩</span>
            <p v-if="state.importSummary?.sessionCount">
              {{
                t('browser.import.multiChat.cancelledWithCompleted', {
                  count: formatCount(state.importSummary.sessionCount),
                })
              }}
            </p>
            <p v-else>{{ t('browser.import.cancelled') }}</p>
          </div>
          <div v-if="state.batchFailures.length > 0" class="result-note result-note--error" role="status">
            <span aria-hidden="true">!</span>
            <div>
              <strong>
                {{ t('browser.import.multiChat.failed', { count: formatCount(state.batchFailures.length) }) }}
              </strong>
              <ul class="batch-failure-list">
                <li v-for="failure in visibleBatchFailures" :key="failure.index">
                  {{ failure.name }}: {{ failure.error }}
                </li>
              </ul>
            </div>
          </div>
          <div v-if="visibleError" class="result-note result-note--error" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>{{ t('browser.error.title') }}</strong>
              <p>{{ visibleError }}</p>
            </div>
          </div>

          <div class="import-actions">
            <button
              v-if="state.importStatus === 'importing'"
              class="button button--secondary button--full"
              type="button"
              @click="controller.cancelImport"
            >
              {{ t('browser.import.cancel') }}
            </button>
            <button
              v-else-if="state.importStatus === 'success' || state.importStatus === 'cancelled'"
              class="button button--primary button--full"
              type="button"
              @click="controller.clearImportState"
            >
              {{ t('browser.import.another') }}
            </button>
            <button
              v-else-if="state.selectedFile"
              class="button button--primary button--full"
              type="button"
              :disabled="
                !state.detectedFormat ||
                state.importStatus === 'detecting' ||
                (state.detectedFormat.multiChat && selectedChatCount === 0)
              "
              @click="controller.importSelectedFile"
            >
              {{
                state.multiChatEntries.length > 0
                  ? t('browser.import.multiChat.importSelected', { count: formatCount(selectedChatCount) })
                  : t('browser.import.start')
              }}
            </button>
            <button v-else class="button button--primary button--full" type="button" @click="openFilePicker">
              {{ t('browser.import.choose') }}
            </button>
          </div>
        </section>

        <section class="panel sessions-panel" aria-labelledby="sessions-title">
          <div class="sessions-heading">
            <div class="panel-heading">
              <p class="eyebrow">{{ t('browser.sessions.eyebrow') }}</p>
              <h2 id="sessions-title">{{ t('browser.sessions.title') }}</h2>
              <p>{{ t('browser.sessions.description') }}</p>
            </div>
            <div class="sessions-heading__tools">
              <span class="session-count">{{ t('browser.sessions.count', { count: state.sessions.length }) }}</span>
              <button
                class="icon-button"
                type="button"
                :aria-label="t('browser.sessions.refresh')"
                :disabled="state.refreshingSessions"
                @click="controller.refreshSessions"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 7v5h-5M5 17v-5h5m8.2-2A7 7 0 0 0 6.8 6.8L5 9m14 6-1.8 2.2A7 7 0 0 1 5.8 14" />
                </svg>
              </button>
            </div>
          </div>

          <div v-if="state.sessions.length === 0" class="empty-state">
            <div class="empty-state__mark" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <h3>{{ t('browser.sessions.emptyTitle') }}</h3>
            <p>{{ t('browser.sessions.emptyDescription') }}</p>
          </div>

          <div v-else class="session-list">
            <article v-for="session in state.sessions" :key="session.id" class="session-card">
              <div class="session-avatar" aria-hidden="true">{{ sessionInitial(session) }}</div>
              <div class="session-card__body">
                <form
                  v-if="editingSessionId === session.id"
                  class="rename-form"
                  @submit.prevent="saveRename(session.id)"
                >
                  <label class="visually-hidden" :for="`rename-${session.id}`">
                    {{ t('browser.sessions.renameLabel') }}
                  </label>
                  <input :id="`rename-${session.id}`" v-model="editedName" maxlength="200" required autofocus />
                  <button
                    class="text-button text-button--accent"
                    type="submit"
                    :disabled="state.busySessionId !== null"
                  >
                    {{ t('common.save') }}
                  </button>
                  <button class="text-button" type="button" @click="editingSessionId = null">
                    {{ t('common.cancel') }}
                  </button>
                </form>
                <template v-else>
                  <div class="session-card__title-row">
                    <h3>{{ session.name }}</h3>
                    <span class="type-badge">
                      {{
                        session.type === ChatType.GROUP ? t('browser.sessions.group') : t('browser.sessions.private')
                      }}
                    </span>
                  </div>
                  <div class="session-stats">
                    <span>{{ t('browser.sessions.messages', { count: formatCount(session.messageCount) }) }}</span>
                    <span>{{ t('browser.sessions.members', { count: formatCount(session.memberCount) }) }}</span>
                    <span>{{ session.platform }}</span>
                  </div>
                  <div class="session-dates">
                    <span v-if="session.lastMessageTs">
                      {{ t('browser.sessions.lastMessage', { date: formatDate(session.lastMessageTs) }) }}
                    </span>
                    <span>{{ t('browser.sessions.importedAt', { date: formatDate(session.importedAt) }) }}</span>
                  </div>
                </template>
              </div>
              <div v-if="editingSessionId !== session.id" class="session-actions">
                <button class="text-button text-button--accent" type="button" @click="openAnalysis(session)">
                  {{ t('browser.analysis.open') }}
                </button>
                <button class="text-button" type="button" @click="beginRename(session)">
                  {{ t('browser.sessions.rename') }}
                </button>
                <button class="text-button text-button--danger" type="button" @click="pendingDelete = session">
                  {{ t('common.delete') }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>

    <div v-if="pendingDelete" class="dialog-backdrop" @click.self="pendingDelete = null">
      <section
        ref="deleteDialog"
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        tabindex="-1"
        @keydown.esc="pendingDelete = null"
      >
        <div class="confirm-dialog__mark" aria-hidden="true">!</div>
        <h2 id="delete-title">{{ t('browser.sessions.deleteTitle', { name: pendingDelete.name }) }}</h2>
        <p>{{ t('browser.sessions.deleteDescription') }}</p>
        <div class="confirm-dialog__actions">
          <button class="button button--secondary" type="button" @click="pendingDelete = null">
            {{ t('common.cancel') }}
          </button>
          <button
            class="button button--danger"
            type="button"
            :disabled="state.busySessionId !== null"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="selectedSession" class="dialog-backdrop analysis-backdrop" @click.self="controller.closeSessionAnalysis">
      <section
        ref="analysisDialog"
        class="analysis-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-title"
        tabindex="-1"
        @keydown.esc="controller.closeSessionAnalysis"
      >
        <header class="analysis-dialog__header">
          <div>
            <p class="eyebrow">{{ t('browser.analysis.eyebrow') }}</p>
            <h2 id="analysis-title">{{ t('browser.analysis.title', { name: selectedSession.name }) }}</h2>
            <p>{{ t('browser.analysis.description') }}</p>
          </div>
          <button
            class="icon-button"
            type="button"
            :aria-label="t('common.close')"
            @click="controller.closeSessionAnalysis"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </header>

        <div v-if="state.analysisStatus === 'loading'" class="analysis-state" aria-live="polite">
          <span class="spinner" aria-hidden="true"></span>
          <p>{{ t('browser.analysis.loading') }}</p>
        </div>

        <div v-else-if="state.analysisStatus === 'failed'" class="analysis-state" role="alert">
          <span class="state-card__mark" aria-hidden="true">!</span>
          <div>
            <strong>{{ t('browser.error.title') }}</strong>
            <p>{{ state.analysisError }}</p>
          </div>
        </div>

        <template v-else-if="state.analysisStatus === 'ready'">
          <div class="analysis-metrics">
            <div>
              <span>{{ t('browser.analysis.totalMessages') }}</span>
              <strong>{{ formatCount(hourlyTotal) }}</strong>
            </div>
            <div>
              <span>{{ t('browser.analysis.peakHour') }}</span>
              <strong>{{ peakHour ? t('browser.analysis.hourValue', { hour: peakHour.hour }) : '—' }}</strong>
            </div>
            <div>
              <span>{{ t('browser.analysis.activeHours') }}</span>
              <strong>{{ activeHourCount }} / 24</strong>
            </div>
          </div>

          <div v-if="hourlyTotal > 0" class="hourly-chart">
            <div
              v-for="item in state.hourlyActivity"
              :key="item.hour"
              class="hourly-chart__column"
              :title="t('browser.analysis.hourTooltip', { hour: item.hour, count: formatCount(item.messageCount) })"
            >
              <div class="hourly-chart__track">
                <span :style="{ height: `${hourBarHeight(item.messageCount)}%` }"></span>
              </div>
              <small :class="{ 'hourly-chart__label--hidden': item.hour % 3 !== 0 }">{{ item.hour }}</small>
            </div>
          </div>
          <div v-else class="analysis-empty">{{ t('browser.analysis.noData') }}</div>

          <footer class="analysis-dialog__footer">
            <span class="local-chip__dot" aria-hidden="true"></span>
            {{ t('browser.analysis.runtimeNote') }}
          </footer>
        </template>
      </section>
    </div>
  </div>
</template>
