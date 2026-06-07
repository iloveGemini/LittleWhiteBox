<script setup lang="ts">
import { useTavernAppUiContext } from '../tavern-app-context';

const ui = useTavernAppUiContext();
const {
    activeAssistantPresetId,
    activeSettingsWorkspace,
    ASSISTANT_PRESET_BATCH_SIZE,
    assistantPreset,
    assistantPresetDirty,
    assistantPresetItems,
    assistantPresetSearchText,
    assistantPresetStatus,
    assistantPresetVisibleLimit,
    deriveAssistantPreset,
    discardAssistantPresetChanges,
    hiddenAssistantPresetCount,
    saveCurrentAssistantPreset,
    selectAssistantPreset,
    selectAssistantPresetItem,
    selectedAssistantPresetItem,
    shortText,
    updateAssistantPresetPatch,
    updateSelectedAssistantPresetItem,
    visibleAssistantPresetRecords,
} = ui;
</script>

<template>
  <div
    v-show="activeSettingsWorkspace === 'assistantPreset'"
    class="panel step-panel preset-workspace"
  >
    <div class="panel-head preset-page-head">
      <div>
        <h2>助手预设</h2>
      </div>
      <div class="panel-pills">
        <span
          v-if="assistantPresetDirty"
          class="pill warning"
        >未保存</span>
        <span class="pill">{{ assistantPreset.name || '未命名' }}</span>
      </div>
    </div>
    <div class="preset-command-bar">
      <div class="preset-source-field">
        <label class="archive-search preset-source-search">
          <span>助手预设</span>
          <input
            v-model="assistantPresetSearchText"
            type="search"
            placeholder="搜索管理员口径"
          >
        </label>
        <div class="preset-source-list">
          <div
            v-if="!visibleAssistantPresetRecords.length"
            class="inline-empty-note"
          >
            没有匹配的助手预设。
          </div>
          <button
            v-for="item in visibleAssistantPresetRecords"
            :key="item.id"
            type="button"
            class="preset-source-row"
            :class="{ selected: activeAssistantPresetId === item.id }"
            @click="selectAssistantPreset(item.id)"
          >
            <strong>{{ item.name }}</strong>
            <small>{{ item.isBuiltIn ? '内置' : '自定义' }}{{ item.description ? ` · ${item.description}` : '' }}</small>
          </button>
        </div>
        <button
          v-if="hiddenAssistantPresetCount"
          type="button"
          class="archive-load-more preset-source-more"
          @click="assistantPresetVisibleLimit += ASSISTANT_PRESET_BATCH_SIZE"
        >
          再显示 {{ Math.min(hiddenAssistantPresetCount, ASSISTANT_PRESET_BATCH_SIZE) }} 个
        </button>
      </div>
      <div class="preset-actions">
        <button
          type="button"
          @click="deriveAssistantPreset"
        >
          另存副本
        </button>
        <button
          type="button"
          :disabled="!assistantPresetDirty"
          @click="discardAssistantPresetChanges"
        >
          放弃
        </button>
        <button
          type="button"
          :disabled="!assistantPresetDirty"
          @click="saveCurrentAssistantPreset"
        >
          保存
        </button>
      </div>
    </div>
    <div
      v-if="assistantPresetStatus"
      class="preset-status-line"
    >
      <span>{{ assistantPresetStatus }}</span>
    </div>
    <div class="preset-meta-strip">
      <label>
        <span>名称</span>
        <input
          :value="assistantPreset.name"
          @input="updateAssistantPresetPatch({ name: ($event.target as HTMLInputElement).value })"
        >
      </label>
      <label>
        <span>说明</span>
        <input
          :value="assistantPreset.description || ''"
          @input="updateAssistantPresetPatch({ description: ($event.target as HTMLInputElement).value })"
        >
      </label>
    </div>
    <div class="assistant-preset-studio">
      <aside class="assistant-preset-item-list archive-item-list">
        <div class="assistant-preset-nav-head">
          <strong>记忆档案</strong>
          <span>一档一项</span>
        </div>
        <button
          v-for="item in assistantPresetItems"
          :key="item.id"
          type="button"
          class="assistant-preset-nav-row"
          :class="{ selected: selectedAssistantPresetItem?.id === item.id }"
          @click="selectAssistantPresetItem(item.id)"
        >
          <span>{{ item.summary }}</span>
          <strong>{{ item.label }}</strong>
          <small>{{ shortText(item.content || '未填写职责。', 54) }}</small>
        </button>
      </aside>

      <section class="assistant-preset-detail-panel archive-editor-panel">
        <div class="assistant-preset-line-head">
          <div>
            <strong>{{ selectedAssistantPresetItem?.label || '记忆档案' }}</strong>
            <span>{{ selectedAssistantPresetItem?.summary || '选择左侧一项后编辑。' }}</span>
          </div>
        </div>
        <div
          v-if="selectedAssistantPresetItem"
          class="assistant-preset-detail-fields"
        >
          <label>
            <span>职责说明</span>
            <textarea
              :value="selectedAssistantPresetItem.content"
              rows="12"
              placeholder="写这个记忆档案应该维护什么、保留什么、避免什么。"
              @input="updateSelectedAssistantPresetItem(($event.target as HTMLTextAreaElement).value)"
            />
          </label>
        </div>
        <button
          v-else
          type="button"
          class="assistant-preset-empty-add"
          disabled
        >
          没有可编辑条目
        </button>
      </section>
    </div>
  </div>
</template>
