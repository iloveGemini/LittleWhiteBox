<script setup lang="ts">
import TavernScrollControls from '../TavernScrollControls.vue';
import { useTavernChatContext, useTavernManagerContext, useTavernShellContext } from '../tavern-app-context';

const emit = defineEmits<{
    (event: 'open-contract'): void;
}>();

const shell = useTavernShellContext();
const chat = useTavernChatContext();
const manager = useTavernManagerContext();
const {
    shortText,
} = shell;
const {
    chatFocus,
    cancelEditMessage,
    editingMessageDraft,
    formatMessageTime,
    handleComposeInput,
    handleEditInput,
    markdownSignature,
    renderChatMarkdown,
    roleLabel,
    thoughtBlocks,
    thoughtSummaryLabel,
} = chat;
const {
    activeMemoryFiles,
    archivedManagerRuns,
    canEditManagerMessage,
    canRerunManagerMessage,
    canSendManagerMessage,
    copyManagerMessage,
    currentManagerWorkRun,
    deleteManagerMessageTurn,
    formatRunActivityLine,
    formatRunIssueLine,
    formatRunInputLine,
    formatRunMapLine,
    formatRunMemoryLine,
    formatRunModelLine,
    handleManagerComposeKeydown,
    handleManagerEditKeydown,
    handleManagerScroll,
    handleManagerSubmit,
    handleManagerTouchMove,
    handleManagerTouchStart,
    handleManagerWheel,
    hiddenManagerRunCount,
    isEditingManagerMessage,
    isEditingManagerMessageDirty,
    isManagerAssistantCancelling,
    isManagerAssistantRunning,
    liveManagerChatDisplayItems,
    managerActionFeedback,
    managerBusy,
    managerCompactionOverlay,
    managerComposeTextareaRef,
    managerInputDraft,
    managerInputStatus,
    managerMessageWindow,
    managerRuns,
    managerRunTone,
    managerScrollControlsActive,
    managerScrollRef,
    managerStatusLabel,
    managerToolStatusLabel,
    managerToolTone,
    managerToolTraceItems,
    managerToolTurnPreview,
    managerToolTurnSummary,
    memoryFileDisplayName,
    memoryFiles,
    memoryIndexStatusLine,
    retryManagerRun,
    revealOlderManagerMessages,
    rerunFromManagerMessage,
    saveEditManagerMessage,
    scrollManagerToBottom,
    scrollManagerToTop,
    selectedMemoryFile,
    showManagerScrollBottom,
    showManagerScrollTop,
    startEditManagerMessage,
    toolTraceSummary,
    visibleManagerChatItems,
} = manager;

function setManagerScrollRef(element: Element | null) {
    managerScrollRef.value = element instanceof HTMLElement ? element : null;
}

function setManagerComposeTextareaRef(element: Element | null) {
    managerComposeTextareaRef.value = element instanceof HTMLTextAreaElement ? element : null;
}

function openContractModal() {
    emit('open-contract');
}
</script>

