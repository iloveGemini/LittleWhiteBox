import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, nextTick, ref } from 'vue';

import { normalizeAgentConfig } from '../../agent-core/config.js';
import { useTavernSettingsController } from '../app-src/components/settings/useTavernSettingsController';

function flushAsyncState() {
    return new Promise((resolve) => {
        setTimeout(async () => {
            await nextTick();
            resolve(undefined);
        }, 0);
    });
}

function readHiddenOutsideCount(config: Record<string, unknown>): number {
    const normalized = normalizeAgentConfig(config);
    const tavern = (normalized.tavern as Record<string, unknown> | undefined) || {};
    const userSettings = (tavern.userSettings as Record<string, unknown> | undefined) || {};
    return Number(userSettings.hiddenOutsideCount) || 0;
}

test('display settings revert to the last committed values when host save fails', async () => {
    const activeView = ref('home');
    const activeSettingsWorkspace = ref<'api' | 'chatPreset' | 'worldbooks' | 'regex' | 'assistantPreset' | 'user'>('user');
    const agentConfig = ref(normalizeAgentConfig({
        tavern: {
            userSettings: {
                hiddenOutsideCount: 5,
                loadBatchSize: 20,
            },
        },
    }));
    let rejectSave: ((reason?: unknown) => void) | null = null;
    const controller = useTavernSettingsController({
        activeView,
        activeSettingsWorkspace,
        agentConfig,
        effectiveContext: computed(() => ({})),
        homeThemeDark: ref(false),
        isRunning: ref(false),
        describeError: (error) => error instanceof Error ? error.message : String(error || ''),
        postToHost: () => {},
        requestHost: async (type) => {
            if (type !== 'xb-tavern:save-user-settings') {
                return {};
            }
            return await new Promise<Record<string, unknown>>((_resolve, reject) => {
                rejectSave = reject;
            });
        },
        shortText: (value = '') => String(value || ''),
    });

    controller.settingsContext.stepHiddenOutsideCount(1);
    assert.equal(controller.settingsContext.displaySettings.value.hiddenOutsideCount, 6);
    assert.equal(readHiddenOutsideCount(agentConfig.value), 6);

    rejectSave?.(new Error('save failed'));
    await flushAsyncState();

    assert.equal(controller.settingsContext.displaySettings.value.hiddenOutsideCount, 5);
    assert.equal(readHiddenOutsideCount(agentConfig.value), 5);
    assert.equal(controller.settingsContext.userSettingsSaving.value, false);
    assert.equal(controller.settingsContext.userSettingsStatus.value, 'save failed');
});
