<script setup lang="ts">
import { onBeforeUpdate, onUpdated } from 'vue';
import { captureElementScrollState, restoreElementScrollState, type ElementScrollSnapshot } from '../../scroll-state';
import TavernCornerActions from '../TavernCornerActions.vue';
import TavernMemoryEditor from '../TavernMemoryEditor.vue';
import TavernScrollControls from '../TavernScrollControls.vue';
import { useTavernAppUiContext } from '../tavern-app-context';
import TavernChatSidebar from './TavernChatSidebar.vue';

const ui = useTavernAppUiContext();
const {
    actionFeedback,
    activeMemoryFiles,
    activeView,
    cancelEditMessage,
    canEditMessage,
    canRerunMessage,
    canSendManagerMessage,
    canSendMessage,
    chatAutoScroll,
    chatFocus,
    chatLayout,
    chatMessages,
    chatMessageWindow,
    chatComposeTextareaRef,
    chatScrollControlsActive,
    chatScrollRef,
    chatSubtitle,
    copyMessage,
    currentUserMessage,
    deleteMessageTurn,
    discardMemoryDraft,
    editingMessageDraft,
    enterMemoryEditMode,
    episodeSummaries,
    formatManagerSource,
    formatMemoryFileMeta,
    formatMessageTime,
    formatRunModelLine,
    formatSummarySource,
    handleChatScroll,
    handleChatSubmit,
    handleChatTouchMove,
    handleChatTouchStart,
    handleChatWheel,
    handleComposeInput,
    handleComposeKeydown,
    handleEditInput,
    handleEditKeydown,
    handleManagerComposeKeydown,
    handleManagerScroll,
    handleManagerSubmit,
    handleManagerTouchMove,
    handleManagerTouchStart,
    handleManagerWheel,
    hiddenManagerRunCount,
    homeThemeDark,
    isEditingMessage,
    isEditingMessageDirty,
    isManagerAssistantRunning,
    isRunning,
    latestErrorMessage,
    managerAutoScroll,
    managerBusy,
    managerChatMessages,
    managerCompactionOverlay,
    managerInputDraft,
    managerInputStatus,
    managerMessageWindow,
    managerRuns,
    managerComposeTextareaRef,
    managerScrollControlsActive,
    managerScrollRef,
    managerStatusLabel,
    managerStatusLine,
    markdownSignature,
    memoryEditorDirty,
    memoryEditorDocumentAvailable,
    memoryEditorDraft,
    memoryEditorLoadedPath,
    memoryEditorMode,
    memoryEditorReadOnly,
    memoryEditorStatus,
    memoryFileDisplayName,
    memoryFiles,
    memoryIndexStatusLine,
    messageKey,
    openPromptInspector,
    postToHost,
    previewMemoryDraft,
    recentTurnSummaries,
    renderChatMarkdown,
    rerunFromMessage,
    retryManagerRun,
    revealOlderChatMessages,
    revealOlderManagerMessages,
    roleLabel,
    runtimeText,
    runtimeThoughts,
    saveEditMessage,
    saveSelectedMemoryFile,
    scrollChatToBottom,
    scrollChatToTop,
    scrollManagerToBottom,
    scrollManagerToTop,
    selectedMemoryFile,
    shortText,
    showChatScrollBottom,
    showChatScrollTop,
    showManagerScrollBottom,
    showManagerScrollTop,
    startEditMessage,
    thoughtBlocks,
    thoughtSummaryLabel,
    toolTraceSummary,
    turnSummaries,
    updateChatScrollButtons,
    updateManagerScrollButtons,
    visibleChatMessages,
    visibleManagerChatMessages,
    visibleManagerRuns,
} = ui;

let pendingChatScrollSnapshot: ElementScrollSnapshot | null = null;
let pendingManagerScrollSnapshot: ElementScrollSnapshot | null = null;

function setChatScrollRef(element: Element | null) {
    chatScrollRef.value = element instanceof HTMLElement ? element : null;
}

function setChatComposeTextareaRef(element: Element | null) {
    chatComposeTextareaRef.value = element instanceof HTMLTextAreaElement ? element : null;
}

function setManagerScrollRef(element: Element | null) {
    managerScrollRef.value = element instanceof HTMLElement ? element : null;
}

function setManagerComposeTextareaRef(element: Element | null) {
    managerComposeTextareaRef.value = element instanceof HTMLTextAreaElement ? element : null;
}

