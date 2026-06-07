<script setup lang="ts">
import TavernCornerActions from '../TavernCornerActions.vue';
import TavernSettingsSidebar from '../TavernSettingsSidebar.vue';
import TavernApiSettingsPanel from './TavernApiSettingsPanel.vue';
import TavernChatPresetSettingsPanel from './TavernChatPresetSettingsPanel.vue';
import TavernWorldbooksSettingsPanel from './TavernWorldbooksSettingsPanel.vue';
import TavernRegexSettingsPanel from './TavernRegexSettingsPanel.vue';
import TavernAssistantPresetSettingsPanel from './TavernAssistantPresetSettingsPanel.vue';
import { useTavernAppUiContext } from '../tavern-app-context';

const ui = useTavernAppUiContext();
const {
    activeSettingsWorkspace,
    activeView,
    homeThemeDark,
    postToHost,
    selectSettingsWorkspace,
    settingsNavItems,
} = ui;
</script>

<template>
  <section
    v-if="activeView === 'settings'"
    class="xb-layout xb-page settings-layout"
  >
    <TavernCornerActions
      include-home
      :dark="homeThemeDark"
      @home="activeView = 'home'"
      @toggle-theme="homeThemeDark = !homeThemeDark"
      @exit="postToHost('xb-tavern:close')"
    />
    <TavernSettingsSidebar
      :active="activeSettingsWorkspace"
      :items="settingsNavItems"
      @select="selectSettingsWorkspace"
    />

    <section class="xb-main">
      <TavernApiSettingsPanel />

      <TavernChatPresetSettingsPanel />

      <TavernWorldbooksSettingsPanel />

      <TavernRegexSettingsPanel />

      <TavernAssistantPresetSettingsPanel />
    </section>
  </section>
</template>
