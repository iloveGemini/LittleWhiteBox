import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createActionCheckEvent,
    extractActionCheckRegexMarkers,
    injectActionCheckRegexMarkers,
} from '../shared/runtime-events';

test('action check regex markers remap card offsets after display regex deletes earlier text', () => {
    const rawText = '『状态栏会被显示正则删除』她抬手推开木门。';
    const event = createActionCheckEvent({
        action: '推门',
        stat: '力量',
        difficulty: 12,
        roll: 16,
        success: true,
        insertAfterChars: rawText.indexOf('她抬手') + '她抬手'.length,
    });

    const marked = injectActionCheckRegexMarkers(rawText, [event]);
    const regexedText = marked.text.replace(/『.*?』/gs, '');
    const normalized = extractActionCheckRegexMarkers(regexedText, [event], marked.boundaries);

    assert.equal(normalized.text, '她抬手推开木门。');
    assert.equal(normalized.events.length, 1);
    assert.equal(normalized.events[0].insertAfterChars, '她抬手'.length);
});

test('action check regex markers preserve normalized stakes across whole-event remapping', () => {
    const rawText = '她猛地扑向洞口，试图在塌方前钻出去。';
    const normalizedStakes = 'x'.repeat(240);
    const event = createActionCheckEvent({
        action: '钻出洞口',
        stat: '敏捷',
        difficulty: 14,
        roll: 17,
        success: true,
        insertAfterChars: rawText.indexOf('，'),
        stakes: `  ${'x'.repeat(260)}  `,
    });

    assert.equal(event.stakes, normalizedStakes);

    const marked = injectActionCheckRegexMarkers(rawText, [event]);
    const regexedText = marked.text.replace('猛地', '');
    const normalized = extractActionCheckRegexMarkers(regexedText, [event], marked.boundaries);

    assert.equal(normalized.text, '她扑向洞口，试图在塌方前钻出去。');
    assert.equal(normalized.events.length, 1);
    assert.equal(normalized.events[0].stakes, normalizedStakes);
    assert.equal(normalized.events[0].insertAfterChars, rawText.indexOf('，') - '猛地'.length);
});

test('action check runtime events normalize bare-d20 difficulty and critical outcomes', () => {
    const criticalFailure = createActionCheckEvent({
        action: '轻推门板',
        stat: '力量',
        difficulty: -10,
        roll: 1,
        success: true,
        insertAfterChars: 0,
    });
    assert.equal(criticalFailure.difficulty, 1);
    assert.equal(criticalFailure.success, false);
    assert.equal(criticalFailure.outcome, 'criticalFailure');

    const criticalSuccess = createActionCheckEvent({
        action: '强行跃过深渊',
        stat: '敏捷',
        difficulty: 99,
        roll: 20,
        success: false,
        insertAfterChars: 0,
    });
    assert.equal(criticalSuccess.difficulty, 21);
    assert.equal(criticalSuccess.success, true);
    assert.equal(criticalSuccess.outcome, 'criticalSuccess');

    const impossibleWithoutTwenty = createActionCheckEvent({
        action: '强行说服守卫放行',
        stat: '魅力',
        difficulty: 21,
        roll: 19,
        success: true,
        outcome: 'success',
        insertAfterChars: 0,
    });
    assert.equal(impossibleWithoutTwenty.success, false);
    assert.equal(impossibleWithoutTwenty.outcome, 'failure');

    const correctedCriticalFailure = createActionCheckEvent({
        action: '推开半掩的门',
        stat: '力量',
        difficulty: 1,
        roll: 1,
        success: true,
        outcome: 'success',
        insertAfterChars: 0,
    });
    assert.equal(correctedCriticalFailure.success, false);
    assert.equal(correctedCriticalFailure.outcome, 'criticalFailure');
});
