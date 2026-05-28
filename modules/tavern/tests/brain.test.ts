import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_XB_TAVERN_WORLD_SETTINGS,
    buildXbTavernBrain,
    createXbTavernRuntimeState,
    createXbTavernWorldSettings,
} from '../shared/brain';
import { createDefaultXbTavernPreset } from '../shared/presets';

test('xb tavern brain applies one shared runtime contract for preview and runs', () => {
    const preset = createDefaultXbTavernPreset();
    const brain = buildXbTavernBrain({
        context: {
            character: { id: 'char-1', name: 'Aster' },
            user: { name: 'Player' },
            worldBooks: [{
                name: 'Lore',
                entries: [{
                    uid: 'station',
                    content: 'Station lore.',
                    key: 'station',
                    order: 1,
                }],
            }],
        },
        preset,
        currentUserMessage: 'The station opens.',
        historyMode: 'squash',
        turn: 3,
        entryStates: {},
        diagnostics: { ok: true },
    });

    assert.equal(brain.runtimeState.worldSettings?.recursion, DEFAULT_XB_TAVERN_WORLD_SETTINGS.recursion);
    assert.equal(brain.runtimeState.worldSettings?.recursionLimit, DEFAULT_XB_TAVERN_WORLD_SETTINGS.recursionLimit);
    assert.equal(brain.runtimeState.worldSettings?.budgetChars, DEFAULT_XB_TAVERN_WORLD_SETTINGS.budgetChars);
    assert.equal(brain.runtimeState.worldSettings?.turn, 3);
    assert.equal(brain.buildResult.activatedWorldEntries.length, 1);
    assert.equal(brain.rawMessagesJson, brain.buildSnapshot.rawMessagesJson);
    assert.deepEqual(JSON.parse(brain.rawMessagesJson), brain.buildResult.messages);
});

test('xb tavern brain world setting helper normalizes state defaults', () => {
    const worldSettings = createXbTavernWorldSettings({
        turn: -2,
        entryStates: {
            'World\u0000entry': { cooldownUntilTurn: 4 },
        },
    });
    const runtimeState = createXbTavernRuntimeState({
        context: {},
        preset: {},
        currentUserMessage: 'Hello.',
        turn: -2,
        entryStates: worldSettings.entryStates,
    });

    assert.equal(worldSettings.turn, 0);
    assert.equal(runtimeState.currentUserMessage, 'Hello.');
    assert.equal(runtimeState.historyMode, 'squash');
    assert.deepEqual(runtimeState.worldSettings?.entryStates, {
        'World\u0000entry': { cooldownUntilTurn: 4 },
    });
});
