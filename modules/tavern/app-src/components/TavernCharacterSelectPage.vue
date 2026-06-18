<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import TavernCornerActions from './TavernCornerActions.vue';
import { useTavernEphemeralDisclosureScope } from './useTavernEphemeralDisclosureScope';

interface TavernCharacterOption {
    id: string;
    name: string;
    avatar?: string;
    shallow?: boolean;
    description?: string;
    personality?: string;
    scenario?: string;
    firstMessage?: string;
    alternateGreetings?: string[];
    mesExample?: string;
    creatorNotes?: string;
    characterDepthPrompt?: string;
}

interface TavernCharacterWorldbookState {
    characterId: string;
    currentCharacterId: string;
    isCurrentCharacter: boolean;
    characterName: string;
    boundWorldbookName: string;
    boundExists: boolean;
    hasEmbeddedBook: boolean;
    embeddedBookName: string;
    worldbookOptions: string[];
}

interface TavernCharacterSessionOption {
    id: string;
    title: string;
    characterId?: string;
    characterName?: string;
    createdAt: number;
    updatedAt: number;
    summary?: string;
}

const props = defineProps<{
    dark: boolean;
    pendingError: string;
    characters: TavernCharacterOption[];
    visibleCharacters: TavernCharacterOption[];
    filteredCount: number;
    liveCharacterId: string;
    selectedCharacter: TavernCharacterOption | null | undefined;
    selectedGreetingIndex: number;
    pendingPreviewCharacterId: string;
    pendingCharacterSessionId: string;
    selectedCharacterSessions: TavernCharacterSessionOption[];
    characterWorldbookState: TavernCharacterWorldbookState | null;
    characterWorldbookBusy: boolean;
    searchText: string;
    hiddenCount: number;
    batchSize: number;
    avatarAvailable: (avatar?: string) => boolean;
    sessionFloorLabel: (session: TavernCharacterSessionOption) => string;
    shortText: (text: string, limit?: number) => string;
}>();

const emit = defineEmits<{
    (event: 'toggle-theme'): void;
    (event: 'back'): void;
    (event: 'refresh'): void;
    (event: 'update:searchText', value: string): void;
    (event: 'select', id: string): void;
    (event: 'enter-selected'): void;
    (event: 'open-character-worldbook'): void;
    (event: 'open-session', id: string): void;
    (event: 'select-greeting', index: number): void;
    (event: 'load-more'): void;
    (event: 'keydown', value: KeyboardEvent): void;
    (event: 'avatar-error', avatar?: string): void;
}>();

const listRef = ref<HTMLElement | null>(null);
const sessionArchiveOpen = ref(false);
const characterDefinitionOpen = ref(false);
const advancedDefinitionDisclosure = useTavernEphemeralDisclosureScope();

const greetingOptions = computed(() => {
    const selected = props.selectedCharacter;
    if (!selected) {return [];}
    return [
        String(selected.firstMessage || '').trim(),
        ...(selected.alternateGreetings || []),
    ].filter(Boolean);
});
const selectedGreetingText = computed(() => {
    if (!greetingOptions.value.length) {return '';}
    const index = Math.min(Math.max(0, Number(props.selectedGreetingIndex) || 0), greetingOptions.value.length - 1);
    return greetingOptions.value[index] || '';
});
const hasMultipleGreetings = computed(() => greetingOptions.value.length > 1);
const selectedCharacterSessionCount = computed(() => props.selectedCharacterSessions.length);
const characterDefinitionFields = computed(() => {
    const character = props.selectedCharacter;
    return [
        { label: '性格摘要', value: character?.personality || '' },
        { label: '情景', value: character?.scenario || '' },
        { label: '角色备注', value: character?.characterDepthPrompt || '' },
        { label: '制作者备注', value: character?.creatorNotes || '' },
        { label: '示例对话', value: character?.mesExample || '' },
    ];
});

const selectedCharacterPreviewLoading = computed(() => (
    !!props.selectedCharacter
    && String(props.pendingPreviewCharacterId || '') === String(props.selectedCharacter.id || '')
));

const characterWorldbookButtonTitle = computed(() => {
    const state = props.characterWorldbookState;
    if (!state) {return '读取角色世界书';}
    if (state.boundWorldbookName && state.boundExists) {return `打开 ${state.boundWorldbookName}`;}
    if (state.hasEmbeddedBook) {return `导入 ${state.embeddedBookName}`;}
    return '选择一本世界书绑定';
});
const characterWorldbookBound = computed(() => (
    props.characterWorldbookState?.boundExists === true
));

