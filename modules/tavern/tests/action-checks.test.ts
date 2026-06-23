import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_ACTION_CHECK_DIFFICULTY,
    MAX_ACTION_CHECK_DIFFICULTY,
    MIN_ACTION_CHECK_DIFFICULTY,
    executeTavernActionCheck,
    getActionCheckToolDefinitions,
} from '../shared/action-checks';

test('action check uses bare-d20 difficulty bounds and default', () => {
    const missingDifficulty = executeTavernActionCheck({
        action: '撬开门锁',
        stat: '灵巧',
    }, { rollDie: () => 10 });
    assert.equal(missingDifficulty.ok, true);
    assert.equal(missingDifficulty.ok && missingDifficulty.difficulty, DEFAULT_ACTION_CHECK_DIFFICULTY);

    const tooLow = executeTavernActionCheck({
        action: '跨过矮栏',
        stat: '敏捷',
        difficulty: -999,
    }, { rollDie: () => 10 });
    assert.equal(tooLow.ok, true);
    assert.equal(tooLow.ok && tooLow.difficulty, MIN_ACTION_CHECK_DIFFICULTY);

    const tooHigh = executeTavernActionCheck({
        action: '强行跃过深渊',
        stat: '勇气',
        difficulty: 999,
    }, { rollDie: () => 20 });
    assert.equal(tooHigh.ok, true);
    assert.equal(tooHigh.ok && tooHigh.difficulty, MAX_ACTION_CHECK_DIFFICULTY);
});

test('action check treats natural 1 and natural 20 as critical outcomes', () => {
    const naturalOne = executeTavernActionCheck({
        action: '推开半掩的门',
        stat: '力量',
        difficulty: 1,
    }, { rollDie: () => 1 });
    assert.equal(naturalOne.ok, true);
    assert.equal(naturalOne.ok && naturalOne.success, false);
    assert.equal(naturalOne.ok && naturalOne.outcome, 'criticalFailure');
    assert.match(naturalOne.ok ? naturalOne.summary : '', /critical failure/);

    const naturalTwenty = executeTavernActionCheck({
        action: '强行说服守卫放行',
        stat: '魅力',
        difficulty: 21,
    }, { rollDie: () => 20 });
    assert.equal(naturalTwenty.ok, true);
    assert.equal(naturalTwenty.ok && naturalTwenty.success, true);
    assert.equal(naturalTwenty.ok && naturalTwenty.outcome, 'criticalSuccess');
    assert.match(naturalTwenty.ok ? naturalTwenty.summary : '', /critical success/);
});

test('action check preserves exact insertAfter visible text whitespace', () => {
    const result = executeTavernActionCheck({
        action: '向前踏步',
        stat: '敏捷',
        insertAfter: '我向前踏步 \n',
    }, { rollDie: () => 12 });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.insertAfter, '我向前踏步 \n');

    const blank = executeTavernActionCheck({
        action: '向前踏步',
        stat: '敏捷',
        insertAfter: ' \n\t',
    }, { rollDie: () => 12 });
    assert.equal(blank.ok, true);
    assert.equal(blank.ok && 'insertAfter' in blank, false);
});

test('action check tool description teaches the bare-d20 range and critical consequences', () => {
    const description = String(getActionCheckToolDefinitions()[0]?.function.description || '');
    const parameters = JSON.stringify(getActionCheckToolDefinitions()[0]?.function.parameters || {});
    assert.match(description, /1-5 easy, 6-10 ordinary, 11-15 hard, 16-20 very hard, 21 nearly impossible/);
    assert.match(description, /Natural 1 is critical failure with a real penalty or complication/);
    assert.match(description, /Natural 20 is critical success with an extra reward/);
    assert.match(parameters, /only beatable by natural 20/);
});
