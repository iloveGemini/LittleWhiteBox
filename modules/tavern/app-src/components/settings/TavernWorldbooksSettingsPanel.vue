<script setup lang="ts">
import { computed, watch } from 'vue';
import { useTavernSettingsContext } from '../tavern-app-context';
import { useTavernEphemeralDisclosureScope } from '../useTavernEphemeralDisclosureScope';

const settings = useTavernSettingsContext();
const {
    activeSettingsWorkspace,
    hiddenWorldbookPreviewEntryCount,
    openSelectedWorldbookEditor,
    selectedWorldbook,
    selectedWorldbookName,
    showMoreWorldbookPreviewEntries,
    WORLDBOOK_PREVIEW_BATCH_SIZE,
    worldbookGlobalCount,
    worldbookOptions,
    worldbookPreview,
    worldbookPreviewStatus,
    worldbookSearchText,
    worldbookSourceSummary,
    worldbookStatus,
} = settings;

const worldbookSelectOptions = computed(() => {
    const query = String(worldbookSearchText.value || '').trim().toLocaleLowerCase();
    const selectedName = String(selectedWorldbookName.value || '').trim();
    const selected = worldbookOptions.value.find((item) => item.name === selectedName);
    const filtered = query
        ? worldbookOptions.value.filter((item) => item.name.toLocaleLowerCase().includes(query))
        : worldbookOptions.value;
    if (selected && !filtered.some((item) => item.name === selected.name)) {
        return [selected, ...filtered];
    }
    return filtered;
});

const worldbookDisclosure = useTavernEphemeralDisclosureScope();

function worldbookEntryDisclosureId(entry: { uid?: string; name: string; order?: number }) {
    return `worldbook:${selectedWorldbookName.value}:${entry.uid || entry.order || entry.name}`;
}

watch(
    [activeSettingsWorkspace, selectedWorldbookName, () => worldbookPreview.value?.name],
    () => worldbookDisclosure.reset(),
);
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
    <div class="preset-command-bar worldbook-command-bar">
      <label class="preset-source-select worldbook-source-select">
        <select
          :value="selectedWorldbookName"
          @change="selectedWorldbookName = ($event.target as HTMLSelectElement).value"
        >
          <option
            v-if="!worldbookSelectOptions.length"
            value=""
          >
            没有世界书
          </option>
          <option
            v-for="item in worldbookSelectOptions"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }}
          </option>
        </select>
      </label>
      <label class="archive-search native-search worldbook-search-field">
        <input
          v-model="worldbookSearchText"
          type="search"
          aria-label="筛选世界书"
          placeholder="筛选世界书"
        >
      </label>
    </div>
    <div class="native-settings-studio worldbook-overview-grid">
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
              <details
                v-for="entry in worldbookPreview.entries"
                :key="entry.uid || entry.name"
                class="worldbook-entry-preview"
                :class="{ disabled: !entry.enabled }"
                :open="worldbookDisclosure.isOpen(worldbookEntryDisclosureId(entry))"
                @toggle="worldbookDisclosure.setOpenFromEvent(worldbookEntryDisclosureId(entry), $event)"
              >
                <summary>
                  <span class="worldbook-entry-title">
                    <strong>{{ entry.name }}</strong>
                  </span>
                  <span class="worldbook-entry-state">{{ entry.constant ? '常驻' : entry.enabled ? '启用' : '关闭' }}</span>
                </summary>
                <div
                  v-if="worldbookDisclosure.isOpen(worldbookEntryDisclosureId(entry))"
                  class="worldbook-entry-body"
                >
                  <p
                    v-if="entry.keys.length || entry.secondaryKeys.length"
                    class="worldbook-entry-keys"
                  >
                    {{ [...entry.keys, ...entry.secondaryKeys].join(' / ') }}
                  </p>
                  <p
                    v-if="entry.contentPreview"
                    class="worldbook-entry-content"
                  >
                    {{ entry.contentPreview }}
                  </p>
                </div>
              </details>
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
