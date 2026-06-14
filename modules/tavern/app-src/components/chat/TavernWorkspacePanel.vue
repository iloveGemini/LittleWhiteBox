<script setup lang="ts">
import { computed } from 'vue';
import TavernMapPanel from '../TavernMapPanel.vue';
import TavernMemoryEditor from '../TavernMemoryEditor.vue';
import { useTavernMemoryContext, useTavernWorkspaceContext } from '../tavern-app-context';
import { useMobileSheetDrag } from './useMobileSheetDrag';

defineProps<{
    mobileMemoryDirectoryOpen: boolean;
}>();
const emit = defineEmits<{
    (event: 'close'): void;
    (event: 'close-memory-directory'): void;
    (event: 'toggle-memory-directory'): void;
}>();

const memory = useTavernMemoryContext();
const workspace = useTavernWorkspaceContext();
const {
    chatWorkspacePanel,
} = workspace;
const {
    activeMemoryFiles,
    discardMemoryDraft,
    enterMemoryEditMode,
    expandMemoryFileGroup,
    formatMemoryFileMeta,
    MEMORY_FILE_BATCH_SIZE,
    MEMORY_TURN_BATCH_SIZE,
    memoryDirectoryGroups,
    memoryEditorDirty,
    memoryEditorDocumentAvailable,
    memoryEditorDraft,
    memoryEditorLoadedPath,
    memoryEditorMode,
    memoryEditorReadOnly,
    memoryEditorStatus,
    memoryFileDisplayName,
    memoryFiles,
    memoryFileSearchText,
    markdownSignature,
    previewMemoryDraft,
    renderChatMarkdown,
    saveSelectedMemoryFile,
    selectedMemoryFileEntry,
    selectedMemoryFilePath,
    selectMemoryFile,
    stateMemoryFile,
} = memory;
const {
    mapStateDocument,
    mapStatePatches,
} = workspace;

const currentStateFile = computed(() => stateMemoryFile.value || null);
const currentStateContent = computed(() => String(currentStateFile.value?.content || '').trim());
const currentStatePreviewHtml = computed(() => renderChatMarkdown(currentStateContent.value));
const currentStatePreviewSignature = computed(() => markdownSignature(currentStateContent.value));

function closeMobileChatPanel() {
    emit('close');
}

const {
    dragging: sheetHandleDragging,
    handleSheetHandlePointerCancel,
    handleSheetHandlePointerDown,
    handleSheetHandlePointerMove,
    handleSheetHandlePointerUp,
} = useMobileSheetDrag(closeMobileChatPanel);

function toggleMobileMemoryDirectory() {
    emit('toggle-memory-directory');
}

function selectMobileMemoryFile(path: string) {
    selectMemoryFile(path);
    emit('close-memory-directory');
}
</script>