function scrollSelectedIntoView() {
    void nextTick(() => {
        const root = listRef.value;
        const selectedId = String(props.selectedCharacter?.id || '').trim();
        if (!root || !selectedId) {return;}
        const target = Array.from(root.querySelectorAll<HTMLElement>('[data-character-card-id]'))
            .find((node) => node.dataset.characterCardId === selectedId);
        target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
}

function handleSearchInput(event: Event) {
    emit('update:searchText', (event.target as HTMLInputElement).value);
}

function characterDataDisclosureId(key: string) {
    return `character-data:${props.selectedCharacter?.id || 'none'}:${key}`;
}

function greetingLabel(index: number) {
    return index === 0 ? '主开场白' : `备用 ${index}`;
}

function formatSessionTime(value: unknown) {
    const time = Number(value) || 0;
    if (!time) {return '未知时间';}
    return new Date(time).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function sessionArchiveTitle(session: TavernCharacterSessionOption) {
    return String(session.title || session.characterName || props.selectedCharacter?.name || '未命名会话').trim();
}

function sessionArchiveMeta(session: TavernCharacterSessionOption) {
    return `${formatSessionTime(session.updatedAt || session.createdAt)} · ${props.sessionFloorLabel(session)}`;
}

function openSessionArchive() {
    if (!props.selectedCharacter || props.pendingCharacterSessionId) {return;}
    sessionArchiveOpen.value = true;
}

function closeSessionArchive() {
    sessionArchiveOpen.value = false;
}

function openCharacterDefinition() {
    if (!props.selectedCharacter) {return;}
    characterDefinitionOpen.value = true;
}

function closeCharacterDefinition() {
    characterDefinitionOpen.value = false;
}

function openSession(sessionId: string) {
    const id = String(sessionId || '').trim();
    if (!id) {return;}
    closeSessionArchive();
    emit('open-session', id);
}

watch(
    () => props.selectedCharacter?.id,
    () => {
        advancedDefinitionDisclosure.reset();
        closeCharacterDefinition();
        closeSessionArchive();
        scrollSelectedIntoView();
    },
);

defineExpose({ scrollSelectedIntoView, openSessionArchive });
</script>

<template>
  <section class="xb-page character-select-page">
    <TavernCornerActions
      compact
      :dark="dark"
      @toggle-theme="$emit('toggle-theme')"
    />
    <div class="character-desk">
      <header class="character-select-head">
        <div class="head-left">
          <button
            type="button"
            class="os-sys-button"
            @click="$emit('back')"
          >
            <span class="icon">↵</span>
            首页
          </button>
        </div>
        <div class="character-title-copy">
          <p class="eyebrow">
            SYSTEM // DESK
          </p>
          <h2>角色档案库</h2>
        </div>
        <div
          class="head-balance"
          aria-hidden="true"
        />
      </header>

      <div
        v-if="pendingError"
        class="character-select-error"
      >
        [SYS_ERROR] {{ pendingError }}
      </div>

      <section
        v-if="characters.length"
        class="character-archive"
        :class="{ 'has-character-selection': !!selectedCharacter }"
      >
        <aside class="character-index-panel">
          <div class="index-panel-toolbar">
            <label class="os-search-bar">
              <span class="icon">⌕</span>
              <input
                :value="searchText"
                type="search"
                placeholder="检索角色特征..."
                @input="handleSearchInput"
              >
            </label>
            <div class="index-meta">
              {{ visibleCharacters.length }} / {{ filteredCount }} ENTRIES
            </div>
          </div>

          <div
            ref="listRef"
            class="character-card-grid"
            tabindex="0"
            aria-label="角色卡列表"
            @keydown="$emit('keydown', $event)"
          >
            <button
              v-for="character in visibleCharacters"
              :key="character.id"
              type="button"
              class="character-card-option"
              :data-character-card-id="character.id"
              :class="{
                current: character.id === liveCharacterId,
                selected: character.id === selectedCharacter?.id,
                pending: character.id === pendingCharacterSessionId,
              }"
              :disabled="!!pendingCharacterSessionId"
              @click="$emit('select', character.id)"
            >
              <div class="card-focus-indicator" />
              <span class="character-card-avatar">
                <img
                  v-if="avatarAvailable(character.avatar)"
                  :src="character.avatar"
                  loading="lazy"
                  decoding="async"
                  alt=""
                  @error="$emit('avatar-error', character.avatar)"
                >
                <span v-else>{{ character.name.slice(0, 1) }}</span>
              </span>
              <span class="character-card-body">
                <span class="character-card-title">
                  <strong>{{ character.name }}</strong>
                </span>
                <span class="character-card-desc">
                  {{ shortText(character.description || character.personality || character.scenario || character.firstMessage || '暂无数据存档。', 72) }}
                </span>
                <span class="card-status-tags">
                  <small
                    v-if="character.id === liveCharacterId"
                    class="tag active"
                  >ACTIVE</small>
                  <small
                    v-if="character.id === pendingCharacterSessionId"
                    class="tag loading"
                  >LOADING...</small>
                  <small
                    v-else-if="character.id === pendingPreviewCharacterId"
                    class="tag loading"
                  >READING...</small>
                </span>
              </span>
            </button>
            <button
              v-if="hiddenCount"
              type="button"
              class="archive-load-more character-load-more"
              @click="$emit('load-more')"
            >
              加载更多残卷 ({{ Math.min(hiddenCount, batchSize) }})
            </button>
          </div>

          <div
            v-if="!visibleCharacters.length"
            class="empty-note"
          >
            [SYS_WARN] 未检索到匹配档案。
          </div>
        </aside>

        <main
          v-if="selectedCharacter"
          class="character-preview-panel dossier-view"
        >
          <div class="dossier-header">
            <div class="dossier-identity">
              <p class="sys-mono">
                ID: {{ selectedCharacter.id.substring(0, 8) || 'UNKNOWN' }}
              </p>
              <div class="dossier-title-row">
                <h3>{{ selectedCharacter.name }}</h3>
                <div class="dossier-title-actions">
                  <button
                    type="button"
                    class="os-system-act-btn character-definition-button"
                    title="角色卡详情"
                    aria-label="角色卡详情"
                    @click="openCharacterDefinition"
                  >
                    <svg
                      class="character-definition-icon"
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.7"
                        d="M5.5 4.7c1.8-.9 4.1-.9 6.5.3 2.4-1.2 4.7-1.2 6.5-.3v14.4c-1.8-.8-4.1-.7-6.5.5-2.4-1.2-4.7-1.3-6.5-.5V4.7Z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-width="1.3"
                        d="M12 5v14.2M8 8.5h1.9M8 11.5h1.9M14.1 8.5H16M14.1 11.5H16"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="os-system-act-btn character-worldbook-button"
                    :class="{ 'is-loading': characterWorldbookBusy, 'is-bound': characterWorldbookBound }"
                    :disabled="!!pendingCharacterSessionId || characterWorldbookBusy"
                    :title="characterWorldbookButtonTitle"
                    aria-label="角色世界书"
                    @click="$emit('open-character-worldbook')"
                  >
                    <svg
                      class="character-worldbook-icon"
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-width="1.6"
                        d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM3.8 9h16.4M3.8 15h16.4M12 3c2 2.2 3 5.2 3 9s-1 6.8-3 9M12 3c-2 2.2-3 5.2-3 9s1 6.8 3 9"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="os-system-act-btn session-archive-button"
                    :disabled="!!pendingCharacterSessionId"
                    @click="openSessionArchive"
                  >
                    会话档案
                    <span v-if="selectedCharacterSessionCount">{{ selectedCharacterSessionCount }}</span>
                  </button>
                  <button
                    type="button"
                    class="os-system-act-btn enter-chat-button"
                    :class="{ 'is-loading': selectedCharacter.id === pendingCharacterSessionId }"
                    :disabled="!!pendingCharacterSessionId"
                    @click="$emit('enter-selected')"
                  >
                    {{ selectedCharacter.id === pendingCharacterSessionId ? '新建中...' : '新建聊天' }}
                  </button>
                </div>
              </div>
              <div class="dossier-summary">
                {{ selectedCharacterPreviewLoading ? '正在读取角色卡...' : selectedCharacter.description || selectedCharacter.personality || selectedCharacter.scenario || '暂无角色描述。' }}
              </div>
            </div>
          </div>

          <div class="dossier-details">
            <dl class="data-group">
              <div class="data-row">
                <dt>开场白 <span v-if="greetingOptions.length > 1">{{ selectedGreetingIndex + 1 }} / {{ greetingOptions.length }}</span></dt>
                <dd>
                  <div
                    v-if="greetingOptions.length"
                    class="greeting-current-card"
                  >
                    <div class="greeting-current-head">
                      <strong>{{ greetingLabel(selectedGreetingIndex) }}</strong>
                      <span v-if="greetingOptions.length > 1">{{ greetingOptions.length }} 个可选</span>
                    </div>
                    <div class="data-block greeting-current-text">
                      {{ selectedGreetingText }}
                    </div>
                    <details
                      :open="advancedDefinitionDisclosure.isOpen(characterDataDisclosureId('greetings'))"
                      class="data-section greeting-picker"
                      :class="{ 'is-empty': !hasMultipleGreetings }"
                      @toggle="advancedDefinitionDisclosure.setOpenFromEvent(characterDataDisclosureId('greetings'), $event)"
                    >
                      <summary class="greeting-section-title">
                        切换开场白
                      </summary>
                      <div
                        v-if="hasMultipleGreetings && advancedDefinitionDisclosure.isOpen(characterDataDisclosureId('greetings'))"
                        class="greeting-choice-list"
                      >
                        <button
                          v-for="(greeting, index) in greetingOptions"
                          :key="`${selectedCharacter.id}-greeting-${index}`"
                          type="button"
                          class="greeting-choice"
                          :class="{ selected: index === selectedGreetingIndex }"
                          :disabled="!!pendingCharacterSessionId"
                          @click="$emit('select-greeting', index)"
                        >
                          <span class="greeting-choice-name">{{ greetingLabel(index) }}</span>
                          <span class="greeting-choice-text">{{ shortText(greeting, 120) }}</span>
                        </button>
                      </div>
                    </details>
                  </div>
                  <div
                    v-else-if="selectedCharacterPreviewLoading"
                    class="data-block"
                  >
                    正在读取角色卡...
                  </div>
                  <div
                    v-else
                    class="data-block"
                  >
                    未填写
                  </div>
                </dd>
              </div>
            </dl>
          </div>
        </main>

        <div
          v-if="characterDefinitionOpen && selectedCharacter"
          class="character-definition-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="角色卡详情"
        >
          <section class="character-definition-dialog">
            <header>
              <div>
                <strong>角色卡详情</strong>
                <span>{{ selectedCharacter.name }}</span>
              </div>
              <button
                type="button"
                class="session-archive-close character-definition-close"
                aria-label="关闭角色卡详情"
                @click="closeCharacterDefinition"
              />
            </header>
            <dl class="character-definition-list">
              <div
                v-for="field in characterDefinitionFields"
                :key="field.label"
                class="character-definition-section"
              >
                <dt>{{ field.label }}</dt>
                <dd :class="{ 'is-empty': !field.value }">
                  {{ field.value || (selectedCharacterPreviewLoading ? '正在读取角色卡...' : '未填写') }}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div
          v-if="sessionArchiveOpen && selectedCharacter"
          class="character-session-archive-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="会话档案"
        >
          <section class="character-session-archive">
            <header>
              <div>
                <strong>会话档案</strong>
                <span>{{ selectedCharacter.name }}</span>
              </div>
              <button
                type="button"
                class="session-archive-close"
                aria-label="关闭会话档案"
                @click="closeSessionArchive"
              />
            </header>
            <div
              v-if="selectedCharacterSessions.length"
              class="session-archive-list"
            >
              <button
                v-for="session in selectedCharacterSessions"
                :key="session.id"
                type="button"
                class="session-archive-item"
                @click="openSession(session.id)"
              >
                <span class="session-archive-item-title">{{ sessionArchiveTitle(session) }}</span>
                <span class="session-archive-item-meta">{{ sessionArchiveMeta(session) }}</span>
                <span
                  v-if="session.summary"
                  class="session-archive-item-summary"
                >{{ shortText(session.summary, 96) }}</span>
              </button>
            </div>
            <div
              v-else
              class="session-archive-empty"
            >
              这张角色卡还没有旧会话。
            </div>
          </section>
        </div>

        <main
          v-if="!selectedCharacter"
          class="character-preview-panel dossier-empty"
        >
          <div class="cyber-placeholder">
            <div class="ring" />
            <span>AWAITING<br>SELECTION</span>
          </div>
        </main>
      </section>

      <section
        v-else
        class="character-empty"
      >
        <div class="empty-content">
          <h2>数据库脱节</h2>
          <p>本地缓存在酒馆内未找到可用角色，请在主控端加载后重试。</p>
          <button
            type="button"
            class="os-sys-button primary"
            @click="$emit('refresh')"
          >
            重新唤醒数据
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
