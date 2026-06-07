<script setup lang="ts">
import TavernCornerActions from './TavernCornerActions.vue';

defineProps<{
    dark: boolean;
    hasSession: boolean;
    subtitle: string;
    characterCount: number;
}>();

defineEmits<{
    (event: 'toggle-theme'): void;
    (event: 'exit'): void;
    (event: 'enter'): void;
    (event: 'open-characters'): void;
    (event: 'open-settings', workspace: 'api' | 'chatPreset' | 'assistantPreset' | 'worldbooks' | 'regex'): void;
    (event: 'open-about'): void;
}>();
</script>

<template>
  <section class="tavern-home xb-page home-command-center">
    <TavernCornerActions
      :dark="dark"
      @toggle-theme="$emit('toggle-theme')"
      @exit="$emit('exit')"
    />
    <div class="home-hero home-command-hero">
      <div class="home-brand-panel">
        <p class="eyebrow">
          Private Narrative Archive
        </p>
        <h2>Little White Tavern</h2>
        <p>
          A quiet narrative desk where the scene, the archive, and the assistant stay in the same room.
        </p>
        <p class="home-version-line">
          {{ hasSession ? subtitle : `${characterCount} cards in archive` }}
        </p>
        <button
          type="button"
          class="enter-btn home-enter-chat"
          @click="$emit('enter')"
        >
          {{ hasSession ? 'ENTER LAST CHAT' : 'OPEN CHARACTER ARCHIVE' }}
        </button>
      </div>
      <div class="home-command-panel home-menu-panel">
        <button
          type="button"
          class="home-menu-item"
          @click="$emit('open-characters')"
        >
          <strong>角色卡选择</strong>
          <span>Character Cards</span>
        </button>
        <button
          type="button"
          class="home-menu-item"
          @click="$emit('open-settings', 'worldbooks')"
        >
          <strong>世界书编录</strong>
          <span>World Lore Books</span>
        </button>
        <button
          type="button"
          class="home-menu-item"
          @click="$emit('open-settings', 'chatPreset')"
        >
          <strong>聊天预设</strong>
          <span>Prompt Presets</span>
        </button>
        <button
          type="button"
          class="home-menu-item"
          @click="$emit('open-settings', 'assistantPreset')"
        >
          <strong>助手预设</strong>
          <span>Memory Manager</span>
        </button>
        <button
          type="button"
          class="home-menu-item"
          @click="$emit('open-settings', 'regex')"
        >
          <strong>正则规则</strong>
          <span>Text Filters</span>
        </button>
        <button
          type="button"
          class="home-menu-item"
          @click="$emit('open-settings', 'api')"
        >
          <strong>API 配置</strong>
          <span>Model Connection</span>
        </button>
        <button
          type="button"
          class="home-menu-item highlight"
          @click="$emit('open-about')"
        >
          <strong>关于</strong>
          <span>Guide & Advantages</span>
        </button>
      </div>
    </div>
  </section>
</template>
