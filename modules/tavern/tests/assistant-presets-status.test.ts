import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildDefaultStatusPanelPrompt,
    buildTavernManagerSystemPrompt,
    createDefaultTavernAssistantPreset,
    normalizeTavernAssistantPreset,
} from '../shared/assistant-presets';

test('default assistant preset carries an editable status panel section', () => {
    const preset = createDefaultTavernAssistantPreset();
    assert.match(preset.statusPrompt, /# 状态栏设定/);
    assert.match(preset.statusPrompt, /没写的项不智能补全/);
    assert.match(buildDefaultStatusPanelPrompt(), /新NPC在已有关系 block 内增加字段/);

    const normalized = normalizeTavernAssistantPreset({
        id: 'custom',
        name: 'Custom',
        statusPrompt: '',
    });
    assert.match(normalized.statusPrompt, /# 状态栏设定/);
});

test('manager system prompt includes status rules only when status is authorized', () => {
    const preset = {
        statePrompt: 'STATE_RULE',
        characterPrompt: 'CHAR_RULE',
        statusPrompt: 'STATUS_RULE',
    };
    const withStatus = buildTavernManagerSystemPrompt(preset, {
        includeMemory: true,
        includeCartography: false,
        includeStatus: true,
        includeQuestOrchestration: false,
    });
    assert.match(withStatus, /## Status Panel Rules/);
    assert.match(withStatus, /StatusRead, StatusInit, and StatusPatch/);
    assert.match(withStatus, /STATUS_RULE/);

    const withoutStatus = buildTavernManagerSystemPrompt(preset, {
        includeMemory: true,
        includeCartography: false,
        includeStatus: false,
        includeQuestOrchestration: false,
    });
    assert.doesNotMatch(withoutStatus, /## Status Panel Rules/);
    assert.doesNotMatch(withoutStatus, /STATUS_RULE/);
    assert.match(withoutStatus, /STATE_RULE/);
    assert.match(withoutStatus, /CHAR_RULE/);
});
