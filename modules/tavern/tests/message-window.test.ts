import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    AGENT_MESSAGE_WINDOW_DEFAULT,
    expandMessageWindow,
    getMessageWindow,
    resetMessageWindow,
} from '../app-src/message-window';

const root = resolve(import.meta.dirname, '../../..');

test('tavern message window matches ebook defaults and expands older messages in chunks', () => {
    const state = { uiMessageWindowLimit: 100 };

    resetMessageWindow(state);
    assert.equal(state.uiMessageWindowLimit, AGENT_MESSAGE_WINDOW_DEFAULT);

    const initial = getMessageWindow(state, 12);
    assert.equal(initial.hiddenBefore, 7);
    assert.equal(initial.visibleCount, 5);

    const expanded = expandMessageWindow(state, 12);
    assert.equal(expanded, true);

    const afterExpand = getMessageWindow(state, 12);
    assert.equal(afterExpand.hiddenBefore, 0);
    assert.equal(afterExpand.visibleCount, 12);
});

test('tavern scroll handlers collapse expanded message windows when returning to bottom', () => {
    const source = readFileSync(resolve(root, 'modules/tavern/app-src/App.vue'), 'utf8');
    assert.match(source, /function handleChatScroll\(\)[\s\S]*collapseChatMessageWindowIfBottom\(\);/);
    assert.match(source, /function handleManagerScroll\(\)[\s\S]*collapseManagerMessageWindowIfBottom\(\);/);
    assert.match(source, /function scrollChatToBottom\([\s\S]*options\.collapseWindow \|\| chatAutoScroll\.value[\s\S]*collapseChatMessageWindowIfBottom\(true\);/);
    assert.match(source, /function scrollManagerToBottom\([\s\S]*options\.collapseWindow \|\| managerAutoScroll\.value[\s\S]*collapseManagerMessageWindowIfBottom\(true\);/);
});
