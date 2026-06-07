import test from 'node:test';
import assert from 'node:assert/strict';

import {
    XBTavernWorldPosition,
    buildXbTavernMessages,
} from '../shared/message-assembler';
import {
    buildXbTavernContextFromSillyTavern,
    collectSillyTavernWorldbookNames,
    collectSillyTavernWorldbookSources,
    normalizeWorldbookData,
} from '../shared/sillytavern-context';

test('sillytavern context adapter extracts character, persona, chat and worldbooks', () => {
    const source = {
        characterId: 0,
        name1: 'Mira',
        characters: [{
            name: 'Aster',
            avatar: 'aster.png',
            data: {
                description: 'Pilot.',
                first_mes: 'Primary greeting.',
                alternate_greetings: ['Alt one.', '', 'Alt two.'],
                extensions: { world: 'AsterWorld' },
            },
        }],
        chat: [
            { is_user: true, name: 'Mira', mes: 'Hello.' },
            { is_user: false, name: 'Aster', mes: 'Hi.' },
        ],
        worldNames: ['ChatWorld'],
        personaDescriptionLorebook: 'PersonaWorld',
        selected_world_info: ['GlobalWorld'],
        charLore: [{ name: 'aster.png', extraBooks: ['ExtraWorld'] }],
    };
    const book = normalizeWorldbookData('AsterWorld', {
        entries: {
            one: { uid: 1, content: 'Lore.', constant: true },
        },
    });
    const context = buildXbTavernContextFromSillyTavern(source, { worldBooks: [book] });

    assert.equal(context.character?.name, 'Aster');
    assert.equal(context.character?.firstMessage, 'Primary greeting.');
    assert.deepEqual(context.character?.alternateGreetings, ['Alt one.', 'Alt two.']);
    assert.equal(context.user?.name, 'Mira');
    assert.equal(context.history?.length, 2);
    assert.deepEqual(collectSillyTavernWorldbookNames(source), ['ChatWorld', 'PersonaWorld', 'AsterWorld', 'ExtraWorld', 'GlobalWorld']);
    assert.deepEqual(collectSillyTavernWorldbookSources(source).map((item) => `${item.sourceType}:${item.name}`), [
        'chat:ChatWorld',
        'persona:PersonaWorld',
        'character:AsterWorld',
        'character:ExtraWorld',
        'global:GlobalWorld',
    ]);
    assert.equal(context.worldEntries?.[0].content, 'Lore.');
    assert.equal(context.worldEntries?.[0].worldSourceType, 'character');
});

test('sillytavern context adapter returns an empty diagnostic-safe shape when data is missing', () => {
    const context = buildXbTavernContextFromSillyTavern({}, {});

    assert.equal(context.character?.name, '');
    assert.equal(context.user?.name, 'User');
    assert.deepEqual(context.history, []);
    assert.deepEqual(context.worldBooks, []);
    assert.deepEqual(context.worldEntries, []);
});

test('sillytavern context adapter does not treat system name as a character card', () => {
    const context = buildXbTavernContextFromSillyTavern({
        name2: 'SillyTavern System',
    }, {});

    assert.equal(context.character?.name, '');
});

test('sillytavern context adapter switches character snapshots by id', () => {
    const source = {
        characterId: 1,
        name1: 'Mira',
        characters: [
            { name: 'Aster', data: { description: 'Pilot.' } },
            { name: 'Nia', data: { description: 'Archivist.', extensions: { world: 'NiaWorld' } } },
        ],
    };
    const book = normalizeWorldbookData('NiaWorld', {
        entries: {
            one: { uid: 'nia-1', content: 'Archive lore.', constant: true },
        },
    });
    const context = buildXbTavernContextFromSillyTavern(source, { worldBooks: [book] });

    assert.equal(context.character?.name, 'Nia');
    assert.equal(context.character?.description, 'Archivist.');
    assert.deepEqual(collectSillyTavernWorldbookNames(source), ['NiaWorld']);
    assert.equal(context.worldEntries?.[0].sourceWorldBook, 'NiaWorld');
});

test('sillytavern context adapter includes embedded character lorebook entries', () => {
    const source = {
        characterId: 0,
        characters: [{
            name: 'Aster',
            avatar: 'aster.png',
            data: {
                character_book: {
                    name: 'AsterEmbedded',
                    entries: [
                        {
                            id: 1,
                            keys: ['embedded-key'],
                            content: 'Embedded lore.',
                            constant: false,
                            enabled: true,
                            insertion_order: 50,
                            position: 'before_char',
                            extensions: {
                                position: XBTavernWorldPosition.before,
                                depth: 2,
                                character_filter: { names: ['aster.png'] },
                            },
                        },
                        {
                            id: 2,
                            keys: ['disabled-key'],
                            content: 'Disabled embedded lore.',
                            enabled: false,
                        },
                    ],
                },
            },
        }],
        chat: [{ is_user: true, mes: 'Hello.' }],
    };
    const context = buildXbTavernContextFromSillyTavern(source, {});

    assert.deepEqual(collectSillyTavernWorldbookNames(source), []);
    assert.equal(context.worldBooks?.[0]?.name, 'AsterEmbedded');
    assert.equal(context.worldEntries?.[0]?.content, 'Embedded lore.');
    assert.equal(context.worldEntries?.[0]?.sourceWorldBook, 'AsterEmbedded');
    assert.deepEqual(context.worldEntries?.[0]?.key, ['embedded-key']);
    assert.equal(context.worldEntries?.[0]?.order, 50);
    assert.equal(context.worldEntries?.[0]?.position, XBTavernWorldPosition.before);
    assert.deepEqual(context.worldEntries?.[0]?.characterFilter, { names: ['aster.png'] });
    assert.equal(context.worldEntries?.[1]?.disable, true);

    const result = buildXbTavernMessages(context, {}, {
        currentUserMessage: 'embedded-key disabled-key',
    });
    assert.deepEqual(result.activatedWorldEntries.map((entry) => entry.uid), [1]);
});