<template>
  <aside class="tavern-workspace-panel">
    <button
      type="button"
      class="chat-mobile-sheet-handle"
      :class="{ 'is-dragging': sheetHandleDragging }"
      title="收起记忆面板"
      aria-label="收起记忆面板"
      @click="closeMobileChatPanel"
      @pointercancel="handleSheetHandlePointerCancel"
      @pointerdown="handleSheetHandlePointerDown"
      @pointermove="handleSheetHandlePointerMove"
      @pointerup="handleSheetHandlePointerUp"
    />
    <div class="tavern-workspace-tabs">
      <button
        type="button"
        :class="{ active: chatWorkspacePanel === 'state' }"
        @click="chatWorkspacePanel = 'state'"
      >
        状态
      </button>
      <button
        type="button"
        :class="{ active: chatWorkspacePanel === 'memory' }"
        @click="chatWorkspacePanel = 'memory'"
      >
        记忆
      </button>
    </div>
    <section
      v-if="chatWorkspacePanel === 'state'"
      class="tavern-state-panel"
    >
      <TavernMapPanel
        compact
        :document="mapStateDocument"
        :patches="mapStatePatches"
      />
      <article class="tavern-current-state">
        <div
          v-if="currentStateContent"
          class="tavern-current-state-body xb-tavern-markdown"
          :data-markdown-signature="currentStatePreviewSignature"
          v-html="currentStatePreviewHtml"
        />
        <div
          v-else
          class="tavern-current-state-empty"
        >
          暂无当前状态。
        </div>
      </article>
    </section>
    <section
      v-else
      class="tavern-memory-workspace"
      :class="{ 'is-memory-directory-open': mobileMemoryDirectoryOpen }"
    >
      <aside class="tavern-memory-directory">
        <header class="tavern-memory-directory-head">
          <strong>记忆文档</strong>
          <span>{{ activeMemoryFiles.length }}</span>
        </header>
        <label
          v-if="memoryFiles.length"
          class="memory-search tavern-memory-search"
        >
          <input
            v-model="memoryFileSearchText"
            type="search"
            placeholder="检索档案"
          >
        </label>
        <div
          v-if="memoryFiles.length"
          class="memory-directory-list xb-files"
        >
          <div
            v-for="group in memoryDirectoryGroups"
            :key="group.key"
            class="memory-file-group"
          >
            <div class="memory-file-group-title">
              <span>{{ group.title }}</span>
              <em>{{ group.totalCount }}</em>
            </div>
            <div class="memory-file-tree">
              <button
                v-for="file in group.files"
                :key="file.path"
                type="button"
                class="memory-file"
                :class="{ active: selectedMemoryFilePath === file.path, stale: file.status === 'stale' }"
                @click="selectMobileMemoryFile(file.path)"
              >
                <span class="memory-file-main">{{ memoryFileDisplayName(file) }}</span>
              </button>
              <button
                v-if="group.hiddenCount"
                type="button"
                class="memory-file memory-file-more"
                @click="expandMemoryFileGroup(group.key)"
              >
                <span class="memory-file-main">再显示 {{ Math.min(group.hiddenCount, group.key === 'turns' ? MEMORY_TURN_BATCH_SIZE : MEMORY_FILE_BATCH_SIZE) }} 个</span>
              </button>
            </div>
          </div>
          <p
            v-if="memoryFileSearchText && !memoryDirectoryGroups.length"
            class="muted compact"
          >
            没有匹配的记忆档案。
          </p>
        </div>
        <p
          v-else
          class="muted compact"
        >
          还没有记忆档案。
        </p>
      </aside>
      <button
        type="button"
        class="tavern-mobile-memory-picker"
        :class="{ 'is-open': mobileMemoryDirectoryOpen }"
        :disabled="!memoryFiles.length"
        title="选择记忆文档"
        aria-label="选择记忆文档"
        @click="toggleMobileMemoryDirectory"
      >
        <span>{{ selectedMemoryFileEntry ? memoryFileDisplayName(selectedMemoryFileEntry) : '选择记忆文档' }}</span>
        <em aria-hidden="true">⌄</em>
      </button>
      <TavernMemoryEditor
        v-model:draft="memoryEditorDraft"
        :document-available="memoryEditorDocumentAvailable"
        :read-only="memoryEditorReadOnly"
        :dirty="memoryEditorDirty"
        :mode="memoryEditorMode"
        :preview-html="renderChatMarkdown(memoryEditorDraft)"
        :preview-signature="markdownSignature(memoryEditorDraft)"
        :status="memoryEditorStatus"
        :has-selected-file="!!selectedMemoryFileEntry"
        :loaded-path="memoryEditorLoadedPath"
        :file-meta="selectedMemoryFileEntry ? formatMemoryFileMeta(selectedMemoryFileEntry) : ''"
        @enter-edit="enterMemoryEditMode"
        @preview="previewMemoryDraft"
        @discard="discardMemoryDraft"
        @save="saveSelectedMemoryFile"
      />
    </section>
  </aside>
</template>


