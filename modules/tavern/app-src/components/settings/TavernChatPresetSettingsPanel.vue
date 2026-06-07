<script setup lang="ts">
import { useTavernAppUiContext } from '../tavern-app-context';

const ui = useTavernAppUiContext();
const {
    activePromptOrderLabel,
    activeSettingsWorkspace,
    canEditPromptOrder,
    CHAT_PRESET_SOURCE_BATCH_SIZE,
    chatPresetSourceSearchText,
    chatPresetSourceVisibleLimit,
    discardPresetChanges,
    filteredPromptEditorRows,
    hiddenChatPresetOptionCount,
    hiddenPromptCount,
    movePromptRow,
    preset,
    presetDirty,
    presetRows,
    presetStatus,
    presetTotalChars,
    PROMPT_EDITOR_BATCH_SIZE,
    promptEditorRows,
    promptRoleDisplay,
    promptRowIndex,
    promptSearchText,
    promptVisibleLimit,
    saveCurrentPreset,
    selectChatPresetFromHost,
    selectedPresetSourceId,
    selectedPromptIdentifier,
    selectedPromptRow,
    togglePromptRow,
    updatePromptByIdentifier,
    visibleChatPresetOptions,
    visiblePromptEditorRows,
} = ui;
</script>

<template>
  <div
    v-show="activeSettingsWorkspace === 'chatPreset'"
    class="panel step-panel preset-workspace"
  >
    <div class="panel-head preset-page-head">
      <div>
        <h2>聊天预设</h2>
      </div>
      <div class="panel-pills">
        <span
          v-if="presetDirty"
          class="pill warning"
        >未保存</span>
        <span class="pill">{{ presetRows.length }} 条 · {{ presetTotalChars }} 字</span>
      </div>
    </div>
    <div class="preset-command-bar">
      <div class="preset-source-field">
        <label class="archive-search preset-source-search">
          <span>酒馆预设</span>
          <input
            v-model="chatPresetSourceSearchText"
            type="search"
            placeholder="搜索可用预设"
          >
        </label>
        <div class="preset-source-list">
          <div
            v-if="!visibleChatPresetOptions.length"
            class="inline-empty-note"
          >
            没有匹配的酒馆预设。
          </div>
          <button
            v-for="item in visibleChatPresetOptions"
            :key="item.name"
            type="button"
            class="preset-source-row"
            :class="{ selected: selectedPresetSourceId === item.name }"
            @click="selectChatPresetFromHost(item.name)"
          >
            <strong>{{ item.label }}</strong>
            <small>{{ selectedPresetSourceId === item.name ? '当前使用' : '酒馆原生' }}</small>
          </button>
        </div>
        <button
          v-if="hiddenChatPresetOptionCount"
          type="button"
          class="archive-load-more preset-source-more"
          @click="chatPresetSourceVisibleLimit += CHAT_PRESET_SOURCE_BATCH_SIZE"
        >
          再显示 {{ Math.min(hiddenChatPresetOptionCount, CHAT_PRESET_SOURCE_BATCH_SIZE) }} 个
        </button>
      </div>
      <div class="preset-actions">
        <button
          type="button"
          :disabled="!presetDirty"
          @click="discardPresetChanges"
        >
          放弃
        </button>
        <button
          type="button"
          :disabled="!canEditPromptOrder || !presetDirty"
          @click="saveCurrentPreset"
        >
          保存
        </button>
      </div>
    </div>
    <div
      v-if="presetStatus"
      class="preset-status-line"
    >
      <span>{{ presetStatus }}</span>
    </div>

    <div class="preset-studio">
      <section class="preset-edit-main prompt-sequence-panel">
        <div class="preset-form-grid prompt-sequence-summary">
          <label>
            <span>当前来源</span>
            <input
              :value="preset.promptManager?.name || ''"
              readonly
            >
          </label>
          <label>
            <span>顺序</span>
            <input
              :value="activePromptOrderLabel"
              readonly
            >
          </label>
        </div>
        <div class="archive-toolbar preset-filterbar">
          <label class="archive-search">
            <span>检索条目</span>
            <input
              v-model="promptSearchText"
              type="search"
              placeholder="按名称、消息身份或内容搜索"
            >
          </label>
          <p>
            显示 {{ Math.min(filteredPromptEditorRows.length, promptVisibleLimit) }} / {{ filteredPromptEditorRows.length }}，共 {{ promptEditorRows.length }} 条
          </p>
        </div>
        <div class="prompt-manager-list">
          <div
            v-if="!visiblePromptEditorRows.length"
            class="inline-empty-note"
          >
            没有匹配的提示词条目。
          </div>
          <div
            v-for="row in visiblePromptEditorRows"
            :key="row.identifier"
            class="prompt-manager-row"
            :class="{ selected: selectedPromptIdentifier === row.identifier, disabled: !row.enabled, marker: row.marker }"
            @click="selectedPromptIdentifier = row.identifier"
          >
            <button
              type="button"
              class="prompt-row-index"
              title="选择"
              @click.stop="selectedPromptIdentifier = row.identifier"
            >
              {{ promptRowIndex(row.identifier) + 1 }}
            </button>
            <div class="prompt-row-main">
              <strong>{{ row.name }}</strong>
              <small>{{ promptRoleDisplay(row.role) }}</small>
            </div>
            <div class="prompt-row-actions">
              <button
                type="button"
                title="上移"
                :disabled="!canEditPromptOrder || !!promptSearchText || promptRowIndex(row.identifier) === 0"
                @click.stop="movePromptRow(row.identifier, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                title="下移"
                :disabled="!canEditPromptOrder || !!promptSearchText || promptRowIndex(row.identifier) === promptEditorRows.length - 1"
                @click.stop="movePromptRow(row.identifier, 1)"
              >
                ↓
              </button>
              <label
                class="prompt-toggle"
                title="启用"
                @click.stop
              >
                <input
                  type="checkbox"
                  :checked="row.enabled"
                  :disabled="!canEditPromptOrder"
                  @change="togglePromptRow(row.identifier, ($event.target as HTMLInputElement).checked)"
                >
              </label>
            </div>
          </div>
        </div>
        <button
          v-if="hiddenPromptCount"
          type="button"
          class="archive-load-more"
          @click="promptVisibleLimit += PROMPT_EDITOR_BATCH_SIZE"
        >
          再显示 {{ Math.min(hiddenPromptCount, PROMPT_EDITOR_BATCH_SIZE) }} 条
        </button>
      </section>

      <aside class="preset-preview-panel prompt-detail-panel prompt-editor-panel">
        <div class="preset-preview-head">
          <strong>{{ selectedPromptRow?.name || '提示词条目' }}</strong>
          <span>{{ promptRoleDisplay(String(selectedPromptRow?.role || 'system')) }}</span>
        </div>
        <div
          v-if="selectedPromptRow"
          class="prompt-detail-form prompt-editor-form"
        >
          <label>
            <span>名称</span>
            <input
              :value="selectedPromptRow.name"
              @input="updatePromptByIdentifier(selectedPromptRow.identifier, { name: ($event.target as HTMLInputElement).value })"
            >
          </label>
          <label>
            <span>消息身份</span>
            <select
              :value="selectedPromptRow.role"
              @change="updatePromptByIdentifier(selectedPromptRow.identifier, { role: ($event.target as HTMLSelectElement).value })"
            >
              <option value="system">系统</option>
              <option value="user">用户</option>
              <option value="assistant">助手</option>
            </select>
          </label>
          <label class="preset-text-field">
            <span>内容</span>
            <textarea
              :value="selectedPromptRow.content"
              rows="16"
              spellcheck="false"
              :disabled="selectedPromptRow.marker"
              @input="updatePromptByIdentifier(selectedPromptRow.identifier, { content: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <p
            v-if="selectedPromptRow.marker"
            class="muted compact"
          >
            这是酒馆顺序占位，不编辑正文。
          </p>
        </div>
        <div
          v-else
          class="empty-note"
        >
          当前预设没有可编辑条目。
        </div>
      </aside>
    </div>
  </div>
</template>