onBeforeUpdate(() => {
    pendingChatScrollSnapshot = captureElementScrollState(chatScrollRef.value, {
        itemSelector: '[data-chat-anchor-key]',
        datasetKey: 'chatAnchorKey',
    });
    pendingManagerScrollSnapshot = captureElementScrollState(managerScrollRef.value, {
        itemSelector: '[data-manager-anchor-key]',
        datasetKey: 'managerAnchorKey',
    });
});

onUpdated(() => {
    const shouldAutoScrollChat = activeView.value === 'chat' && chatFocus.value === 'chat' && chatAutoScroll.value !== false;
    const shouldAutoScrollManager = activeView.value === 'chat' && chatFocus.value === 'manager' && managerAutoScroll.value !== false;
    restoreElementScrollState(chatScrollRef.value, pendingChatScrollSnapshot, {
        itemSelector: '[data-chat-anchor-key]',
        datasetKey: 'chatAnchorKey',
    }, {
        forceBottom: shouldAutoScrollChat,
        defaultToBottom: shouldAutoScrollChat,
        preserveScrollTop: !shouldAutoScrollChat,
    });
    restoreElementScrollState(managerScrollRef.value, pendingManagerScrollSnapshot, {
        itemSelector: '[data-manager-anchor-key]',
        datasetKey: 'managerAnchorKey',
    }, {
        forceBottom: shouldAutoScrollManager,
        defaultToBottom: shouldAutoScrollManager,
        preserveScrollTop: !shouldAutoScrollManager,
    });
    pendingChatScrollSnapshot = null;
    pendingManagerScrollSnapshot = null;
    updateChatScrollButtons();
    updateManagerScrollButtons();
});
</script>