<template>
  <section
    class="chat-face chat-face-back chat-manager"
    :aria-hidden="chatFocus === 'chat'"
  >
    <header class="manager-head">
      <div class="manager-head-actions">
        <button
          type="button"
          class="contract-trigger"
          title="契约"
          aria-label="契约"
          @click="openContractModal"
        >
          契约
        </button>
        <button
          type="button"
          class="chat-flip-trigger"
          title="角色聊天"
          aria-label="角色聊天"
          @click="chatFocus = 'chat'"
        >
          角色
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
        <template
          v-for="item in visibleManagerChatItems"
          :key="item.key"
        >
          <article
            v-if="item.kind === 'message'"
            :data-manager-anchor-key="item.anchorKey"
            class="manager-card manager-message"
            :class="item.message.role === 'user' ? 'manager-message-user' : 'manager-message-assistant'"
          >
            <div class="manager-run-title">
              <strong>{{ item.message.role === 'user' ? roleLabel('user') : '助手' }}</strong>
              <small>{{ formatMessageTime(item.message.createdAt) }}</small>
            </div>
            <div
              v-if="isEditingManagerMessage(item.message)"
              class="message-edit-panel manager-message-edit-panel"
            >
              <textarea
                v-model="editingMessageDraft"
                class="message-edit-box"
                rows="6"
                :data-manager-message-editor="`manager:${item.message.sessionId}:${item.message.order}`"
                @input="handleEditInput"
                @keydown="handleManagerEditKeydown($event, item.message)"
              />
              <div class="message-edit-actions">
                <button
                  type="button"
                  :disabled="!isEditingManagerMessageDirty(item.message)"
                  @click="saveEditManagerMessage(item.message)"
                >
                  {{ item.message.role === 'user' ? '保存' : '保存修改' }}
                </button>
                <button
                  v-if="item.message.role === 'user'"
                  type="button"
                  :disabled="!isEditingManagerMessageDirty(item.message)"
                  @click="saveEditManagerMessage(item.message, { rerun: true })"
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
            <div
              v-if="!isEditingManagerMessage(item.message)"
              class="xb-tavern-markdown"
              :data-markdown-signature="markdownSignature(item.message.content)"
              v-html="renderChatMarkdown(item.message.content)"
            />
            <div
              v-if="!isEditingManagerMessage(item.message)"
              class="message-actions manager-message-actions"
            >
              <button
                type="button"
                :class="managerActionFeedback(item.message, 'copy')"
                title="复制"
                aria-label="复制"
                @click="copyManagerMessage(item.message)"
              >
                ⧉
              </button>
              <button
                type="button"
                :disabled="!canEditManagerMessage(item.message)"
                :class="managerActionFeedback(item.message, 'edit')"
                title="编辑"
                aria-label="编辑"
                @click="startEditManagerMessage(item.message)"
              >
                ✎
              </button>
              <button
                type="button"
                :disabled="!canRerunManagerMessage(item.message)"
                :class="managerActionFeedback(item.message, 'rerun')"
                :title="item.message.role === 'user' ? '从这里重问助手' : '重新生成这条助手回复'"
                :aria-label="item.message.role === 'user' ? '从这里重问助手' : '重新生成这条助手回复'"
                @click="rerunFromManagerMessage(item.message)"
              >
                ↻
              </button>
              <button
                type="button"
                :disabled="isManagerAssistantRunning"
                :class="managerActionFeedback(item.message, 'delete')"
                title="删除"
                aria-label="删除"
                @click="deleteManagerMessageTurn(item.message)"
              >
                ⌫
              </button>
            </div>
          </article>

          <details
            v-else
            class="manager-tool-turn manager-tool-turn-history"
            :data-manager-anchor-key="item.anchorKey"
          >
            <summary>
              <span>{{ item.rounds.length > 1 ? `工具轮 ${item.rounds.length} 轮` : '工具轮' }}</span>
              <small>{{ managerToolTurnSummary(item) }}</small>
              <em>{{ managerToolTurnPreview(item) }}</em>
            </summary>
            <div class="manager-tool-turn-body">
              <div
                v-for="(round, roundIndex) in item.rounds"
                :key="`${item.key}-round-${round.assistantMessage.order}`"
                class="manager-tool-round"
              >
                <div class="manager-tool-round-title">
                  <strong>第 {{ Number(roundIndex) + 1 }} 轮 · {{ round.calls.length }} 个工具</strong>
                  <span>{{ formatMessageTime(round.assistantMessage.createdAt) }}</span>
                </div>
                <details
                  v-if="thoughtBlocks(round.assistantMessage.thoughts).length"
                  class="manager-tool-thoughts"
                >
                  <summary>{{ thoughtSummaryLabel(thoughtBlocks(round.assistantMessage.thoughts), false) }}</summary>
                  <div
                    v-for="(thought, thoughtIndex) in thoughtBlocks(round.assistantMessage.thoughts)"
                    :key="`${item.key}-round-${roundIndex}-thought-${thoughtIndex}`"
                    class="chat-thought-block"
                  >
                    <strong>{{ thought.label }}</strong>
                    <pre>{{ thought.text }}</pre>
                  </div>
                </details>
                <div
                  v-if="round.assistantMessage.content"
                  class="manager-tool-preface xb-tavern-markdown"
                  :data-markdown-signature="markdownSignature(round.assistantMessage.content)"
                  v-html="renderChatMarkdown(round.assistantMessage.content)"
                />
                <div
                  v-for="call in round.calls"
                  :key="call.id"
                  class="manager-tool-item"
                  :class="call.ok ? 'is-resolved' : 'is-error'"
                >
                  <div class="manager-tool-head">
                    <span>{{ call.name }}</span>
                    <em>{{ call.toolMessage ? (call.ok ? '已返回' : '失败') : '等待返回' }}</em>
                  </div>
                  <small v-if="call.argumentsText">{{ call.argumentsText }}</small>
                  <p>{{ call.resultText }}</p>
                </div>
              </div>
            </div>
          </details>
        </template>

        <template
          v-for="item in liveManagerChatDisplayItems"
          :key="`live:${item.key}`"
        >
          <article
            v-if="item.kind === 'message'"
            :data-manager-anchor-key="`live:${item.anchorKey}`"
            class="manager-card manager-message manager-message-live"
            :class="item.message.role === 'user' ? 'manager-message-user' : 'manager-message-assistant'"
          >
            <div class="manager-run-title">
              <strong>{{ item.message.role === 'user' ? roleLabel('user') : '助手' }}</strong>
              <small>正在处理</small>
            </div>
            <div
              class="xb-tavern-markdown"
              :data-markdown-signature="markdownSignature(item.message.content)"
              v-html="renderChatMarkdown(item.message.content)"
            />
          </article>

          <details
            v-else
            class="manager-tool-turn manager-tool-turn-live"
            :data-manager-anchor-key="`live:${item.anchorKey}`"
            open
          >
            <summary>
              <span>{{ item.rounds.length > 1 ? `工具轮 ${item.rounds.length} 轮` : '工具轮' }}</span>
              <small>{{ managerToolTurnSummary(item) }}</small>
              <em>{{ managerToolTurnPreview(item) }}</em>
            </summary>
            <div class="manager-tool-turn-body">
              <div
                v-for="(round, roundIndex) in item.rounds"
                :key="`live:${item.key}-round-${round.assistantMessage.order}`"
                class="manager-tool-round"
              >
                <div class="manager-tool-round-title">
                  <strong>第 {{ Number(roundIndex) + 1 }} 轮 · {{ round.calls.length }} 个工具</strong>
                  <span>正在处理</span>
                </div>
                <details
                  v-if="thoughtBlocks(round.assistantMessage.thoughts).length"
                  class="manager-tool-thoughts"
                  open
                >
                  <summary>{{ thoughtSummaryLabel(thoughtBlocks(round.assistantMessage.thoughts), true) }}</summary>
                  <div
                    v-for="(thought, thoughtIndex) in thoughtBlocks(round.assistantMessage.thoughts)"
                    :key="`live:${item.key}-round-${roundIndex}-thought-${thoughtIndex}`"
                    class="chat-thought-block"
                  >
                    <strong>{{ thought.label }}</strong>
                    <pre>{{ thought.text }}</pre>
                  </div>
                </details>
                <div
                  v-if="round.assistantMessage.content"
                  class="manager-tool-preface xb-tavern-markdown"
                  :data-markdown-signature="markdownSignature(round.assistantMessage.content)"
                  v-html="renderChatMarkdown(round.assistantMessage.content)"
                />
                <div
                  v-for="call in round.calls"
                  :key="`live:${call.id}`"
                  class="manager-tool-item"
                  :class="call.ok ? 'is-resolved' : 'is-error'"
                >
                  <div class="manager-tool-head">
                    <span>{{ call.name }}</span>
                    <em>{{ call.toolMessage ? (call.ok ? '已返回' : '失败') : '等待返回' }}</em>
                  </div>
                  <small v-if="call.argumentsText">{{ call.argumentsText }}</small>
                  <p>{{ call.resultText }}</p>
                </div>
              </div>
            </div>
          </details>
        </template>

        <article
          v-if="isManagerAssistantRunning && !liveManagerChatDisplayItems.length"
          class="manager-card manager-message manager-message-assistant manager-message-live"
          data-manager-anchor-key="live:manager-thinking"
        >
          <div class="manager-run-title">
            <strong>助手</strong>
            <small>正在处理</small>
          </div>
          <p>正在思考...</p>
        </article>

        <details
          v-if="memoryFiles.length || managerRuns.length"
          class="manager-work-drawer"
          data-manager-anchor-key="meta:work"
        >
          <summary>
            <strong>工作记录</strong>
            <span v-if="currentManagerWorkRun">{{ managerStatusLabel(currentManagerWorkRun.status) }} · {{ formatRunInputLine(currentManagerWorkRun) }}</span>
            <span v-else>{{ activeMemoryFiles.length }}/{{ memoryFiles.length }} 份档案</span>
          </summary>
          <article
            v-if="currentManagerWorkRun"
            :data-manager-anchor-key="`run:${currentManagerWorkRun.id}`"
            class="manager-card manager-message manager-message-run manager-work-current"
            :class="[`is-${currentManagerWorkRun.status}`, `tone-${managerRunTone(currentManagerWorkRun)}`]"
          >
            <div class="manager-run-title">
              <strong>本次后台工作</strong>
              <small>{{ managerStatusLabel(currentManagerWorkRun.status) }}</small>
            </div>
            <p class="manager-work-source">
              {{ formatRunInputLine(currentManagerWorkRun) }}
            </p>
            <small>{{ formatRunModelLine(currentManagerWorkRun) }}</small>
            <small class="manager-run-activity">{{ formatRunActivityLine(currentManagerWorkRun) }}</small>
            <div class="manager-work-status-grid">
              <p>{{ formatRunMemoryLine(currentManagerWorkRun) }}</p>
              <p>{{ formatRunMapLine(currentManagerWorkRun) }}</p>
            </div>
            <p v-if="currentManagerWorkRun.outputText">
              结果：{{ shortText(currentManagerWorkRun.outputText, 180) }}
            </p>
            <p
              v-if="formatRunIssueLine(currentManagerWorkRun)"
              class="manager-work-issue-line"
            >
              {{ formatRunIssueLine(currentManagerWorkRun) }}
            </p>
            <details
              v-if="managerToolTraceItems(currentManagerWorkRun.toolTrace).length"
              class="manager-work-debug"
            >
              <summary>{{ toolTraceSummary(currentManagerWorkRun.toolTrace) }}</summary>
              <div class="manager-tool-list">
                <div
                  v-for="tool in managerToolTraceItems(currentManagerWorkRun.toolTrace)"
                  :key="tool.id"
                  class="manager-tool-item"
                  :class="managerToolTone(tool)"
                >
                  <div class="manager-tool-head">
                    <span>{{ tool.name }}</span>
                    <em>{{ managerToolStatusLabel(tool) }}<template v-if="tool.elapsedLabel"> · {{ tool.elapsedLabel }}</template></em>
                  </div>
                  <details
                    v-if="tool.thoughts.length"
                    class="manager-tool-thoughts"
                  >
                    <summary>{{ thoughtSummaryLabel(tool.thoughts, false) }}</summary>
                    <div
                      v-for="(thought, thoughtIndex) in tool.thoughts"
                      :key="`${tool.id}-stored-thought-${thoughtIndex}`"
                      class="chat-thought-block"
                    >
                      <strong>{{ thought.label }}</strong>
                      <pre>{{ thought.text }}</pre>
                    </div>
                  </details>
                  <div
                    v-if="tool.preface"
                    class="manager-tool-preface xb-tavern-markdown"
                    :data-markdown-signature="markdownSignature(tool.preface)"
                    v-html="renderChatMarkdown(tool.preface)"
                  />
                  <small v-if="tool.args">{{ tool.args }}</small>
                  <p v-if="tool.summary">
                    {{ tool.summary }}
                  </p>
                  <p v-if="tool.path">
                    {{ tool.path }}
                  </p>
                </div>
              </div>
            </details>
            <button
              v-if="currentManagerWorkRun.status === 'failed'"
              type="button"
              :disabled="managerBusy"
              @click="retryManagerRun(currentManagerWorkRun)"
            >
              重试
            </button>
          </article>
          <article
            v-else
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

          <details
            v-if="archivedManagerRuns.length || hiddenManagerRunCount"
            class="manager-work-history"
          >
            <summary>
              <strong>历史记录</strong>
              <span>{{ archivedManagerRuns.length + hiddenManagerRunCount }} 条</span>
            </summary>
            <div
              v-for="run in archivedManagerRuns"
              :key="run.id"
              class="manager-history-row"
              :class="[`tone-${managerRunTone(run)}`]"
            >
              <div>
                <strong>{{ managerStatusLabel(run.status) }}</strong>
                <small>{{ formatRunInputLine(run) }}</small>
              </div>
              <span>{{ toolTraceSummary(run.toolTrace) || formatRunActivityLine(run) }}</span>
            </div>
            <p v-if="hiddenManagerRunCount">
              更早 {{ hiddenManagerRunCount }} 条已收起。
            </p>
          </details>
        </details>

        <p
          v-if="!visibleManagerChatItems.length"
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
        @bottom="scrollManagerToBottom(true, { collapseWindow: true, revealHelpers: true })"
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
        {{ isManagerAssistantCancelling ? '正在停止' : isManagerAssistantRunning ? '停止' : '发送' }}
      </button>
    </form>
  </section>
</template>


