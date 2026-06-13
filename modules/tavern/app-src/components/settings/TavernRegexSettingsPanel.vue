<script setup lang="ts">
import { useTavernAppUiContext } from '../tavern-app-context';

const ui = useTavernAppUiContext();
const {
    activeSettingsWorkspace,
    applyActiveRegexScript,
    createRegexScript,
    deleteCurrentRegexScript,
    expandRegexGroup,
    linesFromList,
    listFromLines,
    REGEX_GROUP_BATCH_SIZE,
    regexDirty,
    regexDraft,
    regexDraftTypeLabel,
    regexGroupsForDisplay,
    regexPlacementLabel,
    regexScriptRows,
    regexSearchText,
    regexStatus,
    saveCurrentRegexScript,
    selectedRegexKey,
    selectedRegexRow,
    selectRegexScript,
    toggleRegexPlacement,
    updateRegexPatch,
} = ui;
</script>

<template>
  <div
    v-show="activeSettingsWorkspace === 'regex'"
    class="panel step-panel native-workspace"
  >
    <div class="panel-head preset-page-head">
      <div>
        <h2>正则</h2>
      </div>
      <div class="panel-pills">
        <span
          v-if="regexDirty"
          class="pill warning"
        >未保存</span>
        <span class="pill">{{ regexScriptRows.length }} 条</span>
      </div>
    </div>
    <div class="preset-command-bar regex-command-bar">
      <div class="settings-toolstrip">
        <button
          type="button"
          class="settings-icon-tool"
          title="放弃修改"
          aria-label="放弃修改"
          :disabled="!regexDirty"
          @click="applyActiveRegexScript(selectedRegexRow)"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M3 7v6h6" />
            <path d="M21 17a8 8 0 0 0-13.7-5.7L3 15" />
          </svg>
        </button>
        <button
          type="button"
          class="settings-icon-tool"
          title="保存"
          aria-label="保存"
          :disabled="!regexDraft.scriptName || !regexDirty"
          @click="saveCurrentRegexScript"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M5 21h14a1 1 0 0 0 1-1V7.5L16.5 4H5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1Z" />
            <path d="M8 21v-7h8v7" />
            <path d="M8 4v5h7" />
          </svg>
        </button>
        <button
          type="button"
          class="settings-icon-tool"
          title="删除"
          aria-label="删除"
          :disabled="!selectedRegexRow"
          @click="deleteCurrentRegexScript"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
    <div
      v-if="regexStatus"
      class="preset-status-line"
    >
      <span>{{ regexStatus }}</span>
    </div>
    <div class="native-settings-studio regex-studio">
      <aside class="native-list-panel regex-group-panel regex-library-panel">
        <label class="archive-search native-search">
          <span>检索正则</span>
          <input
            v-model="regexSearchText"
            type="search"
            placeholder="名称、匹配式或替换文本"
          >
        </label>
        <div
          v-for="group in regexGroupsForDisplay"
          :key="group.key"
          class="regex-group-block"
        >
          <div class="assistant-preset-nav-head">
            <strong>{{ group.label }}</strong>
            <span>{{ group.allowed === false ? '未允许' : `${group.visibleRows.length} / ${group.filteredCount} / ${group.totalCount} 条` }}</span>
          </div>
          <button
            v-for="row in group.visibleRows"
            :key="row.key"
            type="button"
            class="native-list-row"
            :class="{ selected: selectedRegexKey === row.key, disabled: row.script.disabled }"
            @click="selectRegexScript(row)"
          >
            <span>{{ row.script.disabled ? '停' : '用' }}</span>
            <strong>{{ row.script.scriptName || '未命名正则' }}</strong>
            <small>{{ row.script.findRegex || '空匹配式' }}</small>
          </button>
          <button
            v-if="group.hiddenCount"
            type="button"
            class="native-add-row"
            @click="expandRegexGroup(group.key)"
          >
            再显示 {{ Math.min(group.hiddenCount, REGEX_GROUP_BATCH_SIZE) }} 条
          </button>
          <button
            type="button"
            class="native-add-row"
            :title="`新增${group.label}`"
            :aria-label="`新增${group.label}`"
            @click="createRegexScript(group)"
          >
            新增
          </button>
        </div>
        <div
          v-if="regexSearchText && !regexGroupsForDisplay.length"
          class="inline-empty-note"
        >
          没有匹配的正则。
        </div>
      </aside>

      <section class="native-detail-panel regex-detail-panel">
        <template v-if="selectedRegexKey || regexDraft.scriptName">
          <div class="preset-preview-head">
            <strong>{{ regexDraft.scriptName || '新正则' }}</strong>
            <span>{{ regexDraftTypeLabel() }}</span>
          </div>
          <div class="regex-editor-grid">
            <section class="regex-editor-section regex-pattern-section">
              <div class="regex-section-title">
                查找与替换
              </div>
              <div class="native-form-grid regex-editor-meta">
                <label>
                  <span>名称</span>
                  <input
                    :value="regexDraft.scriptName || ''"
                    @input="updateRegexPatch({ scriptName: ($event.target as HTMLInputElement).value })"
                  >
                </label>
                <label>
                  <span>匹配</span>
                  <input
                    :value="regexDraft.findRegex || ''"
                    spellcheck="false"
                    @input="updateRegexPatch({ findRegex: ($event.target as HTMLInputElement).value })"
                  >
                </label>
              </div>
              <label class="preset-text-field regex-main-field">
                <span>替换为</span>
                <textarea
                  :value="regexDraft.replaceString || ''"
                  rows="5"
                  spellcheck="false"
                  @input="updateRegexPatch({ replaceString: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>
              <label class="preset-text-field regex-support-field">
                <span>裁剪字符串</span>
                <textarea
                  :value="linesFromList(regexDraft.trimStrings)"
                  rows="3"
                  spellcheck="false"
                  @input="updateRegexPatch({ trimStrings: listFromLines(($event.target as HTMLTextAreaElement).value) })"
                />
              </label>
            </section>

            <section class="regex-editor-section regex-placement-section">
              <div class="regex-section-title">
                作用范围
              </div>
              <div class="native-check-row placement-row regex-editor-switches">
                <label
                  v-for="value in [1, 2, 3, 5, 6]"
                  :key="value"
                  class="inline-check"
                >
                  <input
                    type="checkbox"
                    :checked="(regexDraft.placement || []).includes(value)"
                    @change="toggleRegexPlacement(value, ($event.target as HTMLInputElement).checked)"
                  >
                  <span>{{ regexPlacementLabel(value) }}</span>
                </label>
              </div>
            </section>

            <section class="regex-editor-section regex-ephemeral-section">
              <div class="regex-section-title">
                表层替换
              </div>
              <div class="native-check-row regex-editor-switches">
                <label class="inline-check">
                  <input
                    type="checkbox"
                    :checked="regexDraft.markdownOnly === true"
                    @change="updateRegexPatch({ markdownOnly: ($event.target as HTMLInputElement).checked })"
                  >
                  <span>只改显示</span>
                </label>
                <label class="inline-check">
                  <input
                    type="checkbox"
                    :checked="regexDraft.promptOnly === true"
                    @change="updateRegexPatch({ promptOnly: ($event.target as HTMLInputElement).checked })"
                  >
                  <span>只改提示词</span>
                </label>
              </div>
            </section>

            <section class="regex-editor-section regex-options-section">
              <div class="regex-section-title">
                其他选项
              </div>
              <div class="native-check-row regex-editor-switches">
                <label class="inline-check">
                  <input
                    type="checkbox"
                    :checked="regexDraft.disabled === true"
                    @change="updateRegexPatch({ disabled: ($event.target as HTMLInputElement).checked })"
                  >
                  <span>停用</span>
                </label>
                <label class="inline-check">
                  <input
                    type="checkbox"
                    :checked="regexDraft.runOnEdit === true"
                    @change="updateRegexPatch({ runOnEdit: ($event.target as HTMLInputElement).checked })"
                  >
                  <span>编辑时执行</span>
                </label>
              </div>
              <div class="native-form-grid regex-advanced-grid">
                <label>
                  <span>查找宏</span>
                  <select
                    :value="regexDraft.substituteRegex ?? 0"
                    @change="updateRegexPatch({ substituteRegex: Number(($event.target as HTMLSelectElement).value) })"
                  >
                    <option :value="0">不替换</option>
                    <option :value="1">原样替换</option>
                    <option :value="2">转义替换</option>
                  </select>
                </label>
                <label>
                  <span>最小深度</span>
                  <input
                    type="number"
                    :value="regexDraft.minDepth ?? ''"
                    @input="updateRegexPatch({ minDepth: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })"
                  >
                </label>
                <label>
                  <span>最大深度</span>
                  <input
                    type="number"
                    :value="regexDraft.maxDepth ?? ''"
                    @input="updateRegexPatch({ maxDepth: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })"
                  >
                </label>
              </div>
            </section>
          </div>
        </template>
        <div
          v-else
          class="empty-note"
        >
          选择一条正则，或在左侧新建。
        </div>
      </section>
    </div>
  </div>
</template>
