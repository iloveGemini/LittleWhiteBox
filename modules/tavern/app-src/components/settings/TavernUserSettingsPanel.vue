<script setup lang="ts">
import { computed } from 'vue';
import type { TavernUserOption } from '../tavern-app-context';
import { useTavernSettingsContext } from '../tavern-app-context';

const settings = useTavernSettingsContext();
const {
    activeSettingsWorkspace,
    currentTavernUser,
    displaySettings,
    loadTavernUsers,
    resetDisplaySettings,
    shortText,
    stepHiddenOutsideCount,
    stepLoadBatchSize,
    switchingTavernUserId,
    switchTavernUser,
    tavernUsers,
    userSettingsLoading,
    userSettingsSaving,
    userSettingsStatus,
} = settings;

const currentUserLabel = computed(() => currentTavernUser.value?.name || '未选择 USER');
const currentUserDescription = computed(() => currentTavernUser.value?.description || '当前酒馆 USER 将同步到聊天上下文中。');
const contextSummaryLines = [
    '暂未开放调整',
    '当前上下文窗口上限为 20 楼。',
    '达到上限后，会回收到较新的可用历史继续运行。',
    '目标保留量按 10 楼计算，并结合当前用户楼层数调整。',
    '删除楼层后，若可用历史少于 5 楼，会从当前可用历史重新起算。',
    '窗口外记忆依赖契约中的记忆功能。',
    '该设计主要用于兼顾上下文稳定性与 API 缓存表现。',
];

function userCardDescription(user: TavernUserOption) {
    return user.description || (user.active ? '当前正在使用的 USER。' : '点击切换到这个 USER。');
}

function userCardInitial(user: TavernUserOption) {
    return (String(user.name || user.id || 'U').trim().slice(0, 1) || 'U').toUpperCase();
}
</script>

<template>
  <div
    v-show="activeSettingsWorkspace === 'user'"
    class="panel step-panel user-settings-workspace"
  >
    <div class="panel-head preset-page-head">
      <div>
        <h2>用户设置</h2>
      </div>
      <div class="panel-pills">
        <span class="pill">{{ tavernUsers.length }} 个 USER</span>
      </div>
    </div>
    <div
      v-if="userSettingsStatus"
      class="preset-status-line"
    >
      <span>{{ userSettingsStatus }}</span>
    </div>
    <div class="user-settings-stack">
      <section class="user-settings-section">
        <div class="user-settings-section-head">
          <div>
            <span class="user-settings-kicker">USER</span>
            <h3>切换当前 USER</h3>
            <p>{{ currentUserLabel }} · {{ currentUserDescription }}</p>
          </div>
          <button
            type="button"
            class="user-settings-inline-button"
            :disabled="userSettingsLoading || !!switchingTavernUserId"
            @click="loadTavernUsers"
          >
            刷新列表
          </button>
        </div>
        <div
          v-if="tavernUsers.length"
          class="user-settings-user-grid"
        >
          <button
            v-for="user in tavernUsers"
            :key="user.id"
            type="button"
            class="user-settings-user-card"
            :class="{ active: user.active, switching: switchingTavernUserId === user.id }"
            :disabled="!!switchingTavernUserId && switchingTavernUserId !== user.id"
            @click="switchTavernUser(user.id)"
          >
            <div class="user-settings-user-avatar">
              <img
                v-if="user.avatarUrl"
                :src="user.avatarUrl"
                :alt="user.name"
              >
              <span v-else>{{ userCardInitial(user) }}</span>
            </div>
            <div class="user-settings-user-copy">
              <div class="user-settings-user-line">
                <strong>{{ user.name }}</strong>
                <span
                  v-if="user.active"
                  class="user-settings-user-badge"
                >当前</span>
              </div>
              <p>{{ shortText(userCardDescription(user), 80) }}</p>
            </div>
          </button>
        </div>
        <div
          v-else
          class="empty-note"
        >
          {{ userSettingsLoading ? '正在读取 USER 列表…' : '当前没有可切换的 USER。' }}
        </div>
      </section>

      <section class="user-settings-section">
        <div class="user-settings-section-head">
          <div>
            <span class="user-settings-kicker">显示</span>
            <h3>楼层显示</h3>
            <p>这两项会立刻影响当前聊天窗口的显示和向前加载节奏。</p>
          </div>
          <button
            type="button"
            class="user-settings-inline-button"
            :disabled="userSettingsSaving"
            @click="resetDisplaySettings"
          >
            恢复默认
          </button>
        </div>
        <div class="user-settings-display-list">
          <div class="user-settings-display-row">
            <div class="user-settings-display-copy">
              <strong>窗口外隐藏数</strong>
              <p>默认 5 楼，可调整范围 1-20。</p>
            </div>
            <div class="user-settings-stepper">
              <button
                type="button"
                class="user-settings-stepper-button"
                :disabled="userSettingsSaving || displaySettings.hiddenOutsideCount <= 1"
                title="减少隐藏数"
                aria-label="减少隐藏数"
                @click="stepHiddenOutsideCount(-1)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
              <div class="user-settings-stepper-value">
                <strong>{{ displaySettings.hiddenOutsideCount }}</strong>
                <span>楼</span>
              </div>
              <button
                type="button"
                class="user-settings-stepper-button"
                :disabled="userSettingsSaving || displaySettings.hiddenOutsideCount >= 20"
                title="增加隐藏数"
                aria-label="增加隐藏数"
                @click="stepHiddenOutsideCount(1)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              </button>
            </div>
          </div>

          <div class="user-settings-display-row">
            <div class="user-settings-display-copy">
              <strong>滚动加载批次</strong>
              <p>默认 20 楼，按 5 楼步进，可调整范围 5-50。</p>
            </div>
            <div class="user-settings-stepper">
              <button
                type="button"
                class="user-settings-stepper-button"
                :disabled="userSettingsSaving || displaySettings.loadBatchSize <= 5"
                title="减少加载批次"
                aria-label="减少加载批次"
                @click="stepLoadBatchSize(-1)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
              <div class="user-settings-stepper-value">
                <strong>{{ displaySettings.loadBatchSize }}</strong>
                <span>楼</span>
              </div>
              <button
                type="button"
                class="user-settings-stepper-button"
                :disabled="userSettingsSaving || displaySettings.loadBatchSize >= 50"
                title="增加加载批次"
                aria-label="增加加载批次"
                @click="stepLoadBatchSize(1)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="user-settings-section">
        <div class="user-settings-section-head">
          <div>
            <span class="user-settings-kicker">上下文说明</span>
            <h3>总结阈值</h3>
            <p>暂未开放。这里仅展示当前上下文窗口的运行逻辑。</p>
          </div>
          <span class="pill">暂未开放</span>
        </div>
        <ul class="user-settings-note-list">
          <li
            v-for="line in contextSummaryLines"
            :key="line"
          >
            {{ line }}
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