<template>
  <section
    v-if="activeView === 'chat'"
    class="tavern-chat xb-page"
    :class="[`chat-focus-${chatFocus}`, `chat-layout-${chatLayout}`]"
  >
    <TavernCornerActions
      include-home
      :dark="homeThemeDark"
      @home="activeView = 'home'"
      @toggle-theme="homeThemeDark = !homeThemeDark"
      @exit="postToHost('xb-tavern:close')"
    />
    <TavernChatSidebar />

    <section
      class="chat-workbench"
      :class="{ 'is-manager': chatFocus === 'manager' }"
    >
      <div class="chat-flip-card">
        <section
          class="chat-face chat-face-front chat-main"
          :aria-hidden="chatFocus === 'manager'"
        >
          <header class="chat-head">
            <div>
              <h2>角色聊天</h2>
              <p>{{ chatSubtitle }}</p>
            </div>
            <div class="chat-head-actions">
              <button
                type="button"
                class="prompt-inspector-trigger"
                @click="openPromptInspector('history')"
              >
                请求日志
              </button>
              <button
                type="button"
                class="chat-flip-trigger"
                @click="chatFocus = 'manager'"
              >
                助手聊天
              </button>
            </div>
          </header>
          <div
            class="chat-scroll-shell"
          >
            <div
              :ref="setChatScrollRef"
              class="chat-scroll"
              @scroll="handleChatScroll"
              @wheel.passive="handleChatWheel"
              @touchstart.passive="handleChatTouchStart"
              @touchmove.passive="handleChatTouchMove"
            >
              <div
                v-if="chatMessageWindow.hiddenBefore"
                class="chat-history-gate"
                :data-chat-anchor-key="`gate:${chatMessageWindow.hiddenBefore}`"
                role="button"
                tabindex="0"
                @click="revealOlderChatMessages(true)"
                @keydown.enter.prevent="revealOlderChatMessages(true)"
                @keydown.space.prevent="revealOlderChatMessages(true)"
              >
                展开较早记录 {{ chatMessageWindow.hiddenBefore }} 条
              </div>
              <div
                v-for="message in visibleChatMessages"
                :key="`${message.sessionId}-${message.order}`"
                :data-chat-anchor-key="`${message.sessionId}:${message.order}`"
                class="chat-bubble"
                :class="[
                  message.role === 'user' ? 'from-user' : 'from-assistant',
                  { 'is-error': message.error },
                ]"
              >
                <div class="bubble-meta">
                  <span>{{ message.error ? '错误' : roleLabel(message.role) }}</span>
                  <small>{{ formatMessageTime(message.createdAt) }}</small>
                </div>
                <div
                  v-if="isEditingMessage(message)"
                  class="message-edit-panel"
                >
                  <textarea
                    v-model="editingMessageDraft"
                    class="message-edit-box"
                    rows="6"
                    :data-message-editor="messageKey(message)"
                    @input="handleEditInput"
                    @keydown="handleEditKeydown($event, message)"
                  />
                  <div class="message-edit-actions">
                    <button
                      type="button"
                      :disabled="!isEditingMessageDirty(message)"
                      @click="saveEditMessage(message)"
                    >
                      {{ message.role === 'user' ? '保存' : '保存修改' }}
                    </button>
                    <button
                      v-if="message.role === 'user'"
                      type="button"
                      :disabled="!isEditingMessageDirty(message)"
                      @click="saveEditMessage(message, { rerun: true })"
                    >
                      保存并重发
                    </button>
                    <button
                      type="button"
                      @click="cancelEditMessage"
                    >
                      取消
                    </button>
                  </div>
                </div>
                <details
                  v-if="!isEditingMessage(message) && thoughtBlocks(message).length"
                  class="tavern-thought-details"
                >
                  <summary>{{ thoughtSummaryLabel(message) }}</summary>
                  <div
                    v-for="(thought, thoughtIndex) in thoughtBlocks(message)"
                    :key="`${message.sessionId}-${message.order}-thought-${thoughtIndex}`"
                    class="tavern-thought-block"
                  >
                    <div class="tavern-thought-label">
                      {{ thought.label }}
                    </div>
                    <pre>{{ thought.text }}</pre>
                  </div>
                </details>
                <div
                  v-if="!isEditingMessage(message)"
                  class="xb-tavern-markdown"
                  :data-markdown-signature="markdownSignature(message.content)"
                  v-html="renderChatMarkdown(message.content)"
                />
                <div
                  v-if="!isEditingMessage(message)"
                  class="message-actions"
                >
                  <button
                    type="button"
                    :class="actionFeedback(message, 'copy')"
                    title="复制"
                    aria-label="复制"
                    @click="copyMessage(message)"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    :disabled="!canEditMessage(message)"
                    :class="actionFeedback(message, 'edit')"
                    title="编辑"
                    aria-label="编辑"
                    @click="startEditMessage(message)"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    :disabled="!canRerunMessage(message)"
                    :class="actionFeedback(message, 'rerun')"
                    :title="message.role === 'user' ? '从这里重发' : '重新生成这条回复'"
                    :aria-label="message.role === 'user' ? '从这里重发' : '重新生成这条回复'"
                    @click="rerunFromMessage(message)"
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    :disabled="isRunning"
                    :class="actionFeedback(message, 'delete')"
                    title="删除"
                    aria-label="删除"
                    @click="deleteMessageTurn(message)"
                  >
                    ⌫
                  </button>
                </div>
              </div>
              <div
                v-if="isRunning && (runtimeText || runtimeThoughts.length)"
                data-chat-anchor-key="streaming:content"
                class="chat-bubble from-assistant streaming"
              >
                <div class="bubble-meta">
                  <span>{{ roleLabel('assistant') }}</span>
                  <small>生成中</small>
                </div>
                <details
                  v-if="thoughtBlocks(runtimeThoughts).length"
                  class="tavern-thought-details"
                  open
                >
                  <summary>{{ thoughtSummaryLabel(runtimeThoughts, true) }}</summary>
                  <div
                    v-for="(thought, thoughtIndex) in thoughtBlocks(runtimeThoughts)"
                    :key="`runtime-thought-${thoughtIndex}`"
                    class="tavern-thought-block"
                  >
                    <div class="tavern-thought-label">
                      {{ thought.label }}
                    </div>
                    <pre>{{ thought.text }}</pre>
                  </div>
                </details>
                <div
                  v-if="runtimeText"
                  class="xb-tavern-markdown"
                  :data-markdown-signature="markdownSignature(runtimeText)"
                  v-html="renderChatMarkdown(runtimeText)"
                />
              </div>
              <div
                v-if="isRunning && !runtimeText && !thoughtBlocks(runtimeThoughts).length"
                data-chat-anchor-key="streaming:empty"
                class="chat-bubble from-assistant streaming thinking"
              >
                <div class="bubble-meta">
                  <span>{{ roleLabel('assistant') }}</span>
                  <small>生成中</small>
                </div>
                <p>正在组织回复...</p>
              </div>
              <p
                v-if="!chatMessages.length && !isRunning"
                class="chat-empty"
              >
                写一句话，开始。
              </p>
            </div>
            <TavernScrollControls
              :active="chatScrollControlsActive"
              :show-top="showChatScrollTop"
              :show-bottom="showChatScrollBottom"
              @top="scrollChatToTop"
              @bottom="scrollChatToBottom(true, { collapseWindow: true })"
            />
          </div>
          <form
            class="chat-compose"
            @submit.prevent="handleChatSubmit"
          >
            <div
              v-if="latestErrorMessage"
              class="compose-error"
            >
              {{ latestErrorMessage }}
            </div>
            <textarea
              :ref="setChatComposeTextareaRef"
              v-model="currentUserMessage"
              rows="3"
              placeholder="对角色说一句话..."
              :disabled="isRunning"
              @input="handleComposeInput"
              @keydown="handleComposeKeydown"
            />
            <button
              type="submit"
              class="primary-action"
              :disabled="!canSendMessage"
            >
              {{ isRunning ? '停止' : '发送' }}
            </button>
          </form>
        </section>

        <section
          class="chat-face chat-face-back chat-manager"
          :aria-hidden="chatFocus === 'chat'"
        >
          <header class="manager-head">
            <div>
              <p class="eyebrow">
                Assistant
              </p>
              <h2>助手聊天</h2>
              <p>{{ managerStatusLine }}</p>
            </div>
            <div class="manager-head-actions">
              <button
                type="button"
                class="prompt-inspector-trigger"
                @click="openPromptInspector('history')"
              >
                请求日志
              </button>
              <button
                type="button"
                class="chat-flip-trigger"
                @click="chatFocus = 'chat'"
              >
                角色聊天
              </button>
            </div>
          </header>

          <div class="chat-scroll-shell manager-scroll-shell">
            <div
              :ref="setManagerScrollRef"
              class="manager-chat-scroll"
              @scroll="handleManagerScroll"
              @wheel.passive="handleManagerWheel"
              @touchstart.passive="handleManagerTouchStart"
              @touchmove.passive="handleManagerTouchMove"
            >
              <div
                v-if="managerCompactionOverlay?.active"
                class="manager-compaction-overlay"
                :class="{ resolved: managerCompactionOverlay.resolved }"
                role="status"
                aria-live="polite"
              >
                <strong>{{ managerCompactionOverlay.status }}</strong>
                <small>
                  {{ managerCompactionOverlay.currentTokens }} / {{ managerCompactionOverlay.triggerTokens || '...' }}
                  <span v-if="managerCompactionOverlay.yieldTokens"> → {{ managerCompactionOverlay.yieldTokens }}</span>
                </small>
              </div>
              <div
                v-if="managerMessageWindow.hiddenBefore"
                class="chat-history-gate manager-history-gate"
                :data-manager-anchor-key="`gate:${managerMessageWindow.hiddenBefore}`"
                role="button"
                tabindex="0"
                @click="revealOlderManagerMessages(true)"
                @keydown.enter.prevent="revealOlderManagerMessages(true)"
                @keydown.space.prevent="revealOlderManagerMessages(true)"
              >
                展开较早记录 {{ managerMessageWindow.hiddenBefore }} 条
              </div>
              <article
                v-for="message in visibleManagerChatMessages"
                :key="`${message.sessionId}-${message.order}`"
                :data-manager-anchor-key="`msg:${message.sessionId}:${message.order}`"
                class="manager-card manager-message"
                :class="message.role === 'user' ? 'manager-message-user' : 'manager-message-assistant'"
              >
                <div class="manager-run-title">
                  <strong>{{ message.role === 'user' ? '我' : '助手' }}</strong>
                  <small>{{ formatMessageTime(message.createdAt) }}</small>
                </div>
                <div
                  class="xb-tavern-markdown"
                  :data-markdown-signature="markdownSignature(message.content)"
                  v-html="renderChatMarkdown(message.content)"
                />
              </article>

              <details
                v-if="memoryFiles.length || episodeSummaries.length || managerRuns.length || turnSummaries.length"
                class="manager-work-drawer"
                data-manager-anchor-key="meta:work"
              >
                <summary>
                  <strong>工作记录</strong>
                  <span>{{ memoryFiles.length }} 份档案 · {{ managerRuns.length }} 次运行</span>
                </summary>
                <article
                  class="manager-card manager-message manager-message-system"
                  data-manager-anchor-key="meta:memory"
                >
                  <div class="manager-run-title">
                    <strong>记忆档案</strong>
                    <small>{{ activeMemoryFiles.length }}/{{ memoryFiles.length }}</small>
                  </div>
                  <p>{{ memoryIndexStatusLine }}</p>
                  <p v-if="selectedMemoryFile">
                    当前打开：{{ memoryFileDisplayName(selectedMemoryFile) }}
                  </p>
                </article>

                <article
                  v-for="episode in episodeSummaries.slice(0, 2)"
                  :key="episode.id"
                  :data-manager-anchor-key="`episode:${episode.id}`"
                  class="manager-card manager-message manager-message-episode"
                >
                  <div class="manager-run-title">
                    <strong>{{ episode.title }}</strong>
                    <small>第 {{ episode.startTurn }}-{{ episode.endTurn }} 轮</small>
                  </div>
                  <p>{{ episode.summary || '暂无摘要。' }}</p>
                  <p v-if="episode.unresolved?.length">
                    未解决：{{ episode.unresolved.join('、') }}
                  </p>
                </article>

                <article
                  v-for="run in visibleManagerRuns"
                  :key="run.id"
                  :data-manager-anchor-key="`run:${run.id}`"
                  class="manager-card manager-message manager-message-run"
                  :class="`is-${run.status}`"
                >
                  <div class="manager-run-title">
                    <strong>{{ managerStatusLabel(run.status) }}</strong>
                    <small>{{ formatManagerSource(run) }}</small>
                  </div>
                  <p>{{ run.inputSummary }}</p>
                  <small>{{ formatRunModelLine(run) }}</small>
                  <p v-if="run.parsedAction">
                    动作：{{ run.parsedAction }}
                  </p>
                  <p v-if="run.changedFiles?.length">
                    文件：{{ run.changedFiles.join('、') }}
                  </p>
                  <p v-if="run.outputText">
                    结论：{{ shortText(run.outputText, 220) }}
                  </p>
                  <p v-if="run.toolTrace">
                    {{ toolTraceSummary(run.toolTrace) }}
                  </p>
                  <p v-if="run.error">
                    {{ run.error }}
                  </p>
                  <button
                    v-if="run.status === 'failed'"
                    type="button"
                    :disabled="managerBusy"
                    @click="retryManagerRun(run)"
                  >
                    重试
                  </button>
                </article>
                <article
                  v-if="hiddenManagerRunCount"
                  class="manager-card manager-message manager-message-run manager-message-archive-note"
                >
                  <div class="manager-run-title">
                    <strong>较早工作记录</strong>
                    <small>{{ hiddenManagerRunCount }} 条</small>
                  </div>
                  <p>较早的管理员运行记录已收起，避免长会话持续占用界面资源。</p>
                </article>

                <article
                  v-for="summary in recentTurnSummaries.slice(0, 4)"
                  :key="summary.id"
                  :data-manager-anchor-key="`summary:${summary.id}`"
                  class="manager-card manager-message manager-message-turn"
                >
                  <div class="manager-run-title">
                    <strong>{{ formatSummarySource(summary) }}</strong>
                    <small>{{ summary.tags?.join('、') || '无标签' }}</small>
                  </div>
                  <p>{{ summary.summary }}</p>
                </article>
              </details>

              <p
                v-if="!managerChatMessages.length"
                data-manager-anchor-key="empty"
                class="chat-empty"
              >
                还没有和助手对话。
              </p>
            </div>
            <TavernScrollControls
              extra-class="manager-scroll-helpers"
              :active="managerScrollControlsActive"
              :show-top="showManagerScrollTop"
              :show-bottom="showManagerScrollBottom"
              @top="scrollManagerToTop"
              @bottom="scrollManagerToBottom(true, { collapseWindow: true })"
            />
          </div>

          <form
            class="manager-compose chat-compose"
            @submit.prevent="handleManagerSubmit"
          >
            <div
              v-if="managerInputStatus"
              class="compose-error"
            >
              {{ managerInputStatus }}
            </div>
            <textarea
              :ref="setManagerComposeTextareaRef"
              v-model="managerInputDraft"
              rows="3"
              placeholder="和助手说一句话..."
              :disabled="isManagerAssistantRunning"
              @input="handleComposeInput"
              @keydown="handleManagerComposeKeydown"
            />
            <button
              type="submit"
              class="primary-action"
              :disabled="!canSendManagerMessage"
            >
              {{ isManagerAssistantRunning ? '停止' : '发送' }}
            </button>
          </form>
        </section>
      </div>
    </section>

    <TavernMemoryEditor
      v-model:draft="memoryEditorDraft"
      :document-available="memoryEditorDocumentAvailable"
      :read-only="memoryEditorReadOnly"
      :dirty="memoryEditorDirty"
      :mode="memoryEditorMode"
      :preview-html="renderChatMarkdown(memoryEditorDraft)"
      :preview-signature="markdownSignature(memoryEditorDraft)"
      :status="memoryEditorStatus"
      :has-selected-file="!!selectedMemoryFile"
      :loaded-path="memoryEditorLoadedPath"
      :file-meta="selectedMemoryFile ? formatMemoryFileMeta(selectedMemoryFile) : ''"
      @enter-edit="enterMemoryEditMode"
      @preview="previewMemoryDraft"
      @discard="discardMemoryDraft"
      @save="saveSelectedMemoryFile"
    />
  </section>
</template>
