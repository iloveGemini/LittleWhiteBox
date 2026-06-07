<script setup lang="ts">
import { useTavernAppUiContext } from '../tavern-app-context';

const ui = useTavernAppUiContext();
const {
    activeSettingsWorkspace,
    apiSettingsRootRef,
    apiReady,
    apiReadyDetail,
    apiRuntimeLine,
} = ui;

function setApiSettingsRootRef(element: Element | null) {
    apiSettingsRootRef.value = element instanceof HTMLElement ? element : null;
}
</script>

<template>
  <div
    v-show="activeSettingsWorkspace === 'api'"
    class="panel step-panel api-workspace"
  >
    <div class="panel-head">
      <div>
        <h2>API 配置</h2>
      </div>
      <span
        class="pill"
        :class="{ warning: !apiReady }"
      >
        {{ apiReady ? '可发模' : '需配置' }}
      </span>
    </div>
    <div
      class="api-scroll-body"
    >
      <div
        class="what-to-check"
        :class="{ warning: !apiReady }"
      >
        <strong>当前模型：</strong>
        <span>{{ apiReady ? apiRuntimeLine : apiReadyDetail }}</span>
      </div>
      <div
        :ref="setApiSettingsRootRef"
        class="tavern-api-settings"
      />
    </div>
  </div>
</template>
