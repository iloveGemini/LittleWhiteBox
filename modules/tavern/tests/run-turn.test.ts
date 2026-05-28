import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

import db, {
    createTavernSession,
    getTavernSession,
    listTavernMessages,
    updateTavernSessionSnapshot,
} from '../shared/session-db';
import { createDefaultXbTavernPreset } from '../shared/presets';
import {
    buildContextHistory,
    buildTavernRequestSnapshot,
    runXbTavernTurn,
    type TavernRunOnceOptions,
} from '../app-src/runtime/run-once';

async function resetDb() {
    await db.delete();
    await db.open();
}

test('xb tavern run turn saves user and assistant messages and updates session state', async () => {
    await resetDb();
    const preset = createDefaultXbTavernPreset();
    const result = await runXbTavernTurn({
        agentConfig: { provider: 'fake-provider', model: 'fake-model' },
        contextSnapshot: {
            character: { id: 'char-1', name: 'Aster', description: 'Pilot.' },
            user: { name: 'Player' },
            worldBooks: [{
                name: 'Lore',
                entries: [{
                    uid: 'sticky-entry',
                    content: 'Station lore.',
                    constant: true,
                    sticky: 2,
                }],
            }],
        },
        preset,
        currentUserMessage: 'Hello.',
        executeRunOnce: async (options: TavernRunOnceOptions) => ({
            text: 'Hi from Aster.',
            provider: 'fake-provider',
            model: 'fake-model',
            finishReason: 'stop',
            requestSnapshot: buildTavernRequestSnapshot(options.agentConfig, options.messages, {
                provider: 'fake-provider',
                model: 'fake-model',
            }),
        }),
    });

    assert.equal(result.error, undefined);
    assert.equal(result.previewMatchesRequest, true);
    assert.equal(result.nextTurn, 1);
    const messages = await listTavernMessages(result.sessionId);
    assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant']);
    assert.equal(messages[1]?.content, 'Hi from Aster.');
    assert.equal(messages[1]?.provider, 'fake-provider');
    assert.equal(messages[1]?.model, 'fake-model');
    assert.equal(messages[1]?.finishReason, 'stop');
    const session = await getTavernSession(result.sessionId);
    assert.equal(session?.state?.turn, 1);
    assert.equal(Object.keys(session?.state?.worldEntryStates || {}).some((key) => key.includes('sticky-entry')), true);
    assert.equal(session?.state?.lastProvider, 'fake-provider');
});

test('xb tavern run turn records provider failures as error assistant messages', async () => {
    await resetDb();
    const preset = createDefaultXbTavernPreset();
    const result = await runXbTavernTurn({
        agentConfig: { provider: 'fake-provider', model: 'fake-model' },
        contextSnapshot: {
            character: { id: 'char-1', name: 'Aster' },
        },
        preset,
        currentUserMessage: 'Fail once.',
        executeRunOnce: async () => {
            throw new Error('provider_failed');
        },
    });

    assert.equal(result.error, 'provider_failed');
    assert.equal(result.finishReason, 'error');
    assert.equal(result.nextTurn, 0);
    const messages = await listTavernMessages(result.sessionId);
    const savedRequestSnapshot = messages[1]?.requestSnapshot as { messageCount?: number } | undefined;
    assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant']);
    assert.equal(messages[1]?.error, true);
    assert.equal(messages[1]?.content, 'provider_failed');
    assert.equal(savedRequestSnapshot?.messageCount, result.requestSnapshot.messageCount);
    const session = await getTavernSession(result.sessionId);
    assert.equal(session?.state?.lastError, 'provider_failed');
    assert.equal(session?.state?.turn, 0);

    let retryRaw = '';
    await runXbTavernTurn({
        sessionId: result.sessionId,
        agentConfig: { provider: 'fake-provider', model: 'fake-model' },
        contextSnapshot: {
            character: { id: 'char-1', name: 'Aster' },
        },
        preset,
        currentUserMessage: 'Retry.',
        executeRunOnce: async (options: TavernRunOnceOptions) => {
            retryRaw = JSON.stringify(options.messages);
            return {
                text: 'Recovered.',
                requestSnapshot: buildTavernRequestSnapshot(options.agentConfig, options.messages),
            };
        },
    });
    assert.doesNotMatch(retryRaw, /provider_failed/);
});

test('xb tavern context history filters saved error messages for preview and runtime', () => {
    const history = buildContextHistory([
        {
            sessionId: 'session',
            order: 0,
            role: 'user',
            content: 'Hello.',
            createdAt: 1,
        },
        {
            sessionId: 'session',
            order: 1,
            role: 'assistant',
            content: 'provider_failed',
            error: true,
            createdAt: 2,
        },
        {
            sessionId: 'session',
            order: 2,
            role: 'assistant',
            content: 'Recovered.',
            createdAt: 3,
        },
    ]);

    assert.deepEqual(history, [
        { role: 'user', content: 'Hello.' },
        { role: 'assistant', content: 'Recovered.' },
    ]);
});

test('xb tavern run turn keeps existing session context locked until explicit snapshot refresh', async () => {
    await resetDb();
    const preset = createDefaultXbTavernPreset();
    const session = await createTavernSession({
        title: 'Locked',
        characterId: 'old',
        characterName: 'Old Character',
        contextSnapshot: {
            character: { id: 'old', name: 'Old Character', description: 'Old card.' },
        },
        presetId: preset.id,
        presetName: preset.name,
    });
    let sentRaw = '';
    await runXbTavernTurn({
        sessionId: session.id,
        agentConfig: { provider: 'fake-provider', model: 'fake-model' },
        contextSnapshot: {
            character: { id: 'new', name: 'New Character', description: 'New card.' },
        },
        preset,
        currentUserMessage: 'Who are you?',
        executeRunOnce: async (options: TavernRunOnceOptions) => {
            sentRaw = JSON.stringify(options.messages);
            return {
                text: 'I am old.',
                requestSnapshot: buildTavernRequestSnapshot(options.agentConfig, options.messages),
            };
        },
    });
    assert.match(sentRaw, /Old Character/);
    assert.doesNotMatch(sentRaw, /New Character/);

    await updateTavernSessionSnapshot(session.id, {
        contextSnapshot: {
            character: { id: 'new', name: 'New Character', description: 'New card.' },
        },
    });
    await runXbTavernTurn({
        sessionId: session.id,
        agentConfig: { provider: 'fake-provider', model: 'fake-model' },
        contextSnapshot: {
            character: { id: 'ignored', name: 'Ignored Character' },
        },
        preset,
        currentUserMessage: 'And now?',
        executeRunOnce: async (options: TavernRunOnceOptions) => {
            sentRaw = JSON.stringify(options.messages);
            return {
                text: 'I am new.',
                requestSnapshot: buildTavernRequestSnapshot(options.agentConfig, options.messages),
            };
        },
    });
    assert.match(sentRaw, /New Character/);
    assert.doesNotMatch(sentRaw, /Ignored Character/);
});
