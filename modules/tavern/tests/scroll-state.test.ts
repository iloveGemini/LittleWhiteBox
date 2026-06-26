import assert from 'node:assert/strict';
import test from 'node:test';

import { captureElementScrollState, restoreElementScrollState } from '../app-src/scroll-state';

interface FakeRect {
    top: number;
    bottom: number;
}

function fakeElement(key: string, rect: FakeRect) {
    return {
        dataset: { chatAnchorKey: key },
        getBoundingClientRect: () => rect,
    };
}

function fakeScrollNode(input: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    rect: FakeRect;
    items: Array<ReturnType<typeof fakeElement>>;
}) {
    return {
        scrollTop: input.scrollTop,
        scrollHeight: input.scrollHeight,
        clientHeight: input.clientHeight,
        getBoundingClientRect: () => input.rect,
        querySelectorAll: () => input.items,
    } as unknown as HTMLElement;
}

test('scroll state restores by the next visible anchor when the top anchor was removed', () => {
    const before = fakeScrollNode({
        scrollTop: 100,
        scrollHeight: 1000,
        clientHeight: 320,
        rect: { top: 0, bottom: 320 },
        items: [
            fakeElement('message:1', { top: 0, bottom: 80 }),
            fakeElement('message:2', { top: 80, bottom: 180 }),
        ],
    });
    const snapshot = captureElementScrollState(before, {
        itemSelector: '.chat-bubble[data-chat-anchor-key]',
        datasetKey: 'chatAnchorKey',
    });

    assert.equal(snapshot?.anchorKey, 'message:1');
    assert.deepEqual(snapshot?.anchors.map((anchor) => anchor.key), ['message:1', 'message:2']);

    const after = fakeScrollNode({
        scrollTop: 0,
        scrollHeight: 920,
        clientHeight: 320,
        rect: { top: 0, bottom: 320 },
        items: [
            fakeElement('message:2', { top: 0, bottom: 100 }),
        ],
    });

    restoreElementScrollState(after, snapshot, {
        itemSelector: '.chat-bubble[data-chat-anchor-key]',
        datasetKey: 'chatAnchorKey',
    }, {
        preserveScrollTop: true,
    });

    assert.equal(after.scrollTop, 20);
});
