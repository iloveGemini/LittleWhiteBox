<script setup lang="ts">
import { useTavernAppUiContext } from '../tavern-app-context';

const ui = useTavernAppUiContext();
const {
    activeSettingsWorkspace,
    hiddenWorldbookCount,
    hiddenWorldbookPreviewEntryCount,
    openSelectedWorldbookEditor,
    selectedWorldbook,
    selectedWorldbookName,
    showMoreWorldbookPreviewEntries,
    visibleWorldbookOptions,
    WORLDBOOK_BATCH_SIZE,
    WORLDBOOK_PREVIEW_BATCH_SIZE,
    worldbookGlobalCount,
    worldbookOptions,
    worldbookPreview,
    worldbookPreviewStatus,
    worldbookSearchText,
    worldbookSourceSummary,
    worldbookStatus,
    worldbookVisibleLimit,
} = ui;
</script>

<template>
  <div
    v-show="activeSettingsWorkspace === 'worldbooks'"
    class="panel step-panel native-workspace"
  >
    <div class="panel-head preset-page-head">
      <div>
        <h2>世界书</h2>
      </div>
      <div class="panel-pills panel-head-actions">
        <span class="pill">{{ worldbookOptions.length }} 本</span>
        <span
          v-if="worldbookGlobalCount"
          class="pill"
        >{{ worldbookGlobalCount }} 本全局</span>
      </div>
    </div>
    <div
      v-if="worldbookStatus"
      class="preset-status-line"
    >
      <span>{{ worldbookStatus }}</span>
    </div>
    <div class="native-settings-studio worldbook-overview-grid">
      <aside class="native-list-panel worldbook-index-panel">
        <div class="assistant-preset-nav-head">
          <strong>世界书</strong>
        </div>
        <label class="archive-search native-search">
          <span>检索世界书</span>
          <input
            v-model="worldbookSearchText"
            type="search"
            placeholder="输入书名"
          >
        </label>
        <div
          v-for="item in visibleWorldbookOptions"
          :key="item.name"
          role="button"
          tabindex="0"
          class="native-list-row"
          :class="{ selected: selectedWorldbookName === item.name }"
          @click="selectedWorldbookName = item.name"
          @keydown.enter.prevent="selectedWorldbookName = item.name"
          @keydown.space.prevent="selectedWorldbookName = item.name"
        >
          <span
            class="worldbook-source-lights"
            :aria-label="worldbookSourceSummary(item)"
          >
            <i
              class="source-light source-global"
              :class="{ active: item.globalActive }"
              title="全局世界书"
            >全</i>
          </span>
          <span class="native-row-copy">
            <strong>{{ item.name }}</strong>
            <small v-if="worldbookSourceSummary(item)">{{ worldbookSourceSummary(item) }}</small>
          </span>
        </div>
        <button
          v-if="hiddenWorldbookCount"
          type="button"
          class="native-add-row"
          @click="worldbookVisibleLimit += WORLDBOOK_BATCH_SIZE"
        >
          再显示 {{ Math.min(hiddenWorldbookCount, WORLDBOOK_BATCH_SIZE) }} 本
        </button>
        <div
          v-if="!visibleWorldbookOptions.length"
          class="inline-empty-note"
        >
          没有匹配的世界书。
        </div>
      </aside>

      <section class="native-detail-panel worldbook-overview-detail worldbook-gateway-panel">
        <div
          v-if="selectedWorldbook"
          class="worldbook-preview-surface"
        >
          <div class="preset-preview-head worldbook-selected-head">
            <div>
              <strong>{{ selectedWorldbook.name }}</strong>
              <span v-if="worldbookSourceSummary(selectedWorldbook)">{{ worldbookSourceSummary(selectedWorldbook) }}</span>
            </div>
            <div class="worldbook-selected-actions">
              <span
                v-if="selectedWorldbook.globalActive"
                class="worldbook-link-badge"
              >全局世界书</span>
              <button
                type="button"
                class="worldbook-row-open"
                title="打开酒馆编辑器"
                aria-label="打开酒馆编辑器"
                @click="openSelectedWorldbookEditor(selectedWorldbook.name)"
              >
                打开
              </button>
            </div>
          </div>
          <div
            v-if="worldbookPreviewStatus"
            class="worldbook-preview-status"
          >
            {{ worldbookPreviewStatus }}
          </div>
          <template v-else-if="worldbookPreview && worldbookPreview.name === selectedWorldbook.name">
            <div class="worldbook-metric-grid">
              <span>
                <strong>{{ worldbookPreview.entryCount }}</strong>
                <small>条目</small>
              </span>
              <span>
                <strong>{{ worldbookPreview.enabledCount }}</strong>
                <small>启用</small>
              </span>
              <span>
                <strong>{{ worldbookPreview.constantCount }}</strong>
                <small>常驻</small>
              </span>
              <span>
                <strong>{{ worldbookPreview.keywordCount }}</strong>
                <small>关键词</small>
              </span>
              <span>
                <strong>{{ worldbookPreview.totalChars }}</strong>
                <small>正文字符</small>
              </span>
            </div>
            <div
              v-if="worldbookPreview.entries.length"
              class="worldbook-entry-preview-list"
            >
              <article
                v-for="entry in worldbookPreview.entries"
                :key="entry.uid || entry.name"
                class="worldbook-entry-preview"
                :class="{ disabled: !entry.enabled }"
              >
                <header>
                  <strong>{{ entry.name }}</strong>
                  <span>{{ entry.constant ? '常驻' : entry.enabled ? '启用' : '关闭' }}</span>
                </header>
                <p
                  v-if="entry.keys.length || entry.secondaryKeys.length"
                  class="worldbook-entry-keys"
                >
                  {{ [...entry.keys, ...entry.secondaryKeys].slice(0, 8).join(' / ') }}
                </p>
                <p>{{ entry.contentPreview || '没有正文预览。' }}</p>
              </article>
              <button
                v-if="hiddenWorldbookPreviewEntryCount"
                type="button"
                class="native-add-row worldbook-preview-more"
                @click="showMoreWorldbookPreviewEntries"
              >
                再显示 {{ Math.min(hiddenWorldbookPreviewEntryCount, WORLDBOOK_PREVIEW_BATCH_SIZE) }} 条
              </button>
            </div>
            <div
              v-else
              class="empty-note"
            >
              这本世界书暂无条目。
            </div>
          </template>
        </div>
        <div
          v-else
          class="empty-note"
        >
          选择一本世界书后查看预览。
        </div>
      </section>
    </div>
  </div>
</template>
